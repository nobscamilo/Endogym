// Lógica del "Análisis del coach" (Progreso): construye el digest de entrenos reales,
// el prompt para Gemini, el informe heurístico de fallback y la firma de invalidación.
// Separado de la ruta /api/coach-analysis para poder testearlo y sondearlo directamente.
import { buildAdaptiveTuning, buildProgressMemory } from '../core/progressMemory.js';
import { evaluatePreparticipationScreening } from '../core/screening.js';
import {
  getUserProfile,
  getLatestWeeklyPlan,
  listWorkoutsSince,
  listMetricsSince,
  listMealsSince,
  getWorkoutById,
  getLastDoneWorkoutAt,
  getCoachRecommendation,
} from '../lib/repositories/firestoreRepository.js';
import { buildNutritionDigest, describeNutritionDigest, buildRecoveryTrend, describeRecoveryTrend } from '../core/wellnessDigest.js';
import { COACH_ANALYST_PERSONA } from './coachPersona.js';

export const COACH_ANALYSIS_LOOKBACK_DAYS = 28;

export const COACH_ANALYSIS_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    lastSession: { type: 'string', description: 'Análisis del último entreno realizado (2-4 frases, cita números reales: cargas, FC, RPE).' },
    history: { type: 'string', description: 'Comparación con los entrenos previos y tendencia (2-4 frases con datos concretos).' },
    adjustments: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ajustes concretos que el coach aplicará a las PRÓXIMAS sesiones (2-4 puntos accionables).',
    },
    warning: { type: 'string', description: 'Señal de alerta si la hay (FC elevada, fatiga, síntomas); cadena vacía si no.' },
  },
  required: ['lastSession', 'history', 'adjustments'],
};

export function isDoneWorkout(w) {
  if (!w) return false;
  if (w.source === 'daily_checkin') return w.completed === true;
  return w.completed !== false;
}

function workoutKey(w) {
  return [w.stravaActivityId || '', w.source || 'manual', String(w.performedAt || '').slice(0, 19), w.title || ''].join('|');
}

// Firma estable del conjunto de entrenos: si cambia (entrenó de nuevo), el informe queda stale.
export function workoutsSignature(workouts) {
  const done = (Array.isArray(workouts) ? workouts : []).filter(isDoneWorkout);
  const keys = done.map(workoutKey).sort();
  let hash = 0;
  const s = keys.join(';');
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return `${done.length}-${(hash >>> 0).toString(16)}`;
}

function fmtDate(iso) {
  return String(iso || '').slice(0, 10);
}

// OJO: Number(null) === 0 (finito); hay que descartar null/'' explícitamente para no
// imprimir "null km", "FC media null" o "0 min" inventados en el digest.
function posNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function describeWorkout(w) {
  const parts = [`${fmtDate(w.performedAt)} · ${w.title || w.sportType || 'Sesión'}`];
  if (w.source === 'strava') parts.push(`Strava (${w.sportType || 'actividad'})`);
  else if (w.source === 'daily_checkin') parts.push('check-in');
  else parts.push('registrada en la app');
  const dur = posNum(w.durationMinutes);
  const dist = posNum(w.distanceKm);
  const hr = posNum(w.avgHeartRate);
  const hrMax = posNum(w.maxHeartRate);
  const rpe = posNum(w.sessionRpe);
  if (dur) parts.push(`${Math.round(dur)} min`);
  if (dist) parts.push(`${dist} km`);
  if (hr) parts.push(`FC media ${hr}${hrMax ? ` (máx ${hrMax})` : ''} ppm`);
  if (rpe) parts.push(`RPE ${rpe}/10`);
  if (Array.isArray(w.exercises) && w.exercises.length) {
    const lifts = w.exercises
      .filter((e) => e?.name && Number.isFinite(Number(e.weightKg)))
      .map((e) => `${e.name} ${e.weightKg} kg${e.sets ? ` ×${e.sets}` : ''}`);
    if (lifts.length) parts.push(`cargas: ${lifts.join(', ')}`);
  }
  return parts.join(' · ');
}

