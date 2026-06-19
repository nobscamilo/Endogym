// GET /api/session-for-date?date=YYYY-MM-DD
//
// Devuelve la sesión PRESCRITA de una fecha pasada (dentro del bloque activo) y, si ya hay
// algo registrado ese día, su resumen, para que la UI pueda registrar/editar una sesión de un
// día previo "partiendo del plan de ese día". No toca el dashboard del día actual: reutiliza
// los mismos mappers de studio-data pasando otra fecha.
//
// Reglas: la fecha debe ser válida, no futura y como máximo MAX_BACK_DAYS días atrás
// (alineado con las ventanas de reentrada del modelo). El registro real lo hace
// POST /api/workouts con performedAt/dailyCheckinDate de esa fecha (ver screen-train.jsx).

import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import { buildActiveBlockAdaptiveOverlay, isActiveBlockPlan } from '../../../core/activeBlockOverlay.js';
import { buildAdaptiveTuning, buildProgressMemory } from '../../../core/progressMemory.js';
import { evaluatePreparticipationScreening } from '../../../core/screening.js';
import {
  getUserProfile,
  getLatestWeeklyPlan,
  listMealsSince,
  listMetricsSince,
  listWorkoutsSince,
  getLastDoneWorkoutAt,
} from '../../../lib/repositories/firestoreRepository.js';
import { findDaySession } from '../../../core/sessionHistory.js';
import { dateKeyInTimeZone } from '../../../lib/appTime.js';
import { mapTodaySession } from '../studio-data/route.js';

const ISO_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_BACKLOG_DAYS = 14;

export function isValidDateKey(value) {
  if (typeof value !== 'string' || !ISO_DATE_KEY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Días civiles enteros entre dos claves YYYY-MM-DD (b - a). Positivo si b es posterior.
export function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86400000);
}

// Valida la fecha pedida contra "hoy" (civil). Devuelve { error } o { ok: true }.
export function validateBacklogDate(date, today, maxBackDays = MAX_BACKLOG_DAYS) {
  if (!isValidDateKey(date)) return { error: 'El parámetro "date" debe tener formato YYYY-MM-DD válido.' };
  const back = dayDiff(date, today);
  if (back < 0) return { error: 'No se puede registrar una sesión en una fecha futura.' };
  if (back > maxBackDays) return { error: `Solo puedes registrar hasta ${maxBackDays} días atrás.` };
  return { ok: true, back };
}

export async function GET(request) {
  return withTrace('session_for_date', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return errorResponse('Autenticación requerida.', 401);
      }
      throw error;
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const today = dateKeyInTimeZone();
    const check = validateBacklogDate(date, today);
    if (check.error) return errorResponse(check.error, 400);

    try {
      const since60dIso = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
      const [profile, latestPlan, workouts, recentMeals, metrics, lastDoneAtHint] = await Promise.all([
        getUserProfile(user.uid),
        getLatestWeeklyPlan(user.uid).catch(() => null),
        listWorkoutsSince(user.uid, since60dIso, 200).catch(() => []),
        listMealsSince(user.uid, since60dIso, 250).catch(() => []),
        listMetricsSince(user.uid, since60dIso, 200).catch(() => []),
        getLastDoneWorkoutAt(user.uid).catch(() => null),
      ]);

      let planForStudio = latestPlan;
      if (profile && isActiveBlockPlan(latestPlan, date)) {
        const progressMemory = buildProgressMemory({
          workouts,
          meals: recentMeals,
          metrics,
          lookbackDays: 21,
          now: new Date(),
          lastDoneAtHint,
        });
        const adaptiveTuning = buildAdaptiveTuning({
          profile,
          progressMemory,
          screening: evaluatePreparticipationScreening(profile.preparticipation),
        });
        planForStudio = buildActiveBlockAdaptiveOverlay({
          plan: latestPlan,
          adaptiveTuning,
          progressMemory,
          now: new Date(),
          today: date,
        }).plan;
      }

      const session = mapTodaySession(planForStudio, date, workouts, profile, { exact: true });
      const logged = findDaySession(workouts, date);
      const loggedSummary = logged
        ? {
            sources: logged.sources || [],
            sessionRpe: logged.sessionRpe ?? null,
            fatigue: logged.fatigue ?? null,
            sleepHours: logged.sleepHours ?? null,
            completed: logged.completed !== false,
            symptoms: logged.symptoms || null,
            hasAlarmSymptoms: Boolean(logged.hasAlarmSymptoms),
            lifts: (Array.isArray(logged.exercises) ? logged.exercises : [])
              .filter((e) => e?.name)
              .slice(0, 20)
              .map((e) => ({
                id: e.id || null,
                name: e.name,
                kg: Number(e.weightKg) > 0 ? Number(e.weightKg) : null,
                reps: e.reps ?? null,
                sets: e.sets ?? null,
              })),
          }
        : null;

      return jsonResponse({
        ok: true,
        date,
        today,
        isTrainingDay: Boolean(session),
        session,
        logged: loggedSummary,
      });
    } catch (error) {
      logError('session_for_date_failed', error, { traceId, userId: user.uid });
      return jsonResponse({ ok: false, error: 'No se pudo cargar la sesión de esa fecha.' });
    }
  });
}
