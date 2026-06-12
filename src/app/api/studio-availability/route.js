import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import { upsertUserProfile } from '../../../lib/repositories/firestoreRepository.js';

// Encuesta de disponibilidad del Studio. Hace un MERGE PARCIAL del perfil (upsertUserProfile,
// no resetea otros campos como el PUT de /api/profile) con: objetivo, equipo (→ modalidad),
// comidas/día, minutos por sesión, días por semana y cada cuántas semanas re-preguntar.
// Marca `studioAvailability: true` para que el planner honre la duración de forma segura.

const GOALS = new Set(['weight_loss', 'recomposition', 'hypertrophy', 'strength', 'endurance', 'glycemic_control']);
const MODALITIES = new Set(['full_gym', 'home', 'trx', 'mixed', 'hybrid_run_gym']);
const RACE_GOALS = new Set(['health', 'race_5k', 'race_10k', 'race_21k', 'race_42k']);

export async function POST(request) {
  return withTrace('studio_availability', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    let body;
    try { body = await request.json(); } catch { return errorResponse('JSON inválido.', 400); }

    const patch = { studioAvailability: true, lastSurveyAt: new Date().toISOString() };
    if (GOALS.has(body?.goal)) patch.goal = body.goal;
    if (MODALITIES.has(body?.trainingModality)) {
      patch.trainingModality = body.trainingModality;
      patch.trainingMode = body.trainingModality === 'full_gym' ? 'gym' : 'home';
    }
    const meals = Number(body?.mealsPerDay);
    if (Number.isFinite(meals)) patch.mealsPerDay = Math.min(6, Math.max(3, Math.round(meals)));
    const mins = Number(body?.sessionMinutes ?? body?.preferredDurationMinutes);
    if (Number.isFinite(mins)) patch.preferredDurationMinutes = Math.min(150, Math.max(20, Math.round(mins)));
    const days = Number(body?.daysPerWeek);
    if (Number.isFinite(days)) patch.daysPerWeek = Math.min(7, Math.max(1, Math.round(days)));
    const weeks = Number(body?.resurveyWeeks);
    if (Number.isFinite(weeks)) patch.resurveyWeeks = Math.min(26, Math.max(1, Math.round(weeks)));
    // Datos personales (también merge parcial, no resetean el resto del perfil).
    const age = Number(body?.age);
    if (Number.isFinite(age)) patch.age = Math.min(100, Math.max(12, Math.round(age)));
    const weightKg = Number(body?.weightKg);
    if (Number.isFinite(weightKg)) patch.weightKg = Math.min(300, Math.max(30, Math.round(weightKg * 10) / 10));
    const heightCm = Number(body?.heightCm);
    if (Number.isFinite(heightCm)) patch.heightCm = Math.min(230, Math.max(120, Math.round(heightCm)));
    if (['male', 'female'].includes(body?.sex)) patch.sex = body.sex;
    // Carrera: objetivo + marca de referencia (para ritmos numéricos).
    if (RACE_GOALS.has(body?.runRaceGoal)) patch.runRaceGoal = body.runRaceGoal;
    const refDist = Number(body?.runRefDistanceMeters);
    if (Number.isFinite(refDist) && refDist >= 800 && refDist <= 100000) patch.runRefDistanceMeters = Math.round(refDist);
    else if (body?.runRefDistanceMeters === null) patch.runRefDistanceMeters = null;
    const refTime = Number(body?.runRefTimeSeconds);
    if (Number.isFinite(refTime) && refTime >= 120 && refTime <= 36000) patch.runRefTimeSeconds = Math.round(refTime);
    else if (body?.runRefTimeSeconds === null) patch.runRefTimeSeconds = null;
    // Fecha de carrera (YYYY-MM-DD) para la periodización.
    if (typeof body?.raceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.raceDate)) patch.raceDate = body.raceDate;
    else if (body?.raceDate === null) patch.raceDate = null;
    // FCmáx medida (opcional): prevalece sobre la estimación por edad en zonas y coach.
    const hrMax = Number(body?.hrMaxBpm);
    if (Number.isFinite(hrMax) && hrMax >= 120 && hrMax <= 230) patch.hrMaxBpm = Math.round(hrMax);
    else if (body?.hrMaxBpm === null) patch.hrMaxBpm = null;

    // Comorbilidades ESTRUCTURADAS (checkboxes de Perfil): fuente principal de
    // detectComorbidities (calentamiento/retorno, restricciones de selección).
    if (body?.conditions && typeof body.conditions === 'object') {
      const VALID_ZONES = new Set(['lumbar', 'rodilla', 'hombro', 'tobillo', 'cadera', 'cervical', 'muñeca']);
      patch.conditions = {
        hypertension: body.conditions.hypertension === true,
        diabetes: body.conditions.diabetes === true,
        osteoarthritis: body.conditions.osteoarthritis === true,
        osteoporosis: body.conditions.osteoporosis === true,
        injuryZones: (Array.isArray(body.conditions.injuryZones) ? body.conditions.injuryZones : [])
          .filter((z) => VALID_ZONES.has(z)).slice(0, 7),
      };
    }

    // Objetivo SMART medible: valor numérico + fecha. El "kind" se deriva del goal
    // server-side (peso corporal para perder grasa/recomposición/ganar músculo; e1RM
    // para fuerza). El objetivo de carrera ya tiene su propio flujo (runRaceGoal/raceDate).
    const goalForTarget = GOALS.has(body?.goal) ? body.goal : null;
    const targetKindByGoal = {
      weight_loss: 'weightKg', recomposition: 'weightKg', hypertrophy: 'weightKg', strength: 'e1rmKg',
    };
    if (body?.goalTargetValue === null) {
      patch.goalTarget = null;
    } else if (goalForTarget && targetKindByGoal[goalForTarget]) {
      const v = Number(body?.goalTargetValue);
      const kind = targetKindByGoal[goalForTarget];
      const okRange = kind === 'weightKg' ? (v >= 30 && v <= 300) : (v >= 10 && v <= 500);
      const date = typeof body?.goalTargetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.goalTargetDate)
        ? body.goalTargetDate : null;
      if (Number.isFinite(v) && okRange) {
        patch.goalTarget = {
          kind,
          goal: goalForTarget,
          value: Math.round(v * 10) / 10,
          date,
          setAt: new Date().toISOString(),
        };
      }
    }

    // FASE 1.3 — Check-in de reentrada (1 pregunta: ¿por qué paraste?). El front lo envía
    // la primera vez que el usuario vuelve tras ≥7 días sin entrenar. answeredAt/daysOut
    // se fijan server-side; alimentan las reglas REENTRY_* de buildAdaptiveTuning.
    const REENTRY_REASONS = new Set(['vacaciones', 'enfermedad', 'motivacion', 'otro']);
    if (REENTRY_REASONS.has(body?.reentryReason)) {
      const daysOut = Number(body?.reentryDaysOut);
      patch.reentry = {
        reason: body.reentryReason,
        answeredAt: new Date().toISOString(),
        daysOut: Number.isFinite(daysOut) ? Math.min(365, Math.max(0, Math.round(daysOut))) : null,
      };
      // Si el POST es SOLO el check-in de reentrada (sin encuesta), no marcar
      // studioAvailability: ese flag cambia cómo el planner honra duración/frecuencia.
      if (!GOALS.has(body?.goal) && !MODALITIES.has(body?.trainingModality)
        && body?.sessionMinutes == null && body?.preferredDurationMinutes == null && body?.daysPerWeek == null) {
        delete patch.studioAvailability;
        delete patch.lastSurveyAt;
      }
    }

    try {
      await upsertUserProfile(user.uid, patch);
      return jsonResponse({ ok: true });
    } catch (error) {
      logError('studio_availability_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo guardar la disponibilidad.', 500);
    }
  });
}