// e1RM por Epley: kg × (1 + reps/30). Sin reps fiables, el e1RM ≈ kg (comparación conservadora).
export function epley1Rm(kg, reps) {
  const k = Number(kg);
  const r = Number(reps);
  if (!Number.isFinite(k) || k <= 0) return null;
  if (!Number.isFinite(r) || r <= 0 || r > 30) return Math.round(k * 10) / 10;
  return Math.round(k * (1 + r / 30) * 10) / 10;
}

// Progresión de cargas por ejercicio a partir de los entrenos registrados (manuales con kg).
// Devuelve, por ejercicio, los últimos puntos (fecha, kg, reps, e1RM) y un veredicto:
// 'progressing' (el último e1RM supera el previo), 'stalled' (≥3 sesiones sin superar),
// 'regressing' (cae >3%) o 'insufficient' (menos de 2 puntos).
export function buildLiftProgression(workouts, { maxLifts = 6, maxPoints = 5 } = {}) {
  const byLift = new Map();
  const done = (Array.isArray(workouts) ? workouts : [])
    .filter((w) => isDoneWorkout(w) && Array.isArray(w.exercises))
    .sort((a, b) => String(a.performedAt || '').localeCompare(String(b.performedAt || '')));
  for (const w of done) {
    for (const e of w.exercises) {
      const kg = Number(e?.weightKg);
      if (!e?.name || !Number.isFinite(kg) || kg <= 0) continue;
      const key = String(e.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!byLift.has(key)) byLift.set(key, { name: e.name, points: [] });
      byLift.get(key).points.push({
        date: String(w.performedAt || '').slice(0, 10),
        kg,
        reps: Number(e.reps) > 0 ? Number(e.reps) : null,
        e1rm: epley1Rm(kg, e.reps),
      });
    }
  }
  const lifts = [];
  for (const lift of byLift.values()) {
    const points = lift.points.slice(-maxPoints);
    let trend = 'insufficient';
    if (points.length >= 2) {
      const last = points[points.length - 1].e1rm;
      const prevMax = Math.max(...points.slice(0, -1).map((p) => p.e1rm));
      if (last > prevMax * 1.01) trend = 'progressing';
      else if (last < prevMax * 0.97) trend = 'regressing';
      else trend = points.length >= 3 ? 'stalled' : 'flat';
    }
    lifts.push({ name: lift.name, points, trend, sessions: lift.points.length });
  }
  // Prioriza lo accionable: estancados/en retroceso primero, luego más sesiones.
  const rank = { regressing: 0, stalled: 1, flat: 2, progressing: 3, insufficient: 4 };
  lifts.sort((a, b) => (rank[a.trend] - rank[b.trend]) || (b.sessions - a.sessions));
  return lifts.slice(0, maxLifts);
}

export function describeLiftProgression(lifts) {
  const label = { progressing: 'PROGRESANDO', stalled: 'ESTANCADO', regressing: 'EN RETROCESO', flat: 'estable', insufficient: 'datos insuficientes' };
  return (Array.isArray(lifts) ? lifts : [])
    .filter((l) => l.trend !== 'insufficient')
    .map((l) => `${l.name} [${label[l.trend]}]: ${l.points.map((p) => `${p.kg} kg${p.reps ? `×${p.reps}` : ''} (e1RM ${p.e1rm})`).join(' → ')}`);
}

/* ===== FASE 2.2 — Cierre del loop de recomendaciones ===== */

// Instantánea de e1RM por ejercicio en el momento de emitir recomendaciones.
export function buildLiftSnapshot(liftProgression) {
  const snap = {};
  for (const l of Array.isArray(liftProgression) ? liftProgression : []) {
    const last = l.points?.[l.points.length - 1];
    if (l.name && last?.e1rm != null) snap[l.name] = last.e1rm;
  }
  return snap;
}

