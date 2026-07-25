import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { logError, logInfo, withTrace } from '../../../lib/logger.js';
import { enforceUserRateLimit, getRateLimitHeaders, RATE_LIMIT_SCOPES } from '../../../lib/rateLimit.js';
import {
  isValidGoogleAiModelName,
  requestGoogleGenerateContent,
} from '../../../services/googleGenAiTransport.js';
import { resolveGeminiCoachModel } from '../../../services/exerciseCoachClient.js';
import { addTokenUsage, recordAiMetric, tokensFromGeminiResponse } from '../../../lib/aiMetrics.js';
import {
  COACH_ANALYSIS_REPORT_SCHEMA,
  buildCoachAnalysisDigest,
  buildCoachAnalysisPrompt,
  buildHeuristicCoachReport,
  decodeReportStrings,
  sanitizeCoachReport,
} from '../../../services/coachAnalysis.js';
import {
  saveCoachAnalysis,
  getCoachAnalysis,
  saveCoachRecommendation,
} from '../../../lib/repositories/firestoreRepository.js';
import { COACH_ANALYST_PERSONA } from '../../../services/coachPersona.js';
import { checkAiBudget, recordUserAiSpend, logBudgetStop } from '../../../lib/aiBudget.js';

// Análisis del coach (Progreso): analiza el ÚLTIMO entreno realizado, lo compara con los
// previos (manuales + Strava + check-ins) y explica los ajustes que aplicará a las próximas
// sesiones. El informe se cachea en Firestore con una firma versionada del contexto completo:
// GET devuelve el informe guardado (con stale:true si cambian objetivo, plan o datos reales);
// POST regenera con Gemini (rate limit persistente) o, si la IA falla, con un resumen
// heurístico observable construido desde las MISMAS reglas adaptativas reales del planner.

// Presupuesto GLOBAL de IA (mismo patrón que exerciseCoachClient.js). El maxDuration de
// Vercel es 30 s y aquí había DOS intentos de 20 s cada uno: si el primero agotaba su
// timeout, el segundo arrancaba pasado el segundo 20 y la función moría con 504 — el
// usuario perdía hasta el informe heurístico, que no necesita IA. Ahora los dos intentos
// comparten un reloj que arranca al entrar en la ruta (el digest de Firestore también
// consume presupuesto) y el segundo solo se lanza si queda margen útil.
const AI_TOTAL_BUDGET_MS = 22_000;
const AI_ATTEMPT_TIMEOUT_MS = 20_000;
// Por debajo de esto un intento no da tiempo ni a devolver tokens: se pagaría y se tiraría.
const AI_MIN_USEFUL_MS = 8_000;

export async function GET(request) {
  return withTrace('coach_analysis_get', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }
    try {
      const saved = await getCoachAnalysis(user.uid);
      if (!saved || !saved.report) return jsonResponse({ ok: true, empty: true });
      // Firma del contexto completo: objetivo/meta/plan, entrenos editados, métricas y comidas.
      // También incluye una versión de contrato para invalidar informes legacy.
      const digest = await buildCoachAnalysisDigest(user.uid);
      const stale = digest.signature !== saved.signature;
      // decodeReportStrings: los informes YA GUARDADOS con escapes \uXXXX literales (Gemini
      // doble-escapó los acentos dentro del JSON) se decodifican en lectura, sin re-validar
      // el shape (un informe legacy no debe volverse null).
      return jsonResponse({ ok: true, report: decodeReportStrings(saved.report), source: saved.source || 'ai', generatedAt: saved.updatedAt || null, stale });
    } catch (error) {
      logError('coach_analysis_get_failed', error, { traceId, userId: user.uid });
      return jsonResponse({ ok: true, empty: true });
    }
  });
}

