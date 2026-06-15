// Fusión de sesiones por día (fuente única de verdad para conteo e historial).
//
// Un mismo día de entrenamiento puede generar hasta 3 documentos en `workouts`:
//   - `daily-{fecha}`  → check-in (completada, RPE, fatiga, sueño, síntomas)
//   - id automático    → registro manual (cargas/reps por ejercicio, RPE de sesión)
//   - `strava-{id}`    → actividad sincronizada (distancia, FC, ritmo)
// Antes se contaba 1 documento = 1 sesión, inflando adherencia e historial.
// DECISIÓN (15 jun 2026, usuario): **1 sesión por día**; se fusionan los registros
// quedándose con la info más rica de cada fuente. Strava que coincide con el día NO
// suma una sesión extra.

export function workoutDayKey(workout) {
  return String(workout?.performedAt || '').slice(0, 10);
}

// Una sesión "hecha": el check-in solo cuenta si se completó; el resto cuenta salvo
// que esté explícitamente marcado como no completado.
export function isWorkoutDone(workout) {
  if (!workout) return false;
  return workout.source === 'daily_checkin'
    ? workout.completed === true
    : workout.completed !== false;
}

function liftCount(workout) {
  return (Array.isArray(workout?.exercises) ? workout.exercises : []).filter((e) => e?.name).length;
}

// Cuanto "contenido de sesión" aporta un registro: prioriza el que trae ejercicios
// (y cargas), luego Strava (métricas de dispositivo) y por último el check-in.
function richnessScore(workout) {
  let score = 0;
  const lifts = (Array.isArray(workout?.exercises) ? workout.exercises : []).filter((e) => e?.name);
  score += lifts.length * 10;
  if (lifts.some((e) => Number(e.weightKg) > 0)) score += 5;
  if (workout?.source === 'manual') score += 4;
  else if (workout?.source === 'strava') score += 2;
  if (Number(workout?.durationMinutes) > 0) score += 1;
  return score;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Fusiona los registros "hechos" de un mismo día en una sola sesión, conservando los
// nombres de campo de un workout para que los mappers existentes la consuman igual.
function mergeDayWorkouts(dayWorkouts) {
  const done = dayWorkouts.filter(isWorkoutDone);
  if (!done.length) return null;

  const byRichness = [...done].sort((a, b) => richnessScore(b) - richnessScore(a));
  const base = byRichness[0];
  const checkin = done.find((w) => w.source === 'daily_checkin') || null;
  const strava = done.find((w) => w.source === 'strava') || null;
  const sources = Array.from(new Set(done.map((w) => w.source || 'manual')));

  return {
    ...base,
    // id del registro con más contenido → mantiene el análisis del coach cacheado.
    id: base.id,
    workoutId: base.id,
    source: base.source,
    sources,
    merged: sources.length > 1,
    performedAt: base.performedAt,
    title: base.title || strava?.title || checkin?.title || null,
    durationMinutes: firstNumber(base.durationMinutes, strava?.durationMinutes, checkin?.durationMinutes),
    distanceKm: firstNumber(strava?.distanceKm, base.distanceKm),
    avgHeartRate: firstNumber(strava?.avgHeartRate, base.avgHeartRate),
    maxHeartRate: firstNumber(strava?.maxHeartRate, base.maxHeartRate),
    avgPaceSecPerKm: firstNumber(strava?.avgPaceSecPerKm, base.avgPaceSecPerKm),
    // Bienestar: del check-in (única fuente fiable de fatiga/sueño/síntomas).
    sessionRpe: firstNumber(base.sessionRpe, checkin?.sessionRpe),
    fatigue: firstNumber(checkin?.fatigue, base.fatigue),
    sleepHours: firstNumber(checkin?.sleepHours, base.sleepHours),
    symptoms: checkin?.symptoms || base.symptoms || null,
    hasAlarmSymptoms: Boolean(checkin?.hasAlarmSymptoms || base.hasAlarmSymptoms),
    completed: true,
  };
}

// Colapsa una lista de workouts a una sesión por día (las más recientes primero).
// `liftCount` se usa solo como desempate estable.
export function collapseWorkoutsByDay(workouts) {
  const groups = new Map();
  (Array.isArray(workouts) ? workouts : []).forEach((w) => {
    const key = workoutDayKey(w);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  });

  const sessions = [];
  for (const [, dayWorkouts] of groups) {
    const merged = mergeDayWorkouts(dayWorkouts);
    if (merged) sessions.push(merged);
  }

  return sessions.sort((a, b) => {
    const cmp = String(b.performedAt || '').localeCompare(String(a.performedAt || ''));
    return cmp !== 0 ? cmp : liftCount(b) - liftCount(a);
  });
}

// Número de sesiones realmente hechas (1 por día), para adherencia y conteo.
export function countDoneSessions(workouts) {
  return collapseWorkoutsByDay(workouts).length;
}

// Sesión fusionada de un día concreto (YYYY-MM-DD), o null si ese día no hay nada hecho.
// Sirve para rehidratar en la UI el estado "hoy ya registrado".
export function findDaySession(workouts, dayKey) {
  if (!dayKey) return null;
  const sameDay = (Array.isArray(workouts) ? workouts : []).filter((w) => workoutDayKey(w) === dayKey);
  return mergeDayWorkouts(sameDay);
}
