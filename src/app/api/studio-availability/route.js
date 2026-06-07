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

    try {
      await upsertUserProfile(user.uid, patch);
      return jsonResponse({ ok: true });
    } catch (error) {
      logError('studio_availability_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo guardar la disponibilidad.', 500);
    }
  });
}
