// Motor de entrenamiento de carrera para Ignios.
//
// Convierte una MARCA reciente (distancia + tiempo) en ritmos de entrenamiento por zona
// (fácil, larga, umbral/tempo, intervalos, repeticiones) usando la fórmula de Riegel para
// estimar un 5K-equivalente y derivar el resto con desfases estándar de la literatura
// (Daniels/ACSM, aproximados). Si no hay marca, devuelve ritmos cualitativos.
//
// También construye la PRESCRIPCIÓN de cada sesión de carrera (estructura, series, drills)
// adaptada al objetivo (5K/10K/21K/42K/salud).

export const RaceGoal = Object.freeze({
  HEALTH: 'health',
  RACE_5K: 'race_5k',
  RACE_10K: 'race_10k',
  RACE_21K: 'race_21k',
  RACE_42K: 'race_42k',
});

export const RACE_GOAL_META = {
  health: { label: 'Salud / forma', distanceMeters: 0, longRunMin: 50, longRunCapMin: 70 },
  race_5k: { label: '5K', distanceMeters: 5000, longRunMin: 55, longRunCapMin: 80 },
  race_10k: { label: '10K', distanceMeters: 10000, longRunMin: 65, longRunCapMin: 95 },
  race_21k: { label: 'Media maratón (21K)', distanceMeters: 21097, longRunMin: 80, longRunCapMin: 130 },
  race_42k: { label: 'Maratón (42K)', distanceMeters: 42195, longRunMin: 95, longRunCapMin: 165 },
};

