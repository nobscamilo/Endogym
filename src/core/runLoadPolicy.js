/**
 * Política de carga de CARRERA del planner (auditoría externa 30-sep-2026, #1 #2 #3 #6 #7 #29).
 *
 * Problemas que corrige:
 *  - #1  Con <3 carreras en 28 días el plan caía a la PLANTILLA fija (60/60/60/75 min ≈ 4 h de
 *        carrera/semana) aunque la persona viniese de ~40 min/semana.
 *  - #2  La fase salía solo de la fecha: un nivel Base a 3 semanas de la carrera estaba en "pico".
 *  - #3  Sin semana de carrera: el día D era una tirada larga y la víspera, umbral.
 *  - #6  Dos sesiones de calidad por semana para nivel Base con poca base.
 *  - #7  Rodajes continuos a un techo de FC que la persona no puede sostener corriendo.
 *  - #29 Volumen plano o decreciente sin ser descarga.
 *
 * Criterios (orientativos, documentados; no son una ecuación validada):
 *  - Carga crónica = media semanal de minutos de carrera (mayor de 4 y 2 semanas).
 *  - Techo semanal inicial = max(suelo por nivel, crónica × 1,3) — ratio agudo:crónico ≤ 1,3,
 *    el umbral más citado de "zona segura" (Gabbett 2016; la evidencia es discutida, por eso
 *    se usa como techo prudente y no como objetivo). Progresión +10 %/semana dentro del bloque.
 *  - Suelo por nivel (dosis mínima útil): Base 75, Intermedio 120, Avanzado 180 min/semana.
 *  - Base baja = nivel Base, <4 carreras en 28 d o <90 min/semana de carrera. Calidad: 0 con base
 *    baja (1 si ya hace ≥8 carreras/28 d y ≥90 min), 2 con base consolidada y cribado que lo permita.
 *  - Sin datos de carrera (no sincroniza Strava) se confía en el nivel declarado.
 *  - Correr/caminar si la FC media de sus carreras supera el techo del rodaje (75 % FCmáx).
 */
import { RACE_GOAL_META, resolveRaceGoal, buildRunPrescription, RUN_RPE_BY_TYPE } from './running.js';
import { buildWarmupProtocol, buildCooldownProtocol } from './warmupCooldown.js';

const LEVEL_FLOOR_MIN = { novice: 75, intermediate: 120, advanced: 180 };
const ACWR_CAP = 1.3;
const WEEKLY_PROGRESSION = 0.1;
const MIN_RUN_MIN = 20;
const QUALITY_FOCUS = ['cardio_intervals', 'cardio_tempo'];

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round5(v) {
  return Math.max(MIN_RUN_MIN, Math.round(v / 5) * 5);
}

/**
 * @returns {{ level, lowBase, chronicWeeklyRunMin, runsLast28d, startCapMin, maxQuality,
 *   runWalk: {run:number, walk:number, reason:string}|null, maxPhase:'base'|'build'|'peak' }}
 */
export function buildRunLoadPolicy({ progressMemory = null, profile = {}, screening = null, hrMax = null } = {}) {
  const r = progressMemory?.running || {};
  const level = ['novice', 'intermediate', 'advanced'].includes(profile.trainingExperience) ? profile.trainingExperience : 'novice';
  const runs28 = num(r.runsLast28d) ?? 0;
  const chronic = num(r.weeklyRunMinutesBaseline);
  // Sin NINGÚN dato de carrera (no sincroniza Strava) no podemos medir la carga: se confía en
  // el nivel declarado. Base → prudente; Intermedio/Avanzado → sin techo por datos.
  const noData = runs28 === 0 && chronic == null;
  const lowBase = noData ? level === 'novice' : (level === 'novice' || runs28 < 4 || (chronic ?? 0) < 90);
  const floor = LEVEL_FLOOR_MIN[level];
  const startCapMin = noData
    ? (level === 'novice' ? floor : Infinity)
    : Math.round(Math.max(floor, (chronic ?? 0) * ACWR_CAP));

  const highAllowed = screening?.highIntensityAllowed !== false;
  let maxQuality;
  if (!highAllowed) maxQuality = 0;
  else if (lowBase) maxQuality = (runs28 >= 8 && (chronic ?? 0) >= 90) ? 1 : 0; // (Base con ≥2 carreras/semana y ≥90 min: 1)
  else maxQuality = 2;
  if (noData && level !== 'novice') maxQuality = highAllowed ? 2 : 0;

  let runWalk = null;
  const hr = num(r.recentRunAvgHr);
  const max = num(hrMax);
  if (hr && max && max >= 120) {
    const ceiling = Math.round(max * 0.75);
    const gap = hr - ceiling;
    if (gap >= 12) runWalk = { run: 2, walk: 1 };
    else if (gap >= 6) runWalk = { run: 3, walk: 1 };
    else if (gap > 0) runWalk = { run: 5, walk: 1 };
    if (runWalk) runWalk.reason = `Tu FC media corriendo (${hr} ppm) supera el techo del rodaje fácil (${ceiling} ppm).`;
  }
  if (!runWalk && level === 'novice' && runs28 < 4) {
    runWalk = { run: 3, walk: 1, reason: 'Vienes de muy poco volumen de carrera: alternar correr y caminar permite sumar minutos sin sobrecargar.' };
  }

  const maxPhase = lowBase ? 'base' : (level === 'intermediate' ? 'build' : 'peak');
  return { level, lowBase, noData, chronicWeeklyRunMin: chronic, runsLast28d: runs28, startCapMin, maxQuality, runWalk, maxPhase };
}

