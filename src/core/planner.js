import {
  GoalType,
  MetabolicProfile,
  TrainingModality,
  TrainingMode,
} from '../domain/models.js';
import {
  buildSessionExercises,
  getExerciseLibrarySummary,
  isExerciseCompatibleWithSessionFocus,
  resolveSessionFocus,
} from './exerciseLibrary.js';
import { buildMacroPlan } from './nutrition.js';
import { buildWeeklyNutritionPlan } from './nutritionPlanner.js';
import {
  RACE_GOAL_META,
  resolveRaceGoal,
  estimate5kPaceSecPerKm,
  deriveRunPaces,
  buildRunPrescription,
  pacesSummary,
  resolveTrainingPhase,
  resolvePhaseParams,
  weeksToRace,
  carbStrategyForDay,
  stepDownRunFocus,
} from './running.js';
import { buildWarmupProtocol, buildCooldownProtocol } from './warmupCooldown.js';
import { listActiveRestrictionRules } from './comorbidityRestrictions.js';

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

const LEGACY_GOAL_MAP = {
  cut: GoalType.WEIGHT_LOSS,
  maintenance: GoalType.MAINTAIN_WEIGHT,
  bulk: GoalType.HYPERTROPHY,
};

const GOAL_CALORIE_DELTA = {
  [GoalType.WEIGHT_LOSS]: -450,
  [GoalType.MAINTAIN_WEIGHT]: 0,
  [GoalType.ENDURANCE]: 150,
  [GoalType.HYPERTROPHY]: 250,
  [GoalType.STRENGTH]: 100,
  [GoalType.RECOMPOSITION]: -100,
  [GoalType.GLYCEMIC_CONTROL]: -150,
  [GoalType.SAFE_CONDITIONING]: 0,
};

