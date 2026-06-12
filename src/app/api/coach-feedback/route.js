import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import { saveCoachFeedback } from '../../../lib/repositories/firestoreRepository.js';
import { recordAiMetric } from '../../../lib/aiMetrics.js';

// FASE 3.4 — Feedback 👍👎 sobre respuestas del coach (chat y análisis).
// Guarda { endpoint, rating, contextHash, createdAt } por usuario. Sin texto libre
// obligatorio y SIN el contenido de la respuesta (solo un hash corto calculado en el
// cliente): base para auditar calidad y, a futuro, dataset propio.

const ENDPOINTS = new Set(['coach-chat', 'coach-analysis', 'workout-analysis']);
const RATINGS = new Set(['up', 'down']);

export async function POST(request) {
  return withTrace('coach_feedback', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    let body;
    try { body = await request.json(); } catch { return errorResponse('JSON inválido.', 400); }

    const endpoint = ENDPOINTS.has(body?.endpoint) ? body.endpoint : null;
    const rating = RATINGS.has(body?.rating) ? body.rating : null;
    if (!endpoint || !rating) return errorResponse('Faltan "endpoint" o "rating" válidos.', 400);
    const contextHash = typeof body?.contextHash === 'string' ? body.contextHash.slice(0, 64) : null;

    try {
      await saveCoachFeedback(user.uid, { endpoint, rating, contextHash });
      await recordAiMetric(endpoint, { [rating === 'up' ? 'feedbackUp' : 'feedbackDown']: 1 });
      return jsonResponse({ ok: true });
    } catch (error) {
      logError('coach_feedback_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo guardar el feedback.', 500);
    }
  });
}