const PHASE_ORDER = ['base', 'build', 'peak'];

/**
 * Fase efectiva: la de la fecha, pero nunca por encima de lo que permite el nivel/base. Con
 * base baja no hay taper de 2 semanas (no hay volumen que afinar): solo la semana de carrera.
 */
export function capTrainingPhase(phase, policy, weeksToRace) {
  if (!policy) return phase;
  if (phase === 'taper') {
    if (policy.lowBase && Number(weeksToRace) >= 2) return 'base';
    return phase;
  }
  if (phase === 'deload') return phase;
  const i = PHASE_ORDER.indexOf(phase);
  const maxI = PHASE_ORDER.indexOf(policy.maxPhase);
  if (i < 0 || maxI < 0) return phase;
  return i > maxI ? policy.maxPhase : phase;
}

function isRunDay(d) {
  return d?.sessionType === 'aerobic' && d.workout;
}

function toEasyRun(day) {
  day.sessionFocus = 'cardio_easy';
  day.workout.sessionFocus = 'cardio_easy';
  day.workout.title = 'Rodaje suave';
}

function toActiveRest(day, { title = 'Descanso activo', minutes = 30, note = 'Caminar 20-30 min a ritmo cómodo + movilidad suave.' } = {}) {
  day.isTrainingDay = false;
  day.sessionType = 'recovery';
  day.sessionFocus = 'recovery';
  day.workout = {
    title,
    sessionFocus: 'recovery',
    durationMinutes: minutes,
    intensityRpe: 'RPE 2-3',
    warmup: buildWarmupProtocol({ sessionType: 'recovery', sessionFocus: 'recovery', profile: {} }),
    exercises: [],
    cooldown: buildCooldownProtocol({ sessionType: 'recovery', profile: {} }),
    note,
  };
}

function runWalkText(rw, minutes) {
  const cycle = rw.run + rw.walk;
  const reps = Math.max(1, Math.floor(minutes / cycle));
  return `Correr/caminar: ${reps} × (${rw.run} min corriendo suave + ${rw.walk} min caminando rápido), unos ${minutes} min en total. Camina en cuanto la FC pase del techo del rodaje, aunque no toque.`;
}

function rebuildRun(day, { raceGoal, paces, phase, runWalk }) {
  const minutes = day.workout.durationMinutes;
  const rp = buildRunPrescription({ sessionFocus: day.sessionFocus, durationMinutes: minutes, raceGoal, paces, phase });
  if (runWalk && (rp.runType === 'easy' || rp.runType === 'long')) {
    rp.structure = runWalkText(runWalk, minutes);
    rp.runWalk = { run: runWalk.run, walk: runWalk.walk };
    rp.note = `${runWalk.reason} Cuando puedas correr los tramos sin pasar del techo, alarga el tramo de carrera 1 min por semana.`;
    rp.targetPace = null;
    rp.targetRange = null;
  }
  day.workout.runPrescription = rp;
  const byType = RUN_RPE_BY_TYPE[rp.runType];
  if (byType) {
    day.workout.intensityRpe = byType;
    day.workout.intensityRpeSource = 'run_type';
  }
}

/**
 * Aplica calidad máxima, techo semanal de minutos y correr/caminar a los días de carrera de
 * UNA semana. Muta `days`. Devuelve un resumen para el plan.
 */
