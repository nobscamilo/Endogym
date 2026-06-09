import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import {
  listWorkouts,
  getWorkoutAnalysesByIds,
} from '../../../lib/repositories/firestoreRepository.js';

// Historial consultable de entrenos para el Studio (Progreso): paginado por cursor
// `before` (performedAt ISO) y con el análisis del coach cacheado inline cuando existe.
// Solo lectura; el análisis por sesión se genera en POST /api/workout-analysis.

const MAX_LIMIT = 50;

function pos(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapItem(w, analysis) {
  const lifts = (Array.isArray(w.exercises) ? w.exercises : [])
    .filter((e) => e?.name && Number(e.weightKg) > 0)
    .map((e) => ({ name: e.name, kg: Number(e.weightKg), sets: e.sets ?? null }));
  return {
    workoutId: w.id || null,
    performedAt: w.performedAt || null,
    date: String(w.performedAt || '').slice(0, 10),
    title: w.title || w.sportType || 'Sesión',
    source: w.source === 'strava' ? 'strava' : w.source === 'daily_checkin' ? 'checkin' : 'app',
    durationMin: pos(w.durationMinutes) ? Math.round(Number(w.durationMinutes)) : null,
    distanceKm: pos(w.distanceKm),
    avgHr: pos(w.avgHeartRate),
    maxHr: pos(w.maxHeartRate),
    rpe: pos(w.sessionRpe),
    fatigue: pos(w.fatigue),
    sleepHours: pos(w.sleepHours),
    lifts: lifts.slice(0, 12),
    analysis: analysis?.analysis || null,
    analysisSource: analysis?.source || null,
  };
}

export async function GET(request) {
  return withTrace('workout_history', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const limit = rawLimit == null ? 15 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return errorResponse(`Query param "limit" debe ser un entero entre 1 y ${MAX_LIMIT}.`, 400);
    }
    const before = searchParams.get('before');
    if (before != null && Number.isNaN(new Date(before).getTime())) {
      return errorResponse('Query param "before" debe ser una fecha ISO válida.', 400);
    }

    try {
      // Pedimos limit+1 para saber si hay más páginas sin otra consulta.
      const rows = await listWorkouts(user.uid, limit + 1, { before: before || null });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit)
        .filter((w) => (w.source === 'daily_checkin' ? w.completed === true : w.completed !== false));
      const analyses = await getWorkoutAnalysesByIds(user.uid, page.map((w) => w.id)).catch(() => ({}));
      const items = page.map((w) => mapItem(w, analyses[w.id]));
      const nextBefore = hasMore && rows[limit - 1]?.performedAt ? rows[limit - 1].performedAt : null;
      return jsonResponse({ ok: true, items, hasMore, nextBefore });
    } catch (error) {
      logError('workout_history_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo cargar el historial.', 500);
    }
  });
}