export async function POST(request) {
  return withTrace('coach_analysis', async ({ traceId }) => {
    const budgetDeadline = Date.now() + AI_TOTAL_BUDGET_MS;
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    const rateLimit = await enforceUserRateLimit({
      userId: user.uid,
      scope: RATE_LIMIT_SCOPES.COACH_ANALYSIS,
    });
    const rateLimitHeaders = getRateLimitHeaders(rateLimit);
    if (!rateLimit.allowed) {
      logInfo('rate_limit_exceeded', { traceId, userId: user.uid, scope: RATE_LIMIT_SCOPES.COACH_ANALYSIS, retryAfterSeconds: rateLimit.retryAfterSeconds });
      return errorResponse('Demasiados análisis seguidos. Espera antes de volver a intentarlo.', 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, rateLimitHeaders);
    }

    try {
      const digest = await buildCoachAnalysisDigest(user.uid);
      if (!digest.done.length) {
        return jsonResponse({ ok: true, empty: true, reason: 'no_workouts' }, 200, rateLimitHeaders);
      }

      let report = null;
      let source = 'ai';
      let aiCalls = 0;
      let aiTokens = {};
      const model = resolveGeminiCoachModel();
      // Freno de gasto: si no hay presupuesto, este flujo NO falla — cae al informe
      // heurístico, que sale de las mismas señales reales y se etiqueta honestamente en la
      // UI como "Resumen automático (sin IA)".
      const spendBudget = await checkAiBudget({ userId: user.uid });
      if (!spendBudget.allowed) logBudgetStop('coach-analysis', spendBudget, { traceId, userId: user.uid });
      if (spendBudget.allowed && process.env.GEMINI_API_KEY && isValidGoogleAiModelName(model)) {
        // BUG 20-jul-2026: gemini-2.5-flash con salida restringida por esquema
        // (responseSchema) + temperatura baja + thinkingBudget 0 entraba en un bucle
        // degenerado ('{"lastSession": "Tu \n\t\t\t…' hasta MAX_TOKENS) → JSON truncado →
        // JSON.parse lanzaba y el informe caía SIEMPRE al heurístico ("Resumen automático
        // (sin IA)"). Verificado con sonda real (scratch/coach-analysis-ai-probe.mjs):
        // temperatura 1.0 (3/3 STOP) o thinkingBudget>0 rompen el bucle. Se intenta la
        // config rápida y, si aún degenera, un reintento con budget de pensamiento.
        const generationAttempts = [
          { label: 'primary', thinkingConfig: { thinkingBudget: 0 } },
          { label: 'retry_thinking', thinkingConfig: { thinkingBudget: 512 } },
        ];
        for (const attempt of generationAttempts) {
          // Nunca arrancar un intento que el maxDuration de Vercel va a cortar a medias.
          const remainingMs = budgetDeadline - Date.now();
          if (remainingMs < AI_MIN_USEFUL_MS) {
            logInfo('coach_analysis_budget_exhausted', {
              traceId, userId: user.uid, attempt: attempt.label, remainingMs,
            });
            break;
          }
          try {
            const { response } = await requestGoogleGenerateContent({
              model,
              traceId,
              timeoutMs: Math.min(AI_ATTEMPT_TIMEOUT_MS, remainingMs),
              systemInstruction: COACH_ANALYST_PERSONA,
              parts: [{ text: buildCoachAnalysisPrompt(digest) }],
              generationConfig: {
                temperature: 1.0,
                topP: 0.95,
                maxOutputTokens: 2500,
                responseMimeType: 'application/json',
                responseJsonSchema: COACH_ANALYSIS_REPORT_SCHEMA,
                thinkingConfig: attempt.thinkingConfig,
              },
            });
            aiCalls += 1;
            if (response.ok) {
              const data = await response.json();
              aiTokens = addTokenUsage(aiTokens, tokensFromGeminiResponse(data));
              const candidate = data?.candidates?.[0];
              const text = (candidate?.content?.parts || []).map((p) => p?.text || '').join('').trim();
              report = sanitizeCoachReport(JSON.parse(text));
              if (!report) {
                logError('coach_analysis_ai_invalid_shape', new Error('sanitizeCoachReport devolvió null'), {
                  traceId, userId: user.uid, attempt: attempt.label, finishReason: candidate?.finishReason || null, textChars: text.length,
                });
              }
            } else {
              logError('coach_analysis_http_error', new Error(`HTTP ${response.status}`), { traceId, userId: user.uid, attempt: attempt.label });
            }
          } catch (error) {
            logError('coach_analysis_ai_failed', error, { traceId, userId: user.uid, attempt: attempt.label });
          }
          if (report) break;
        }
      }

      if (!report) {
        report = buildHeuristicCoachReport(digest);
        source = 'heuristic';
      }

      // FASE 3.6 — métricas: llamadas reales + tokens + fallback heurístico si aplica.
      await recordAiMetric('coach-analysis', { calls: Math.max(1, aiCalls), fallbacks: source === 'heuristic' ? 1 : 0, ...aiTokens });
      await recordUserAiSpend(user.uid, aiTokens);
      const record = await saveCoachAnalysis(user.uid, { report, source, signature: digest.signature });
      // FASE 2.2 — persistir las recomendaciones emitidas + snapshot de e1RM para
      // comparar su cumplimiento de forma determinista en el siguiente análisis.
      try {
        const { buildLiftSnapshot } = await import('../../../services/coachAnalysis.js');
        await saveCoachRecommendation(user.uid, {
          adjustments: Array.isArray(report?.adjustments) ? report.adjustments.slice(0, 6) : [],
          signature: digest.signature,
          liftSnapshot: buildLiftSnapshot(digest.liftProgression),
          source,
        });
      } catch (recErr) {
        logError('coach_recommendation_save_failed', recErr, { traceId, userId: user.uid });
      }
      logInfo('coach_analysis_result', { traceId, userId: user.uid, source, workouts: digest.done.length });
      return jsonResponse({ ok: true, report, source, generatedAt: record?.updatedAt || null, stale: false }, 200, rateLimitHeaders);
    } catch (error) {
      logError('coach_analysis_failed', error, { traceId, userId: user.uid });
      await recordAiMetric('coach-analysis', { errors: 1 });
      return errorResponse('No se pudo generar el análisis ahora mismo.', 502, undefined, rateLimitHeaders);
    }
  });
}