export function applyRunLoadPolicyToWeek(days, policy, { weekIndex = 0, raceGoal = 'health', paces = null, phase = 'base', volumeFactor = 1 } = {}) {
  if (!policy || !Array.isArray(days)) return null;
  const runs = days.filter(isRunDay);
  if (!runs.length) return null;

  // 1) Calidad: conserva como mucho `maxQuality` (series antes que umbral); el resto, rodaje.
  const quality = runs.filter((d) => QUALITY_FOCUS.includes(d.sessionFocus));
  quality.sort((a, b) => (a.sessionFocus === 'cardio_intervals' ? -1 : 1) - (b.sessionFocus === 'cardio_intervals' ? -1 : 1));
  quality.slice(policy.maxQuality).forEach(toEasyRun);

  // 2) Techo semanal (progresa +10 %/semana; la fase lo puede recortar, nunca subir).
  const cap = Number.isFinite(policy.startCapMin)
    ? Math.round(policy.startCapMin * (1 + WEEKLY_PROGRESSION) ** weekIndex * Math.min(1, volumeFactor))
    : Infinity;
  const total = runs.reduce((a, d) => a + (Number(d.workout.durationMinutes) || 0), 0);
  // Objetivo de la semana: lo planificado, progresando +10 %/semana dentro del bloque (#29),
  // y nunca por encima del techo. En fases que recortan (taper/descarga) no se progresa.
  const grow = volumeFactor < 1 ? 1 : (1 + WEEKLY_PROGRESSION) ** weekIndex;
  // Sin techo (sin datos y nivel declarado ≥ intermedio) no se toca el volumen de la plantilla.
  const target = Number.isFinite(cap) ? Math.min(cap, Math.round(total * grow)) : total;
  let kept = runs;
  if (target !== total) {
    const maxRuns = Math.max(2, Math.min(runs.length, Math.floor(target / MIN_RUN_MIN)));
    if (maxRuns < runs.length) {
      // Quita primero rodajes suaves (nunca la tirada larga ni la calidad que quede).
      const removable = runs.filter((d) => d.sessionFocus === 'cardio_easy' || d.sessionFocus === 'cardio' || d.sessionFocus === 'cardio_drills');
      const toRemove = removable.slice(-(runs.length - maxRuns));
      toRemove.forEach((d) => toActiveRest(d));
      kept = runs.filter((d) => !toRemove.includes(d));
    }
    kept.forEach((d) => { d._origMin = Number(d.workout.durationMinutes) || null; });
    const long = kept.find((d) => d.sessionFocus === 'cardio_long');
    const others = kept.filter((d) => d !== long);
    const longMin = long ? round5(Math.max(target * 0.4, MIN_RUN_MIN)) : 0;
    const each = others.length ? round5((target - longMin) / others.length) : 0;
    if (long) long.workout.durationMinutes = longMin;
    others.forEach((d) => { d.workout.durationMinutes = each; });
  }

  // 3) Prescripción coherente con la duración final (+ correr/caminar si toca).
  kept.forEach((d) => {
    const prevKm = d.workout.runPrescription?.targetKm ?? null;
    rebuildRun(d, { raceGoal, paces, phase, runWalk: policy.runWalk });
    // El km objetivo sigue a los minutos (proporcional). Con correr/caminar no se promete km.
    if (prevKm && !policy.runWalk) {
      const ratio = d._origMin ? d.workout.durationMinutes / d._origMin : 1;
      d.workout.runPrescription.targetKm = Math.round(prevKm * ratio * 10) / 10;
    }
    delete d._origMin;
  });
  return {
    weeklyCapMin: Number.isFinite(cap) ? cap : null,
    plannedRunMin: kept.reduce((a, d) => a + d.workout.durationMinutes, 0),
    qualitySessions: kept.filter((d) => QUALITY_FOCUS.includes(d.sessionFocus)).length,
    runWalk: policy.runWalk ? { run: policy.runWalk.run, walk: policy.runWalk.walk } : null,
  };
}

