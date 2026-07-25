import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { logError, logInfo, withTrace } from '../../../lib/logger.js';
import { addTokenUsage, recordAiMetric, tokensFromGeminiResponse } from '../../../lib/aiMetrics.js';
import { enforceUserRateLimit, getRateLimitHeaders, RATE_LIMIT_SCOPES } from '../../../lib/rateLimit.js';
import {
  isValidGoogleAiModelName,
  requestGoogleGenerateContent,
} from '../../../services/googleGenAiTransport.js';
import { resolveGeminiCoachModel } from '../../../services/exerciseCoachClient.js';
import {
  WORKOUT_ANALYSIS_SCHEMA,
  buildWorkoutAnalysisDigest,
  buildWorkoutAnalysisPrompt,
  buildHeuristicWorkoutAnalysis,
  decodeReportStrings,
  sanitizeWorkoutAnalysis,
} from '../../../services/coachAnalysis.js';
import {
  saveWorkoutAnalysis,
  getWorkoutAnalysis,
} from '../../../lib/repositories/firestoreRepository.js';
import { COACH_ANALYST_PERSONA } from '../../../services/coachPersona.js';
import { checkAiBudget, recordUserAiSpend, logBudgetStop } from '../../../lib/aiBudget.js';

// Análisis del coach de UNA sesión del historial. Caché permanente: una sesión pasada es
// inmutable, así que se genera UNA vez y se sirve desde users/{uid}/workoutAnalyses/{workoutId}.
// Los hits de caché NO consumen rate limit. La generación usa su PROPIO scope
// (`workout-analysis`, 15/h): antes compartía el del informe de Progreso (6/h) y analizar
// seis sesiones del historial dejaba al usuario sin el análisis principal durante una hora.

// Mismo presupuesto global que coach-analysis: dos intentos de 20 s podían pasar del
// maxDuration de 30 s de Vercel y matar la función con 504, perdiendo el heurístico.
const AI_TOTAL_BUDGET_MS = 22_000;
const AI_ATTEMPT_TIMEOUT_MS = 20_000;
const AI_MIN_USEFUL_MS = 8_000;

