import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { logError, logInfo, withTrace } from '../../../lib/logger.js';
import { enforceUserRateLimit, getRateLimitHeaders, RATE_LIMIT_SCOPES } from '../../../lib/rateLimit.js';
import {
  isValidGoogleAiModelName,
  requestGoogleGenerateContent,
} from '../../../services/googleGenAiTransport.js';
import { resolveGeminiCoachModel } from '../../../services/exerciseCoachClient.js';
import { recordAiMetric } from '../../../lib/aiMetrics.js';
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

// Análisis del coach (Progreso): analiza el ÚLTIMO entreno realizado, lo compara con los
// previos (manuales + Strava + check-ins) y explica los ajustes que aplicará a las próximas
// sesiones. El informe se cachea en Firestore con una firma versionada del contexto completo:
// GET devuelve el informe guardado (con stale:true si cambian objetivo, plan o datos reales);
// POST regenera con Gemini (rate limit persistente) o, si la IA falla, con un resumen
// heurístico observable construido desde las MISMAS reglas adaptativas reales del planner.

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
      const model = resolveGeminiCoachModel();
      if (process.env.GEMINI_API_KEY && isValidGoogleAiModelName(model)) {
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
          try {
            const { response } = await requestGoogleGenerateContent({
              model,
              traceId,
              timeoutMs: 20000,
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
            if (response.ok) {
              const data = await response.json();
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

      // FASE 3.6 — métricas: llamada + fallback heurístico si aplica.
      await recordAiMetric('coach-analysis', { calls: 1, fallbacks: source === 'heuristic' ? 1 : 0 });
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