function formatHms(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/**
 * Semana de carrera: el día D es una sesión "Carrera" con estrategia; la víspera, descanso;
 * después, recuperación; antes, rodajes cortos (~50 %) con progresivos y sin fuerza de pierna
 * en los 4 días previos. Muta `days`. Devuelve null si la carrera no cae en esta semana.
 */
export function applyRaceWeek(days, { raceDate, raceGoal, p5SecPerKm = null, policy = null, paces = null } = {}) {
  if (!raceDate || !Array.isArray(days)) return null;
  const raceIdx = days.findIndex((d) => d.date === raceDate);
  if (raceIdx < 0) return null;
  const goal = resolveRaceGoal(raceGoal);
  const meta = RACE_GOAL_META[goal];
  const runWalk = policy?.runWalk || null;

  let stridesDone = false;
  days.forEach((d, i) => {
    if (i === raceIdx) return;
    if (i > raceIdx + 2) return; // a partir del 3.er día tras la carrera, el plan sigue su curso
    if (i > raceIdx) {
      toActiveRest(d, { title: 'Recuperación post-carrera', minutes: 30, note: 'Caminar 20-30 min y movilidad suave. Vuelve a correr cuando no haya dolor ni cansancio anormal.' });
      return;
    }
    if (i === raceIdx - 1) {
      toActiveRest(d, { title: 'Víspera de carrera', minutes: 15, note: 'Descanso o 10-15 min muy suaves con 3-4 progresivos cortos. Prepara dorsal, ropa y avituallamiento; cena conocida.' });
      d.preRace = true;
      return;
    }
    if (d.sessionType === 'resistance' || d.sessionType === 'mixed') {
      if (raceIdx - i <= 4) toActiveRest(d, { title: 'Movilidad (semana de carrera)', minutes: 20, note: 'Sin fuerza de pierna los 4 días previos a la carrera: movilidad y core suave.' });
      return;
    }
    if (isRunDay(d)) {
      toEasyRun(d);
      d.workout.durationMinutes = round5((Number(d.workout.durationMinutes) || 40) * 0.5);
      rebuildRun(d, { raceGoal: goal, paces, phase: 'taper', runWalk });
      if (!stridesDone && raceIdx - i >= 2) {
        d.workout.runPrescription.structure += ' Al final, 4-6 progresivos de 20 s (rápidos pero relajados) con 1 min andando entre ellos.';
        stridesDone = true;
      }
      d.workout.runPrescription.note = 'Semana de carrera: volumen a la mitad para llegar fresco. No recuperes sesiones perdidas.';
      delete d.workout.runPrescription.targetKm;
    }
  });

  const race = days[raceIdx];
  const distKm = meta.distanceMeters / 1000;
  const predictedSec = p5SecPerKm && distKm ? p5SecPerKm * 5 * (distKm / 5) ** 1.06 * (runWalk ? 1.08 : 1) : null;
  const minutes = predictedSec ? Math.round(predictedSec / 60) : (distKm ? Math.round(distKm * 8) : 60);
  const strategy = runWalk
    ? `Correr/caminar ${runWalk.run}:${runWalk.walk} DESDE EL KM 0 (no esperes a estar cansado). Primer tercio más suave de lo que te pida el cuerpo; si en la mitad vas bien, pasa a tramos más largos de carrera; el último tercio, lo que te quede.`
    : 'Salida controlada: los 2 primeros km 5-10 s/km más lentos que tu ritmo objetivo; parte central a ritmo; si en el último tercio vas bien, aprieta (parcial negativo).';
  const fueling = minutes > 75
    ? ' Avituallamiento: agua en cada puesto y 30-60 g de hidratos por hora (gel o bebida) a partir de los 40-45 min.'
    : ' Para esta duración no necesitas geles: agua según calor.';
  race.isTrainingDay = true;
  race.sessionType = 'aerobic';
  race.sessionFocus = 'race';
  race.raceDay = true;
  race.workout = {
    title: `Carrera ${meta.label}`,
    sessionFocus: 'race',
    durationMinutes: minutes,
    intensityRpe: 'RPE 6-8',
    intensityRpeSource: 'race',
    warmup: race.workout?.warmup || [],
    exercises: [],
    cooldown: race.workout?.cooldown || [],
    runPrescription: {
      runType: 'race',
      zoneLabel: 'Carrera',
      targetPace: null,
      targetRange: null,
      structure: `Calentamiento 10 min de trote muy suave + 3 progresivos. ${strategy}`,
      note: `${policy?.lowBase ? 'Con tu base actual, el objetivo es TERMINAR bien, no hacer marca: caminar más tramos de lo previsto es parte del plan, no un fracaso. ' : ''}${predictedSec ? `Tiempo orientativo: ~${formatHms(predictedSec)}. ` : ''}Desayuno habitual 2-3 h antes (nada nuevo el día de la carrera).${fueling} Si aparece dolor torácico, mareo o palpitaciones, para y pide ayuda.`,
      drills: [],
    },
  };
  return { raceIdx, predictedSec: predictedSec ? Math.round(predictedSec) : null, runWalk: Boolean(runWalk) };
}
