import { createWorkout, listWorkouts } from '../../../lib/repositories/firestoreRepository.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { withTrace } from '../../../lib/logger.js';

function parseLimit(searchParams) {
  const rawLimit = searchParams.get('limit');
  if (rawLimit == null) {
    return 20;
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }

  return limit;
}

const MAX_EXERCISES_PER_WORKOUT = 60;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;
const ISO_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAILY_CHECKIN_SYMPTOM_KEYS = ['dyspnea', 'jointPain', 'dizziness', 'tachycardia'];

function isValidDateKey(value) {
  if (typeof value !== 'string' || !ISO_DATE_KEY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidSymptoms(symptoms) {
  if (!symptoms || typeof symptoms !== 'object' || Array.isArray(symptoms)) return false;
  return DAILY_CHECKIN_SYMPTOM_KEYS.every((key) => typeof symptoms[key] === 'boolean');
}

function getLatestAllowedDailyCheckinDate() {
  const tomorrowUtc = new Date();
  tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);
  return tomorrowUtc.toISOString().slice(0, 10);
}

function isValidDailyCheckin(payload) {
  if (payload.source !== 'daily_checkin') return true;
  if (!isValidDateKey(payload.dailyCheckinDate)) return false;
  if (payload.dailyCheckinDate > getLatestAllowedDailyCheckinDate()) return false;
  if (payload.performedAt.slice(0, 10) !== payload.dailyCheckinDate) return false;
  if (typeof payload.checkinSkipped !== 'boolean') return false;
  if (!isValidSymptoms(payload.symptoms)) return false;

  if (payload.checkinSkipped) {
    return payload.completed === false
      && payload.sessionRpe == null
      && payload.fatigue == null
      && payload.sleepHours == null;
  }

  return payload.completed === true
    && payload.sessionRpe != null
    && payload.fatigue != null
    && payload.sleepHours != null;
}

function isValidWorkoutPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!payload.title || typeof payload.title !== 'string' || payload.title.length > MAX_TITLE_LENGTH) return false;
  if (!payload.mode || typeof payload.mode !== 'string') return false;
  if (!payload.performedAt || typeof payload.performedAt !== 'string') return false;
  if (Number.isNaN(new Date(payload.performedAt).getTime())) return false;
  if (payload.durationMinutes != null && !Number.isFinite(Number(payload.durationMinutes))) return false;
  if (payload.exercises != null && !Array.isArray(payload.exercises)) return false;
  if (Array.isArray(payload.exercises) && payload.exercises.length > MAX_EXERCISES_PER_WORKOUT) return false;
  if (payload.notes != null && typeof payload.notes === 'string' && payload.notes.length > MAX_NOTES_LENGTH) return false;
  if (payload.sessionRpe != null) {
    const value = Number(payload.sessionRpe);
    if (!Number.isFinite(value) || value < 0 || value > 10) return false;
  }
  if (payload.fatigue != null) {
    const value = Number(payload.fatigue);
    if (!Number.isFinite(value) || value < 0 || value > 10) return false;
  }
  if (payload.sleepHours != null) {
    const value = Number(payload.sleepHours);
    if (!Number.isFinite(value) || value < 0 || value > 24) return false;
  }
  if (payload.mood != null) {
    const value = Number(payload.mood);
    if (!Number.isFinite(value) || value < 1 || value > 5) return false;
  }
  if (payload.completed != null && typeof payload.completed !== 'boolean') return false;
  if (payload.notes != null && typeof payload.notes !== 'string') return false;
  if (payload.source != null && !['manual', 'daily_checkin'].includes(payload.source)) return false;
  if (!isValidDailyCheckin(payload)) return false;
  return true;
}

export async function GET(request) {
  try {
    return await withTrace('workouts_list', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      const { searchParams } = new URL(request.url);
      const limit = parseLimit(searchParams);

      if (limit == null) {
        return errorResponse('Query param "limit" debe ser un entero entre 1 y 100.', 400);
      }

      // Cursor opcional de paginación: entrenos con performedAt estrictamente anterior.
      const before = searchParams.get('before');
      if (before != null && Number.isNaN(new Date(before).getTime())) {
        return errorResponse('Query param "before" debe ser una fecha ISO válida.', 400);
      }

      const workouts = await listWorkouts(user.uid, limit, { before: before || null });
      return jsonResponse({ traceId, workouts });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al listar entrenamientos.', 500);
  }
}

export async function POST(request) {
  try {
    return await withTrace('workouts_create', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);

      let payload;
      try {
        payload = await request.json();
      } catch {
        return errorResponse('JSON inválido en body.', 400);
      }

      if (!isValidWorkoutPayload(payload)) {
        return errorResponse('Payload inválido. Requiere title, mode y performedAt válidos.', 400);
      }

      const workout = await createWorkout(user.uid, payload);
      return jsonResponse({ traceId, workout }, 201);
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al crear entrenamiento.', 500);
  }
}
