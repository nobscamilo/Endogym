import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import { getAdminServices } from '../../../lib/firebaseAdmin.js';
import { getUserProfile, getLatestWeeklyPlan } from '../../../lib/repositories/firestoreRepository.js';
import { suggestExerciseAlternatives } from '../../../core/exerciseLibrary.js';
import { buildSessionFocusChange, buildSessionFocusReschedule } from '../../../core/planner.js';
import { resolveRaceGoal, estimate5kPaceSecPerKm, deriveRunPaces, buildRunPrescription } from '../../../core/running.js';
import { dateKeyInTimeZone } from '../../../lib/appTime.js';

// Swap de ejercicios del Studio (fase 2). Cambia un ejercicio (scope 'one') o toda la sesión
// de hoy (scope 'all'), eligiendo alternativas con la lógica del coach (suggestExerciseAlternatives)
// y evitando repetir ejercicios de otros días del plan (no-repeat). Aplica en servidor y persiste
// el plan; el cliente refresca /api/studio-data para ver la sesión nueva.
// reason: 'variety' (def) | 'time' (recorta nº de ejercicios) | 'equipment'.

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function todayStrUTC() { return dateKeyInTimeZone(); }

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
    const requestedFocus = typeof body?.sessionFocus === 'string'
      ? body.sessionFocus
      : (typeof body?.targetFocus === 'string' ? body.targetFocus : '');
    const isFocusSwap = body?.scope === 'focus' || body?.reason === 'focus' || Boolean(requestedFocus);
    const reason = isFocusSwap
      ? 'focus'
      : (['time', 'equipment', 'variety', 'more_time'].includes(body?.reason) ? body.reason : 'variety');
    const scope = isFocusSwap ? 'focus' : ((body?.scope === 'all' || reason === 'more_time') ? 'all' : 'one');
    const exerciseId = typeof body?.exerciseId === 'string' ? body.exerciseId : null;
    if (scope === 'one' && !exerciseId) return errorResponse('Falta exerciseId.', 400);
    // #3 — zonas con molestias/agujetas marcadas antes de cambiar de grupo.
    const SORE_AREA_KEYS = ['leg', 'torso', 'shoulder', 'lumbar'];
    const soreAreas = Array.isArray(body?.soreAreas)
      ? Array.from(new Set(body.soreAreas.filter((a) => SORE_AREA_KEYS.includes(a)))).slice(0, 4)
      : [];

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

      if (scope === 'focus') {
        const profileForPlan = {
          ...(profile || {}),
          goal: plan.goal || profile?.goal,
          trainingMode: plan.trainingMode || profile?.trainingMode,
          trainingModality: plan.trainingModality || profile?.trainingModality,
        };
        // #2 — reprograma validado por intercambio (cuando el grupo elegido choca con un vecino).
        if (body?.action === 'reschedule') {
          const resched = buildSessionFocusReschedule({
            days: plan.days,
            dayIndex: idx,
            targetFocus: requestedFocus,
            profile: profileForPlan,
            adaptiveTuning: plan.adaptiveTuning || null,
            trainingMode: plan.trainingMode,
            trainingModality: plan.trainingModality,
            goal: plan.goal,
            phase: plan.phase,
            soreAreas,
          });
          if (!resched.ok) return errorResponse(resched.error, resched.status || 400, resched.details);
          plan.days[resched.today.index] = resched.today.day;
          plan.days[resched.neighbor.index] = resched.neighbor.day;
          const { db } = await getAdminServices();
          await db.collection('users').doc(user.uid).collection('weeklyPlans').doc(plan.id)
            .update({ days: plan.days, updatedAt: new Date().toISOString() });
          return jsonResponse({
            ok: true,
            sessionFocus: resched.today.day.sessionFocus,
            rescheduled: true,
            note: resched.note,
            soreNote: resched.soreNote || null,
            soreApplied: Boolean(resched.soreApplied),
          });
        }
        const change = buildSessionFocusChange({
          days: plan.days,
          dayIndex: idx,
          targetFocus: requestedFocus,
          profile: profileForPlan,
          adaptiveTuning: plan.adaptiveTuning || null,
          trainingMode: plan.trainingMode,
          trainingModality: plan.trainingModality,
          goal: plan.goal,
          phase: plan.phase,
          soreAreas,
        });
        if (!change.ok) {
          return errorResponse(change.error, change.status || 400, change.details);
        }
        plan.days[idx] = change.day;
        const { db } = await getAdminServices();
        await db.collection('users').doc(user.uid).collection('weeklyPlans').doc(plan.id)
          .update({ days: plan.days, updatedAt: new Date().toISOString() });
        return jsonResponse({ ok: true, sessionFocus: change.day.sessionFocus, options: change.options, converted: Boolean(change.converted), warning: change.warning || null, soreNote: change.soreNote || null, soreApplied: Boolean(change.soreApplied) });
      }

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

      // "Más tiempo": extiende la sesión actual (no reemplaza). Para carrera alarga la duración
      // y recalcula la prescripción; para fuerza añade ejercicios extra hasta el nuevo tiempo.
      if (reason === 'more_time') {
        const cur = Number(day.workout?.durationMinutes) || 60;
        let target = Number(body?.targetMinutes);
        if (!Number.isFinite(target)) target = cur + 30;
        target = Math.min(180, Math.max(cur + 5, Math.round(target)));
        day.workout.durationMinutes = target;

        if (day.sessionType === 'aerobic') {
          const raceGoal = resolveRaceGoal(profile?.runRaceGoal);
          const p5 = estimate5kPaceSecPerKm(profile?.runRefDistanceMeters, profile?.runRefTimeSeconds);
          const paces = deriveRunPaces(p5);
          day.workout.runPrescription = buildRunPrescription({
            sessionFocus: day.sessionFocus || day.workout?.sessionFocus,
            durationMinutes: target, raceGoal, paces, phase: plan.phase,
          });
        } else {
          const desired = Math.max(exercises.length + 1, Math.min(9, Math.round((target - 10) / 8)));
          const exclude = new Set(usedOtherDays);
          (day.workout.exercises || []).forEach((e) => exclude.add(norm(e.name)));
          let guard = 0;
          while ((day.workout.exercises || []).length < desired && guard < 14) {
            guard += 1;
            const seed = day.workout.exercises[day.workout.exercises.length - 1] || exercises[0];
            const alt = pickAlt(seed, exclude);
            if (!alt) break;
            day.workout.exercises.push(alt);
            exclude.add(norm(alt.name));
          }
        }

        const { db: dbx } = await getAdminServices();
        await dbx.collection('users').doc(user.uid).collection('weeklyPlans').doc(plan.id)
          .update({ days: plan.days, updatedAt: new Date().toISOString() });
        return jsonResponse({ ok: true, extendedTo: target });
      }

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
