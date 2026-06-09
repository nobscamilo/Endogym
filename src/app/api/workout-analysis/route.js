import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { logError, logInfo, withTrace } from '../../../lib/logger.js';
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
        return jsonResponse({ ok: true, analysis: cached.analysis, source: cached.source || 'ai', cached: true });
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
      const model = resolveGeminiCoachModel();
      if (process.env.GEMINI_API_KEY && isValidGoogleAiModelName(model)) {
        try {
          const { response } = await requestGoogleGenerateContent({
            model,
            traceId,
            timeoutMs: 20000,
            parts: [{ text: buildWorkoutAnalysisPrompt(digest) }],
            generationConfig: {
              temperature: 0.4,
              topP: 0.9,
              maxOutputTokens: 1200,
              responseMimeType: 'application/json',
              responseJsonSchema: WORKOUT_ANALYSIS_SCHEMA,
              thinkingConfig: { thinkingBudget: 0 },
            },
          });
          if (response.ok) {
            const data = await response.json();
            const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').trim();
            analysis = sanitizeWorkoutAnalysis(JSON.parse(text));
          } else {
            logError('workout_analysis_http_error', new Error(`HTTP ${response.status}`), { traceId, userId: user.uid });
          }
        } catch (error) {
          logError('workout_analysis_ai_failed', error, { traceId, userId: user.uid });
        }
      }

      if (!analysis) {
        analysis = buildHeuristicWorkoutAnalysis(digest);
        source = 'heuristic';
      }

      await saveWorkoutAnalysis(user.uid, workoutId, { analysis, source });
      logInfo('workout_analysis_result', { traceId, userId: user.uid, workoutId, source, comparables: digest.comparables.length });
      return jsonResponse({ ok: true, analysis, source, cached: false }, 200, rateLimitHeaders);
    } catch (error) {
      logError('workout_analysis_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo analizar la sesión ahora mismo.', 502);
    }
  });
}
