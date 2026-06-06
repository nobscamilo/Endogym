import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import { getAdminServices } from '../../../lib/firebaseAdmin.js';
import { getUserProfile, getLatestWeeklyPlan } from '../../../lib/repositories/firestoreRepository.js';
import { suggestExerciseAlternatives } from '../../../core/exerciseLibrary.js';

// Swap de ejercicios del Studio (fase 2). Cambia un ejercicio (scope 'one') o toda la sesión
// de hoy (scope 'all'), eligiendo alternativas con la lógica del coach (suggestExerciseAlternatives)
// y evitando repetir ejercicios de otros días del plan (no-repeat). Aplica en servidor y persiste
// el plan; el cliente refresca /api/studio-data para ver la sesión nueva.
// reason: 'variety' (def) | 'time' (recorta nº de ejercicios) | 'equipment'.

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function todayStrUTC() { return new Date().toISOString().slice(0, 10); }

export async function POST(request) {
  return withTrace('studio_swap', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    let body;
    try { body = await request.json(); } catch { return errorResponse('JSON inválido.', 400); }
    const scope = body?.scope === 'all' ? 'all' : 'one';
    const reason = ['time', 'equipment', 'variety'].includes(body?.reason) ? body.reason : 'variety';
    const exerciseId = typeof body?.exerciseId === 'string' ? body.exerciseId : null;
    if (scope === 'one' && !exerciseId) return errorResponse('Falta exerciseId.', 400);

    try {
      const [profile, plan] = await Promise.all([
        getUserProfile(user.uid).catch(() => null),
        getLatestWeeklyPlan(user.uid).catch(() => null),
      ]);
      if (!plan || !Array.isArray(plan.days) || !plan.id) {
        return errorResponse('No hay plan que ajustar. Genera tu plan primero.', 409);
      }

      const today = todayStrUTC();
      const dayIdx = plan.days.findIndex((d) => d.date === today && d.isTrainingDay);
      const idx = dayIdx >= 0 ? dayIdx : plan.days.findIndex((d) => d.isTrainingDay);
      if (idx < 0) return errorResponse('No hay sesión de entreno hoy.', 409);
      const day = plan.days[idx];
      const exercises = Array.isArray(day.workout?.exercises) ? day.workout.exercises : [];
      if (!exercises.length) return errorResponse('La sesión no tiene ejercicios.', 409);

      const modality = reason === 'equipment' ? (body?.modality || plan.trainingModality) : plan.trainingModality;
      const ctx = {
        modality,
        sessionType: day.sessionType,
        sessionTitle: day.workout?.title || '',
        sessionFocus: day.sessionFocus || day.workout?.sessionFocus || null,
        goal: plan.goal,
        profile: profile || {},
      };

      // Nombres usados en OTROS días (para no repetir).
      const usedOtherDays = new Set();
      plan.days.forEach((d, i) => {
        if (i === idx) return;
        (d.workout?.exercises || []).forEach((e) => usedOtherDays.add(norm(e.name)));
      });

      const pickAlt = (ex, exclude) => {
        const alts = suggestExerciseAlternatives({ currentExerciseId: ex.id, currentExercise: ex, ...ctx, limit: 14 }) || [];
        return alts.find((a) => a && a.name && !exclude.has(norm(a.name))) || alts[0] || null;
      };

      let swapped = 0;
      if (scope === 'one') {
        const i = exercises.findIndex((e) => e.id === exerciseId) >= 0
          ? exercises.findIndex((e) => e.id === exerciseId)
          : exercises.findIndex((e) => norm(e.name) === norm(exerciseId));
        if (i < 0) return errorResponse('Ejercicio no encontrado en la sesión.', 404);
        const exclude = new Set([...usedOtherDays, ...exercises.map((e) => norm(e.name))]);
        exclude.delete(norm(exercises[i].name));
        const alt = pickAlt(exercises[i], exclude);
        if (alt) { exercises[i] = alt; swapped = 1; }
      } else {
        const exclude = new Set(usedOtherDays);
        const next = [];
        for (const ex of exercises) {
          const alt = pickAlt(ex, exclude);
          if (alt) { next.push(alt); exclude.add(norm(alt.name)); swapped += 1; }
          else { next.push(ex); exclude.add(norm(ex.name)); }
        }
        day.workout.exercises = reason === 'time' ? next.slice(0, Math.min(4, next.length)) : next;
      }

      if (!swapped) return errorResponse('No se encontraron alternativas adecuadas.', 422);

      const { db } = await getAdminServices();
      await db.collection('users').doc(user.uid).collection('weeklyPlans').doc(plan.id)
        .update({ days: plan.days, updatedAt: new Date().toISOString() });

      return jsonResponse({ ok: true, swapped });
    } catch (error) {
      logError('studio_swap_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo cambiar el ejercicio.', 500);
    }
  });
}
