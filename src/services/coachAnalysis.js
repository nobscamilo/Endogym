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
import {
  RACE_GOAL_METERS,
  buildEfficiencyTrend,
  formatRaceTime,
  hrMaxFromAge,
  hrZone,
  predictRaceTimeFromRuns,
  validateRunZone,
} from '../core/running.js';
import { dateKeyInTimeZone } from '../lib/appTime.js';

export const COACH_ANALYSIS_LOOKBACK_DAYS = 28;
export const COACH_ANALYSIS_CONTEXT_VERSION = 2;

export const COACH_ANALYSIS_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    lastSession: { type: 'string', description: 'Análisis del último entreno realizado (2-4 frases, cita números reales: cargas, FC, RPE).' },
    history: { type: 'string', description: 'Comparación con los entrenos previos y tendencia (2-4 frases con datos concretos).' },
    goalAlignment: { type: 'string', description: 'Evaluación explícita del avance hacia el objetivo principal/SMART/carrera usando solo las señales proporcionadas (2-4 frases). Si faltan datos, dilo.' },
    adjustments: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ajustes concretos que el coach aplicará a las PRÓXIMAS sesiones (2-4 puntos accionables).',
    },
    warning: { type: 'string', description: 'Señal de alerta si la hay (FC elevada, fatiga, síntomas); cadena vacía si no.' },
  },
  required: ['lastSession', 'history', 'goalAlignment', 'adjustments'],
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

function stableHash(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16);
}