// Cumplimiento determinista: compara el e1RM actual de cada ejercicio con el snapshot
// guardado junto a las recomendaciones previas. Sin juicios inventados: solo deltas.
export function buildRecommendationCompliance(previousRecommendation, liftProgression) {
  const prevSnap = previousRecommendation?.liftSnapshot;
  if (!prevSnap || typeof prevSnap !== 'object') return [];
  const current = buildLiftSnapshot(liftProgression);
  const lines = [];
  for (const [name, prevE1rm] of Object.entries(prevSnap)) {
    const now = current[name];
    if (now == null) { lines.push(`${name}: sin registros nuevos desde la recomendación`); continue; }
    const delta = Math.round((now - prevE1rm) * 10) / 10;
    const label = delta > 0.5 ? 'MEJORÓ' : delta < -0.5 ? 'BAJÓ' : 'igual';
    lines.push(`${name}: e1RM ${prevE1rm} → ${now} kg (${label})`);
  }
  return lines.slice(0, 6);
}

// Compara las cargas del último entreno de fuerza con lo prescrito en el plan (por id o nombre).
export function compareLoadsWithPlan(lastStrength, plan) {
  if (!lastStrength || !Array.isArray(lastStrength.exercises)) return [];
  const prescribed = new Map();
  (plan?.days || []).forEach((d) => (d.workout?.exercises || []).forEach((e) => {
    const kg = Number(e?.prescription?.loadKg);
    if (!Number.isFinite(kg) || kg <= 0) return;
    if (e.id) prescribed.set(`id:${e.id}`, kg);
    if (e.name) prescribed.set(`nm:${String(e.name).toLowerCase()}`, kg);
  }));
  const out = [];
  for (const e of lastStrength.exercises) {
    const real = Number(e?.weightKg);
    if (!e?.name || !Number.isFinite(real) || real <= 0) continue;
    const target = prescribed.get(`id:${e.id}`) ?? prescribed.get(`nm:${String(e.name).toLowerCase()}`);
    if (Number.isFinite(target) && target > 0) {
      const pct = Math.round(((real - target) / target) * 100);
      out.push(`${e.name}: hizo ${real} kg vs ${target} kg prescritos (${pct >= 0 ? '+' : ''}${pct}%)`);
    }
  }
  return out.slice(0, 8);
}