export function resolveRaceGoal(value) {
  return RACE_GOAL_META[value] ? value : RaceGoal.HEALTH;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Riegel: t2 = t1 * (d2/d1)^1.06
function riegel(timeSec, fromMeters, toMeters) {
  return timeSec * Math.pow(toMeters / fromMeters, 1.06);
}

// Estima el ritmo de 5K (s/km) a partir de una marca de referencia.
export function estimate5kPaceSecPerKm(refDistanceMeters, refTimeSeconds) {
  const d = toNum(refDistanceMeters);
  const t = toNum(refTimeSeconds);
  if (!Number.isFinite(d) || !Number.isFinite(t) || d < 800 || t < 120) return null;
  const t5k = riegel(t, d, 5000);
  return t5k / 5; // s/km
}

// Desfases (s/km) respecto al ritmo de 5K para cada tipo de sesión (aprox. Daniels).
const PACE_OFFSETS = {
  reps: -18,        // repeticiones cortas / técnica veloz
  intervals: -3,    // VO2max (~3-5K)
  tempo: +22,       // umbral (~ritmo 10K-15K)
  easy: +80,        // rodaje fácil / zona 2
  long: +92,        // tirada larga (cómodo sostenido)
};

export function deriveRunPaces(p5SecPerKm) {
  if (!p5SecPerKm) return null;
  const out = {};
  for (const [k, off] of Object.entries(PACE_OFFSETS)) {
    out[k] = Math.round(p5SecPerKm + off);
  }
  out.fiveK = Math.round(p5SecPerKm);
  return out;
}

export function formatPace(secPerKm) {
  if (!Number.isFinite(secPerKm)) return null;
  const s = Math.max(120, Math.round(secPerKm));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}/km`;
}

function paceRange(secPerKm, spread = 5) {
  if (!Number.isFinite(secPerKm)) return null;
  const lo = formatPace(secPerKm - spread);
  const hi = formatPace(secPerKm + spread);
  return `${lo.replace('/km', '')}–${hi}`;
}

// Mapea el foco de sesión (resuelto por el planner) al tipo de carrera.
export function runTypeFromFocus(sessionFocus) {
  switch (sessionFocus) {
    case 'cardio_intervals': return 'intervals';
    case 'cardio_tempo': return 'tempo';
    case 'cardio_long': return 'long';
    case 'cardio_drills': return 'drills';
    case 'cardio_easy':
    case 'cardio':
    default: return 'easy';
  }
}

const ZONE_LABELS = {
  easy: 'Zona 2 · conversacional',
  long: 'Zona 2 · cómodo sostenido',
  tempo: 'Umbral · cómodamente duro',
  intervals: 'VO2max · fuerte controlado',
  drills: 'Técnica · ágil y relajado',
};

// Drills de calentamiento para días de calidad (series/tempo).
const QUALITY_DRILLS = [
  'Movilidad de tobillo y cadera (3 min)',
  'A-skip y skipping bajo (2×20 m)',
  '4–6 rectas progresivas (strides) de 60–80 m',
];

// Esquema de series por objetivo para días de intervalos.
function intervalScheme(raceGoal) {
  switch (raceGoal) {
    case 'race_5k': return { reps: 6, dist: '800 m', recovery: '90 s trote', at: 'intervals' };
    case 'race_10k': return { reps: 5, dist: '1000 m', recovery: '90 s trote', at: 'intervals' };
    case 'race_21k': return { reps: 4, dist: '1500 m', recovery: '2 min trote', at: 'tempo' };
    case 'race_42k': return { reps: 5, dist: '1000 m', recovery: '90 s trote', at: 'tempo' };
    case 'health':
    default: return { reps: 8, dist: '1 min', recovery: '1 min suave', at: 'intervals' };
  }
}

// Construye la prescripción de una sesión de carrera.
export function buildRunPrescription({ sessionFocus, durationMinutes, raceGoal, paces }) {
  const runType = runTypeFromFocus(sessionFocus);
  const goal = resolveRaceGoal(raceGoal);
  const dur = Math.max(20, Math.round(toNum(durationMinutes) || 40));
  const hasPaces = !!paces;
  const p = (key) => (hasPaces ? formatPace(paces[key]) : null);
  const range = (key) => (hasPaces ? paceRange(paces[key]) : null);

  const out = {
    runType,
    zoneLabel: ZONE_LABELS[runType] || ZONE_LABELS.easy,
    targetPace: null,
    targetRange: null,
    structure: '',
    drills: [],
    note: '',
  };

  if (runType === 'easy') {
    out.targetPace = p('easy'); out.targetRange = range('easy');
    out.structure = `Carrera continua suave ${dur} min. Debes poder hablar en frases completas.`;
    out.note = 'El 80% del volumen semanal debe ser fácil (modelo polarizado).';
  } else if (runType === 'long') {
    out.targetPace = p('long'); out.targetRange = range('long');
    out.structure = `Tirada larga continua ${dur} min a ritmo cómodo. Hidrata y, si pasas de 75 min, lleva carbohidratos.`;
    out.note = 'Construye resistencia aeróbica; no la conviertas en carrera.';
  } else if (runType === 'tempo') {
    const block = Math.max(15, dur - 20);
    out.targetPace = p('tempo'); out.targetRange = range('tempo');
    out.structure = `10 min calentamiento + ${block} min continuos a umbral + 10 min vuelta a la calma.`;
    out.note = 'Esfuerzo “cómodamente duro”: sostenible ~1 h en carrera.';
    out.drills = QUALITY_DRILLS;
  } else if (runType === 'intervals') {
    const sch = intervalScheme(goal);
    out.targetPace = p(sch.at); out.targetRange = range(sch.at);
    out.structure = `Calentamiento 12 min + drills. ${sch.reps} × ${sch.dist} a ritmo ${sch.at === 'tempo' ? 'umbral' : 'intervalo'} (rec. ${sch.recovery}). Enfriamiento 8 min.`;
    out.note = 'Mantén todas las series al mismo ritmo; si decaes, recorta el número.';
    out.drills = QUALITY_DRILLS;
  } else { // drills
    out.targetPace = p('reps'); out.targetRange = range('reps');
    out.structure = 'Trote suave 10 min + circuito de técnica (A-skip, B-skip, skipping, talones) + 6 rectas progresivas.';
    out.note = 'Prioriza cadencia (~170–180 ppm) y postura, no la velocidad máxima.';
    out.drills = QUALITY_DRILLS;
  }

  return out;
}

// Resumen de ritmos para el coach / cabecera (texto corto). Devuelve null si no hay marca.
export function pacesSummary(paces) {
  if (!paces) return null;
  return {
    facil: formatPace(paces.easy),
    larga: formatPace(paces.long),
    umbral: formatPace(paces.tempo),
    intervalos: formatPace(paces.intervals),
    cincoK: formatPace(paces.fiveK),
  };
}
