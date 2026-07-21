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

// Análisis del coach de UNA sesión del historial. Caché permanente: una sesión pasada es
// inmutable, así que se genera UNA vez y se sirve desde users/{uid}/workoutAnalyses/{workoutId}.
// Los hits de caché NO consumen rate limit; la generación comparte el scope `coach-analysis`.

export async function POST(request) {
  return withTrace('workout_analysis', async ({ traceId }) => {
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
        scope: RATE_LIMIT_SCOPES.COACH_ANALYSIS,
      });
      const rateLimitHeaders = getRateLimitHeaders(rateLimit);
      if (!rateLimit.allowed) {
        logInfo('rate_limit_exceeded', { traceId, userId: user.uid, scope: RATE_LIMIT_SCOPES.COACH_ANALYSIS, retryAfterSeconds: rateLimit.retryAfterSeconds });
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
      if (process.env.GEMINI_API_KEY && isValidGoogleAiModelName(model)) {
        // Mismo fix que coach-analysis (20-jul-2026): con esquema + temperatura baja +
        // thinkingBudget 0, gemini-2.5-flash puede degenerar en bucles de \t hasta
        // MAX_TOKENS → JSON truncado → fallback heurístico permanente. Temperatura 1.0
        // y reintento con budget de pensamiento rompen el bucle.
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