export async function POST(request) {
  return withTrace('workout_analysis', async ({ traceId }) => {
    const budgetDeadline = Date.now() + AI_TOTAL_BUDGET_MS;
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Cuerpo JSON inválido.', 400);
    }
    const workoutId = typeof body?.workoutId === 'string' ? body.workoutId.trim() : '';
    if (!workoutId || workoutId.length > 80 || workoutId.includes('/')) {
      return errorResponse('Falta "workoutId" válido.', 400);
    }

    try {
      // Caché primero: no consume rate limit ni IA.
      const cached = await getWorkoutAnalysis(user.uid, workoutId);
      if (cached?.analysis) {
        // decodeReportStrings: análisis YA GUARDADOS con escapes \uXXXX literales (Gemini
        // doble-escapó acentos dentro del JSON) se decodifican en lectura.
        return jsonResponse({ ok: true, analysis: decodeReportStrings(cached.analysis), source: cached.source || 'ai', cached: true });
      }

      const rateLimit = await enforceUserRateLimit({
        userId: user.uid,
        scope: RATE_LIMIT_SCOPES.WORKOUT_ANALYSIS,
      });
      const rateLimitHeaders = getRateLimitHeaders(rateLimit);
      if (!rateLimit.allowed) {
        logInfo('rate_limit_exceeded', { traceId, userId: user.uid, scope: RATE_LIMIT_SCOPES.WORKOUT_ANALYSIS, retryAfterSeconds: rateLimit.retryAfterSeconds });
        return errorResponse('Demasiados análisis seguidos. Espera antes de volver a intentarlo.', 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, rateLimitHeaders);
      }

      const digest = await buildWorkoutAnalysisDigest(user.uid, workoutId);
      if (!digest) {
        return errorResponse('Sesión no encontrada o no completada.', 404, undefined, rateLimitHeaders);
      }

      let analysis = null;
      let source = 'ai';
      let aiCalls = 0;
      let aiTokens = {};
      const model = resolveGeminiCoachModel();
      // Freno de gasto: sin presupuesto se usa el análisis heurístico de la sesión, que la
      // UI ya etiqueta como automático. No se rompe nada.
      const spendBudget = await checkAiBudget({ userId: user.uid });
      if (!spendBudget.allowed) logBudgetStop('workout-analysis', spendBudget, { traceId, userId: user.uid });
      if (spendBudget.allowed && process.env.GEMINI_API_KEY && isValidGoogleAiModelName(model)) {
        // Mismo fix que coach-analysis (20-jul-2026): con esquema + temperatura baja +
        // thinkingBudget 0, gemini-2.5-flash puede degenerar en bucles de \t hasta
        // MAX_TOKENS → JSON truncado → fallback heurístico permanente. Temperatura 1.0
        // y reintento con budget de pensamiento rompen el bucle.
        const generationAttempts = [
          { label: 'primary', thinkingConfig: { thinkingBudget: 0 } },
          { label: 'retry_thinking', thinkingConfig: { thinkingBudget: 512 } },
        ];
        for (const attempt of generationAttempts) {
          const remainingMs = budgetDeadline - Date.now();
          if (remainingMs < AI_MIN_USEFUL_MS) {
            logInfo('workout_analysis_budget_exhausted', {
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
              parts: [{ text: buildWorkoutAnalysisPrompt(digest) }],
              generationConfig: {
                temperature: 1.0,
                topP: 0.95,
                maxOutputTokens: 2500,
                responseMimeType: 'application/json',
                responseJsonSchema: WORKOUT_ANALYSIS_SCHEMA,
                thinkingConfig: attempt.thinkingConfig,
              },
            });
            aiCalls += 1;
            if (response.ok) {
              const data = await response.json();
              aiTokens = addTokenUsage(aiTokens, tokensFromGeminiResponse(data));
              const candidate = data?.candidates?.[0];
              const text = (candidate?.content?.parts || []).map((p) => p?.text || '').join('').trim();
              analysis = sanitizeWorkoutAnalysis(JSON.parse(text));
              if (!analysis) {
                logError('workout_analysis_ai_invalid_shape', new Error('sanitizeWorkoutAnalysis devolvió null'), {
                  traceId, userId: user.uid, attempt: attempt.label, finishReason: candidate?.finishReason || null, textChars: text.length,
                });
              }
            } else {
              logError('workout_analysis_http_error', new Error(`HTTP ${response.status}`), { traceId, userId: user.uid, attempt: attempt.label });
            }
          } catch (error) {
            logError('workout_analysis_ai_failed', error, { traceId, userId: user.uid, attempt: attempt.label });
          }
          if (analysis) break;
        }
      }

      if (!analysis) {
        analysis = buildHeuristicWorkoutAnalysis(digest);
        source = 'heuristic';
      }

      // OBSERVABILIDAD (20-jul-2026): este flujo no registraba ninguna métrica de IA.
      await recordAiMetric('workout-analysis', { calls: Math.max(1, aiCalls), fallbacks: source === 'heuristic' ? 1 : 0, ...aiTokens }).catch(() => {});
      await recordUserAiSpend(user.uid, aiTokens);
      await saveWorkoutAnalysis(user.uid, workoutId, { analysis, source });
      logInfo('workout_analysis_result', { traceId, userId: user.uid, workoutId, source, comparables: digest.comparables.length });
      return jsonResponse({ ok: true, analysis, source, cached: false }, 200, rateLimitHeaders);
    } catch (error) {
      logError('workout_analysis_failed', error, { traceId, userId: user.uid });
      await recordAiMetric('workout-analysis', { errors: 1 }).catch(() => {});
      return errorResponse('No se pudo analizar la sesión ahora mismo.', 502);
    }
  });
}
