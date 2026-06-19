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
  getStravaConnection,
} from '../../../lib/repositories/firestoreRepository.js';
import { hrMaxFromAge, hrZone, validateRunZone, buildEfficiencyTrend, predictRaceTimeFromRuns, formatRaceTime, RACE_GOAL_METERS } from '../../../core/running.js';
import { buildGoalProgress } from '../../../services/goalProgress.js';
import { collapseWorkoutsByDay, countDoneSessions, findDaySession } from '../../../core/sessionHistory.js';
import { listSessionFocusChangeOptions } from '../../../core/planner.js';
import { buildMesocycleReview } from '../../../core/mesocycleReview.js';
import { buildPrePostNutrition } from '../../../core/prePostNutrition.js';
import { buildWaistAssessment, estimateBodyFatNavy } from '../../../core/waistRisk.js';
import { dateKeyBoundsIso, dateKeyInTimeZone } from '../../../lib/appTime.js';

function paceLabel(secPerKm) {
  const s = Number(secPerKm);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}/km`;
}

// Validación de zonas: compara la FC real de cada carrera de Strava con la zona prescrita ese
// día. Solo para perfiles de carrera (híbrido/running o con objetivo de carrera).
function mapRunZones(workouts, plan, profile) {
  const modality = profile?.trainingModality || '';
  const isRunner = modality === 'hybrid_run_gym' || modality === 'running'
    || (profile?.runRaceGoal && profile.runRaceGoal !== 'health');
  if (!isRunner) return null;
  const runs = (Array.isArray(workouts) ? workouts : [])
    .filter((w) => w.source === 'strava' && /run|carrera|trail/i.test(String(w.sportType || '')) && Number(w.avgHeartRate));
  if (!runs.length) return null;
  const observedMax = Math.max(0, ...runs.map((w) => Number(w.maxHeartRate) || 0));
  // Prioridad: FCmáx medida por el usuario (perfil) > máx observada en sus carreras > estimación por edad.
  const manualHrMax = Number(profile?.hrMaxBpm);
  const hrMax = (Number.isFinite(manualHrMax) && manualHrMax >= 120)
    ? Math.max(manualHrMax, observedMax)
    : (Math.max(observedMax, hrMaxFromAge(profile?.age) || 0) || null);
  if (!hrMax) return null;
  const typeByDate = {};
  (plan?.days || []).forEach((d) => { if (d.workout?.runPrescription) typeByDate[d.date] = d.workout.runPrescription.runType; });
  const items = runs.slice(0, 8).map((w) => {
    const date = String(w.performedAt || '').slice(0, 10);
    const runType = typeByDate[date] || null;
    const z = hrZone(Number(w.avgHeartRate), hrMax);
    const v = runType ? validateRunZone({ avgHr: Number(w.avgHeartRate), hrMax, runType }) : null;
    return {
      date, title: w.title || 'Carrera', avgHr: Number(w.avgHeartRate),
      zone: z ? z.zone : null, pct: z ? z.pct : null,
      target: v ? v.target : null, verdict: v ? v.verdict : null, message: v ? v.message : null,
    };
  });
  return { hrMax, items };
}

// Historial visible de entrenos realizados (manuales + check-ins completados + Strava).
// Antes este dato existía en Firestore pero NO se mostraba en ninguna pantalla: el usuario
// registraba sesiones y "desaparecían". Alimenta la sección de Progreso.
function mapRecentWorkouts(workouts) {
  // Una sesión por día (fusiona check-in + manual + Strava); evita duplicados en el historial.
  const done = collapseWorkoutsByDay(workouts)
    .slice(0, 10)
    .map((w) => {
      const lifts = (Array.isArray(w.exercises) ? w.exercises : [])
        .filter((e) => e?.name)
        .map((e) => ({ name: e.name, kg: Number(e.weightKg) > 0 ? Number(e.weightKg) : null, sets: e.sets ?? null, reps: e.reps ?? null }));
      // Number(null) === 0 (finito): descarta null/'' antes de convertir para no mostrar 0 falsos.
      const pos = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
      return {
        date: String(w.performedAt || '').slice(0, 10),
        title: w.title || w.sportType || 'Sesión',
        source: w.source === 'strava' ? 'strava' : w.source === 'daily_checkin' ? 'checkin' : 'app',
        durationMin: pos(w.durationMinutes) ? Math.round(Number(w.durationMinutes)) : null,
        distanceKm: pos(w.distanceKm),
        avgHr: pos(w.avgHeartRate),
        rpe: pos(w.sessionRpe),
        lifts: lifts.slice(0, 8),
      };
    });
  return done.length ? done : null;
}

// Forma aeróbica real (corredores): eficiencia ritmo/FC y predicción de carrera
// con los mejores esfuerzos de Strava. Solo con datos suficientes; nada inventado.
// FASE 1.3 — Estado de reentrada para la UI: días sin entrenar, si toca el check-in
// de reentrada (1 pregunta: "¿por qué paraste?") y si hoy corresponde sesión puente
// o regenerar el plan. null para usuarios nuevos (nunca entrenaron) o activos (<7 días).
function mapReentry({ workouts, profile, lastDoneAtHint, tuning }) {
  const done = (Array.isArray(workouts) ? workouts : [])
    .filter((w) => (w.source === 'daily_checkin' ? w.completed === true : w.completed !== false))
    .map((w) => String(w.performedAt || ''))
    .filter(Boolean)
    .sort();
  let lastDoneAt = done.at(-1) || null;
  if (lastDoneAtHint && (!lastDoneAt || String(lastDoneAtHint) > lastDoneAt)) lastDoneAt = String(lastDoneAtHint);
  if (!lastDoneAt) return null;
  const ms = Date.now() - new Date(lastDoneAt).getTime();
  if (!Number.isFinite(ms)) return null;
  const days = Math.max(0, Math.floor(ms / 86400000));
  const tw = tuning?.workout || {};
  if (days < 7 && tw.bridgeSession !== true && tw.runIntensityStepDown !== true) return null;
  const answeredThisBreak = Boolean(profile?.reentry?.answeredAt && profile.reentry.answeredAt > lastDoneAt);
  return {
    daysSinceLastDone: days,
    needsCheckin: days >= 7 && !answeredThisBreak,
    bridgeSession: tw.bridgeSession === true || days >= 7,
    planStale: tw.planStale === true || days > 14,
  };
}

function mapRunFitness(workouts, profile) {
  const modality = profile?.trainingModality || '';
  const isRunner = modality === 'hybrid_run_gym' || modality === 'running'
    || (profile?.runRaceGoal && profile.runRaceGoal !== 'health');
  if (!isRunner) return null;
  const runs = (Array.isArray(workouts) ? workouts : [])
    .filter((w) => w.source === 'strava' && /run|carrera|trail/i.test(String(w.sportType || '')));
  if (!runs.length) return null;
  const out = {};
  const trend = buildEfficiencyTrend(runs);
  if (trend) {
    out.efficiency = {
      recentEf: trend.recentEf,
      baselineEf: trend.baselineEf,
      trendPct: trend.trendPct,
      runsUsed: trend.points.length,
    };
  }
  const targetMeters = RACE_GOAL_METERS[profile?.runRaceGoal] || null;
  if (targetMeters) {
    const pred = predictRaceTimeFromRuns({ distanceMeters: targetMeters, runs });
    if (pred) {
      out.prediction = {
        goal: profile.runRaceGoal.replace('race_', '').toUpperCase(),
        time: formatRaceTime(pred.seconds),
        basedOn: pred.basedOn,
      };
    }
  }
  return Object.keys(out).length ? out : null;
}

function mapCoachAdjust(plan) {
  const at = plan?.adaptiveTuning;
  const rules = Array.isArray(at?.appliedRules) ? at.appliedRules : [];
  if (!rules.length) return null;
  return {
    summary: at?.summary || null,
    volumeFactor: at?.workout?.volumeFactor ?? null,
    rules: rules.slice(0, 3).map((r) => ({ id: r.id, reason: r.reason, effect: r.effect })),
  };
}

function mapStrava(connection, workouts) {
  const runs = (Array.isArray(workouts) ? workouts : [])
    .filter((w) => w.source === 'strava')
    .slice(0, 8)
    .map((w) => ({
      date: (w.performedAt || '').slice(0, 10),
      title: w.title || w.sportType || 'Actividad',
      sport: w.sportType || '',
      distanceKm: w.distanceKm ?? null,
      durationMin: w.durationMinutes ?? null,
      avgHr: w.avgHeartRate ?? null,
      maxHr: w.maxHeartRate ?? null,
      pace: paceLabel(w.avgPaceSecPerKm),
    }));
  return {
    connected: Boolean(connection?.refreshToken),
    lastSyncAt: connection?.lastSyncAt || null,
    recent: runs,
  };
}

// Datos reales para el rediseño Studio (fase 2). Devuelve overrides que el bundle
// estático fusiona sobre window.STUDIO (datos de muestra) ANTES de renderizar.
// Cada sección es defensiva: si faltan datos válidos, se omite y se conserva la muestra.
//
// REAL: perfil, sesión de hoy (con vídeos reales de YouTube), semana, biblioteca,
//       macros objetivo/consumidas, progreso (peso + sesiones).
// MUESTRA (no hay equivalente en backend aún): recetas de comidas, lista de compra,
//       batch cooking, curva glucémica, strain/recovery/volumen muscular/PRs.

const HUES = [55, 232, 18, 300, 162, 78, 200, 120];

function todayStrUTC() {
  return dateKeyInTimeZone();
}

function initialsFrom(name, last) {
  const a = (name || '').trim()[0] || '';
  const b = (last || '').trim()[0] || '';
  return (a + b).toUpperCase() || a.toUpperCase() || 'U';
}

const GOAL_LABELS = { weight_loss: 'Pérdida de peso', recomposition: 'Recomposición', hypertrophy: 'Hipertrofia', strength: 'Fuerza', endurance: 'Resistencia', glycemic_control: 'Control glucémico' };
const MODALITY_LABELS = { full_gym: 'Gimnasio', home: 'Casa', trx: 'TRX', mixed: 'Flexible', hybrid_run_gym: 'Correr + Gym', running: 'Carrera', cycling: 'Ciclismo', yoga: 'Yoga', pilates: 'Pilates' };

function mapUser(profile, authUser) {
  // IMPORTANTE: nunca devolvemos null ni dejamos el nombre sin asignar; si lo hiciéramos, el
  // bundle conservaría el usuario de MUESTRA ("Marta García"). Derivamos un nombre real del
  // perfil, del displayName de Google o del email; en último caso, un genérico neutro.
  const p = profile || {};
  const au = authUser || {};
  const emailLocal = String(au.email || '').split('@')[0] || '';
  const prettyEmail = emailLocal ? emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1) : '';
  const name = p.firstName || p.name || p.displayName || au.name || prettyEmail || 'Atleta';
  const last = p.lastName || p.surname || '';
  const goal = p.goal || '';
  const modality = p.trainingModality || p.trainingMode || '';
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out = {};
  out.name = name;                       // SIEMPRE (evita heredar el nombre de muestra)
  out.last = last;                       // siempre (evita heredar el apellido de muestra)
  out.initials = initialsFrom(name, last);
  if (goal) { out.goalRaw = goal; out.goal = goal; out.goalShort = GOAL_LABELS[goal] || goal; }
  if (modality) { out.modalityRaw = modality; out.modality = MODALITY_LABELS[modality] || modality; }
  // #8 — primeros pasos: marca si el perfil ya pasó por la encuesta del Studio.
  out.profileComplete = p.studioAvailability === true && Boolean(goal);
  // Para prefijar el formulario de Perfil:
  if (num(p.age) !== undefined) out.age = num(p.age);
  if (num(p.weightKg) !== undefined) out.weightKg = num(p.weightKg);
  if (num(p.heightCm) !== undefined) out.heightCm = num(p.heightCm);
  if (p.sex) out.sex = p.sex;
  // Comorbilidades estructuradas (prefill de los checkboxes de Perfil)
  if (p.conditions && typeof p.conditions === 'object') out.conditions = p.conditions;
  // Objetivo SMART (prefill del formulario de Perfil)
  if (num(p.goalTarget?.value) !== undefined) out.goalTargetValue = num(p.goalTarget.value);
  if (p.goalTarget?.date) out.goalTargetDate = p.goalTarget.date;
  if (num(p.mealsPerDay) !== undefined) out.mealsPerDay = num(p.mealsPerDay);
  if (num(p.preferredDurationMinutes) !== undefined) out.sessionMinutes = num(p.preferredDurationMinutes);
  if (num(p.daysPerWeek) !== undefined) out.daysPerWeek = num(p.daysPerWeek);
  if (['novice', 'intermediate', 'advanced'].includes(p.trainingExperience)) out.trainingExperience = p.trainingExperience;
  // #4 — inventario de equipo y preferencias (prefill).
  if (Array.isArray(p.equipment)) out.equipment = p.equipment;
  if (Array.isArray(p.excludedExercises)) out.excludedExercises = p.excludedExercises;
  if (Array.isArray(p.favoriteExercises)) out.favoriteExercises = p.favoriteExercises;
  // Carrera (para prefijar la encuesta).
  if (p.runRaceGoal) out.runRaceGoal = p.runRaceGoal;
  if (num(p.runRefDistanceMeters) !== undefined) out.runRefDistanceMeters = num(p.runRefDistanceMeters);
  if (num(p.runRefTimeSeconds) !== undefined) out.runRefTimeSeconds = num(p.runRefTimeSeconds);
  if (p.raceDate) out.raceDate = p.raceDate;
  if (num(p.hrMaxBpm) !== undefined) out.hrMaxBpm = num(p.hrMaxBpm);
  return out;
}

function rpeAvg(rpe) {
  if (rpe == null) return null;
  if (typeof rpe === 'number') return rpe;
  if (typeof rpe === 'object') {
    const a = Number(rpe.min); const b = Number(rpe.max);
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    if (Number.isFinite(a)) return a;
    if (Number.isFinite(b)) return b;
  }
  return null;
}

function rpeLabel(rpe) {
  const v = rpeAvg(rpe);
  if (v == null) return 'Moderada';
  if (v < 5) return 'Suave';
  if (v < 7) return 'Moderada';
  if (v < 8.5) return 'Moderada-alta';
  return 'Alta';
}

function schemeOf(p) {
  if (!p) return '';
  if (p.format === 'reps') {
    const sets = p.sets ?? null;
    const reps = p.reps ?? null;
    if (sets && reps) return `${sets} × ${reps}`;
    if (reps) return `${reps} reps`;
    if (sets) return `${sets} series`;
    return '';
  }
  if (p.durationMinutes) return `${p.sets ? p.sets + ' × ' : ''}${p.durationMinutes} min`;
  return p.sets ? `${p.sets} series` : '';
}

function loadOf(p) {
  if (!p) return 'Selecciona';
  if (Number.isFinite(Number(p.loadKg)) && Number(p.loadKg) > 0) return `${p.loadKg} kg`;
  if (p.format !== 'reps') return 'Tiempo';
  return 'Selecciona';
}

function shortWeekday(dayName, dateStr) {
  if (typeof dayName === 'string' && dayName.trim()) {
    const s = dayName.trim();
    return s.charAt(0).toUpperCase() + s.slice(1, 3);
  }
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getUTCDay()];
  } catch { return ''; }
}

function dayNumber(dateStr) {
  const n = parseInt(String(dateStr).slice(8, 10), 10);
  return Number.isFinite(n) ? n : null;
}

// #6 — "Por qué de tu sesión": explicación DETERMINISTA (volumen, carga, selección) a partir de
// los datos reales del usuario y de su propia prescripción. Sin claims científicos inventados;
// para la base con citas se remite al coach (que sí hace RAG). Disciplina: no afirmar lo que no
// se puede sustentar con un pasaje recuperable.
const RATIONALE_EXPERIENCE_LABELS = { novice: 'principiante', intermediate: 'intermedio', advanced: 'avanzado' };
const RATIONALE_FOCUS_LABELS = { upper: 'torso', push: 'empuje', pull: 'tracción', lower: 'pierna', full_body: 'cuerpo completo', general_resistance: 'fuerza general' };

function buildSessionRationale(day, profile) {
  const ex = Array.isArray(day.workout?.exercises) ? day.workout.exercises : [];
  if (!['resistance', 'mixed'].includes(day.sessionType) || !ex.length) return null;
  const experience = RATIONALE_EXPERIENCE_LABELS[profile?.trainingExperience] || 'intermedio';
  const totalSets = ex.reduce((a, e) => a + (Number(e.prescription?.sets) || 0), 0);
  const usesDapre = ex.some((e) => e.prescription?.progression?.method === 'dapre');
  const dur = Number(day.workout?.durationMinutes) || null;
  const focusLabel = RATIONALE_FOCUS_LABELS[day.sessionFocus || day.workout?.sessionFocus] || null;

  const selection = [];
  if (focusLabel) selection.push(`foco en ${focusLabel}`);
  const c = profile?.conditions;
  const hasConds = c && (c.hypertension || c.diabetes || c.osteoarthritis || c.osteoporosis || (Array.isArray(c.injuryZones) && c.injuryZones.length));
  if (hasConds) selection.push('evitamos patrones que cargan tus zonas sensibles');
  if (Array.isArray(profile?.equipment) && profile.equipment.length) selection.push('solo ejercicios con tu material disponible');

  return {
    volume: `${ex.length} ejercicios${totalSets ? ` · ~${totalSets} series` : ''}. Ajustado a tu nivel ${experience}${dur ? ` y a ${dur} min de sesión` : ''}.`,
    load: usesDapre
      ? 'La carga de cada ejercicio sale de tu última sesión registrada (progresión por desempeño, DAPRE).'
      : 'Carga estimada por la fase del bloque; se afinará en cuanto registres tus series reales.',
    selection: selection.length ? `Selección: ${selection.join('; ')}.` : null,
    note: 'Para la base científica con citas, pregúntale al coach.',
  };
}

// `exact` (registro retroactivo): cuando es true, solo se devuelve la sesión si la fecha
// pedida es EXACTAMENTE un día de entrenamiento del plan; sin fallback al primer día de
// entreno (que falsearía la prescripción de un día de descanso o fuera de bloque).
export function mapTodaySession(plan, today, workouts = [], profile = null, { exact = false } = {}) {
  const days = plan?.days;
  if (!Array.isArray(days) || !days.length) return null;
  // Resolución de "hoy": para el dashboard se usa SIEMPRE el día EXACTO por fecha (aunque sea
  // recuperación/descanso) para que "Sesión de hoy"/"Hoy" coincida con la pestaña Semana. Antes se
  // exigía isTrainingDay y, en un día de descanso, se caía al primer día de fuerza del bloque →
  // discrepancia (mostraba Torso un viernes de recuperación). En modo `exact` (registro retroactivo)
  // se conserva el comportamiento anterior (solo día de entreno) para no alterar ese flujo.
  const day = exact
    ? (days.find((d) => d.date === today && d.isTrainingDay) || null)
    : (days.find((d) => d.date === today) || days.find((d) => d.isTrainingDay) || days[0]);
  if (!day) return null;
  const isRestDay = !day.isTrainingDay;
  const ex = Array.isArray(day.workout?.exercises) ? day.workout.exercises : [];
  const list = ex.map((e, i) => {
    const item = {
      id: e.id || null,
      name: e.name || 'Ejercicio',
      scheme: schemeOf(e.prescription),
      load: loadOf(e.prescription),
      tag: e.category || 'Ejercicio',
      muscle: (Array.isArray(e.primaryMuscles) && e.primaryMuscles[0]) || e.category || '',
      hue: HUES[i % HUES.length],
      done: false,
    };
    if (e.videoEmbedId) item.yt = e.videoEmbedId;
    if (Array.isArray(e.cues) && e.cues.length) item.cues = e.cues.slice(0, 3);
    if (e.prescription?.loadKg != null) item.loadKg = e.prescription.loadKg;
    if (e.prescription?.sets != null) item.sets = e.prescription.sets;
    if (e.prescription?.reps != null) item.reps = e.prescription.reps;
    if (e.prescription?.loadSource) item.loadSource = e.prescription.loadSource;
    return item;
  });
  // Un día de entreno sin ejercicios sí es null; un día de descanso/recuperación se devuelve igual
  // (con lista vacía + isRestDay) para NO caer a los datos demo y reflejar el día real.
  if (!list.length && (exact || !isRestDay)) return null;
  const prim = [...new Set(ex.flatMap((e) => e.primaryMuscles || []))].slice(0, 3);
  const sec = [...new Set(ex.flatMap((e) => e.secondaryMuscles || []))].slice(0, 3);
  const out = {
    title: day.workout?.title || 'Sesión de hoy',
    focus: day.sessionFocus || day.workout?.sessionFocus || '',
    durationMin: day.workout?.durationMinutes || null,
    intensity: rpeLabel(day.workout?.intensityRpe),
    list,
  };
  if (prim.length) out.primaryMuscles = prim;
  if (sec.length) out.secondaryMuscles = sec;
  const mapSteps = (arr) => (Array.isArray(arr) ? arr : []).map((w) => (
    typeof w === 'string' ? { step: w } : { step: w.step || '', min: w.durationMinutes ?? null, details: w.details || '' }
  )).filter((w) => w.step);
  const warmup = mapSteps(day.workout?.warmup);
  const cooldown = mapSteps(day.workout?.cooldown);
  if (warmup.length) out.warmup = warmup;
  if (cooldown.length) out.cooldown = cooldown;
  if (day.workout?.runPrescription) out.runPrescription = day.workout.runPrescription;
  out.sessionType = day.sessionType || '';
  out.isRestDay = isRestDay;
  // #1 — matriz de opciones de grupo muscular disponibles/bloqueadas (con motivo), para que la
  // UI pueda deshabilitar p. ej. "Torso" si mañana ya toca torso, sin esperar a enviar el cambio.
  // El cambio de grupo se ofrece en CUALQUIER día con sesión (los no-fuerza se convierten en
  // fuerza); por eso la matriz de opciones se calcula también para cardio/recuperación/mindbody.
  if (day.workout && Array.isArray(day.workout.exercises) && day.workout.exercises.length) {
    const dayIndex = days.indexOf(day);
    const focusOptions = listSessionFocusChangeOptions({ days, dayIndex });
    if (focusOptions.length) out.focusOptions = focusOptions;
    if (!['resistance', 'mixed'].includes(day.sessionType)) out.focusConversion = true;
  }
  // #6 — explicación determinista del "por qué" de la sesión.
  const rationale = buildSessionRationale(day, profile);
  if (rationale) out.rationale = rationale;
  // Recomendaciones pre/post entreno (deterministas, con límites clínicos).
  const nutritionAround = buildPrePostNutrition({ day, profile });
  if (nutritionAround) out.nutritionAround = nutritionAround;
  // Rehidratación de Entreno: si HOY ya hay una sesión registrada (check-in/manual/Strava),
  // la UI muestra "Registrada ✓" y el resumen en vez de pedir registro de nuevo.
  const loggedToday = findDaySession(workouts, today);
  if (loggedToday) {
    out.logged = true;
    out.loggedSummary = {
      sources: loggedToday.sources || [],
      sessionRpe: loggedToday.sessionRpe ?? null,
      fatigue: loggedToday.fatigue ?? null,
      sleepHours: loggedToday.sleepHours ?? null,
      completed: loggedToday.completed !== false,
      hasAlarmSymptoms: Boolean(loggedToday.hasAlarmSymptoms),
      lifts: (Array.isArray(loggedToday.exercises) ? loggedToday.exercises : [])
        .filter((e) => e?.name)
        .slice(0, 12)
        .map((e) => ({ name: e.name, kg: Number(e.weightKg) > 0 ? Number(e.weightKg) : null, reps: e.reps ?? null, sets: e.sets ?? null })),
    };
  } else {
    out.logged = false;
  }
  return out;
}

export function mapWeek(plan, today, workouts = []) {
  let days = plan?.days;
  if (!Array.isArray(days) || !days.length) return null;
  // En un bloque de varias semanas, muestra solo la SEMANA actual (lunes→domingo) que
  // contiene "today"; si today cae fuera, la primera semana del bloque.
  if (days.length > 7) {
    const ref = days.find((d) => d.date === today) ? new Date(today) : new Date(days[0].date);
    if (!Number.isNaN(ref.getTime())) {
      const js = ref.getUTCDay();
      const monday = new Date(ref);
      monday.setUTCDate(ref.getUTCDate() + (js === 0 ? -6 : 1 - js));
      const mondayStr = monday.toISOString().slice(0, 10);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      const sundayStr = sunday.toISOString().slice(0, 10);
      const windowed = days.filter((d) => d.date >= mondayStr && d.date <= sundayStr);
      if (windowed.length) days = windowed;
      else days = days.slice(0, 7);
    } else {
      days = days.slice(0, 7);
    }
  }
  let plannedMinutes = 0;
  const week = days.map((d) => {
    const training = d.isTrainingDay;
    const v = rpeAvg(d.workout?.intensityRpe);
    const load = training ? Math.min(1, Math.max(0.4, (v || 7) / 10)) : 0.15;
    const durMin = Number(d.workout?.durationMinutes);
    if (training && Number.isFinite(durMin) && durMin > 0) plannedMinutes += durMin;
    const row = {
      day: shortWeekday(d.dayName, d.date),
      date: dayNumber(d.date),
      dateISO: d.date || null,
      focus: d.workout?.title || d.sessionFocus || '',
      tag: d.sessionFocus || '',
      load: Number(load.toFixed(2)),
    };
    if (d.date === today) row.today = true;
    if (!training) row.rest = true;
    if (d.date && today) row.past = d.date < today;
    // Historial REAL del día: si hay una sesión registrada (manual/check-in/Strava), se adjunta su
    // resumen para poder revisar en Semana lo que de verdad se hizo (ejercicios/kg/reps/RPE).
    const logged = findDaySession(workouts, d.date);
    if (logged) {
      row.logged = {
        sources: logged.sources || [],
        sessionRpe: logged.sessionRpe ?? null,
        fatigue: logged.fatigue ?? null,
        durationMinutes: Number(logged.durationMinutes) > 0 ? Number(logged.durationMinutes) : null,
        distanceKm: Number(logged.distanceKm) > 0 ? Number(logged.distanceKm) : null,
        lifts: (Array.isArray(logged.exercises) ? logged.exercises : [])
          .filter((e) => e?.name)
          .slice(0, 14)
          .map((e) => ({ name: e.name, kg: Number(e.weightKg) > 0 ? Number(e.weightKg) : null, reps: e.reps ?? null, sets: e.sets ?? null })),
      };
    }
    return row;
  });
  if (!week.length) return null;
  const volumeHours = plannedMinutes > 0 ? Math.round((plannedMinutes / 60) * 10) / 10 : null;
  return { days: week, volumeHours };
}

function mapLibrary(plan) {
  const days = plan?.days;
  if (!Array.isArray(days)) return null;
  const seen = new Set();
  const lib = [];
  for (const d of days) {
    for (const e of (d.workout?.exercises || [])) {
      if (!e?.name || seen.has(e.name)) continue;
      seen.add(e.name);
      const item = {
        name: e.name,
        muscle: (Array.isArray(e.primaryMuscles) && e.primaryMuscles[0]) || e.category || '',
        level: e.difficulty || 'Base',
        equip: e.equipment || '—',
        len: '',
        hue: HUES[lib.length % HUES.length],
      };
      if (e.videoEmbedId) item.yt = e.videoEmbedId;
      lib.push(item);
      if (lib.length >= 12) break;
    }
    if (lib.length >= 12) break;
  }
  return lib.length ? lib : null;
}

function mapMacroTargets(plan, today) {
  const days = plan?.days;
  const dayTarget = Array.isArray(days)
    ? (days.find((d) => d.date === today) || days[0])?.nutritionTarget
    : null;
  const t = dayTarget || plan?.baseTarget;
  if (!t) return null;
  const kcal = Number(t.targetCalories ?? t.calories);
  if (!Number.isFinite(kcal)) return null;
  return {
    kcal: Math.round(kcal),
    protein: Math.round(Number(t.proteinGrams) || 0),
    carbs: Math.round(Number(t.carbsGrams) || 0),
    fat: Math.round(Number(t.fatGrams) || 0),
  };
}

function mapMacroEaten(meals) {
  if (!Array.isArray(meals) || !meals.length) return null;
  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const m of meals) {
    const t = m.totals || {};
    sum.kcal += Number(t.calories) || 0;
    sum.protein += Number(t.proteinGrams) || 0;
    sum.carbs += Number(t.carbsGrams) || 0;
    sum.fat += Number(t.fatGrams) || 0;
  }
  return {
    kcal: Math.round(sum.kcal),
    protein: Math.round(sum.protein),
    carbs: Math.round(sum.carbs),
    fat: Math.round(sum.fat),
  };
}

// Glucemia real desde las comidas logueadas de hoy.
// Simula la curva de glucosa continua si hay comidas registradas hoy.
function mapGlycemic(meals) {
  if (!Array.isArray(meals) || !meals.length) return null;
  let load = 0; let iiSum = 0; let iiN = 0; let has = false;
  for (const m of meals) {
    const t = m.totals || {};
    if (Number.isFinite(Number(t.glycemicLoad))) { load += Number(t.glycemicLoad); has = true; }
    if (Number.isFinite(Number(t.insulinIndex))) { iiSum += Number(t.insulinIndex); iiN += 1; }
  }
  if (!has) return null;
  const dayLoad = Math.round(load);
  const dayClass = dayLoad < 25 ? 'good' : dayLoad < 50 ? 'mid' : 'high';

  return {
    dayLoad,
    dayClass,
    insulinIndex: iiN ? Math.round(iiSum / iiN) : null,
    note: 'Carga glucémica estimada a partir de tus comidas registradas hoy.',
  };
}

const MUSCLE_GROUPS = [
  ['Pecho', ['pecho', 'pectoral', 'chest']],
  ['Espalda', ['espalda', 'dorsal', 'lat', 'lumbar', 'trapecio', 'back', 'romboide']],
  ['Pierna', ['cuadricep', 'quad', 'isquio', 'femoral', 'hamstring', 'gluteo', 'glute', 'pierna', 'gemelo', 'pantorrilla', 'aductor']],
  ['Hombro', ['hombro', 'deltoid', 'shoulder']],
  ['Brazo', ['biceps', 'triceps', 'brazo', 'antebrazo', 'forearm']],
  ['Core', ['core', 'abs', 'abdomen', 'oblicuo', 'oblique']],
];
function groupOf(muscle) {
  const n = String(muscle || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [g, terms] of MUSCLE_GROUPS) if (terms.some((t) => n.includes(t))) return g;
  return null;
}

function mapProgress(metrics, workouts, plan, profile = null) {
  const out = {};
  const wlist = Array.isArray(workouts) ? workouts : [];
  // Las métricas guardan `takenAt`; toleramos `performedAt` por compatibilidad con registros viejos.
  const metricDate = (m) => m.takenAt || m.performedAt || '';

  // Peso (métricas)
  const weights = (Array.isArray(metrics) ? metrics : [])
    .filter((m) => Number.isFinite(Number(m.weightKg)) && metricDate(m))
    .sort((a, b) => String(metricDate(a)).localeCompare(String(metricDate(b))))
    .map((m) => Number(m.weightKg));
  if (weights.length >= 2) {
    const series = weights.slice(-7);
    out.weightSeries = series;
    out.weightNow = series[series.length - 1];
    out.weightDelta6w = Number((series[series.length - 1] - series[0]).toFixed(1));
    out.weightDeltaWk = Number((series[series.length - 1] - series[Math.max(0, series.length - 2)]).toFixed(1));
  } else {
    out.weightSeries = weights.length === 1 ? weights : [];
    out.weightNow = weights.length === 1 ? weights[0] : null;
    out.weightDelta6w = null;
    out.weightDeltaWk = null;
  }

  // Perímetro abdominal (cintura): serie temporal + evaluación de riesgo (ICA + cintura/sexo).
  const waists = (Array.isArray(metrics) ? metrics : [])
    .filter((m) => Number.isFinite(Number(m.waistCm)) && Number(m.waistCm) > 0 && metricDate(m))
    .sort((a, b) => String(metricDate(a)).localeCompare(String(metricDate(b))))
    .map((m) => Number(m.waistCm));
  if (waists.length) {
    const series = waists.slice(-8);
    const now = series[series.length - 1];
    const assessment = buildWaistAssessment({ waistCm: now, heightCm: profile?.heightCm, sex: profile?.sex });
    out.waist = {
      now,
      series,
      delta: series.length >= 2 ? Number((now - series[0]).toFixed(1)) : null,
      ...(assessment || {}),
    };
  }

  // % grasa OPCIONAL (método Navy): una estimación por cada medición que traiga las medidas.
  const bfRaw = (Array.isArray(metrics) ? metrics : [])
    .filter((m) => metricDate(m) && Number(m.waistCm) > 0 && Number(m.neckCm) > 0)
    .sort((a, b) => String(metricDate(a)).localeCompare(String(metricDate(b))))
    .map((m) => estimateBodyFatNavy({ sex: profile?.sex, waistCm: m.waistCm, neckCm: m.neckCm, heightCm: profile?.heightCm, hipCm: m.hipCm }))
    .filter(Boolean);
  if (bfRaw.length) {
    const series = bfRaw.map((r) => r.bodyFatPct).slice(-8);
    out.bodyFat = {
      now: series[series.length - 1],
      series,
      delta: series.length >= 2 ? Number((series[series.length - 1] - series[0]).toFixed(1)) : null,
      method: 'navy',
      note: bfRaw[bfRaw.length - 1].note,
    };
  }

  // Sesiones / adherencia / volumen (plan + entrenos)
  const planDays = Array.isArray(plan?.days) ? plan.days : [];
  const sessionsPlan = planDays.filter((d) => d.isTrainingDay).length;
  if (sessionsPlan) out.sessionsPlan = sessionsPlan;
  // 1 sesión por día: fusiona check-in + manual + Strava para no inflar adherencia.
  const done = countDoneSessions(wlist);
  out.sessionsDone = done;
  if (sessionsPlan) out.adherence = Math.min(100, Math.round((done / sessionsPlan) * 100));
  const planVolMin = planDays.reduce((a, d) => a + (d.isTrainingDay ? Number(d.workout?.durationMinutes) || 0 : 0), 0);
  if (planVolMin) out.volumeWk = Number((planVolMin / 60).toFixed(1));

  // Strain (últimos 7 días) desde check-ins/entrenos: RPE del día (0-10).
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const strain = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const w = wlist.find((x) => String(x.performedAt || '').slice(0, 10) === key);
    strain.push(w && Number.isFinite(Number(w.sessionRpe)) ? Number(w.sessionRpe) : 0);
  }
  out.strain = strain.some((v) => v > 0) ? strain : [];

  // Recovery (proxy del último check-in con sueño/fatiga)
  const lastCheckin = wlist
    .filter((w) => w.source === 'daily_checkin' && (Number.isFinite(Number(w.sleepHours)) || Number.isFinite(Number(w.fatigue))))
    .sort((a, b) => String(b.performedAt).localeCompare(String(a.performedAt)))[0];
  if (lastCheckin) {
    const sleep = Number(lastCheckin.sleepHours);
    const fatigue = Number(lastCheckin.fatigue);
    let rec = 50;
    if (Number.isFinite(sleep)) rec = (Math.min(8, sleep) / 8) * 55;
    if (Number.isFinite(fatigue)) rec += (10 - fatigue) * 4.5;
    out.recovery = Math.max(0, Math.min(100, Math.round(rec)));
  } else {
    out.recovery = null;
  }

  // Volumen por grupo muscular (desde los ejercicios del plan)
  const counts = {};
  planDays.forEach((d) => (d.workout?.exercises || []).forEach((e) => {
    (e.primaryMuscles || [e.category]).forEach((m) => { const g = groupOf(m); if (g) counts[g] = (counts[g] || 0) + 1; });
  }));
  const maxC = Math.max(0, ...Object.values(counts));
  out.muscleVolume = maxC > 0 ? MUSCLE_GROUPS.map(([g]) => ({ m: g, v: Number(((counts[g] || 0) / maxC).toFixed(2)) })) : [];

  // PRs (récords) desde entrenos manuales con ejercicios y carga.
  const prByLift = {};
  wlist.forEach((w) => (w.exercises || []).forEach((e) => {
    const kg = Number(e.weightKg);
    if (e.name && Number.isFinite(kg) && kg > 0) {
      if (!prByLift[e.name] || kg > prByLift[e.name]) prByLift[e.name] = kg;
    }
  }));
  out.pr = Object.entries(prByLift).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([lift, kg]) => ({ lift, val: `${kg} kg`, delta: '' }));

  return Object.keys(out).length ? out : null;
}

export async function GET(request) {
  return withTrace('studio_data', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return errorResponse('Autenticación requerida.', 401);
      }
      throw error;
    }

    try {
      const today = todayStrUTC();
      const { startIso: startOfTodayIso, endIso: endOfTodayIso } = dateKeyBoundsIso(today);
      const since21dIso = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
      const since6wIso = new Date(Date.now() - 42 * 24 * 3600 * 1000).toISOString();
      const since60dIso = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();

      const [profile, latestPlan, recentMeals, metrics, workouts, stravaConn] = await Promise.all([
        getUserProfile(user.uid),
        getLatestWeeklyPlan(user.uid).catch(() => null),
        listMealsSince(user.uid, since21dIso, 250).catch(() => []),
        listMetricsSince(user.uid, since6wIso, 200).catch(() => []),
        listWorkoutsSince(user.uid, since60dIso, 200).catch(() => []),
        getStravaConnection(user.uid).catch(() => null),
      ]);
      const todayMeals = (Array.isArray(recentMeals) ? recentMeals : [])
        .filter((meal) => {
          const at = String(meal?.eatenAt || meal?.createdAt || '');
          return at >= startOfTodayIso && at < endOfTodayIso;
        })
        .slice(0, 50);
      let planForStudio = latestPlan;
      // FASE 1.3 — estado de reentrada (independiente de que haya bloque activo).
      const lastDoneAtHint = await getLastDoneWorkoutAt(user.uid).catch(() => null);
      let reentryTuning = null;
      if (profile && isActiveBlockPlan(latestPlan, today)) {
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
        reentryTuning = adaptiveTuning;
        planForStudio = buildActiveBlockAdaptiveOverlay({
          plan: latestPlan,
          adaptiveTuning,
          progressMemory,
          now: new Date(),
          today,
        }).plan;
      }

      const overrides = {};
      const setIf = (key, val) => { if (val != null) overrides[key] = val; };

      setIf('user', mapUser(profile, user));
      setIf('runPaces', planForStudio?.runPaces || null);
      setIf('todaySession', mapTodaySession(planForStudio, today, workouts, profile));
      const weekData = mapWeek(planForStudio, today, workouts);
      setIf('week', weekData?.days || null);
      setIf('weekVolumeHours', weekData?.volumeHours ?? null);
      setIf('library', mapLibrary(planForStudio));
      setIf('macroTargets', mapMacroTargets(planForStudio, today));
      setIf('macroEaten', mapMacroEaten(todayMeals));
      setIf('glycemic', mapGlycemic(todayMeals));
      setIf('progress', mapProgress(metrics, workouts, planForStudio, profile));
      setIf('strava', mapStrava(stravaConn, workouts));
      setIf('coachAdjust', mapCoachAdjust(planForStudio));
      setIf('recentWorkouts', mapRecentWorkouts(workouts));
      setIf('runZones', mapRunZones(workouts, planForStudio, profile));
      setIf('runFitness', mapRunFitness(workouts, profile));
      setIf('reentry', mapReentry({ workouts, profile, lastDoneAtHint, tuning: reentryTuning }));
      setIf('goalProgress', profile ? buildGoalProgress({ profile, metrics, workouts }) : null);
      // #7 — revisión del mesociclo: solo si hay señales de que conviene regenerar el bloque.
      const review = buildMesocycleReview({ plan: latestPlan, workouts, today });
      setIf('mesocycleReview', review && review.status === 'review' ? review : null);

      return jsonResponse({ ok: true, overrides });
    } catch (error) {
      logError('studio_data_failed', error, { traceId, userId: user.uid });
      return jsonResponse({ ok: false, overrides: {} });
    }
  });
}