// La vigencia del informe depende de mucho más que "hay un workout nuevo": una edición de
// RPE/cargas, un cambio de objetivo/fecha, una métrica de peso o nuevos registros nutricionales
// pueden cambiar la conclusión aun conservando los mismos ids. La versión fuerza stale tras
// cambios de contrato (como añadir goalAlignment) sin migrar documentos antiguos.
export function coachAnalysisContextSignature({ profile, plan, workouts, metrics, meals } = {}) {
  const p = profile || {};
  const goalTarget = p.goalTarget || {};
  const profileKey = {
    goal: p.goal || null,
    goalTarget: {
      kind: goalTarget.kind || null,
      goal: goalTarget.goal || null,
      value: goalTarget.value ?? null,
      date: goalTarget.date || null,
    },
    trainingModality: p.trainingModality || p.trainingMode || null,
    runRaceGoal: p.runRaceGoal || null,
    raceDate: p.raceDate || null,
    hrMaxBpm: p.hrMaxBpm ?? null,
    age: p.age ?? null,
    weightKg: p.weightKg ?? null,
  };
  const planKey = {
    id: plan?.id || plan?.planId || null,
    updatedAt: plan?.updatedAt || null,
    phase: plan?.phase || null,
    phaseLabel: plan?.phaseLabel || null,
    weeksToRace: plan?.weeksToRace ?? null,
    raceGoal: plan?.raceGoal || null,
    days: (Array.isArray(plan?.days) ? plan.days : []).map((d) => ({
      date: d?.date || null,
      title: d?.workout?.title || null,
      sessionType: d?.workout?.sessionType || d?.sessionType || null,
      runType: d?.workout?.runPrescription?.runType || null,
      exercises: (Array.isArray(d?.workout?.exercises) ? d.workout.exercises : []).map((e) => ({
        id: e?.id || null,
        name: e?.name || null,
        loadKg: e?.prescription?.loadKg ?? null,
        sets: e?.prescription?.sets ?? null,
        reps: e?.prescription?.reps ?? null,
      })),
    })),
  };
  const workoutKey = (Array.isArray(workouts) ? workouts : []).map((w) => ({
    id: w?.id || null,
    source: w?.source || null,
    performedAt: w?.performedAt || null,
    title: w?.title || null,
    completed: w?.completed ?? null,
    durationMinutes: w?.durationMinutes ?? null,
    distanceKm: w?.distanceKm ?? null,
    avgHeartRate: w?.avgHeartRate ?? null,
    maxHeartRate: w?.maxHeartRate ?? null,
    sessionRpe: w?.sessionRpe ?? null,
    fatigue: w?.fatigue ?? null,
    sleepHours: w?.sleepHours ?? null,
    symptoms: w?.symptoms || null,
    exercises: (Array.isArray(w?.exercises) ? w.exercises : []).map((e) => ({
      id: e?.id || null, name: e?.name || null, weightKg: e?.weightKg ?? null,
      reps: e?.reps ?? null, sets: e?.sets ?? null, rir: e?.rir ?? null,
      setLogs: e?.setLogs || null,
    })),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const metricKey = (Array.isArray(metrics) ? metrics : []).map((m) => ({
    at: m?.takenAt || m?.performedAt || m?.createdAt || null,
    weightKg: m?.weightKg ?? null,
    waistCm: m?.waistCm ?? null,
    neckCm: m?.neckCm ?? null,
    hipCm: m?.hipCm ?? null,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const mealKey = (Array.isArray(meals) ? meals : []).map((m) => ({
    at: m?.eatenAt || m?.createdAt || null,
    totals: m?.totals || null,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return `v${COACH_ANALYSIS_CONTEXT_VERSION}-${stableHash({ profileKey, planKey, workoutKey, metricKey, mealKey })}`;
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

function validPositive(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function raceGoalLabel(value) {
  const labels = { race_5k: '5K', race_10k: '10K', race_21k: '21K', race_42k: '42K', health: 'salud' };
  return labels[value] || null;
}

function workoutDateKey(w) {
  const raw = w?.performedAt || w?.createdAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? String(raw).slice(0, 10) : dateKeyInTimeZone(parsed);
}

// Señales deterministas para saber si el trabajo de carrera está en consonancia con el
// objetivo. No propone umbrales nuevos: usa el modelo de zonas y la predicción ya existentes.
export function buildRunGoalSignals({ profile, plan, workouts, now = new Date() } = {}) {
  const modality = profile?.trainingModality || profile?.trainingMode || '';
  const raceGoal = profile?.runRaceGoal || plan?.raceGoal || null;
  const isRunner = profile?.goal === 'endurance'
    || modality === 'hybrid_run_gym'
    || modality === 'running'
    || Boolean(raceGoal && raceGoal !== 'health');
  if (!isRunner) return null;

  const all = Array.isArray(workouts) ? workouts : [];
  const runs = all
    .filter((w) => isDoneWorkout(w) && isRunLike(w))
    .sort((a, b) => String(b.performedAt || '').localeCompare(String(a.performedAt || '')));
  const observedMax = Math.max(0, ...runs.map((w) => validPositive(w.maxHeartRate) || 0));
  const manualHrMax = validPositive(profile?.hrMaxBpm);
  const estimatedHrMax = validPositive(hrMaxFromAge(profile?.age));
  let hrMax = null;
  let hrMaxSource = null;
  if (manualHrMax) {
    hrMax = Math.max(manualHrMax, observedMax);
    hrMaxSource = observedMax > manualHrMax ? 'medida/observada' : 'medida por el usuario';
  } else if (observedMax) {
    hrMax = Math.max(observedMax, estimatedHrMax || 0);
    hrMaxSource = observedMax >= (estimatedHrMax || 0) ? 'máxima observada en carrera' : 'estimada por edad/observada';
  } else if (estimatedHrMax) {
    hrMax = estimatedHrMax;
    hrMaxSource = 'estimada por edad';
  }

  const z2Range = hrMax ? {
    min: Math.ceil(hrMax * 0.60),
    max: Math.ceil(hrMax * 0.70) - 1,
  } : null;
  const runTypeByDate = new Map();
  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    if (day?.date && day?.workout?.runPrescription?.runType) {
      runTypeByDate.set(day.date, day.workout.runPrescription.runType);
    }
  }

  let latestZone = null;
  const latestWithHr = runs.find((w) => validPositive(w.avgHeartRate));
  if (latestWithHr && hrMax) {
    const date = workoutDateKey(latestWithHr);
    const avgHr = validPositive(latestWithHr.avgHeartRate);
    const runType = runTypeByDate.get(date) || null;
    const actual = hrZone(avgHr, hrMax);
    const validation = runType ? validateRunZone({ avgHr, hrMax, runType }) : null;
    latestZone = {
      date,
      avgHr,
      actualZone: actual?.zone ?? null,
      pctHrMax: actual?.pct ?? null,
      runType,
      target: validation?.target || null,
      verdict: validation?.verdict || null,
    };
  }

  const today = dateKeyInTimeZone(now instanceof Date ? now : new Date(now));
  const completedRunDates = new Set(runs.map(workoutDateKey).filter(Boolean));
  const keyDays = (Array.isArray(plan?.days) ? plan.days : []).filter((day) => {
    const type = day?.workout?.runPrescription?.runType;
    return day?.date && day.date <= today && ['long', 'tempo', 'intervals'].includes(type);
  });
  const adherence = keyDays.length ? {
    planned: keyDays.length,
    completed: keyDays.filter((d) => completedRunDates.has(d.date)).length,
    missed: keyDays.filter((d) => !completedRunDates.has(d.date)).length,
    long: {
      planned: keyDays.filter((d) => d.workout.runPrescription.runType === 'long').length,
      completed: keyDays.filter((d) => d.workout.runPrescription.runType === 'long' && completedRunDates.has(d.date)).length,
    },
    quality: {
      planned: keyDays.filter((d) => ['tempo', 'intervals'].includes(d.workout.runPrescription.runType)).length,
      completed: keyDays.filter((d) => ['tempo', 'intervals'].includes(d.workout.runPrescription.runType) && completedRunDates.has(d.date)).length,
    },
  } : null;

  const efficiency = buildEfficiencyTrend(runs);
  const targetMeters = RACE_GOAL_METERS[raceGoal] || null;
  const predicted = targetMeters ? predictRaceTimeFromRuns({ distanceMeters: targetMeters, runs }) : null;
  const label = raceGoalLabel(raceGoal);

  return {
    raceGoal: label,
    raceDate: profile?.raceDate || null,
    hrMax,
    hrMaxSource,
    z2Range,
    latestZone,
    keySessionAdherence: adherence,
    efficiency: efficiency ? {
      recentEf: efficiency.recentEf,
      baselineEf: efficiency.baselineEf,
      trendPct: efficiency.trendPct,
      runsUsed: efficiency.points.length,
    } : null,
    prediction: predicted && label ? {
      goal: label,
      time: formatRaceTime(predicted.seconds),
      basedOn: predicted.basedOn,
    } : null,
  };
}

export function describeRunGoalSignals(signals) {
  if (!signals) return null;
  const parts = [];
  if (signals.raceGoal) parts.push(`Objetivo de carrera: ${signals.raceGoal}${signals.raceDate ? ` para ${signals.raceDate}` : ''}.`);
  if (signals.hrMax) {
    parts.push(`FCmáx usada por la app: ${signals.hrMax} ppm (${signals.hrMaxSource || 'fuente no indicada'}).`);
  }
  if (signals.z2Range) parts.push(`Rango objetivo Z2 ${signals.z2Range.min}-${signals.z2Range.max} ppm según el modelo actual de la app.`);
  if (signals.latestZone?.avgHr) {
    const z = signals.latestZone;
    const verdict = { ok: 'en zona', too_easy: 'por debajo de la zona', too_hard: 'por encima de la zona' }[z.verdict] || z.verdict;
    parts.push(`Última carrera con FC (${z.date}): ${z.avgHr} ppm, Z${z.actualZone ?? '?'}${z.target ? `; objetivo de esa sesión ${z.target}, resultado ${verdict}` : '; sin zona prescrita trazable para esa fecha'}.`);
  }
  const a = signals.keySessionAdherence;
  if (a?.planned) {
    parts.push(`Adherencia a sesiones clave vencidas del plan: ${a.completed}/${a.planned} sesiones clave; tirada larga ${a.long.completed}/${a.long.planned}, calidad ${a.quality.completed}/${a.quality.planned}.`);
  }
  if (signals.efficiency) {
    parts.push(`Eficiencia aeróbica: ${signals.efficiency.recentEf} reciente vs ${signals.efficiency.baselineEf} base (${signals.efficiency.trendPct >= 0 ? '+' : ''}${signals.efficiency.trendPct}%).`);
  }
  if (signals.prediction) {
    const p = signals.prediction;
    parts.push(`Predicción orientativa ${p.goal}: ${p.time}, basada en ${p.basedOn.distanceKm} km del ${p.basedOn.date}.`);
  }
  return parts.length ? parts.join(' ') : null;
}

// El texto de una recomendación anterior fue generado por IA y no es una fuente de verdad.
// Conservamos la intención para cerrar el loop, pero retiramos cifras para impedir que una
// alucinación histórica (p. ej. una FC objetivo inventada) se perpetúe en el siguiente prompt.
export function sanitizePreviousRecommendationForPrompt(value) {
  return String(value || '')
    .replace(/\b\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|ppm|bpm|km|kcal|g|h|horas?|min(?:\/km)?|%|\/10)\b/gi, '[cifra previa omitida]')
    .trim();
}

export async function buildCoachAnalysisDigest(uid) {
  const sinceIso = new Date(Date.now() - COACH_ANALYSIS_LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const metricsSinceIso = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const mealsSinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [profile, plan, goalWorkouts, metrics, meals, lastDoneAtHint, previousRecommendation] = await Promise.all([
    getUserProfile(uid).catch(() => null),
    getLatestWeeklyPlan(uid).catch(() => null),
    listWorkoutsSince(uid, metricsSinceIso, 240).catch(() => []),
    listMetricsSince(uid, metricsSinceIso, 100).catch(() => []),
    listMealsSince(uid, mealsSinceIso, 120).catch(() => []),
    getLastDoneWorkoutAt(uid).catch(() => null),
    getCoachRecommendation(uid).catch(() => null),
  ]);
  // Una sola lectura de 90 días alimenta SMART/carrera/firma; el informe narrativo conserva
  // su ventana de 28 días filtrando en memoria (evita dos consultas Firestore solapadas).
  const workouts = (Array.isArray(goalWorkouts) ? goalWorkouts : [])
    .filter((w) => String(w?.performedAt || '') >= sinceIso)
    .slice(0, 120);

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
  let goalProgress = null;
  let goalProgressLine = null;
  if (profile) {
    try {
      // Import dinámico para evitar el ciclo estático: goalProgress reutiliza epley1Rm e
      // isDoneWorkout exportados por este módulo.
      const goals = await import('./goalProgress.js');
      goalProgress = goals.buildGoalProgress({ profile, metrics, workouts: goalWorkouts });
      goalProgressLine = goals.describeGoalProgress(goalProgress);
    } catch { /* un objetivo opcional nunca debe bloquear el informe */ }
  }
  const runGoalSignals = buildRunGoalSignals({ profile, plan, workouts: goalWorkouts, now: new Date() });

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
    goalProgress,
    goalProgressLine,
    runGoalSignals,
    // FASE 1.1/1.2 — digests deterministas (null si no hay datos; el prompt los omite).
    nutrition7d: buildNutritionDigest({ meals, plan }),
    recovery7d: buildRecoveryTrend({ workouts }),
    // FASE 2.2 — recomendaciones previas y su cumplimiento determinista
    previousRecommendation: previousRecommendation || null,
    recommendationCompliance: buildRecommendationCompliance(previousRecommendation, buildLiftProgression(workouts)),
    signature: coachAnalysisContextSignature({ profile, plan, workouts: goalWorkouts, metrics, meals }),
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
  const goalContext = [];
  if (digest.goalProgressLine) goalContext.push(digest.goalProgressLine);
  const runGoalLine = describeRunGoalSignals(digest.runGoalSignals);
  if (runGoalLine) goalContext.push(runGoalLine);
  if (!goalContext.length && profile?.goal) goalContext.push(`Objetivo principal declarado: ${profile.goal}; no hay meta SMART o señales específicas suficientes para cuantificar avance.`);
  if (goalContext.length) {
    lines.push(`ALINEACIÓN CON EL OBJETIVO (fuente determinista; úsala como eje del informe):\n${goalContext.join('\n')}`);
  }
  if (last) lines.push(`ÚLTIMO ENTRENO: ${describeWorkout(last)}`);
  if (loadComparison.length) lines.push(`Cargas reales vs prescritas (último entreno de fuerza): ${loadComparison.join('; ')}.`);
  const prev = done.slice(1, 12).map(describeWorkout);
  if (prev.length) lines.push(`ENTRENOS PREVIOS (28 días):\n- ${prev.join('\n- ')}`);
  const progressionLines = describeLiftProgression(digest.liftProgression);
  if (progressionLines.length) {
    lines.push(`PROGRESIÓN DE CARGAS por ejercicio (e1RM Epley; señala explícitamente los ESTANCADOS o EN RETROCESO y propone el siguiente paso concreto en kg):\n- ${progressionLines.join('\n- ')}`);
  }
  const cardio = progressMemory?.cardio || {};
  if (cardio.hrDriftBpm != null && cardio.hrDriftBpm !== '' && Number.isFinite(Number(cardio.hrDriftBpm))) {
    lines.push(`Señal cardiaca: FC media de carrera reciente ${cardio.recentAvgHr ?? '?'} ppm vs base ${cardio.baselineAvgHr ?? '?'} ppm (deriva ${cardio.hrDriftBpm >= 0 ? '+' : ''}${cardio.hrDriftBpm} ppm, señal "${cardio.hrSignal}").`);
  }
  // FASE 2.2 — cierre del loop: qué se recomendó la última vez y qué pasó después.
  if (digest.previousRecommendation?.adjustments?.length) {
    const prevDate = String(digest.previousRecommendation.createdAt || '').slice(0, 10);
    const priorIntent = digest.previousRecommendation.adjustments
      .slice(0, 4)
      .map(sanitizePreviousRecommendationForPrompt)
      .filter(Boolean);
    lines.push(`RECOMENDACIONES PREVIAS DEL COACH (${prevDate}; la intención se conserva, pero sus cifras se omiten porque no son hechos): ${priorIntent.join(' | ')}`);
    if (digest.recommendationCompliance?.length) {
      lines.push(`CUMPLIMIENTO desde entonces (e1RM real, determinista): ${digest.recommendationCompliance.join('; ')}. Referencia esto: reconoce lo cumplido y ajusta lo que no se aplicó (sin regañar). Las recomendaciones previas NO son hechos: no repitas ninguna cifra que no esté respaldada también por el contexto determinista actual.`);
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
    lines.push('El planner no aplicó ajustes adaptativos esta semana (señales normales). En "adjustments", da 2-3 recomendaciones concretas basadas en los datos y PRIORIZADAS por el objetivo principal; no uses progresión de fuerza como recomendación central para un objetivo de resistencia.');
  }
  lines.push('PROHIBIDO introducir cifras objetivo (ppm, ritmo, kg, kcal o fecha estimada) que no aparezcan literalmente en el contexto determinista anterior. Si falta un dato para juzgar el avance, dilo. En goalAlignment responde explícitamente si los datos observados están o no en consonancia con el objetivo, sin confundir ausencia de datos con mal progreso. Para endurance/carrera, al menos un ajuste debe priorizar una sesión clave o zona trazable; para fuerza/peso usa la meta SMART si existe; para objetivo glucémico limita el análisis a adherencia y registros, sin diagnóstico.');
  lines.push('Devuelve SOLO el JSON del esquema: lastSession (análisis del último entreno), history (comparación con previos y tendencia), goalAlignment (avance explícito hacia objetivo/meta/carrera), adjustments (ajustes/acciones para próximas sesiones), warning (alerta o cadena vacía).');
  return lines.join('\n\n');
}

// Informe heurístico observable: mismas señales reales, sin IA. Nunca inventa.
export function buildHeuristicCoachReport(digest) {
  const { profile, last, done, loadComparison, progressMemory, adaptiveTuning } = digest;
  const lastSession = last
    ? `Tu último entreno: ${describeWorkout(last)}.${loadComparison.length ? ` Comparado con el plan: ${loadComparison.join('; ')}.` : ''}`
    : 'Aún no hay entrenos registrados en los últimos 28 días.';
  const cardio = progressMemory?.cardio || {};
  const histParts = [`En 28 días registraste ${done.length} sesiones (app + Strava + check-ins).`];
  if (cardio.hrDriftBpm != null && cardio.hrDriftBpm !== '' && Number.isFinite(Number(cardio.hrDriftBpm))) {
    histParts.push(`FC media de carrera reciente ${cardio.recentAvgHr} ppm vs base ${cardio.baselineAvgHr} ppm (${cardio.hrDriftBpm >= 0 ? '+' : ''}${cardio.hrDriftBpm} ppm).`);
  }
  if (digest.previousRecommendation?.adjustments?.length && digest.recommendationCompliance?.length) {
    histParts.push(`Desde la última recomendación: ${digest.recommendationCompliance.slice(0, 3).join('; ')}.`);
  }
  const goal = profile?.goal || null;
  const run = digest.runGoalSignals;
  let goalAlignment = digest.goalProgressLine || '';
  const safetyAdjustments = (adaptiveTuning?.appliedRules || [])
    .map((r) => `${r.reason || r.id}: ${r.effect || 'ajuste aplicado'}`);
  const adjustments = [];

  if (goal === 'endurance' || run) {
    const a = run?.keySessionAdherence;
    if (!goalAlignment) {
      goalAlignment = a?.planned
        ? `Objetivo ${run?.raceGoal || 'de resistencia'}: completaste ${a.completed}/${a.planned} sesiones clave vencidas del plan.${a.missed ? ` Faltan ${a.missed}; todavía no se puede afirmar que vayas en camino solo con este dato.` : ' La adherencia a las sesiones clave está en consonancia con el plan, pero hace falta observar su evolución.'}`
        : `Objetivo ${run?.raceGoal || 'de resistencia'}: no hay suficientes sesiones clave vencidas y registradas para cuantificar todavía si vas en camino.`;
    }
    if (a?.missed) adjustments.push(`Para tu objetivo ${run?.raceGoal || 'de carrera'}, prioriza las sesiones clave pendientes: tirada larga ${a.long.completed}/${a.long.planned} y calidad ${a.quality.completed}/${a.quality.planned}; no compenses juntándolas ni aumentando intensidad.`);
    const z = run?.latestZone;
    if (z?.target && z?.verdict && z.verdict !== 'ok') {
      adjustments.push(`En la próxima sesión comparable, vuelve a la zona prescrita ${z.target}; la última fue Z${z.actualZone} con ${z.avgHr} ppm.${run?.z2Range && z.target === 'Z2' ? ` El rango Z2 actual de la app es ${run.z2Range.min}-${run.z2Range.max} ppm.` : ''}`);
    }
    if (!adjustments.some((a) => /sesiones clave|zona prescrita/i.test(a))) {
      adjustments.push('Mantén la prioridad en tirada larga y sesión de calidad del plan; registra distancia, duración y FC para evaluar la progresión de resistencia sin inventar ritmos.');
    }
  } else if (goal === 'strength') {
    goalAlignment ||= 'Objetivo de fuerza: sin una meta SMART y suficientes registros de kg/reps no se puede cuantificar aún si vas en camino.';
    adjustments.push(digest.goalProgressLine
      ? `${digest.goalProgressLine} Usa DAPRE y sube carga solo cuando reps y RPE lo justifiquen.`
      : 'Registra kg, reps y RIR por serie; usa DAPRE para progresar sin convertir la fase del bloque en una subida automática.');
  } else if (['weight_loss', 'hypertrophy', 'recomposition'].includes(goal)) {
    goalAlignment ||= `Objetivo ${goal}: falta una meta SMART o una serie de peso suficiente para cuantificar la tendencia.`;
    adjustments.push(digest.goalProgressLine
      ? `${digest.goalProgressLine} Mantén el plan y reevalúa con la siguiente medición comparable.`
      : 'Registra peso en condiciones comparables y fija una meta/fecha para evaluar tendencia sin reaccionar a una sola medición.');
  } else if (goal === 'glycemic_control') {
    goalAlignment ||= 'Objetivo glucémico: el informe solo puede valorar adherencia, comidas y síntomas registrados; no diagnostica ni interpreta glucosa sin datos válidos.';
    adjustments.push('Mantén actividad y comidas según el plan y registra comidas, síntomas y métricas disponibles; cualquier ajuste clínico corresponde al equipo sanitario.');
  } else {
    goalAlignment ||= `Objetivo ${goal || 'general'}: no hay una meta medible suficiente para cuantificar todavía si vas en camino.`;
    adjustments.push('Mantén la adherencia al bloque y registra RPE, duración y ejecución para que el siguiente análisis pueda medir tendencia.');
  }
  // Ejercicios estancados/en retroceso (e1RM): siempre accionable, también sin IA.
  for (const l of (digest.liftProgression || [])) {
    if (l.trend === 'stalled') adjustments.push(`${l.name}: estancado ${l.points.length} sesiones (e1RM ${l.points[l.points.length - 1].e1rm}). Sube ~2,5 kg o añade 1-2 reps si el RPE lo permite.`);
    if (l.trend === 'regressing') adjustments.push(`${l.name}: e1RM en retroceso. Revisa recuperación/técnica antes de subir carga.`);
  }
  return {
    lastSession,
    history: histParts.join(' '),
    goalAlignment,
    adjustments: [...safetyAdjustments.slice(0, 3), ...adjustments].slice(0, 5),
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
  const goalAlignment = str(raw.goalAlignment, 1200);
  const adjustments = (Array.isArray(raw.adjustments) ? raw.adjustments : [])
    .map((a) => str(a, 300)).filter(Boolean).slice(0, 5);
  if (!lastSession || !goalAlignment || !adjustments.length) return null;
  return { lastSession, history, goalAlignment, adjustments, warning: str(raw.warning, 400) };
}