export async function buildCoachAnalysisDigest(uid) {
  const sinceIso = new Date(Date.now() - COACH_ANALYSIS_LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const mealsSinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [profile, plan, workouts, metrics, meals, lastDoneAtHint, previousRecommendation] = await Promise.all([
    getUserProfile(uid).catch(() => null),
    getLatestWeeklyPlan(uid).catch(() => null),
    listWorkoutsSince(uid, sinceIso, 120).catch(() => []),
    listMetricsSince(uid, sinceIso, 100).catch(() => []),
    listMealsSince(uid, mealsSinceIso, 120).catch(() => []),
    getLastDoneWorkoutAt(uid).catch(() => null),
    getCoachRecommendation(uid).catch(() => null),
  ]);

  const done = (Array.isArray(workouts) ? workouts : [])
    .filter(isDoneWorkout)
    .sort((a, b) => String(b.performedAt || '').localeCompare(String(a.performedAt || '')));

  const progressMemory = buildProgressMemory({ workouts, metrics, lookbackDays: 21, now: new Date(), lastDoneAtHint });
  let adaptiveTuning = null;
  if (profile) {
    try {
      adaptiveTuning = buildAdaptiveTuning({
        profile,
        progressMemory,
        screening: evaluatePreparticipationScreening(profile.preparticipation),
      });
    } catch { adaptiveTuning = null; }
  }

  const last = done[0] || null;
  const lastStrength = done.find((w) => Array.isArray(w.exercises) && w.exercises.some((e) => Number(e?.weightKg) > 0)) || null;

  return {
    profile,
    plan,
    done,
    last,
    lastStrength,
    loadComparison: compareLoadsWithPlan(lastStrength, plan),
    liftProgression: buildLiftProgression(workouts),
    progressMemory,
    adaptiveTuning,
    // FASE 1.1/1.2 — digests deterministas (null si no hay datos; el prompt los omite).
    nutrition7d: buildNutritionDigest({ meals, plan }),
    recovery7d: buildRecoveryTrend({ workouts }),
    // FASE 2.2 — recomendaciones previas y su cumplimiento determinista
    previousRecommendation: previousRecommendation || null,
    recommendationCompliance: buildRecommendationCompliance(previousRecommendation, buildLiftProgression(workouts)),
    signature: workoutsSignature(workouts),
  };
}

export function buildCoachAnalysisPrompt(digest) {
  const { profile, plan, done, last, loadComparison, progressMemory, adaptiveTuning } = digest;
  const lines = [];
  // FASE 2.3 — persona única: el analista comparte núcleo con chat y auditor.
  lines.push(COACH_ANALYST_PERSONA);
  if (profile) {
    lines.push(`Perfil: ${profile.sex === 'female' ? 'mujer' : 'hombre'}, ${profile.age ?? '?'} años, ${profile.weightKg ?? '?'} kg. Objetivo: ${profile.goal || '?'}. Modalidad: ${profile.trainingModality || '?'}.${profile.runRaceGoal ? ` Objetivo de carrera: ${profile.runRaceGoal}.` : ''}`);
  }
  if (plan?.phaseLabel) lines.push(`Fase del bloque de entrenamiento: ${plan.phaseLabel}${Number.isFinite(Number(plan.weeksToRace)) && plan.weeksToRace > 0 ? ` (${plan.weeksToRace} semanas a la carrera)` : ''}.`);
  if (last) lines.push(`ÚLTIMO ENTRENO: ${describeWorkout(last)}`);
  if (loadComparison.length) lines.push(`Cargas reales vs prescritas (último entreno de fuerza): ${loadComparison.join('; ')}.`);
  const prev = done.slice(1, 12).map(describeWorkout);
  if (prev.length) lines.push(`ENTRENOS PREVIOS (28 días):\n- ${prev.join('\n- ')}`);
  const progressionLines = describeLiftProgression(digest.liftProgression);
  if (progressionLines.length) {
    lines.push(`PROGRESIÓN DE CARGAS por ejercicio (e1RM Epley; señala explícitamente los ESTANCADOS o EN RETROCESO y propone el siguiente paso concreto en kg):\n- ${progressionLines.join('\n- ')}`);
  }
  const cardio = progressMemory?.cardio || {};
  if (Number.isFinite(Number(cardio.hrDriftBpm))) {
    lines.push(`Señal cardiaca: FC media de carrera reciente ${cardio.recentAvgHr ?? '?'} ppm vs base ${cardio.baselineAvgHr ?? '?'} ppm (deriva ${cardio.hrDriftBpm >= 0 ? '+' : ''}${cardio.hrDriftBpm} ppm, señal "${cardio.hrSignal}").`);
  }
  // FASE 2.2 — cierre del loop: qué se recomendó la última vez y qué pasó después.
  if (digest.previousRecommendation?.adjustments?.length) {
    const prevDate = String(digest.previousRecommendation.createdAt || '').slice(0, 10);
    lines.push(`RECOMENDACIONES PREVIAS DEL COACH (${prevDate}): ${digest.previousRecommendation.adjustments.slice(0, 4).join(' | ')}`);
    if (digest.recommendationCompliance?.length) {
      lines.push(`CUMPLIMIENTO desde entonces (e1RM real, determinista): ${digest.recommendationCompliance.join('; ')}. Referencia esto: reconoce lo cumplido y ajusta lo que no se aplicó (sin regañar).`);
    }
  }

  // FASE 1.1/1.2 — nutrición y recuperación reales (si hay datos).
  const nutritionLine = describeNutritionDigest(digest.nutrition7d);
  if (nutritionLine) lines.push(`NUTRICIÓN REAL: ${nutritionLine}`);
  const recoveryLine = describeRecoveryTrend(digest.recovery7d);
  if (recoveryLine) lines.push(`RECUPERACIÓN: ${recoveryLine}`);
  if (adaptiveTuning?.appliedRules?.length) {
    lines.push(`AJUSTES QUE EL PLANNER YA APLICÓ (reglas reales, explícalas al usuario): ${adaptiveTuning.appliedRules.map((r) => `${r.id}: ${r.reason || ''} → ${r.effect || ''}`).join(' | ')}. Factor de volumen: ${adaptiveTuning?.workout?.volumeFactor ?? 1}.`);
  } else {
    lines.push('El planner no aplicó ajustes adaptativos esta semana (señales normales). En "adjustments", da 2-3 recomendaciones concretas basadas en los datos (p. ej. progresión de carga prudente, disciplina de zonas, registrar RPE).');
  }
  lines.push('Devuelve SOLO el JSON del esquema: lastSession (análisis del último entreno), history (comparación con previos y tendencia), adjustments (ajustes/acciones para próximas sesiones), warning (alerta o cadena vacía).');
  return lines.join('\n\n');
}

// Informe heurístico observable: mismas señales reales, sin IA. Nunca inventa.
export function buildHeuristicCoachReport(digest) {
  const { last, done, loadComparison, progressMemory, adaptiveTuning } = digest;
  const lastSession = last
    ? `Tu último entreno: ${describeWorkout(last)}.${loadComparison.length ? ` Comparado con el plan: ${loadComparison.join('; ')}.` : ''}`
    : 'Aún no hay entrenos registrados en los últimos 28 días.';
  const cardio = progressMemory?.cardio || {};
  const histParts = [`En 28 días registraste ${done.length} sesiones (app + Strava + check-ins).`];
  if (Number.isFinite(Number(cardio.hrDriftBpm))) {
    histParts.push(`FC media de carrera reciente ${cardio.recentAvgHr} ppm vs base ${cardio.baselineAvgHr} ppm (${cardio.hrDriftBpm >= 0 ? '+' : ''}${cardio.hrDriftBpm} ppm).`);
  }
  if (digest.previousRecommendation?.adjustments?.length && digest.recommendationCompliance?.length) {
    histParts.push(`Desde la última recomendación: ${digest.recommendationCompliance.slice(0, 3).join('; ')}.`);
  }
  const rules = adaptiveTuning?.appliedRules || [];
  const adjustments = rules.length
    ? rules.map((r) => `${r.reason || r.id}: ${r.effect || 'ajuste aplicado'}`)
    : ['Señales estables: el plan sigue su progresión normal de cargas dentro del bloque.'];
  // Ejercicios estancados/en retroceso (e1RM): siempre accionable, también sin IA.
  for (const l of (digest.liftProgression || [])) {
    if (l.trend === 'stalled') adjustments.push(`${l.name}: estancado ${l.points.length} sesiones (e1RM ${l.points[l.points.length - 1].e1rm}). Sube ~2,5 kg o añade 1-2 reps si el RPE lo permite.`);
    if (l.trend === 'regressing') adjustments.push(`${l.name}: e1RM en retroceso. Revisa recuperación/técnica antes de subir carga.`);
  }
  return {
    lastSession,
    history: histParts.join(' '),
    adjustments: adjustments.slice(0, 5),
    warning: '',
  };
}

/* ===== Análisis por sesión (historial): se genera UNA vez por workout y se cachea ===== */

export const WORKOUT_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    session: { type: 'string', description: 'Análisis de ESTA sesión (2-4 frases con números reales: cargas, FC, ritmo, RPE, duración).' },
    progression: { type: 'string', description: 'Comparación con sesiones previas del mismo tipo: ¿progresa, se estanca o empeora? Con datos.' },
    tips: { type: 'array', items: { type: 'string' }, description: '2-3 consejos concretos para la próxima sesión de este tipo.' },
    warning: { type: 'string', description: 'Alerta si la hay; cadena vacía si no.' },
  },
  required: ['session', 'tips'],
};