const MODALITY_TEMPLATES = {
  [TrainingModality.FULL_GYM]: [
    { dayName: 'Lunes', sessionType: 'resistance', title: 'Torso A', durationMinutes: 70, exercises: ['Press banca', 'Remo barra', 'Press militar', 'Jalón al pecho', 'Core'] },
    { dayName: 'Martes', sessionType: 'aerobic', title: 'Cardio zona 2 + movilidad', durationMinutes: 45, exercises: ['Cinta/bici zona 2', 'Movilidad cadera-tobillo'] },
    { dayName: 'Miércoles', sessionType: 'resistance', title: 'Pierna A', durationMinutes: 75, exercises: ['Sentadilla', 'Peso muerto rumano', 'Prensa', 'Gemelos'] },
    { dayName: 'Jueves', sessionType: 'recovery', title: 'Recuperación activa', durationMinutes: 35, exercises: ['Caminata', 'Movilidad torácica', 'Respiración'] },
    { dayName: 'Viernes', sessionType: 'resistance', title: 'Torso B', durationMinutes: 70, exercises: ['Press inclinado', 'Remo mancuerna', 'Elevaciones laterales', 'Bíceps-tríceps'] },
    { dayName: 'Sábado', sessionType: 'mixed', title: 'Pierna B + acondicionamiento', durationMinutes: 70, exercises: ['Hip thrust', 'Zancadas', 'Curl femoral', 'Circuito metabólico'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave', 'Paseo ligero'] },
  ],
  [TrainingModality.HOME]: [
    { dayName: 'Lunes', sessionType: 'resistance', title: 'Full Body A', durationMinutes: 50, exercises: ['Flexiones', 'Sentadillas', 'Puente glúteo', 'Plancha'] },
    { dayName: 'Martes', sessionType: 'aerobic', title: 'Cardio base', durationMinutes: 40, exercises: ['Caminata rápida', 'Subir escaleras', 'Movilidad'] },
    { dayName: 'Miércoles', sessionType: 'resistance', title: 'Full Body B', durationMinutes: 50, exercises: ['Pike push-up', 'Zancadas', 'Remo con banda', 'Core'] },
    { dayName: 'Jueves', sessionType: 'recovery', title: 'Recuperación', durationMinutes: 30, exercises: ['Movilidad', 'Respiración'] },
    { dayName: 'Viernes', sessionType: 'resistance', title: 'Full Body C', durationMinutes: 50, exercises: ['Fondos entre sillas', 'Sentadilla búlgara', 'Peso muerto con mochila'] },
    { dayName: 'Sábado', sessionType: 'mixed', title: 'HIIT bajo impacto', durationMinutes: 35, exercises: ['Circuito intervalos', 'Core'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave'] },
  ],
  [TrainingModality.YOGA]: [
    { dayName: 'Lunes', sessionType: 'mindbody', title: 'Yoga movilidad', durationMinutes: 50, exercises: ['Vinyasa suave', 'Movilidad cadera/columna'] },
    { dayName: 'Martes', sessionType: 'aerobic', title: 'Caminar en zona 2', durationMinutes: 45, exercises: ['Caminata rápida'] },
    { dayName: 'Miércoles', sessionType: 'mindbody', title: 'Yoga fuerza', durationMinutes: 55, exercises: ['Asanas de soporte', 'Core isométrico'] },
    { dayName: 'Jueves', sessionType: 'recovery', title: 'Respiración + flexibilidad', durationMinutes: 35, exercises: ['Pranayama', 'Estiramientos'] },
    { dayName: 'Viernes', sessionType: 'mindbody', title: 'Yoga flujo', durationMinutes: 50, exercises: ['Flujo dinámico'] },
    { dayName: 'Sábado', sessionType: 'mixed', title: 'Yoga + caminata', durationMinutes: 55, exercises: ['Secuencia corta', 'Caminata'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave'] },
  ],
  [TrainingModality.TRX]: [
    { dayName: 'Lunes', sessionType: 'resistance', title: 'TRX push/pull', durationMinutes: 55, exercises: ['TRX row', 'TRX chest press', 'TRX Y-raise', 'Core'] },
    { dayName: 'Martes', sessionType: 'aerobic', title: 'Cardio base', durationMinutes: 40, exercises: ['Bici o caminata'] },
    { dayName: 'Miércoles', sessionType: 'resistance', title: 'TRX lower body', durationMinutes: 55, exercises: ['TRX squat', 'TRX lunge', 'TRX hamstring curl'] },
    { dayName: 'Jueves', sessionType: 'recovery', title: 'Movilidad y estabilidad', durationMinutes: 30, exercises: ['Movilidad', 'Trabajo escapular'] },
    { dayName: 'Viernes', sessionType: 'resistance', title: 'TRX full body', durationMinutes: 55, exercises: ['TRX atomic push-up', 'TRX single-leg squat', 'TRX row'] },
    { dayName: 'Sábado', sessionType: 'mixed', title: 'Condicionamiento TRX', durationMinutes: 40, exercises: ['Circuito TRX por intervalos'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave'] },
  ],
  [TrainingModality.RUNNING]: [
    { dayName: 'Lunes', sessionType: 'aerobic', title: 'Rodaje suave', durationMinutes: 45, exercises: ['Carrera zona 2'] },
    { dayName: 'Martes', sessionType: 'resistance', title: 'Fuerza complementaria', durationMinutes: 40, exercises: ['Sentadilla', 'Peso muerto', 'Core'] },
    { dayName: 'Miércoles', sessionType: 'aerobic', title: 'Intervalos', durationMinutes: 45, exercises: ['Series cortas + recuperación'] },
    { dayName: 'Jueves', sessionType: 'recovery', title: 'Recuperación activa', durationMinutes: 30, exercises: ['Caminata', 'Movilidad'] },
    { dayName: 'Viernes', sessionType: 'aerobic', title: 'Tempo run', durationMinutes: 50, exercises: ['Ritmo umbral'] },
    { dayName: 'Sábado', sessionType: 'aerobic', title: 'Tirada larga', durationMinutes: 65, exercises: ['Carrera continua'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave'] },
  ],
  [TrainingModality.CYCLING]: [
    { dayName: 'Lunes', sessionType: 'aerobic', title: 'Base aeróbica', durationMinutes: 60, exercises: ['Ciclismo zona 2'] },
    { dayName: 'Martes', sessionType: 'resistance', title: 'Fuerza complementaria', durationMinutes: 40, exercises: ['Sentadilla goblet', 'Peso muerto', 'Core'] },
    { dayName: 'Miércoles', sessionType: 'aerobic', title: 'Intervalos en bici', durationMinutes: 50, exercises: ['Bloques de alta intensidad'] },
    { dayName: 'Jueves', sessionType: 'recovery', title: 'Recuperación', durationMinutes: 30, exercises: ['Movilidad'] },
    { dayName: 'Viernes', sessionType: 'aerobic', title: 'Cadencia/tempo', durationMinutes: 55, exercises: ['Trabajo de cadencia'] },
    { dayName: 'Sábado', sessionType: 'aerobic', title: 'Salida larga', durationMinutes: 80, exercises: ['Rodaje continuo'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave'] },
  ],
  [TrainingModality.CALISTHENICS]: [
    { dayName: 'Lunes', sessionType: 'resistance', title: 'Empuje', durationMinutes: 55, exercises: ['Flexiones', 'Fondos', 'Pike push-up'] },
    { dayName: 'Martes', sessionType: 'aerobic', title: 'Cardio base', durationMinutes: 35, exercises: ['Caminata rápida o trote'] },
    { dayName: 'Miércoles', sessionType: 'resistance', title: 'Tracción', durationMinutes: 55, exercises: ['Dominadas asistidas', 'Remo invertido', 'Core'] },
    { dayName: 'Jueves', sessionType: 'recovery', title: 'Movilidad', durationMinutes: 30, exercises: ['Caderas/hombros/columna'] },
    { dayName: 'Viernes', sessionType: 'resistance', title: 'Pierna y core', durationMinutes: 55, exercises: ['Sentadilla pistol progresión', 'Zancadas', 'Plancha'] },
    { dayName: 'Sábado', sessionType: 'mixed', title: 'Circuito calisténico', durationMinutes: 40, exercises: ['Circuito full body'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave'] },
  ],
  [TrainingModality.HYBRID_RUN_GYM]: [
    { dayName: 'Lunes', sessionType: 'resistance', title: 'Gym · Pierna (fuerza)', durationMinutes: 60, exercises: ['Sentadilla', 'Peso muerto rumano', 'Zancadas', 'Core'] },
    { dayName: 'Martes', sessionType: 'aerobic', title: 'Rodaje suave (Zona 2)', durationMinutes: 40, exercises: ['Carrera zona 2'] },
    { dayName: 'Miércoles', sessionType: 'resistance', title: 'Gym · Torso (fuerza)', durationMinutes: 55, exercises: ['Press banca', 'Remo', 'Press militar', 'Dominadas'] },
    { dayName: 'Jueves', sessionType: 'aerobic', title: 'Series / Intervalos', durationMinutes: 45, exercises: ['Intervalos de carrera'] },
    { dayName: 'Viernes', sessionType: 'recovery', title: 'Recuperación activa', durationMinutes: 30, exercises: ['Caminata', 'Movilidad'] },
    { dayName: 'Sábado', sessionType: 'aerobic', title: 'Tirada larga', durationMinutes: 70, exercises: ['Carrera continua zona 2'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave'] },
  ],
  [TrainingModality.PILATES]: [
    { dayName: 'Lunes', sessionType: 'mindbody', title: 'Pilates control central', durationMinutes: 50, exercises: ['Mat core flow'] },
    { dayName: 'Martes', sessionType: 'aerobic', title: 'Cardio base', durationMinutes: 40, exercises: ['Caminata o bici'] },
    { dayName: 'Miércoles', sessionType: 'mindbody', title: 'Pilates fuerza', durationMinutes: 50, exercises: ['Trabajo de cadena posterior'] },
    { dayName: 'Jueves', sessionType: 'recovery', title: 'Movilidad', durationMinutes: 30, exercises: ['Flexibilidad guiada'] },
    { dayName: 'Viernes', sessionType: 'mindbody', title: 'Pilates mixto', durationMinutes: 50, exercises: ['Estabilidad + movilidad'] },
    { dayName: 'Sábado', sessionType: 'mixed', title: 'Pilates + cardio', durationMinutes: 50, exercises: ['Pilates corto + caminata'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 20, exercises: ['Movilidad suave'] },
  ],
  [TrainingModality.MIXED]: [
    { dayName: 'Lunes', sessionType: 'resistance', title: 'Fuerza total', durationMinutes: 60, exercises: ['Trabajo compuesto'] },
    { dayName: 'Martes', sessionType: 'aerobic', title: 'Cardio continuo', durationMinutes: 45, exercises: ['Zona 2'] },
    { dayName: 'Miércoles', sessionType: 'mindbody', title: 'Movilidad guiada', durationMinutes: 45, exercises: ['Yoga/Pilates'] },
    { dayName: 'Jueves', sessionType: 'resistance', title: 'Fuerza + potencia', durationMinutes: 60, exercises: ['Trabajo explosivo controlado'] },
    { dayName: 'Viernes', sessionType: 'aerobic', title: 'Intervalos', durationMinutes: 40, exercises: ['Bloques de alta intensidad'] },
    { dayName: 'Sábado', sessionType: 'mixed', title: 'Condicionamiento mixto', durationMinutes: 50, exercises: ['Circuito combinado'] },
    { dayName: 'Domingo', sessionType: 'recovery', title: 'Descanso', durationMinutes: 25, exercises: ['Movilidad suave'] },
  ],
};

const EXTRA_SESSION_VARIATIONS = {
  [TrainingModality.FULL_GYM]: [
    { sessionType: 'resistance', sessionFocus: 'push', title: 'Empuje técnico', durationMinutes: 66, descriptor: 'Pecho, hombro y triceps con foco técnico' },
    { sessionType: 'resistance', sessionFocus: 'pull', title: 'Tracción densa', durationMinutes: 66, descriptor: 'Espalda alta, dorsales y estabilidad escapular' },
    { sessionType: 'resistance', sessionFocus: 'lower', title: 'Pierna posterior', durationMinutes: 72, descriptor: 'Glúteos, femoral y bisagra dominante' },
    { sessionType: 'mixed', sessionFocus: 'full_body', title: 'Full body metabólico', durationMinutes: 62, descriptor: 'Trabajo total sin repetir cadenas consecutivas' },
  ],
  [TrainingModality.HOME]: [
    { sessionType: 'resistance', sessionFocus: 'full_body', title: 'Full Body potencia', durationMinutes: 48, descriptor: 'Empuje, tracción y pierna en formato compacto' },
    { sessionType: 'resistance', sessionFocus: 'lower', title: 'Pierna en casa', durationMinutes: 46, descriptor: 'Pierna unilateral, glúteos y core anti-rotación' },
    { sessionType: 'mixed', sessionFocus: 'full_body', title: 'Circuito home atlético', durationMinutes: 38, descriptor: 'Trabajo total con densidad y bajo impacto' },
  ],
  [TrainingModality.TRX]: [
    { sessionType: 'resistance', sessionFocus: 'upper', title: 'TRX upper control', durationMinutes: 54, descriptor: 'Torso en suspensión con énfasis escapular' },
    { sessionType: 'resistance', sessionFocus: 'lower', title: 'TRX lower control', durationMinutes: 54, descriptor: 'Pierna, glúteo y core con estabilidad' },
    { sessionType: 'mixed', sessionFocus: 'full_body', title: 'TRX metabolic flow', durationMinutes: 42, descriptor: 'Suspensión total con bloques de acondicionamiento' },
  ],
  [TrainingModality.YOGA]: [
    { sessionType: 'mindbody', sessionFocus: 'mindbody', title: 'Yoga estabilidad', durationMinutes: 52, descriptor: 'Equilibrio, control lumbo-pélvico y respiración' },
    { sessionType: 'mindbody', sessionFocus: 'mindbody', title: 'Yoga fuerza posterior', durationMinutes: 54, descriptor: 'Cadena posterior, hombros y control central' },
    { sessionType: 'mixed', sessionFocus: 'mindbody', title: 'Yoga flow + base aeróbica', durationMinutes: 56, descriptor: 'Flujo útil y salida aeróbica ligera' },
  ],
  [TrainingModality.PILATES]: [
    { sessionType: 'mindbody', sessionFocus: 'mindbody', title: 'Pilates control posterior', durationMinutes: 50, descriptor: 'Glúteos, cadena posterior y control segmentario' },
    { sessionType: 'mindbody', sessionFocus: 'mindbody', title: 'Pilates precisión central', durationMinutes: 48, descriptor: 'Core profundo, movilidad torácica y estabilidad' },
    { sessionType: 'mixed', sessionFocus: 'mindbody', title: 'Pilates flow + cardio', durationMinutes: 50, descriptor: 'Sesión mixta sin saturar grupos adyacentes' },
  ],
  [TrainingModality.CALISTHENICS]: [
    { sessionType: 'resistance', sessionFocus: 'push', title: 'Empuje controlado', durationMinutes: 52, descriptor: 'Pecho, hombro y tríceps con control de escápulas' },
    { sessionType: 'resistance', sessionFocus: 'pull', title: 'Tracción controlada', durationMinutes: 52, descriptor: 'Espalda, bíceps y core suspendido' },
    { sessionType: 'mixed', sessionFocus: 'full_body', title: 'Circuito skill + engine', durationMinutes: 40, descriptor: 'Trabajo técnico y metabólico combinado' },
  ],
  [TrainingModality.MIXED]: [
    { sessionType: 'resistance', sessionFocus: 'full_body', title: 'Full body controlado', durationMinutes: 58, descriptor: 'Trabajo global sin castigar cadenas consecutivas' },
    { sessionType: 'resistance', sessionFocus: 'upper', title: 'Torso mixto', durationMinutes: 56, descriptor: 'Empuje y tracción superior con densidad media' },
    { sessionType: 'mixed', sessionFocus: 'full_body', title: 'Engine mixto', durationMinutes: 44, descriptor: 'Acondicionamiento útil con base de fuerza' },
  ],
  [TrainingModality.HYBRID_RUN_GYM]: [
    { sessionType: 'resistance', sessionFocus: 'lower', title: 'Gym · Pierna (fuerza)', durationMinutes: 60, descriptor: 'Fuerza de tren inferior; separada de la tirada larga' },
    { sessionType: 'resistance', sessionFocus: 'upper', title: 'Gym · Torso (fuerza)', durationMinutes: 55, descriptor: 'Empuje y tracción superior, bajo impacto en piernas' },
    { sessionType: 'aerobic', sessionFocus: 'cardio_easy', title: 'Rodaje suave (Zona 2)', durationMinutes: 40, descriptor: 'Carrera aeróbica fácil para volumen' },
    { sessionType: 'aerobic', sessionFocus: 'cardio_intervals', title: 'Series / Intervalos', durationMinutes: 45, descriptor: 'Trabajo de alta intensidad de carrera' },
    { sessionType: 'aerobic', sessionFocus: 'cardio_tempo', title: 'Tempo / Umbral', durationMinutes: 45, descriptor: 'Ritmo controlado en umbral' },
    { sessionType: 'aerobic', sessionFocus: 'cardio_long', title: 'Tirada larga', durationMinutes: 70, descriptor: 'Volumen aeróbico continuo' },
  ],
};

function toNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveGoal(goal) {
  const resolved = LEGACY_GOAL_MAP[goal] || goal;
  const goals = new Set([
    GoalType.WEIGHT_LOSS,
    GoalType.MAINTAIN_WEIGHT,
    GoalType.ENDURANCE,
    GoalType.HYPERTROPHY,
    GoalType.STRENGTH,
    GoalType.RECOMPOSITION,
    GoalType.GLYCEMIC_CONTROL,
    GoalType.SAFE_CONDITIONING,
  ]);
  return goals.has(resolved) ? resolved : GoalType.RECOMPOSITION;
}

function resolveTrainingModality(modality, trainingMode) {
  const modalities = new Set(Object.values(TrainingModality));
  if (modalities.has(modality)) {
    return modality;
  }
  if (trainingMode === TrainingMode.HOME) {
    return TrainingModality.HOME;
  }
  return TrainingModality.FULL_GYM;
}

function resolveMetabolicProfile(value) {
  const profiles = new Set(Object.values(MetabolicProfile));
  return profiles.has(value) ? value : MetabolicProfile.NONE;
}

function getTemplateWeekdayIndex(date) {
  return (date.getUTCDay() + 6) % 7;
}

// Fuente ÚNICA de calentamiento: los drills concretos de la prescripción de carrera
// (A-skip, rectas con metros y series) sustituyen al texto genérico del paso de
// activación del protocolo dinámico. La UI solo pinta el protocolo (sin duplicados).
export function mergeRunDrillsIntoWarmup(workout) {
  const drills = workout?.runPrescription?.drills;
  if (!Array.isArray(drills) || !drills.length || !Array.isArray(workout?.warmup)) return;
  const activation = workout.warmup.find((step) => step.step === 'Activación biomecánica');
  if (activation) activation.details = drills.join(' · ');
}

function rotateTemplateToDate(template, startDate) {
  const startIndex = getTemplateWeekdayIndex(startDate);
  return template.map((_, index) => template[(startIndex + index) % template.length]);
}

function resolveSessionFocusFamily(sessionFocus, sessionType = '') {
  if (sessionType === 'recovery') return 'recovery';
  if (sessionType === 'aerobic') return 'cardio';
  if (sessionType === 'mindbody') return 'mindbody';

  switch (sessionFocus) {
    case 'upper':
    case 'push':
    case 'pull':
      return 'upper';
    case 'lower':
    case 'lower_conditioning':
      return 'lower';
    case 'full_body':
    case 'general_resistance':
    case 'general_mixed':
      return 'full';
    case 'cardio':
      return 'cardio';
    case 'mindbody':
      return 'mindbody';
    case 'recovery':
      return 'recovery';
    default:
      return 'general';
  }
}

function sessionFocusesConflict(leftFocus, rightFocus, leftType = '', rightType = '') {
  if (!leftFocus || !rightFocus) return false;

  const leftFamily = resolveSessionFocusFamily(leftFocus, leftType);
  const rightFamily = resolveSessionFocusFamily(rightFocus, rightType);
  const lowDemandFamilies = new Set(['cardio', 'mindbody', 'recovery', 'general']);

  if (lowDemandFamilies.has(leftFamily) || lowDemandFamilies.has(rightFamily)) {
    return false;
  }

  if (leftFamily === 'full' || rightFamily === 'full') {
    return ['upper', 'lower', 'full'].includes(leftFamily)
      && ['upper', 'lower', 'full'].includes(rightFamily);
  }

  return leftFamily === rightFamily;
}

// #3 — Check-in por grupo muscular antes de cambiar foco: si la zona con molestias/agujetas
// coincide con el grupo al que se cambia, modulamos la sesión (menos volumen y carga) en vez
// de mandarla a tope. Mapa zona→familias de fuerza que la cargan.
const SORE_AREA_FAMILIES = { leg: ['lower'], torso: ['upper'], shoulder: ['upper'], lumbar: ['lower'] };
const SORE_AREA_LABELS = { leg: 'pierna', torso: 'torso', shoulder: 'hombro', lumbar: 'zona lumbar' };

function evaluateSoreModulation(soreAreas, targetFocus, targetType) {
  const areas = (Array.isArray(soreAreas) ? soreAreas : [])
    .map((a) => String(a || '').toLowerCase().trim())
    .filter((a) => SORE_AREA_FAMILIES[a]);
  if (!areas.length) return { matched: false, note: null };
  const targetFamily = resolveSessionFocusFamily(targetFocus, targetType);
  // Un full body entrena todo → cualquier zona dolorida aplica.
  const matched = areas.filter((a) => targetFamily === 'full' || SORE_AREA_FAMILIES[a].includes(targetFamily));
  if (!matched.length) return { matched: false, note: null };
  const labels = matched.map((a) => SORE_AREA_LABELS[a]);
  return {
    matched: true,
    note: `Marcaste molestias en ${labels.join(' y ')}: bajé volumen y carga de la sesión ~15% y conviene no forzar el rango doloroso.`,
  };
}

const STRENGTH_FOCUS_CHANGE_OPTIONS = [
  { id: 'upper', label: 'Torso', title: 'Torso' },
  { id: 'push', label: 'Empuje', title: 'Empuje' },
  { id: 'pull', label: 'Tracción', title: 'Tracción' },
  { id: 'lower', label: 'Pierna', title: 'Pierna' },
  { id: 'full_body', label: 'Full body', title: 'Full body' },
];

function focusChangeMeta(sessionFocus) {
  return STRENGTH_FOCUS_CHANGE_OPTIONS.find((option) => option.id === sessionFocus) || null;
}

function focusChangeTitle(modality, sessionFocus) {
  const meta = focusChangeMeta(sessionFocus);
  const label = meta?.title || 'Fuerza';
  if (modality === TrainingModality.HYBRID_RUN_GYM || modality === TrainingModality.FULL_GYM) return `Gym · ${label}`;
  if (modality === TrainingModality.HOME) return `Casa · ${label}`;
  if (modality === TrainingModality.TRX) return `TRX · ${label}`;
  if (modality === TrainingModality.CALISTHENICS) return `Calistenia · ${label}`;
  return label;
}

function focusChangeBlockReason({ targetFocus, targetType, previousDay, nextDay }) {
  const previousFocus = previousDay?.sessionFocus || previousDay?.workout?.sessionFocus || null;
  const nextFocus = nextDay?.sessionFocus || nextDay?.workout?.sessionFocus || null;
  if (sessionFocusesConflict(targetFocus, previousFocus, targetType, previousDay?.sessionType)) {
    return `Choca con la sesión anterior (${previousDay?.workout?.title || previousFocus}).`;
  }
  if (sessionFocusesConflict(targetFocus, nextFocus, targetType, nextDay?.sessionType)) {
    return `Choca con la siguiente sesión (${nextDay?.workout?.title || nextFocus}).`;
  }
  return null;
}

const STRENGTH_FAMILY_LABELS = { upper: 'torso', lower: 'pierna', full: 'full body' };

// Cuenta las familias de fuerza (torso/pierna/full) entrenadas en la semana,
// excluyendo el día que se está cambiando. Un día full body suma a su propio
// cubo Y aporta carga a torso y pierna (entrena ambos).
function countWeeklyStrengthFamilies(days, excludeIndex) {
  const counts = { upper: 0, lower: 0, full: 0 };
  (Array.isArray(days) ? days : []).forEach((day, idx) => {
    if (idx === excludeIndex || !day) return;
    if (!['resistance', 'mixed'].includes(day.sessionType)) return;
    const focus = day.sessionFocus || day.workout?.sessionFocus || '';
    const family = resolveSessionFocusFamily(focus, day.sessionType);
    if (!['upper', 'lower', 'full'].includes(family)) return;
    counts[family] += 1;
  });
  return counts;
}

// Guardarraíl de volumen SEMANAL: la comprobación de adyacencia no impide que
// swaps repetidos en días no contiguos saturen una familia (p. ej. torso lun/mié/vie)
// y desequilibren el microciclo. Aquí proyectamos el cambio sobre la semana y
// bloqueamos si una familia pasaría a ocupar >60% de las sesiones de fuerza
// (con ≥3 sesiones de fuerza), repartiendo el aporte de los full body a torso y pierna.
function weeklyFocusOverloadReason(targetFocus, targetType, days, dayIndex) {
  const targetFamily = resolveSessionFocusFamily(targetFocus, targetType);
  if (!['upper', 'lower', 'full'].includes(targetFamily)) return null;

  const counts = countWeeklyStrengthFamilies(days, dayIndex);
  const projected = { ...counts, [targetFamily]: counts[targetFamily] + 1 };
  const totalStrength = projected.upper + projected.lower + projected.full;
  if (totalStrength < 3) return null;

  // Carga efectiva por cadena: los full body aportan a torso y a pierna.
  const effective = {
    upper: projected.upper + projected.full,
    lower: projected.lower + projected.full,
    full: projected.full,
  };
  const cap = Math.ceil(totalStrength * 0.6);
  const targetEffective = effective[targetFamily];
  if (targetEffective > cap) {
    return `Sobrecargaría ${STRENGTH_FAMILY_LABELS[targetFamily]} esta semana `
      + `(${targetEffective} de ${totalStrength} sesiones de fuerza); desequilibra el microciclo.`;
  }
  return null;
}

function getSessionVariationCatalog(modality) {
  const template = MODALITY_TEMPLATES[modality] || MODALITY_TEMPLATES[TrainingModality.MIXED];
  const baseVariations = template.map((day) => ({
    sessionType: day.sessionType,
    sessionFocus: resolveSessionFocus({
      modality,
      sessionType: day.sessionType,
      sessionTitle: day.title,
    }),
    title: day.title,
    durationMinutes: day.durationMinutes,
    descriptor: `${day.dayName} · ${day.exercises.slice(0, 2).join(' · ')}`,
    source: 'template',
  }));
  const extras = EXTRA_SESSION_VARIATIONS[modality] || [];
  const seen = new Set();

  return [...baseVariations, ...extras].filter((variation) => {
    const key = `${variation.sessionType}::${variation.sessionFocus || ''}::${variation.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSessionCompatibilityNote(candidateFocus, previousDay, nextDay) {
  const notes = [];

  if (previousDay?.workout?.title && previousDay.sessionFocus) {
    notes.push(`respeta ${previousDay.workout.title}`);
  }

  if (nextDay?.workout?.title && nextDay.sessionFocus) {
    notes.push(`no pisa ${nextDay.workout.title}`);
  }

  if (!notes.length) {
    const family = resolveSessionFocusFamily(candidateFocus);
    if (family === 'upper') return 'torso sin repetir grupos consecutivos';
    if (family === 'lower') return 'pierna sin saturar días vecinos';
    if (family === 'full') return 'full body solo si la ventana semanal lo permite';
    return 'compatible con la secuencia semanal';
  }

  return notes.join(' · ');
}

function buildSessionPreview(exercises, limit = 3) {
  return exercises.slice(0, limit).map((exercise) => exercise.name);
}

function buildSessionMusclePreview(exercises, limit = 4) {
  return Array.from(
    new Set(
      exercises.flatMap((exercise) => exercise.primaryMuscles || [])
    )
  ).slice(0, limit);
}

function scoreSessionVariation(variation, currentDay) {
  const currentFocus = currentDay?.sessionFocus
    || currentDay?.workout?.sessionFocus
    || resolveSessionFocus({
      modality: TrainingModality.FULL_GYM,
      sessionType: currentDay?.sessionType,
      sessionTitle: currentDay?.workout?.title || '',
    });

  let score = 0;
  if (variation.sessionFocus === currentFocus) score += 6;
  if (variation.sessionType === currentDay?.sessionType) score += 3;
  score += Math.max(0, 3 - Math.abs((variation.durationMinutes || 0) - (currentDay?.workout?.durationMinutes || 0)) / 10);
  if (variation.source === 'template') score += 1;
  return score;
}

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSpanishWeekday(date) {
  return capitalize(
    new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(date)
  );
}

function estimateCaloriesFromProfile(profile) {
  const weightKg = clamp(toNumber(profile.weightKg, 75), 35, 250);
  const heightCm = clamp(toNumber(profile.heightCm, 175), 120, 230);
  const age = clamp(toNumber(profile.age, 30), 15, 90);
  const sex = profile.sex === 'female' ? 'female' : 'male';
  const activityLevel = profile.activityLevel in ACTIVITY_FACTORS ? profile.activityLevel : 'moderate';
  const goal = resolveGoal(profile.goal);

  const bmr = sex === 'female'
    ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const maintenanceCalories = Math.round(bmr * ACTIVITY_FACTORS[activityLevel]);
  return maintenanceCalories + GOAL_CALORIE_DELTA[goal];
}

function resolveMacroStrategy(goal) {
  const mapping = {
    [GoalType.WEIGHT_LOSS]: 'weight_loss',
    [GoalType.MAINTAIN_WEIGHT]: 'maintain_weight',
    [GoalType.ENDURANCE]: 'endurance',
    [GoalType.HYPERTROPHY]: 'hypertrophy',
    [GoalType.STRENGTH]: 'strength',
    [GoalType.RECOMPOSITION]: 'recomposition',
    [GoalType.GLYCEMIC_CONTROL]: 'glycemic_control',
    [GoalType.SAFE_CONDITIONING]: 'safe_conditioning',
  };
  return mapping[goal] || 'recomposition';
}

function applyAdaptiveNutritionToBaseTarget(baseTarget, adaptiveTuning = null) {
  if (!adaptiveTuning?.nutrition) {
    return baseTarget;
  }

  const nutrition = adaptiveTuning.nutrition;
  const targetCalories = clamp(
    Math.round(toNumber(baseTarget.targetCalories, 2000) + toNumber(nutrition.calorieDelta, 0)),
    1200,
    5000
  );
  const recomputed = buildMacroPlan(targetCalories, baseTarget.strategy);

  const proteinGrams = Math.max(30, Math.round(recomputed.proteinGrams * toNumber(nutrition.proteinFactor, 1)));
  const carbsGrams = Math.max(20, Math.round(recomputed.carbsGrams * toNumber(nutrition.carbsFactor, 1)));
  const fatGrams = Math.max(20, Math.round(recomputed.fatGrams * toNumber(nutrition.fatFactor, 1)));

  return {
    ...recomputed,
    proteinGrams,
    carbsGrams,
    fatGrams,
    targetCalories: proteinGrams * 4 + carbsGrams * 4 + fatGrams * 9,
  };
}

// Proteína recomendada por kg de peso según objetivo (evidencia deportiva ACSM/ISSN).
function proteinPerKgForGoal(goal) {
  switch (goal) {
    case GoalType.HYPERTROPHY:
    case GoalType.STRENGTH:
    case GoalType.RECOMPOSITION: return 2.0;
    case GoalType.WEIGHT_LOSS:
    case GoalType.GLYCEMIC_CONTROL: return 2.2; // más alta en déficit para proteger masa magra
    case GoalType.ENDURANCE: return 1.7;
    default: return 1.8;
  }
}

// Ancla la proteína a g/kg de peso (no a % de kcal) y recalcula carbohidratos/grasa para
// mantener las calorías objetivo. La grasa nunca baja de ~0.8 g/kg ni de ~20% kcal.
function anchorProteinToBodyweight(target, weightKg, goal, adaptiveTuning = null) {
  const kcal = Math.round(toNumber(target.targetCalories, 2000));
  const proteinFactor = toNumber(adaptiveTuning?.nutrition?.proteinFactor, 1);
  let protein = Math.max(40, Math.round(weightKg * proteinPerKgForGoal(goal) * proteinFactor));
  let fat = Math.max(Math.round(weightKg * 0.9), Math.round((kcal * 0.22) / 9));
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  if (carbs < 30) {
    // Calorías ajustadas: recorta primero grasa hasta el mínimo, luego proteína.
    carbs = 30;
    fat = Math.round((kcal - protein * 4 - carbs * 4) / 9);
    if (fat < 20) {
      fat = 20;
      protein = Math.max(40, Math.round((kcal - carbs * 4 - fat * 9) / 4));
    }
  }
  carbs = Math.max(20, carbs);
  fat = Math.max(20, fat);
  return {
    ...target,
    proteinGrams: protein,
    carbsGrams: carbs,
    fatGrams: fat,
    proteinPerKg: Math.round((protein / weightKg) * 10) / 10,
    targetCalories: protein * 4 + carbs * 4 + fat * 9,
  };
}

export function buildMacroTargetFromProfile(profile, adaptiveTuning = null) {
  const goal = resolveGoal(profile.goal);
  const targetCalories = toNumber(profile.targetCalories, null) ?? estimateCaloriesFromProfile(profile);
  const baseTarget = buildMacroPlan(targetCalories, resolveMacroStrategy(goal));
  const adapted = applyAdaptiveNutritionToBaseTarget(baseTarget, adaptiveTuning);
  const weightKg = clamp(toNumber(profile.weightKg, 75), 35, 250);
  return anchorProteinToBodyweight(adapted, weightKg, goal, adaptiveTuning);
}

function getSessionRpeRange(goal, sessionType) {
  if (sessionType === 'recovery') return 'RPE 2-3';
  if (sessionType === 'mindbody') return 'RPE 3-5';

  if (goal === GoalType.STRENGTH) {
    return sessionType === 'resistance' ? 'RPE 7-9' : 'RPE 5-7';
  }
  if (goal === GoalType.HYPERTROPHY) {
    return sessionType === 'resistance' ? 'RPE 7-8' : 'RPE 5-6';
  }
  if (goal === GoalType.ENDURANCE) {
    return sessionType === 'aerobic' ? 'RPE 5-8' : 'RPE 5-6';
  }
  if (goal === GoalType.WEIGHT_LOSS || goal === GoalType.GLYCEMIC_CONTROL || goal === GoalType.SAFE_CONDITIONING) {
    return sessionType === 'mixed' ? 'RPE 6-7' : 'RPE 4-6';
  }
  return sessionType === 'resistance' ? 'RPE 6-8' : 'RPE 4-6';
}

function adjustMacroTargetForDay(baseTarget, day, goal, opts = {}) {
  const { sessionFocus = null, raceGoal = 'health' } = opts;
  // "Fuel for the work required": los carbohidratos del día escalan con la demanda de la
  // sesión (tirada larga/series/pierna altos; descanso bajo) y con el objetivo de carrera.
  const strat = carbStrategyForDay({ sessionType: day.sessionType, sessionFocus, raceGoal });
  let carbsFactor = strat.factor;
  let fatFactor = 1;
  // Compensa la grasa en sentido inverso para no disparar kcal en días de mucha demanda
  // y mantener saciedad en días bajos (carb cycling).
  if (carbsFactor > 1.05) fatFactor -= 0.08;
  else if (carbsFactor < 0.95) fatFactor += 0.08;
  if (goal === GoalType.GLYCEMIC_CONTROL) {
    carbsFactor -= 0.14;
    fatFactor += 0.10;
  }

  const proteinGrams = Math.max(30, Math.round(baseTarget.proteinGrams));
  const carbsGrams = Math.max(20, Math.round(baseTarget.carbsGrams * carbsFactor));
  const fatGrams = Math.max(20, Math.round(baseTarget.fatGrams * fatFactor));
  const calories = proteinGrams * 4 + carbsGrams * 4 + fatGrams * 9;

  return {
    calories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    carbLevel: strat.level,      // 'alto' | 'medio' | 'bajo'
    carbTiming: strat.timing,    // guía de timing para el plan de comidas / coach
  };
}

function splitMealsForDay(dailyTarget, mealsPerDay) {
  const resolvedMeals = clamp(toNumber(mealsPerDay, 4), 3, 6);
  const labels = ['Desayuno', 'Comida', 'Merienda', 'Cena', 'Pre-entreno', 'Post-entreno'];
  const mealCalories = Math.round(dailyTarget.calories / resolvedMeals);
  const mealProtein = Math.round(dailyTarget.proteinGrams / resolvedMeals);
  const mealCarbs = Math.round(dailyTarget.carbsGrams / resolvedMeals);
  const mealFat = Math.round(dailyTarget.fatGrams / resolvedMeals);

  return Array.from({ length: resolvedMeals }).map((_, index) => ({
    slot: labels[index] || `Comida ${index + 1}`,
    target: {
      calories: mealCalories,
      proteinGrams: mealProtein,
      carbsGrams: mealCarbs,
      fatGrams: mealFat,
    },
  }));
}

function parseRpeRange(label) {
  if (typeof label !== 'string') return null;
  const normalized = label.trim().replace(/^RPE\s*/i, '');
  const range = normalized.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const low = toNumber(range[1], null);
    const high = toNumber(range[2], null);
    if (low != null && high != null) {
      return { low, high };
    }
  }

  const single = normalized.match(/^(\d+(?:\.\d+)?)$/);
  if (single) {
    const value = toNumber(single[1], null);
    if (value != null) {
      return { low: value, high: value };
    }
  }
  return null;
}

function formatRpeRange(range) {
  const low = Math.round(range.low);
  const high = Math.round(range.high);
  if (low === high) return `RPE ${low}`;
  return `RPE ${low}-${high}`;
}

function adjustRpeByAdaptive(baseRpeLabel, adaptiveTuning, preparticipationScreening) {
  const parsed = parseRpeRange(baseRpeLabel);
  if (!parsed) return baseRpeLabel;

  const rpeShift = toNumber(adaptiveTuning?.workout?.rpeShift, 0);
  const capByAdaptive = toNumber(adaptiveTuning?.workout?.maxRpeCap, 9);
  const capByScreening = toNumber(preparticipationScreening?.maxAllowedSessionRpe, 9);
  const cap = clamp(Math.min(capByAdaptive, capByScreening), 4, 9);

  let low = parsed.low + rpeShift;
  let high = parsed.high + rpeShift;
  high = clamp(high, 2, cap);
  low = clamp(low, 1, high);

  return formatRpeRange({ low, high });
}

function buildClinicalAuditTrail({ preparticipationScreening, progressMemory, adaptiveTuning, profile = null }) {
  const items = [];

  if (preparticipationScreening) {
    items.push({
      id: 'SCREENING_RESULT',
      reason: 'Resultado del cribado preparticipación.',
      evidence: `risk=${preparticipationScreening.riskLevel}, gate=${preparticipationScreening.readinessGate}, clearance=${preparticipationScreening.clearanceStatus}`,
      effect: preparticipationScreening.recommendation,
    });
  }

  if (progressMemory) {
    items.push({
      id: 'PROGRESS_MEMORY',
      reason: 'Memoria de progreso reciente.',
      evidence: `readiness=${progressMemory.readinessScore}, completion=${progressMemory.metrics?.completionRate ?? 'n/d'}, adherence=${progressMemory.metrics?.avgNutritionAdherence ?? 'n/d'}`,
      effect: 'Base para ajuste automático semanal de carga y nutrición.',
    });
  }

  if (progressMemory?.clinicalSignals?.alarmSymptomsDetected) {
    items.push({
      id: 'DAILY_CHECKIN_CLINICAL_GATE',
      reason: 'Síntomas de alarma reportados en un check-in diario reciente.',
      evidence: `gate=${progressMemory.clinicalSignals.readinessGate}, symptoms=${(progressMemory.clinicalSignals.alarmSymptoms || []).join('; ') || 'n/d'}, latest=${progressMemory.clinicalSignals.latestAlarmSymptomAt || 'n/d'}`,
      effect: 'Bloquear alta intensidad y solicitar valoración clínica antes de progresar.',
    });
  }

  if (Array.isArray(adaptiveTuning?.appliedRules)) {
    adaptiveTuning.appliedRules.forEach((rule) => items.push(rule));
  }

  // Restricciones de comorbilidad aplicadas a la selección de ejercicios (transparencia).
  for (const rule of listActiveRestrictionRules(profile)) {
    items.push({
      id: `EXCLUSION_${rule.id}`,
      reason: `Restricción activa por ${rule.label}.`,
      evidence: 'Detectada en el perfil (condiciones médicas/lesiones declaradas).',
      effect: rule.reason,
    });
  }

  return items;
}

function buildAcsmPrescription(goal, modality) {
  const aerobicByGoal = {
    [GoalType.WEIGHT_LOSS]: '200-300 min/semana moderado (o equivalente vigoroso)',
    [GoalType.MAINTAIN_WEIGHT]: '150-300 min/semana moderado (o equivalente vigoroso)',
    [GoalType.ENDURANCE]: '200-300 min/semana + sesiones de umbral/intervalos',
    [GoalType.HYPERTROPHY]: '90-180 min/semana de cardio complementario',
    [GoalType.STRENGTH]: '90-180 min/semana de cardio complementario',
    [GoalType.RECOMPOSITION]: '150-250 min/semana moderado',
    [GoalType.GLYCEMIC_CONTROL]: '150-300 min/semana + caminatas postprandiales',
    [GoalType.SAFE_CONDITIONING]: '150-200 min/semana de intensidad ligera a moderada',
  };

  const resistanceByGoal = {
    [GoalType.WEIGHT_LOSS]: '2-3 días/semana, 2-4 series, 8-15 repeticiones',
    [GoalType.MAINTAIN_WEIGHT]: '2-3 días/semana, 2-4 series, 8-12 repeticiones',
    [GoalType.ENDURANCE]: '2 días/semana, 2-4 series, 12-20 repeticiones',
    [GoalType.HYPERTROPHY]: '3-5 días/semana, 3-6 series, 6-12 repeticiones',
    [GoalType.STRENGTH]: '3-5 días/semana, 2-6 series, 2-6 repeticiones',
    [GoalType.RECOMPOSITION]: '3-4 días/semana, 3-5 series, 6-12 repeticiones',
    [GoalType.GLYCEMIC_CONTROL]: '2-4 días/semana, 2-4 series, 8-15 repeticiones',
    [GoalType.SAFE_CONDITIONING]: '2 días/semana, 1-3 series, 10-15 repeticiones de intensidad controlada',
  };

  const modalityNotes = {
    [TrainingModality.YOGA]: 'Añadir al menos 2 sesiones semanales de fuerza complementaria.',
    [TrainingModality.TRX]: 'Progresar tensión/ángulo semanalmente para sobrecarga.',
    [TrainingModality.RUNNING]: 'Incluir 2 sesiones de fuerza para prevención de lesiones.',
    [TrainingModality.CYCLING]: 'Incluir 2 sesiones de fuerza para cadena posterior.',
    [TrainingModality.PILATES]: 'Añadir fuerza externa 2 días/semana si objetivo es fuerza/hipertrofia.',
  };

  return {
    source:
      "ACSM's Guidelines for Exercise Testing and Prescription, 11th ed.; DeLee, Drez & Miller's Orthopaedic Sports Medicine; bibliografía local recuperable vía RAG.",
    fitt: {
      aerobic: aerobicByGoal[goal],
      resistance: resistanceByGoal[goal],
      flexibility: '2-3 días/semana, 10-30s por grupo muscular',
      neuromotor: '2-3 días/semana (equilibrio, coordinación, control motor)',
    },
    modalityNote: modalityNotes[modality] ?? null,
  };
}

function buildSafetyNotes(metabolicProfile) {
  const base = [
    'Este plan es educativo; no sustituye evaluación médica individual.',
    'Suspender ejercicio y consultar si hay dolor torácico, disnea intensa, mareo o síncope.',
  ];

  if (metabolicProfile === MetabolicProfile.PREDIABETES || metabolicProfile === MetabolicProfile.TYPE2_DIABETES) {
    base.push(
      'Monitorizar glucosa según indicación clínica y priorizar sesiones postprandiales en zona moderada.'
    );
  }
  if (metabolicProfile === MetabolicProfile.INSULIN_RESISTANCE) {
    base.push('Priorizar adherencia de fuerza + cardio moderado para mejorar sensibilidad a la insulina.');
  }
  if (metabolicProfile === MetabolicProfile.HYPOTHYROIDISM) {
    base.push('Progresión gradual de volumen/intensidad y control de fatiga acumulada.');
  }
  if (metabolicProfile === MetabolicProfile.PCOS) {
    base.push('Combinar fuerza y acondicionamiento moderado de manera consistente semanalmente.');
  }
  return base;
}

export function buildHeuristicCoachPlan({ profile, weeklyPlan }) {
  const goal = resolveGoal(profile.goal);
  const modality = resolveTrainingModality(profile.trainingModality, profile.trainingMode);
  const metabolicProfile = resolveMetabolicProfile(profile.metabolicProfile);
  const hasAlarmSymptoms = weeklyPlan?.progressMemory?.clinicalSignals?.alarmSymptomsDetected === true;
  const readinessGate = hasAlarmSymptoms
    ? 'stop'
    : weeklyPlan?.preparticipationScreening?.readinessGate || 'ok';
  const readinessScore = weeklyPlan?.progressMemory?.readinessScore ?? null;
  const trainingDays = Array.isArray(weeklyPlan?.days)
    ? weeklyPlan.days.filter((day) => day?.sessionType !== 'recovery').slice(0, 4)
    : [];

  const prescriptionAdjustments = trainingDays.length
    ? trainingDays.map((day) => ({
      day: `${day.dayName || ''} ${day.date || ''}`.trim(),
      adjustment: `Mantener ${day.workout?.intensityRpe || 'RPE moderado'} en ${day.workout?.title || 'sesión principal'} y progresar carga/volumen 5-10% solo si recuperación > 24-48h.`,
      rationale: `Objetivo ${goal} con modalidad ${modality}; progresión conservadora basada en respuesta de fatiga.`,
      evidence: `readinessScore=${readinessScore ?? 'n/d'}, gate=${readinessGate}, adaptive=${weeklyPlan?.adaptiveTuning?.summary || 'sin ajuste adicional'}`,
    }))
    : [
      {
        day: 'Semana actual',
        adjustment: 'Priorizar adherencia y progresión gradual de volumen/intensidad.',
        rationale: 'No hay suficiente detalle de sesiones para personalizar por día.',
        evidence: `readinessScore=${readinessScore ?? 'n/d'}, gate=${readinessGate}`,
      },
    ];

  const riskFlags = [];
  if (hasAlarmSymptoms) {
    riskFlags.push('Síntomas de alarma en check-in reciente: bloquear alta intensidad y solicitar valoración clínica antes de progresar.');
  } else if (readinessGate === 'stop') {
    riskFlags.push('Riesgo alto en cribado: limitar intensidad y solicitar valoración médica antes de progresar.');
  } else if (readinessGate === 'caution') {
    riskFlags.push('Cribado en cautela: evitar picos de intensidad y controlar síntomas durante la sesión.');
  }

  if ((weeklyPlan?.progressMemory?.fatigueState || 'low') === 'high') {
    riskFlags.push('Fatiga elevada reciente: aplicar semana de descarga (deload) y priorizar sueño/recuperación.');
  }

  return {
    coachSummary:
      `Plan de soporte endocrino-deportivo para objetivo ${goal} en modalidad ${modality}. ` +
      `Readiness ${readinessScore ?? 'n/d'}/100 con gate ${readinessGate}.`,
    acsmJustification:
      'Ajustes basados en ACSM FITT: frecuencia semanal según objetivo, intensidad por RPE clínicamente segura, ' +
      'tiempo por tipo de sesión y selección del tipo de ejercicio según modalidad y riesgo.',
    prescriptionAdjustments,
    riskFlags,
    medicalDisclaimer:
      'Contenido educativo. No reemplaza valoración médica presencial ni prescripción individualizada.',
    source: 'heuristic',
    role:
      'Asistente de endocrinología metabólica y medicina del deporte (enfoque educativo, no diagnóstico).',
    objective: `Objetivo principal: ${goal}. Modalidad priorizada: ${modality}.`,
    progression: [
      'Aumentar carga total semanal entre 5-10% si RPE y recuperación lo permiten.',
      'Si hay fatiga acumulada >48h, mantener o reducir volumen 10-20% durante 1 semana.',
    ],
    acsmPrescription: weeklyPlan.acsmPrescription,
    safetyNotes: buildSafetyNotes(metabolicProfile),
    progressMemory: weeklyPlan.progressMemory ?? null,
    preparticipationScreening: weeklyPlan.preparticipationScreening ?? null,
    clinicalAuditTrail: weeklyPlan.clinicalAuditTrail ?? [],
    adaptiveSummary: weeklyPlan.adaptiveTuning?.summary ?? null,
  };
}

// Semilla determinista por usuario+objetivo: hace que dos personas distintas (o la misma con
// otro objetivo) reciban una SELECCIÓN de ejercicios diferente del mismo catálogo, en vez del
// mismo set para todo el mundo. No altera la seguridad clínica (sigue eligiendo de las
// categorías correctas), solo rota el punto de partida dentro de cada categoría.
function hashToInt(value) {
  const s = String(value || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Factor de interferencia (concurrente correr+gym): cuánto se reduce el volumen de FUERZA
// según la fase de carrera. En fases de alta carga (pico/taper) se baja más para priorizar
// la recuperación y el rendimiento en carrera.
const INTERFERENCE_BY_PHASE = { base: 1.0, build: 0.9, peak: 0.82, taper: 0.8, deload: 0.85 };

function isQualityRunFocus(sessionFocus) {
  return sessionFocus === 'cardio_intervals' || sessionFocus === 'cardio_tempo';
}

function addBestTrainingDay(keep, candidates, predicate) {
  const best = candidates
    .filter((candidate) => !keep.has(candidate.index) && predicate(candidate.day))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)[0];
  if (best) keep.add(best.index);
}

function trainingDayPriority(day, { modality, raceGoal, goal }) {
  const focus = day?.sessionFocus || day?.workout?.sessionFocus || '';
  const type = day?.sessionType;
  const raceSpecific = raceGoal && raceGoal !== 'health';
  let priority = 0;

  if (type === 'aerobic') {
    if (focus === 'cardio_long') priority = raceSpecific ? 110 : 86;
    else if (isQualityRunFocus(focus)) priority = raceSpecific ? 98 : 72;
    else if (focus === 'cardio_easy' || focus === 'cardio') priority = raceSpecific ? 88 : 96;
    else priority = 72;
    if (goal === GoalType.ENDURANCE) priority += 8;
    if (goal === GoalType.GLYCEMIC_CONTROL || goal === GoalType.WEIGHT_LOSS) priority += 5;
  } else if (type === 'resistance' || type === 'mixed') {
    const isLower = focus === 'lower';
    const isUpper = focus === 'upper' || focus === 'push' || focus === 'pull';
    if (modality === TrainingModality.HYBRID_RUN_GYM) {
      priority = isLower ? 84 : isUpper ? 80 : 76;
      if (!raceSpecific) priority += 10;
    } else if (goal === GoalType.STRENGTH || goal === GoalType.HYPERTROPHY) {
      priority = type === 'mixed' ? 92 : 102;
    } else if (goal === GoalType.RECOMPOSITION || goal === GoalType.WEIGHT_LOSS || goal === GoalType.GLYCEMIC_CONTROL) {
      priority = type === 'mixed' ? 98 : 94;
    } else {
      priority = type === 'mixed' ? 82 : 86;
    }
    if (isLower) priority += 2;
  } else if (type === 'mindbody') {
    priority = 60;
  }

  return priority;
}

function selectTrainingDayIndexesForAvailability(days, targetDays, context) {
  const training = days
    .map((day, index) => ({
      day,
      index,
      priority: trainingDayPriority(day, context),
    }))
    .filter((item) => item.day?.isTrainingDay);

  if (!Number.isFinite(targetDays) || targetDays >= training.length) {
    return new Set(training.map((item) => item.index));
  }

  const target = Math.max(1, Math.min(training.length, Math.round(targetDays)));
  const keep = new Set();
  const raceSpecific = context.raceGoal && context.raceGoal !== 'health';

  if (context.modality === TrainingModality.HYBRID_RUN_GYM) {
    if (raceSpecific) {
      addBestTrainingDay(keep, training, (day) => day.sessionFocus === 'cardio_long');
      if (target >= 2) addBestTrainingDay(keep, training, (day) => isQualityRunFocus(day.sessionFocus));
      if (target >= 3) addBestTrainingDay(keep, training, (day) => day.sessionType === 'resistance' || day.sessionType === 'mixed');
      if (target >= 4) {
        addBestTrainingDay(keep, training, (day) =>
          day.sessionType === 'aerobic' && day.sessionFocus !== 'cardio_long'
        );
      }
      if (target >= 5) addBestTrainingDay(keep, training, (day) => day.sessionType === 'resistance' || day.sessionType === 'mixed');
    } else {
      addBestTrainingDay(keep, training, (day) => day.sessionFocus === 'cardio_easy');
      if (target >= 2) addBestTrainingDay(keep, training, (day) => day.sessionType === 'resistance' || day.sessionType === 'mixed');
      if (target >= 3) addBestTrainingDay(keep, training, (day) => day.sessionFocus === 'cardio_long');
      if (target >= 4) addBestTrainingDay(keep, training, (day) => isQualityRunFocus(day.sessionFocus));
      if (target >= 5) addBestTrainingDay(keep, training, (day) => day.sessionType === 'resistance' || day.sessionType === 'mixed');
    }
  } else if (context.modality === TrainingModality.FULL_GYM && target >= 2) {
    addBestTrainingDay(keep, training, (day) =>
      day.sessionType === 'resistance' && ['upper', 'push', 'pull'].includes(day.sessionFocus)
    );
    addBestTrainingDay(keep, training, (day) =>
      day.sessionType === 'resistance' && day.sessionFocus === 'lower'
    );
  }

  const ranked = [...training].sort((a, b) => b.priority - a.priority || a.index - b.index);
  for (const item of ranked) {
    if (keep.size >= target) break;
    keep.add(item.index);
  }

  return keep;
}

function computeUserSeed(profile, goal, userId) {
  const identity = userId
    || profile?.userId
    || profile?.uid
    || profile?.id
    || profile?.email
    || profile?.displayName
    || '';
  return hashToInt(`${identity}|${goal || ''}`) % 9973;
}

export function generateWeeklyPlan({
  profile,
  startDate,
  userId = '',
  seedOffset = 0,
  liftHistory = null,
  preparticipationScreening = null,
  progressMemory = null,
  adaptiveTuning = null,
}) {
  const goal = resolveGoal(profile.goal);
  const modality = resolveTrainingModality(profile.trainingModality, profile.trainingMode);
  const trainingMode = modality === TrainingModality.FULL_GYM ? TrainingMode.GYM : TrainingMode.HOME;
  const metabolicProfile = resolveMetabolicProfile(profile.metabolicProfile);

  const baseTemplate = MODALITY_TEMPLATES[modality] || MODALITY_TEMPLATES[TrainingModality.MIXED];
  const baseTarget = buildMacroTargetFromProfile({ ...profile, goal }, adaptiveTuning);
  const mealsPerDay = clamp(toNumber(profile.mealsPerDay, 4), 3, 6);
  const workoutVolumeFactor = clamp(toNumber(adaptiveTuning?.workout?.volumeFactor, 1), 0.7, 1.2);

  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) {
    throw new Error('startDate inválido para el plan semanal.');
  }
  start.setUTCHours(0, 0, 0, 0);
  const template = rotateTemplateToDate(baseTemplate, start);
  const userSeed = computeUserSeed(profile, goal, userId) + Number(seedOffset || 0);

  // Objetivo de carrera + ritmos derivados de una marca reciente (si la hay).
  const raceGoal = resolveRaceGoal(profile.runRaceGoal);
  const p5 = estimate5kPaceSecPerKm(profile.runRefDistanceMeters, profile.runRefTimeSeconds);
  const runPaces = deriveRunPaces(p5);

  // Periodización: fase de la semana (por fecha de carrera si la hay, si no ciclo rodante).
  const weekStartISO = start.toISOString();
  const trainingPhase = resolveTrainingPhase({ raceDateISO: profile.raceDate, weekStartISO });
  const phaseParams = resolvePhaseParams(trainingPhase);
  const wtr = weeksToRace(profile.raceDate, weekStartISO);

  const days = template.map((templateDay, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const sessionFocus = resolveSessionFocus({
      modality,
      sessionType: templateDay.sessionType,
      sessionTitle: templateDay.title,
    });

    const nutritionTarget = adjustMacroTargetForDay(baseTarget, templateDay, goal, { sessionFocus, raceGoal });

    const sessionExercises = buildSessionExercises({
      modality,
      sessionType: templateDay.sessionType,
      sessionTitle: templateDay.title,
      sessionFocus,
      goal,
      profile,
      adaptiveTuning,
      daySeed: index + userSeed,
      sessionMinutes: templateDay.durationMinutes,
      loadProgression: phaseParams.loadFactor || 1,
      liftHistory,
      interferenceScale: ((modality === TrainingModality.HYBRID_RUN_GYM || modality === TrainingModality.RUNNING || modality === TrainingModality.CYCLING)
        && (templateDay.sessionType === 'resistance' || templateDay.sessionType === 'mixed'))
        ? (INTERFERENCE_BY_PHASE[trainingPhase] ?? 1) : 1,
    });

    // Duración planificada. Aplica volumen base × factor de FASE (periodización).
    const effVolume = (templateDay.sessionType === 'recovery' ? 1 : workoutVolumeFactor) * phaseParams.volumeFactor;
    let durationMinutes = clamp(Math.round(templateDay.durationMinutes * effVolume), 20, 150);
    if (templateDay.sessionType === 'aerobic' && sessionFocus === 'cardio_long') {
      // La tirada larga la fija el objetivo de carrera × factor de fase (taper la acorta).
      const longBase = RACE_GOAL_META[raceGoal].longRunMin * phaseParams.longRunFactor;
      durationMinutes = clamp(Math.round(longBase), 25, RACE_GOAL_META[raceGoal].longRunCapMin);
    }

    const workout = {
      title: templateDay.title,
      sessionFocus,
      durationMinutes,
      intensityRpe: adjustRpeByAdaptive(
        getSessionRpeRange(goal, templateDay.sessionType),
        adaptiveTuning,
        preparticipationScreening
      ),
      warmup: buildWarmupProtocol({ sessionType: templateDay.sessionType, modality, sessionFocus, profile }),
      exercises: sessionExercises,
      cooldown: buildCooldownProtocol({ sessionType: templateDay.sessionType, profile }),
    };

    // Prescripción de carrera (ritmo objetivo, estructura, drills) en días aeróbicos.
    if (templateDay.sessionType === 'aerobic') {
      // FASE 1.3 — reentrada: intensidad un escalón abajo la primera semana de vuelta.
      const stepDown = adaptiveTuning?.workout?.runIntensityStepDown === true;
      const rpFocus = stepDown ? stepDownRunFocus(sessionFocus) : sessionFocus;
      workout.runPrescription = buildRunPrescription({ sessionFocus: rpFocus, durationMinutes, raceGoal, paces: runPaces, phase: trainingPhase });
      if (stepDown && rpFocus !== sessionFocus) {
        workout.runPrescription.note = `Reentrada tras el parón: esta semana corre un escalón más suave de lo planificado. ${workout.runPrescription.note || ''}`.trim();
      }
      mergeRunDrillsIntoWarmup(workout);
    }

    return {
      date: date.toISOString().slice(0, 10),
      dayName: formatSpanishWeekday(date),
      isTrainingDay: templateDay.sessionType !== 'recovery',
      sessionType: templateDay.sessionType,
      sessionFocus,
      workout,
      nutritionTarget,
      meals: splitMealsForDay(nutritionTarget, mealsPerDay),
    };
  });

  // Disponibilidad (encuesta del Studio): si el usuario fijó minutos por sesión, ajusta la
  // duración de los días de entreno. Gated por `studioAvailability` para no alterar el
  // comportamiento por defecto ni los tests existentes.
  if (profile.studioAvailability === true) {
    // Frecuencia: si el usuario indicó menos días/semana que el plan, convierte en descanso
    // activo los días menos prioritarios para el objetivo/modalidad (no simplemente los últimos).
    const dpw = Math.round(Number(profile.daysPerWeek));
    if (Number.isFinite(dpw) && dpw >= 1 && dpw <= 7) {
      const keepTrainingIndexes = selectTrainingDayIndexesForAvailability(days, dpw, {
        modality,
        raceGoal,
        goal,
      });
      days.forEach((d, index) => {
        if (!d.isTrainingDay) return;
        if (keepTrainingIndexes.has(index)) return;
        d.isTrainingDay = false;
        d.sessionType = 'recovery';
        d.sessionFocus = 'recovery';
        d.workout = {
          title: 'Descanso activo',
          sessionFocus: 'recovery',
          durationMinutes: 30,
          intensityRpe: 'RPE 2-3',
          warmup: buildWarmupProtocol({ sessionType: 'recovery', modality, sessionFocus: 'recovery', profile }),
          exercises: [],
          cooldown: buildCooldownProtocol({ sessionType: 'recovery', profile }),
        };
      });
    }

    // Duración: ajusta los minutos de los días de entreno restantes a lo indicado.
    const prefMin = Math.round(Number(profile.preferredDurationMinutes));
    if (Number.isFinite(prefMin) && prefMin >= 20 && prefMin <= 150) {
      days.forEach((d) => {
        if (!d.isTrainingDay || !d.workout) return;
        // La tirada larga NO se aplana al tiempo diario: la marca el objetivo × fase.
        if (d.sessionFocus === 'cardio_long') {
          const longBase = Math.max(prefMin, RACE_GOAL_META[raceGoal].longRunMin * phaseParams.longRunFactor);
          d.workout.durationMinutes = clamp(Math.round(longBase), 25, RACE_GOAL_META[raceGoal].longRunCapMin);
        } else {
          d.workout.durationMinutes = clamp(prefMin, 20, 150);
        }
        // Recalcula la prescripción de carrera si cambió la duración.
        if (d.sessionType === 'aerobic') {
          const stepDown2 = adaptiveTuning?.workout?.runIntensityStepDown === true;
          const rpFocus2 = stepDown2 ? stepDownRunFocus(d.sessionFocus) : d.sessionFocus;
          d.workout.runPrescription = buildRunPrescription({ sessionFocus: rpFocus2, durationMinutes: d.workout.durationMinutes, raceGoal, paces: runPaces, phase: trainingPhase });
          if (stepDown2 && rpFocus2 !== d.sessionFocus) {
            d.workout.runPrescription.note = `Reentrada tras el parón: esta semana corre un escalón más suave de lo planificado. ${d.workout.runPrescription.note || ''}`.trim();
          }
          mergeRunDrillsIntoWarmup(d.workout);
        }
      });
    }
  }

  const acsmPrescription = buildAcsmPrescription(goal, modality);
  const clinicalAuditTrail = buildClinicalAuditTrail({
    preparticipationScreening,
    progressMemory,
    adaptiveTuning,
    profile,
  });
  const nutritionPlan = buildWeeklyNutritionPlan({
    profile,
    days,
  });

  const weeklyPlan = {
    goal,
    trainingMode,
    trainingModality: modality,
    raceGoal,
    runPaces: pacesSummary(runPaces),
    phase: trainingPhase,
    phaseLabel: phaseParams.label,
    weeksToRace: wtr,
    metabolicProfile,
    mealsPerDay,
    baseTarget,
    acsmPrescription,
    safetyNotes: buildSafetyNotes(metabolicProfile),
    exerciseLibrary: getExerciseLibrarySummary(),
    nutritionPlan,
    preparticipationScreening,
    progressMemory,
    adaptiveTuning,
    clinicalAuditTrail,
    startDate: days[0].date,
    endDate: days[days.length - 1].date,
    days,
  };

  return weeklyPlan;
}

// Genera un BLOQUE/mesociclo estable de varias semanas (por defecto 21 días = 3 semanas).
// Reutiliza generateWeeklyPlan por cada semana, de modo que la periodización (fase por fecha
// de carrera o ciclo rodante) y la variación de ejercicios (seedOffset por semana) recorren
// todo el bloque. El usuario ve SIEMPRE este bloque; "regenerar" no debe rehacerlo entero.
export function generateBlockPlan({
  profile,
  startDate,
  userId = '',
  liftHistory = null,
  preparticipationScreening = null,
  progressMemory = null,
  adaptiveTuning = null,
  blockDays = 21,
}) {
  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) throw new Error('startDate inválido para el bloque.');
  start.setUTCHours(0, 0, 0, 0);
  const weeks = Math.max(1, Math.ceil(blockDays / 7));

  let base = null;
  const allDays = [];
  const blockWeeks = [];
  for (let w = 0; w < weeks; w += 1) {
    const ws = new Date(start);
    ws.setUTCDate(start.getUTCDate() + w * 7);
    const wp = generateWeeklyPlan({
      profile,
      startDate: ws.toISOString(),
      userId,
      seedOffset: w * 97, // varía la selección de ejercicios entre semanas
      liftHistory,
      preparticipationScreening,
      progressMemory,
      adaptiveTuning,
    });
    if (w === 0) base = wp;
    allDays.push(...wp.days);
    blockWeeks.push({ index: w, startDate: wp.startDate, phase: wp.phase, phaseLabel: wp.phaseLabel, weeksToRace: wp.weeksToRace });
  }

  const days = allDays.slice(0, blockDays);
  return {
    ...base,
    days,
    isBlock: true,
    blockDays: days.length,
    blockStartDate: days[0].date,
    blockEndDate: days[days.length - 1].date,
    blockWeeks,
    startDate: days[0].date,
    endDate: days[days.length - 1].date,
  };
}

export function normalizeWeeklyPlanSessionFocus(weeklyPlan, profile = {}) {
  if (!weeklyPlan || !Array.isArray(weeklyPlan.days)) {
    return weeklyPlan;
  }

  const modality = resolveTrainingModality(
    weeklyPlan.trainingModality || profile.trainingModality,
    weeklyPlan.trainingMode || profile.trainingMode
  );
  const goal = resolveGoal(weeklyPlan.goal || profile.goal);
  const userSeed = computeUserSeed(profile, goal);

  const normalizedDays = weeklyPlan.days.map((day, index) => {
    if (!day?.workout) return day;

    const sessionFocus =
      day.sessionFocus
      || day.workout?.sessionFocus
      || resolveSessionFocus({
        modality,
        sessionType: day.sessionType,
        sessionTitle: day.workout?.title || '',
      });

    const exercises = Array.isArray(day.workout.exercises) ? day.workout.exercises : [];
    const requiresRepair =
      exercises.length > 0
      && exercises.some((exercise) =>
        !isExerciseCompatibleWithSessionFocus(exercise, {
          sessionType: day.sessionType,
          sessionFocus,
        })
      );

    const repairedExercises = requiresRepair
      ? buildSessionExercises({
        modality,
        sessionType: day.sessionType,
        sessionTitle: day.workout?.title || '',
        sessionFocus,
        goal,
        profile,
        adaptiveTuning: weeklyPlan.adaptiveTuning || null,
        daySeed: index + userSeed,
        sessionMinutes: day.workout?.durationMinutes,
      })
      : exercises;

    return {
      ...day,
      sessionFocus,
      workout: {
        ...day.workout,
        sessionFocus,
        focusRepairApplied: requiresRepair || day.workout?.focusRepairApplied || false,
        exercises: repairedExercises,
      },
    };
  });

  return {
    ...weeklyPlan,
    trainingModality: modality,
    goal,
    days: normalizedDays,
  };
}

export function suggestSessionAlternatives({
  days = [],
  dayIndex = -1,
  profile = {},
  adaptiveTuning = null,
  limit = 4,
}) {
  const targetDay = days[dayIndex];
  if (!targetDay?.workout) return [];

  const modality = resolveTrainingModality(
    targetDay.trainingModality || profile.trainingModality,
    targetDay.trainingMode || profile.trainingMode
  );
  const goal = resolveGoal(targetDay.goal || profile.goal);
  const currentFocus =
    targetDay.sessionFocus
    || targetDay.workout?.sessionFocus
    || resolveSessionFocus({
      modality,
      sessionType: targetDay.sessionType,
      sessionTitle: targetDay.workout?.title || '',
    });

  const previousDay = dayIndex > 0 ? days[dayIndex - 1] : null;
  const nextDay = dayIndex < days.length - 1 ? days[dayIndex + 1] : null;
  const previousFocus = previousDay?.sessionFocus || previousDay?.workout?.sessionFocus || null;
  const nextFocus = nextDay?.sessionFocus || nextDay?.workout?.sessionFocus || null;

  return getSessionVariationCatalog(modality)
    .filter((variation) => variation.sessionType === targetDay.sessionType)
    .filter((variation) => variation.title !== targetDay.workout?.title)
    .filter((variation) => !sessionFocusesConflict(
      variation.sessionFocus,
      previousFocus,
      variation.sessionType,
      previousDay?.sessionType
    ))
    .filter((variation) => !sessionFocusesConflict(
      variation.sessionFocus,
      nextFocus,
      variation.sessionType,
      nextDay?.sessionType
    ))
    .sort((left, right) => scoreSessionVariation(right, targetDay) - scoreSessionVariation(left, targetDay))
    .slice(0, Math.max(1, limit))
    .map((variation, variationIndex) => {
      const sessionFocus = variation.sessionFocus || currentFocus;
      const exercises = buildSessionExercises({
        modality,
        sessionType: targetDay.sessionType,
        sessionTitle: variation.title,
        sessionFocus,
        goal,
        profile,
        adaptiveTuning,
        daySeed: dayIndex + (variationIndex + 1) * 17 + computeUserSeed(profile, goal),
        sessionMinutes: variation.durationMinutes || targetDay.workout?.durationMinutes,
      });

      return {
        id: `${targetDay.date || dayIndex}-${variation.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        title: variation.title,
        sessionType: targetDay.sessionType,
        sessionFocus,
        descriptor: variation.descriptor || buildSessionCompatibilityNote(sessionFocus, previousDay, nextDay),
        compatibilityNote: buildSessionCompatibilityNote(sessionFocus, previousDay, nextDay),
        previewExercises: buildSessionPreview(exercises),
        previewMuscles: buildSessionMusclePreview(exercises),
        workout: {
          title: variation.title,
          sessionFocus,
          durationMinutes: variation.durationMinutes || targetDay.workout?.durationMinutes || 45,
          intensityRpe: targetDay.workout?.intensityRpe || 'RPE moderado',
          warmup: buildWarmupProtocol({ sessionType: targetDay.sessionType, modality, sessionFocus, profile }),
          exercises,
          cooldown: buildCooldownProtocol({ sessionType: targetDay.sessionType, profile }),
      },
    };
  });
}

export function listSessionFocusChangeOptions({
  days = [],
  dayIndex = -1,
} = {}) {
  const targetDay = Array.isArray(days) ? days[dayIndex] : null;
  if (!targetDay?.workout || !['resistance', 'mixed'].includes(targetDay.sessionType)) {
    return [];
  }

  const currentFocus = targetDay.sessionFocus || targetDay.workout?.sessionFocus || null;
  const previousDay = dayIndex > 0 ? days[dayIndex - 1] : null;
  const nextDay = dayIndex < days.length - 1 ? days[dayIndex + 1] : null;

  return STRENGTH_FOCUS_CHANGE_OPTIONS.map((meta) => {
    const current = meta.id === currentFocus;
    const blockReason = current
      ? 'Foco actual.'
      : (focusChangeBlockReason({
        targetFocus: meta.id,
        targetType: targetDay.sessionType,
        previousDay,
        nextDay,
      }) || weeklyFocusOverloadReason(meta.id, targetDay.sessionType, days, dayIndex));

    return {
      id: meta.id,
      label: meta.label,
      current,
      available: !blockReason,
      reason: blockReason,
      compatibilityNote: blockReason || buildSessionCompatibilityNote(meta.id, previousDay, nextDay),
    };
  });
}

export function buildSessionFocusChange({
  days = [],
  dayIndex = -1,
  targetFocus = '',
  profile = {},
  adaptiveTuning = null,
  trainingModality = null,
  trainingMode = null,
  goal: planGoal = null,
  phase = null,
  soreAreas = [],
} = {}) {
  const targetDay = Array.isArray(days) ? days[dayIndex] : null;
  if (!targetDay?.workout) {
    return { ok: false, status: 404, error: 'No se encontró la sesión a ajustar.' };
  }
  if (!['resistance', 'mixed'].includes(targetDay.sessionType)) {
    return {
      ok: false,
      status: 409,
      error: 'El cambio de grupo muscular solo aplica a sesiones de fuerza o mixtas.',
      details: { options: [] },
    };
  }

  const normalizedFocus = String(targetFocus || '').trim();
  const meta = focusChangeMeta(normalizedFocus);
  const options = listSessionFocusChangeOptions({ days, dayIndex });
  if (!meta) {
    return {
      ok: false,
      status: 400,
      error: 'Grupo muscular no válido.',
      details: { options },
    };
  }

  const currentFocus = targetDay.sessionFocus || targetDay.workout?.sessionFocus || null;
  if (normalizedFocus === currentFocus) {
    return {
      ok: false,
      status: 400,
      error: 'Ese ya es el foco de la sesión de hoy.',
      details: { options },
    };
  }

  const option = options.find((entry) => entry.id === normalizedFocus);
  if (!option?.available) {
    return {
      ok: false,
      status: 409,
      error: option?.reason || 'Ese foco rompería la secuencia de recuperación semanal.',
      details: { options },
    };
  }

  const modality = resolveTrainingModality(
    trainingModality || targetDay.trainingModality || profile.trainingModality,
    trainingMode || targetDay.trainingMode || profile.trainingMode
  );
  const goal = resolveGoal(planGoal || targetDay.goal || profile.goal);
  const phaseParams = phase ? resolvePhaseParams(phase) : { loadFactor: 1 };
  const interferenceScale = ((modality === TrainingModality.HYBRID_RUN_GYM || modality === TrainingModality.RUNNING || modality === TrainingModality.CYCLING)
    && (targetDay.sessionType === 'resistance' || targetDay.sessionType === 'mixed'))
    ? (INTERFERENCE_BY_PHASE[phase] ?? 1) : 1;
  const durationMinutes = targetDay.workout?.durationMinutes || 45;
  const title = focusChangeTitle(modality, normalizedFocus);
  // #3 — modulación por molestias: si la zona dolorida carga el grupo elegido, reduce el
  // volumeFactor (que en buildSessionExercises baja series Y carga) ~15%.
  const sore = evaluateSoreModulation(soreAreas, normalizedFocus, targetDay.sessionType);
  let effectiveAdaptive = adaptiveTuning;
  if (sore.matched) {
    const baseVf = Number(adaptiveTuning?.workout?.volumeFactor);
    const vf = Number.isFinite(baseVf) && baseVf > 0 ? baseVf : 1;
    const reducedVf = Math.max(0.6, Math.round(vf * 0.85 * 100) / 100);
    effectiveAdaptive = { ...(adaptiveTuning || {}), workout: { ...((adaptiveTuning && adaptiveTuning.workout) || {}), volumeFactor: reducedVf } };
  }
  const exercises = buildSessionExercises({
    modality,
    sessionType: targetDay.sessionType,
    sessionTitle: title,
    sessionFocus: normalizedFocus,
    goal,
    profile,
    adaptiveTuning: effectiveAdaptive,
    daySeed: dayIndex + 101 + computeUserSeed(profile, goal),
    sessionMinutes: durationMinutes,
    loadProgression: phaseParams.loadFactor || 1,
    interferenceScale,
  });

  if (!exercises.length) {
    return {
      ok: false,
      status: 422,
      error: 'No se encontraron ejercicios compatibles para ese grupo con tu equipo y restricciones.',
      details: { options },
    };
  }

  const workout = {
    ...targetDay.workout,
    title,
    sessionFocus: normalizedFocus,
    durationMinutes,
    warmup: buildWarmupProtocol({ sessionType: targetDay.sessionType, modality, sessionFocus: normalizedFocus, profile }),
    exercises,
    cooldown: buildCooldownProtocol({ sessionType: targetDay.sessionType, profile }),
    focusChangeApplied: true,
  };
  delete workout.runPrescription;

  return {
    ok: true,
    day: {
      ...targetDay,
      sessionFocus: normalizedFocus,
      workout,
    },
    options,
    soreApplied: sore.matched,
    soreNote: sore.note,
  };
}
