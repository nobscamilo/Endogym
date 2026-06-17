import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import { getUserProfile, getLatestWeeklyPlan } from '../../../lib/repositories/firestoreRepository.js';
import { retrieveGuidelinesContextWithCitations } from '../../../services/guidelinesRetriever.js';

// #6 — Citas RAG reales para el "por qué de tu sesión". Endpoint bajo demanda (la UI lo llama al
// pulsar "ver fuentes"), para no añadir la latencia del retriever al dashboard. Disciplina:
// devuelve SOLO las fuentes realmente recuperadas de la biblioteca médica; si no hay, lista vacía
// (la UI remite al coach). Nunca inventa citas.

const GOAL_LABELS = {
  weight_loss: 'pérdida de grasa',
  recomposition: 'recomposición',
  hypertrophy: 'hipertrofia',
  strength: 'fuerza',
  endurance: 'resistencia',
  glycemic_control: 'control glucémico',
};

function cleanSource(fileName) {
  return String(fileName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request) {
  return withTrace('session_rationale', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    try {
      const [profile, plan] = await Promise.all([
        getUserProfile(user.uid).catch(() => null),
        getLatestWeeklyPlan(user.uid).catch(() => null),
      ]);
      const goalLabel = GOAL_LABELS[profile?.goal] || 'tu objetivo';
      const userQuery = `Base científica de la prescripción de fuerza: volumen (series), intensidad (carga/RPE), descanso entre series y selección de ejercicios para ${goalLabel}.`;
      const { citations } = await retrieveGuidelinesContextWithCitations({
        profile: profile || {},
        weeklyPlan: plan || undefined,
        userQuery,
        traceId,
      });
      const sources = (Array.isArray(citations) ? citations : [])
        .map((c) => cleanSource(c.fileName))
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .slice(0, 6);
      return jsonResponse({ ok: true, sources });
    } catch (error) {
      // Degrada en silencio: sin citas no es un error de cara al usuario (la UI remite al coach).
      logError('session_rationale_failed', error, { traceId, userId: user.uid });
      return jsonResponse({ ok: true, sources: [] });
    }
  });
}