function normTitle(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function isRunLike(w) {
  return /run|carrera|trail/i.test(String(w?.sportType || '')) || /rodaje|carrera|series|tirada|tempo/i.test(String(w?.title || ''));
}

function isStrengthLike(w) {
  return (Array.isArray(w?.exercises) && w.exercises.some((e) => Number(e?.weightKg) > 0))
    || /weight|strength/i.test(String(w?.sportType || ''))
    || /torso|pierna|empuje|traccion|fuerza|full ?body/i.test(normTitle(w?.title));
}

// Sesiones previas comparables: mismo título normalizado; si no hay, mismo tipo (carrera/fuerza).
export function findComparableSessions(workout, allWorkouts, max = 5) {
  const ref = String(workout?.performedAt || '');
  const prior = (Array.isArray(allWorkouts) ? allWorkouts : [])
    .filter((w) => isDoneWorkout(w) && String(w.performedAt || '') < ref && w.id !== workout?.id)
    .sort((a, b) => String(b.performedAt || '').localeCompare(String(a.performedAt || '')));
  const sameTitle = prior.filter((w) => normTitle(w.title) && normTitle(w.title) === normTitle(workout?.title));
  if (sameTitle.length) return sameTitle.slice(0, max);
  if (isRunLike(workout)) return prior.filter(isRunLike).slice(0, max);
  if (isStrengthLike(workout)) return prior.filter(isStrengthLike).slice(0, max);
  return prior.slice(0, max);
}

export async function buildWorkoutAnalysisDigest(uid, workoutId) {
  const workout = await getWorkoutById(uid, workoutId);
  if (!workout || !isDoneWorkout(workout)) return null;

  // Ventana amplia hacia atrás desde la sesión para encontrar comparables y el check-in cercano.
  const sinceIso = new Date(new Date(workout.performedAt || Date.now()).getTime() - 90 * 24 * 3600 * 1000).toISOString();
  const [profile, plan, workouts] = await Promise.all([
    getUserProfile(uid).catch(() => null),
    getLatestWeeklyPlan(uid).catch(() => null),
    listWorkoutsSince(uid, sinceIso, 200).catch(() => []),
  ]);

  const comparables = findComparableSessions(workout, workouts);
  const liftProgression = buildLiftProgression(workouts);
  const day = String(workout.performedAt || '').slice(0, 10);
  const checkin = (Array.isArray(workouts) ? workouts : []).find(
    (w) => w.source === 'daily_checkin' && Math.abs(new Date(String(w.performedAt).slice(0, 10)) - new Date(day)) <= 24 * 3600 * 1000,
  ) || null;

  // Solo comparamos cargas contra el plan VIGENTE (no reconstruimos planes históricos):
  // honesto para sesiones recientes, aproximado para antiguas — el prompt lo deja claro.
  const loadComparison = isStrengthLike(workout) ? compareLoadsWithPlan(workout, plan) : [];

  return { profile, workout, comparables, checkin, loadComparison, liftProgression };
}

export function buildWorkoutAnalysisPrompt(digest) {
  const { profile, workout, comparables, checkin, loadComparison } = digest;
  const lines = [];
  lines.push('Eres un deportólogo de élite y coach del usuario en la app Ignios. Analiza ESTA sesión concreta con SUS DATOS REALES, en español, directo y crítico, citando números (kg, ppm, min/km, RPE, minutos). PROHIBIDO inventar datos que no estén abajo.');
  if (profile) {
    lines.push(`Perfil: ${profile.sex === 'female' ? 'mujer' : 'hombre'}, ${profile.age ?? '?'} años, ${profile.weightKg ?? '?'} kg. Objetivo: ${profile.goal || '?'}. Modalidad: ${profile.trainingModality || '?'}.${profile.runRaceGoal ? ` Objetivo de carrera: ${profile.runRaceGoal}.` : ''}`);
  }
  lines.push(`SESIÓN A ANALIZAR: ${describeWorkout(workout)}`);
  if (loadComparison.length) lines.push(`Cargas de esta sesión vs el plan vigente (aproximado si la sesión es antigua): ${loadComparison.join('; ')}.`);
  if (checkin && checkin.id !== workout.id) {
    const c = [];
    if (checkin.sessionRpe != null) c.push(`RPE ${checkin.sessionRpe}/10`);
    if (checkin.fatigue != null) c.push(`fatiga ${checkin.fatigue}/10`);
    if (checkin.sleepHours != null) c.push(`sueño ${checkin.sleepHours} h`);
    if (c.length) lines.push(`Check-in cercano a esa fecha: ${c.join(', ')}.`);
  }
  if (comparables.length) {
    lines.push(`SESIONES PREVIAS COMPARABLES (analiza la progresión real entre ellas y esta):\n- ${comparables.map(describeWorkout).join('\n- ')}`);
  } else {
    lines.push('No hay sesiones previas comparables: di explícitamente que es la primera de su tipo y qué medir a partir de ahora.');
  }
  const progLines = describeLiftProgression(digest.liftProgression);
  if (progLines.length) {
    lines.push(`PROGRESIÓN DE CARGAS por ejercicio (e1RM Epley; señala estancamientos y propone el siguiente paso en kg):\n- ${progLines.join('\n- ')}`);
  }
  lines.push('Devuelve SOLO el JSON del esquema: session (análisis de esta sesión), progression (vs comparables, o vacía si no hay), tips (2-3 consejos concretos para la próxima de este tipo), warning (alerta o cadena vacía).');
  return lines.join('\n\n');
}

// Fallback heurístico observable por sesión: solo datos reales, sin IA.
export function buildHeuristicWorkoutAnalysis(digest) {
  const { workout, comparables, loadComparison } = digest;
  const session = `Sesión: ${describeWorkout(workout)}.${loadComparison.length ? ` Cargas vs plan vigente: ${loadComparison.join('; ')}.` : ''}`;
  let progression = '';
  if (comparables.length) {
    progression = `Comparables previas: ${comparables.slice(0, 3).map(describeWorkout).join(' | ')}.`;
  }
  const tips = [];
  if (workout.sessionRpe == null && workout.source !== 'strava') tips.push('Registra el RPE al guardar la sesión: sin él, el coach no puede valorar la intensidad real.');
  if (!comparables.length) tips.push('Primera sesión de este tipo registrada: repítela en 4-7 días para empezar a medir progresión.');
  if (!tips.length) tips.push('Mantén la progresión prudente: sube carga solo si completaste todas las series con buena técnica.');
  return { session, progression, tips, warning: '' };
}

export function sanitizeWorkoutAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const session = str(raw.session, 1200);
  const tips = (Array.isArray(raw.tips) ? raw.tips : []).map((t) => str(t, 300)).filter(Boolean).slice(0, 4);
  if (!session || !tips.length) return null;
  return { session, progression: str(raw.progression, 1200), tips, warning: str(raw.warning, 400) };
}

export function sanitizeCoachReport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const lastSession = str(raw.lastSession, 1200);
  const history = str(raw.history, 1200);
  const adjustments = (Array.isArray(raw.adjustments) ? raw.adjustments : [])
    .map((a) => str(a, 300)).filter(Boolean).slice(0, 5);
  if (!lastSession || !adjustments.length) return null;
  return { lastSession, history, adjustments, warning: str(raw.warning, 400) };
}
