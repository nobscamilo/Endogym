// Objetivos SMART medibles — progreso determinista hacia el objetivo del usuario.
//
// Convierte el objetivo elegido (perder grasa / ganar músculo / fuerza) en lo mismo
// que ya hace el objetivo de carrera: meta numérica + fecha + predicción con datos
// reales. Nada de IA: tendencia lineal sobre la serie real (peso de metrics, e1RM de
// los entrenos). Devuelve null si no hay objetivo fijado o no hay datos suficientes.
import { epley1Rm, isDoneWorkout } from './coachAnalysis.js';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateKey(iso) {
  const s = String(iso || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

// Tendencia lineal simple (unidades/semana) sobre puntos { date, value } — mismo
// criterio que trendPerWeek de progressMemory: primer vs último punto.
function linearTrendPerWeek(points) {
  const sorted = points
    .filter((p) => p.value != null && p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (days < 7) return null; // menos de una semana de datos: tendencia no fiable
  return Number((((last.value - first.value) / days) * 7).toFixed(2));
}

function buildWeightSeries(metrics) {
  return (Array.isArray(metrics) ? metrics : [])
    .map((m) => ({ date: dateKey(m.takenAt || m.createdAt || m.date), value: toNum(m.weightKg) }))
    .filter((p) => p.date && p.value != null);
}

// Mejor e1RM por sesión del ejercicio de referencia (el de más sesiones con carga).
function buildE1rmSeries(workouts) {
  const byLift = new Map();
  for (const w of (Array.isArray(workouts) ? workouts : []).filter(isDoneWorkout)) {
    const date = dateKey(w.performedAt || w.createdAt);
    if (!date || !Array.isArray(w.exercises)) continue;
    for (const e of w.exercises) {
      const kg = toNum(e?.weightKg);
      if (!e?.name || kg == null || kg <= 0) continue;
      const key = String(e.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      const e1rm = epley1Rm(kg, e.reps);
      if (e1rm == null) continue;
      if (!byLift.has(key)) byLift.set(key, { name: e.name, points: new Map() });
      const lift = byLift.get(key);
      const prev = lift.points.get(date);
      if (prev == null || e1rm > prev) lift.points.set(date, e1rm);
    }
  }
  let best = null;
  for (const lift of byLift.values()) {
    if (!best || lift.points.size > best.points.size) best = lift;
  }
  if (!best || best.points.size < 1) return null;
  return {
    name: best.name,
    points: [...best.points.entries()].map(([date, value]) => ({ date, value })),
  };
}

/**
 * buildGoalProgress({ profile, metrics, workouts, now }) → null | {
 *   kind, goal, label, unit, targetValue, targetDate,
 *   currentValue, trendPerWeek, predictedDate, predictedAtTargetDate, onTrack, referenceName?
 * }
 */
export function buildGoalProgress({ profile, metrics = [], workouts = [], now = new Date() } = {}) {
  const target = profile?.goalTarget;
  const targetValue = toNum(target?.value);
  if (!target || targetValue == null) return null;

  let series = null;
  let referenceName = null;
  let unit = 'kg';
  let label = null;
  if (target.kind === 'weightKg') {
    series = buildWeightSeries(metrics);
    label = target.goal === 'hypertrophy' ? 'Peso corporal objetivo' : 'Peso objetivo';
  } else if (target.kind === 'e1rmKg') {
    const lift = buildE1rmSeries(workouts);
    if (!lift) return { kind: target.kind, goal: target.goal || null, label: 'e1RM objetivo', unit, targetValue, targetDate: target.date || null, currentValue: null, trendPerWeek: null, predictedDate: null, predictedAtTargetDate: null, onTrack: null, referenceName: null, note: 'Registra sesiones de fuerza con kg y reps para medir tu e1RM.' };
    series = lift.points;
    referenceName = lift.name;
    label = `e1RM objetivo (${lift.name})`;
  } else {
    return null;
  }

  const sorted = series.sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted.length ? sorted[sorted.length - 1].value : null;
  const trend = linearTrendPerWeek(sorted);
  const nowMs = (now instanceof Date ? now : new Date()).getTime();

  let predictedDate = null;
  let predictedAtTargetDate = null;
  let onTrack = null;
  if (current != null && trend != null && trend !== 0) {
    const remaining = targetValue - current;
    // Solo predecimos si la tendencia apunta HACIA el objetivo.
    if ((remaining > 0 && trend > 0) || (remaining < 0 && trend < 0)) {
      const weeks = remaining / trend;
      if (weeks >= 0 && weeks < 520) {
        predictedDate = new Date(nowMs + weeks * 7 * 86400000).toISOString().slice(0, 10);
      }
    }
    if (target.date) {
      const weeksToDate = (new Date(`${target.date}T00:00:00Z`).getTime() - nowMs) / (7 * 86400000);
      if (Number.isFinite(weeksToDate)) {
        predictedAtTargetDate = Number((current + trend * Math.max(0, weeksToDate)).toFixed(1));
        const goingDown = targetValue < current;
        onTrack = goingDown ? predictedAtTargetDate <= targetValue : predictedAtTargetDate >= targetValue;
      }
    }
  }

  return {
    kind: target.kind,
    goal: target.goal || null,
    label,
    unit,
    targetValue,
    targetDate: target.date || null,
    currentValue: current,
    trendPerWeek: trend,
    predictedDate,
    predictedAtTargetDate,
    onTrack,
    referenceName,
  };
}

/** Línea corta para el contexto del coach (chat). Null si no hay objetivo. */
export function describeGoalProgress(gp) {
  if (!gp || gp.targetValue == null) return null;
  const parts = [`Objetivo SMART: ${gp.label} ${gp.targetValue} ${gp.unit}${gp.targetDate ? ` para ${gp.targetDate}` : ''}.`];
  if (gp.currentValue != null) parts.push(`Actual: ${gp.currentValue} ${gp.unit}.`);
  if (gp.trendPerWeek != null) parts.push(`Tendencia: ${gp.trendPerWeek > 0 ? '+' : ''}${gp.trendPerWeek} ${gp.unit}/semana.`);
  if (gp.predictedDate) parts.push(`A este ritmo lo alcanza ~${gp.predictedDate}.`);
  if (gp.onTrack != null) parts.push(gp.onTrack ? 'Va EN CAMINO para su fecha.' : 'NO va en camino para su fecha: ajusta expectativas o plan con honestidad.');
  return parts.join(' ');
}
