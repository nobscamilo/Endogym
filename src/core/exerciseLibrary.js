import { GoalType, TrainingModality } from '../domain/models.js';
import {
  EXERCISE_AUDIT_SCHEMA,
  buildExerciseCatalog,
  parseExerciseCatalogText,
  serializeExerciseCatalogAsCsv,
  validateExerciseCatalog,
} from './exerciseCatalog/index.js';

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, step = 2.5) {
  return Math.round(value / step) * step;
}

function youtubeLinks(query) {
  const encoded = encodeURIComponent(query);
  return {
    videoUrl: `https://www.youtube.com/results?search_query=${encoded}`,
    videoEmbedUrl: null,
  };
}

function resolveYoutubeQuery(exercise, modality) {
  if (exercise?.youtubeQuery) return exercise.youtubeQuery;
  return `${exercise?.name || 'exercise'} proper form tutorial ${modality}`;
}

const EXERCISES = buildExerciseCatalog();

const CATEGORY_MUSCLE_PROFILES = {
  lower_body_strength: {
    primaryMuscles: ['Cuadriceps', 'Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: {
      front: ['quadriceps'],
      back: ['glutes', 'hamstrings'],
    },
  },
  lower_body_unilateral: {
    primaryMuscles: ['Cuadriceps', 'Gluteos'],
    secondaryMuscles: ['Aductores', 'Core'],
    anatomyRegions: {
      front: ['quadriceps', 'adductors'],
      back: ['glutes'],
    },
  },
  lower_body_accessory: {
    primaryMuscles: ['Gemelos'],
    secondaryMuscles: ['Soleo', 'Tobillo'],
    anatomyRegions: {
      front: ['calves'],
      back: ['calves'],
    },
  },
  posterior_chain: {
    primaryMuscles: ['Gluteos', 'Isquiotibiales'],
    secondaryMuscles: ['Lumbar', 'Core'],
    anatomyRegions: {
      front: ['abs'],
      back: ['glutes', 'hamstrings', 'lower_back'],
    },
  },
  upper_push: {
    primaryMuscles: ['Pectoral', 'Deltoides anterior', 'Triceps'],
    secondaryMuscles: ['Core'],
    anatomyRegions: {
      front: ['chest', 'front_shoulders'],
      back: ['triceps'],
    },
  },
  upper_pull: {
    primaryMuscles: ['Dorsal ancho', 'Trapecio/Romboides', 'Biceps'],
    secondaryMuscles: ['Deltoides posterior', 'Antebrazo'],
    anatomyRegions: {
      front: ['biceps', 'forearms'],
      back: ['lats', 'upper_back', 'rear_shoulders'],
    },
  },
  core: {
    primaryMuscles: ['Recto abdominal', 'Transverso'],
    secondaryMuscles: ['Oblicuos', 'Gluteos'],
    anatomyRegions: {
      front: ['abs', 'obliques'],
      back: ['glutes'],
    },
  },
  conditioning: {
    primaryMuscles: ['Core', 'Hombros', 'Pectoral'],
    secondaryMuscles: ['Cuadriceps', 'Gluteos'],
    anatomyRegions: {
      front: ['abs', 'chest', 'front_shoulders', 'quadriceps'],
      back: ['glutes'],
    },
  },
  mobility: {
    primaryMuscles: ['Movilidad cadera-columna'],
    secondaryMuscles: ['Hombros', 'Tobillos'],
    anatomyRegions: {
      front: ['obliques'],
      back: ['lower_back'],
    },
  },
  mobility_strength: {
    primaryMuscles: ['Gluteos', 'Core'],
    secondaryMuscles: ['Cuadriceps', 'Hombros'],
    anatomyRegions: {
      front: ['quadriceps', 'abs'],
      back: ['glutes'],
    },
  },
  core_mobility: {
    primaryMuscles: ['Core'],
    secondaryMuscles: ['Flexores cadera', 'Lumbar'],
    anatomyRegions: {
      front: ['abs', 'obliques'],
      back: ['lower_back'],
    },
  },
  neuromotor: {
    primaryMuscles: ['Core', 'Gluteo medio'],
    secondaryMuscles: ['Estabilizadores tobillo'],
    anatomyRegions: {
      front: ['abs', 'adductors'],
      back: ['glutes'],
    },
  },
  recovery: {
    primaryMuscles: ['Sistema de recuperacion'],
    secondaryMuscles: ['Caderas', 'Espalda'],
    anatomyRegions: {
      front: ['abs'],
      back: ['lower_back'],
    },
  },
  cardio_base: {
    primaryMuscles: ['Cuadriceps', 'Gemelos'],
    secondaryMuscles: ['Gluteos', 'Sistema cardiovascular'],
    anatomyRegions: {
      front: ['quadriceps', 'calves'],
      back: ['glutes', 'calves'],
    },
  },
  cardio_threshold: {
    primaryMuscles: ['Cuadriceps', 'Gluteos'],
    secondaryMuscles: ['Gemelos', 'Core'],
    anatomyRegions: {
      front: ['quadriceps', 'calves'],
      back: ['glutes', 'hamstrings'],
    },
  },
  cardio_interval: {
    primaryMuscles: ['Cuadriceps', 'Gluteos'],
    secondaryMuscles: ['Gemelos', 'Core'],
    anatomyRegions: {
      front: ['quadriceps', 'calves'],
      back: ['glutes', 'hamstrings'],
    },
  },
  cardio_skill: {
    primaryMuscles: ['Cuadriceps'],
    secondaryMuscles: ['Gemelos', 'Gluteos'],
    anatomyRegions: {
      front: ['quadriceps', 'calves'],
      back: ['glutes'],
    },
  },
};

const EXERCISE_MUSCLE_OVERRIDES = {
  'gym-bench-press': {
    primaryMuscles: ['Pectoral mayor', 'Triceps'],
    secondaryMuscles: ['Deltoides anterior'],
    anatomyRegions: { front: ['chest', 'front_shoulders'], back: ['triceps'] },
  },
  'gym-incline-db-press': {
    primaryMuscles: ['Pectoral superior', 'Triceps'],
    secondaryMuscles: ['Deltoides anterior'],
    anatomyRegions: { front: ['chest', 'front_shoulders'], back: ['triceps'] },
  },
  'gym-overhead-press': {
    primaryMuscles: ['Deltoides', 'Triceps'],
    secondaryMuscles: ['Trapecio superior', 'Core'],
    anatomyRegions: { front: ['front_shoulders'], back: ['triceps', 'upper_back'] },
  },
  'gym-lat-pulldown': {
    primaryMuscles: ['Dorsal ancho', 'Biceps'],
    secondaryMuscles: ['Trapecio medio'],
    anatomyRegions: { front: ['biceps'], back: ['lats', 'upper_back'] },
  },
  'gym-seated-row': {
    primaryMuscles: ['Dorsal ancho', 'Romboides'],
    secondaryMuscles: ['Biceps', 'Deltoides posterior'],
    anatomyRegions: { front: ['biceps'], back: ['lats', 'upper_back', 'rear_shoulders'] },
  },
  'gym-barbell-row': {
    primaryMuscles: ['Dorsal ancho', 'Trapecio medio'],
    secondaryMuscles: ['Biceps', 'Lumbar'],
    anatomyRegions: { front: ['biceps'], back: ['lats', 'upper_back', 'lower_back'] },
  },
  'gym-face-pull': {
    primaryMuscles: ['Deltoides posterior', 'Trapecio medio'],
    secondaryMuscles: ['Romboides', 'Manguito rotador'],
    anatomyRegions: { front: [], back: ['rear_shoulders', 'upper_back'] },
  },
  'gym-hip-thrust': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['glutes', 'hamstrings'] },
  },
  'gym-romanian-deadlift': {
    primaryMuscles: ['Isquiotibiales', 'Gluteos'],
    secondaryMuscles: ['Lumbar'],
    anatomyRegions: { front: [], back: ['hamstrings', 'glutes', 'lower_back'] },
  },
  'gym-conventional-deadlift': {
    primaryMuscles: ['Gluteos', 'Isquiotibiales'],
    secondaryMuscles: ['Lumbar', 'Trapecio'],
    anatomyRegions: { front: ['quadriceps'], back: ['glutes', 'hamstrings', 'lower_back', 'upper_back'] },
  },
  'home-push-up': {
    primaryMuscles: ['Pectoral', 'Triceps'],
    secondaryMuscles: ['Deltoides anterior', 'Core'],
    anatomyRegions: { front: ['chest', 'front_shoulders', 'abs'], back: ['triceps'] },
  },
  'home-pike-push-up': {
    primaryMuscles: ['Hombros', 'Triceps'],
    secondaryMuscles: ['Pectoral superior', 'Core'],
    anatomyRegions: { front: ['front_shoulders'], back: ['triceps'] },
  },
  'home-band-row': {
    primaryMuscles: ['Dorsal ancho', 'Romboides'],
    secondaryMuscles: ['Biceps'],
    anatomyRegions: { front: ['biceps'], back: ['lats', 'upper_back'] },
  },
  'home-band-chest-press': {
    primaryMuscles: ['Pectoral', 'Triceps'],
    secondaryMuscles: ['Deltoides anterior'],
    anatomyRegions: { front: ['chest', 'front_shoulders'], back: ['triceps'] },
  },
  'home-band-overhead-press': {
    primaryMuscles: ['Deltoides', 'Triceps'],
    secondaryMuscles: ['Trapecio superior', 'Core'],
    anatomyRegions: { front: ['front_shoulders', 'abs'], back: ['triceps', 'upper_back'] },
  },
  'home-band-pullover': {
    primaryMuscles: ['Dorsal ancho'],
    secondaryMuscles: ['Pectoral largo', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['lats'] },
  },
  'home-single-leg-rdl': {
    primaryMuscles: ['Isquiotibiales', 'Gluteos'],
    secondaryMuscles: ['Core', 'Estabilizadores de cadera'],
    anatomyRegions: { front: ['abs'], back: ['hamstrings', 'glutes'] },
  },
  'home-banded-good-morning': {
    primaryMuscles: ['Isquiotibiales', 'Gluteos'],
    secondaryMuscles: ['Lumbar'],
    anatomyRegions: { front: ['abs'], back: ['hamstrings', 'glutes', 'lower_back'] },
  },
  'home-hip-bridge': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['glutes', 'hamstrings'] },
  },
  'home-single-leg-glute-bridge': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['glutes', 'hamstrings'] },
  },
  'home-dead-bug': {
    primaryMuscles: ['Transverso abdominal', 'Recto abdominal'],
    secondaryMuscles: ['Flexores de cadera'],
    anatomyRegions: { front: ['abs'], back: [] },
  },
  'home-bird-dog': {
    primaryMuscles: ['Core', 'Lumbar'],
    secondaryMuscles: ['Gluteos', 'Estabilizadores escapulares'],
    anatomyRegions: { front: ['abs'], back: ['lower_back', 'glutes'] },
  },
  'home-cossack-squat': {
    primaryMuscles: ['Aductores', 'Gluteos'],
    secondaryMuscles: ['Cuadriceps', 'Core'],
    anatomyRegions: { front: ['adductors', 'quadriceps'], back: ['glutes'] },
  },
  'home-suitcase-carry': {
    primaryMuscles: ['Oblicuos', 'Core'],
    secondaryMuscles: ['Antebrazo', 'Gluteo medio'],
    anatomyRegions: { front: ['abs', 'obliques', 'forearms'], back: ['glutes'] },
  },
  'home-floor-press': {
    primaryMuscles: ['Pectoral', 'Triceps'],
    secondaryMuscles: ['Deltoides anterior'],
    anatomyRegions: { front: ['chest', 'front_shoulders'], back: ['triceps'] },
  },
  'home-towel-row': {
    primaryMuscles: ['Dorsal ancho', 'Romboides'],
    secondaryMuscles: ['Biceps', 'Antebrazos'],
    anatomyRegions: { front: ['biceps', 'forearms'], back: ['lats', 'upper_back'] },
  },
  'home-band-lat-pulldown': {
    primaryMuscles: ['Dorsal ancho'],
    secondaryMuscles: ['Biceps', 'Trapecio medio'],
    anatomyRegions: { front: ['biceps'], back: ['lats', 'upper_back'] },
  },
  'home-band-curl': {
    primaryMuscles: ['Biceps'],
    secondaryMuscles: ['Braquial', 'Antebrazos'],
    anatomyRegions: { front: ['biceps', 'forearms'], back: [] },
  },
  'home-band-triceps-pressdown': {
    primaryMuscles: ['Triceps'],
    secondaryMuscles: ['Deltoides anterior'],
    anatomyRegions: { front: ['front_shoulders'], back: ['triceps'] },
  },
  'home-band-lateral-raise': {
    primaryMuscles: ['Deltoides lateral'],
    secondaryMuscles: ['Trapecio superior'],
    anatomyRegions: { front: ['front_shoulders'], back: ['rear_shoulders'] },
  },
  'home-hip-airplane': {
    primaryMuscles: ['Gluteo medio', 'Oblicuos'],
    secondaryMuscles: ['Isquiotibiales', 'Estabilizadores de tobillo'],
    anatomyRegions: { front: ['abs'], back: ['glutes', 'hamstrings'] },
  },
  'home-band-woodchop': {
    primaryMuscles: ['Oblicuos', 'Transverso abdominal'],
    secondaryMuscles: ['Gluteos', 'Hombros'],
    anatomyRegions: { front: ['abs', 'obliques', 'front_shoulders'], back: ['glutes'] },
  },
  'home-reverse-plank': {
    primaryMuscles: ['Gluteos', 'Deltoides posterior'],
    secondaryMuscles: ['Isquiotibiales', 'Triceps'],
    anatomyRegions: { front: ['chest'], back: ['glutes', 'hamstrings', 'rear_shoulders', 'triceps'] },
  },
  'calis-pull-up-assisted': {
    primaryMuscles: ['Dorsal ancho', 'Biceps'],
    secondaryMuscles: ['Trapecio inferior', 'Core'],
    anatomyRegions: { front: ['biceps'], back: ['lats', 'upper_back'] },
  },
  'calis-dip-assisted': {
    primaryMuscles: ['Pectoral', 'Triceps'],
    secondaryMuscles: ['Deltoides anterior'],
    anatomyRegions: { front: ['chest', 'front_shoulders'], back: ['triceps'] },
  },
  'calis-inverted-row': {
    primaryMuscles: ['Dorsal ancho', 'Romboides'],
    secondaryMuscles: ['Biceps', 'Deltoides posterior'],
    anatomyRegions: { front: ['biceps'], back: ['lats', 'upper_back', 'rear_shoulders'] },
  },
  'calis-bench-dip': {
    primaryMuscles: ['Triceps'],
    secondaryMuscles: ['Pectoral', 'Deltoides anterior'],
    anatomyRegions: { front: ['chest', 'front_shoulders'], back: ['triceps'] },
  },
  'calis-hindu-push-up': {
    primaryMuscles: ['Pectoral', 'Deltoides'],
    secondaryMuscles: ['Triceps', 'Core'],
    anatomyRegions: { front: ['chest', 'front_shoulders', 'abs'], back: ['triceps'] },
  },
  'calis-arch-hold': {
    primaryMuscles: ['Lumbar', 'Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Deltoides posterior'],
    anatomyRegions: { front: [], back: ['lower_back', 'glutes', 'hamstrings', 'rear_shoulders'] },
  },
  'trx-row': {
    primaryMuscles: ['Dorsal ancho', 'Romboides'],
    secondaryMuscles: ['Biceps', 'Core'],
    anatomyRegions: { front: ['biceps', 'abs'], back: ['lats', 'upper_back'] },
  },
  'trx-chest-press': {
    primaryMuscles: ['Pectoral', 'Triceps'],
    secondaryMuscles: ['Hombros', 'Core'],
    anatomyRegions: { front: ['chest', 'front_shoulders', 'abs'], back: ['triceps'] },
  },
  'trx-hamstring-curl': {
    primaryMuscles: ['Isquiotibiales'],
    secondaryMuscles: ['Gluteos', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['hamstrings', 'glutes'] },
  },
  'trx-atomic-pushup': {
    primaryMuscles: ['Pectoral', 'Core'],
    secondaryMuscles: ['Hombros', 'Triceps'],
    anatomyRegions: { front: ['chest', 'abs', 'front_shoulders'], back: ['triceps'] },
  },
  'trx-biceps-curl': {
    primaryMuscles: ['Biceps'],
    secondaryMuscles: ['Braquial', 'Core'],
    anatomyRegions: { front: ['biceps', 'abs'], back: [] },
  },
  'trx-triceps-extension': {
    primaryMuscles: ['Triceps'],
    secondaryMuscles: ['Deltoides anterior', 'Core'],
    anatomyRegions: { front: ['front_shoulders', 'abs'], back: ['triceps'] },
  },
  'trx-y-fly': {
    primaryMuscles: ['Trapecio inferior', 'Deltoides posterior'],
    secondaryMuscles: ['Romboides', 'Manguito rotador'],
    anatomyRegions: { front: [], back: ['upper_back', 'rear_shoulders'] },
  },
  'trx-power-pull': {
    primaryMuscles: ['Dorsal ancho', 'Oblicuos'],
    secondaryMuscles: ['Biceps', 'Deltoides posterior'],
    anatomyRegions: { front: ['abs', 'biceps'], back: ['lats', 'rear_shoulders', 'upper_back'] },
  },
  'trx-plank-saw': {
    primaryMuscles: ['Recto abdominal', 'Transverso abdominal'],
    secondaryMuscles: ['Serrato anterior', 'Hombros'],
    anatomyRegions: { front: ['abs', 'front_shoulders'], back: [] },
  },
  'trx-chest-fly': {
    primaryMuscles: ['Pectoral'],
    secondaryMuscles: ['Deltoides anterior', 'Core'],
    anatomyRegions: { front: ['chest', 'front_shoulders', 'abs'], back: [] },
  },
  'trx-reverse-fly': {
    primaryMuscles: ['Deltoides posterior', 'Romboides'],
    secondaryMuscles: ['Trapecio medio'],
    anatomyRegions: { front: [], back: ['rear_shoulders', 'upper_back'] },
  },
  'trx-fallout': {
    primaryMuscles: ['Recto abdominal', 'Transverso abdominal'],
    secondaryMuscles: ['Serrato anterior', 'Deltoides'],
    anatomyRegions: { front: ['abs', 'front_shoulders'], back: [] },
  },
  'trx-rollout': {
    primaryMuscles: ['Recto abdominal', 'Transverso abdominal'],
    secondaryMuscles: ['Serrato anterior', 'Dorsal ancho'],
    anatomyRegions: { front: ['abs', 'front_shoulders'], back: ['lats'] },
  },
  'trx-hip-press': {
    primaryMuscles: ['Isquiotibiales', 'Gluteos'],
    secondaryMuscles: ['Core'],
    anatomyRegions: { front: ['abs'], back: ['hamstrings', 'glutes'] },
  },
  'trx-side-plank': {
    primaryMuscles: ['Oblicuos'],
    secondaryMuscles: ['Gluteo medio', 'Deltoides'],
    anatomyRegions: { front: ['obliques', 'abs'], back: ['glutes', 'rear_shoulders'] },
  },
  'trx-pike': {
    primaryMuscles: ['Recto abdominal', 'Flexores de cadera'],
    secondaryMuscles: ['Hombros'],
    anatomyRegions: { front: ['abs', 'quadriceps', 'front_shoulders'], back: [] },
  },
  'trx-t-fly': {
    primaryMuscles: ['Deltoides posterior', 'Trapecio medio'],
    secondaryMuscles: ['Romboides'],
    anatomyRegions: { front: [], back: ['rear_shoulders', 'upper_back'] },
  },
  'trx-single-arm-row': {
    primaryMuscles: ['Dorsal ancho', 'Romboides'],
    secondaryMuscles: ['Biceps', 'Oblicuos'],
    anatomyRegions: { front: ['biceps', 'obliques'], back: ['lats', 'upper_back'] },
  },
  'trx-high-row': {
    primaryMuscles: ['Deltoides posterior', 'Trapecio medio'],
    secondaryMuscles: ['Romboides', 'Biceps'],
    anatomyRegions: { front: ['biceps'], back: ['rear_shoulders', 'upper_back'] },
  },
  'trx-knee-tuck': {
    primaryMuscles: ['Recto abdominal', 'Transverso abdominal'],
    secondaryMuscles: ['Flexores de cadera', 'Serrato anterior'],
    anatomyRegions: { front: ['abs', 'front_shoulders', 'quadriceps'], back: [] },
  },
  'trx-bulgarian-split-squat': {
    primaryMuscles: ['Cuadriceps', 'Gluteos'],
    secondaryMuscles: ['Aductores', 'Core'],
    anatomyRegions: { front: ['quadriceps', 'adductors'], back: ['glutes'] },
  },
  'trx-curtsy-lunge': {
    primaryMuscles: ['Gluteo medio', 'Aductores'],
    secondaryMuscles: ['Cuadriceps', 'Core'],
    anatomyRegions: { front: ['adductors', 'quadriceps'], back: ['glutes'] },
  },
  'trx-assisted-pistol-squat': {
    primaryMuscles: ['Cuadriceps', 'Gluteos'],
    secondaryMuscles: ['Gemelos', 'Core'],
    anatomyRegions: { front: ['quadriceps', 'calves'], back: ['glutes'] },
  },
  'trx-glute-bridge': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['glutes', 'hamstrings'] },
  },
  'trx-hamstring-runner': {
    primaryMuscles: ['Isquiotibiales'],
    secondaryMuscles: ['Gluteos', 'Gemelos'],
    anatomyRegions: { front: ['calves'], back: ['hamstrings', 'glutes'] },
  },
  'trx-hip-hinge': {
    primaryMuscles: ['Isquiotibiales', 'Gluteos'],
    secondaryMuscles: ['Lumbar'],
    anatomyRegions: { front: ['abs'], back: ['hamstrings', 'glutes', 'lower_back'] },
  },
  'trx-oblique-crunch': {
    primaryMuscles: ['Oblicuos', 'Recto abdominal'],
    secondaryMuscles: ['Flexores de cadera', 'Serrato anterior'],
    anatomyRegions: { front: ['abs', 'obliques', 'front_shoulders'], back: [] },
  },
  'trx-crossover-row': {
    primaryMuscles: ['Dorsal ancho', 'Deltoides posterior'],
    secondaryMuscles: ['Romboides', 'Oblicuos'],
    anatomyRegions: { front: ['biceps', 'obliques'], back: ['lats', 'rear_shoulders', 'upper_back'] },
  },
  'trx-face-pull': {
    primaryMuscles: ['Deltoides posterior', 'Trapecio medio'],
    secondaryMuscles: ['Romboides', 'Manguito rotador'],
    anatomyRegions: { front: [], back: ['rear_shoulders', 'upper_back'] },
  },
  'yoga-downward-dog': {
    primaryMuscles: ['Hombros', 'Gemelos'],
    secondaryMuscles: ['Isquiotibiales', 'Dorsal ancho'],
    anatomyRegions: { front: ['front_shoulders', 'calves'], back: ['hamstrings', 'lats'] },
  },
  'yoga-cobra-pose': {
    primaryMuscles: ['Lumbar'],
    secondaryMuscles: ['Gluteos', 'Pectoral'],
    anatomyRegions: { front: ['chest'], back: ['lower_back', 'glutes'] },
  },
  'yoga-bridge-pose': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Lumbar'],
    anatomyRegions: { front: [], back: ['glutes', 'hamstrings', 'lower_back'] },
  },
  'yoga-boat-pose': {
    primaryMuscles: ['Recto abdominal', 'Flexores de cadera'],
    secondaryMuscles: ['Oblicuos'],
    anatomyRegions: { front: ['abs', 'quadriceps'], back: [] },
  },
  'yoga-pigeon-stretch': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Rotadores de cadera'],
    anatomyRegions: { front: [], back: ['glutes'] },
  },
  'yoga-half-moon': {
    primaryMuscles: ['Gluteo medio', 'Oblicuos'],
    secondaryMuscles: ['Isquiotibiales', 'Hombros'],
    anatomyRegions: { front: ['abs', 'front_shoulders'], back: ['glutes', 'hamstrings'] },
  },
  'yoga-triangle-pose': {
    primaryMuscles: ['Oblicuos', 'Aductores'],
    secondaryMuscles: ['Isquiotibiales', 'Gluteo medio'],
    anatomyRegions: { front: ['obliques', 'adductors'], back: ['hamstrings', 'glutes'] },
  },
  'yoga-locust-pose': {
    primaryMuscles: ['Lumbar', 'Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Deltoides posterior'],
    anatomyRegions: { front: [], back: ['lower_back', 'glutes', 'hamstrings', 'rear_shoulders'] },
  },
  'yoga-dancer-pose': {
    primaryMuscles: ['Gluteos', 'Cuadriceps'],
    secondaryMuscles: ['Oblicuos', 'Hombros'],
    anatomyRegions: { front: ['quadriceps', 'abs', 'front_shoulders'], back: ['glutes'] },
  },
  'yoga-plank-pose': {
    primaryMuscles: ['Recto abdominal', 'Serrato anterior'],
    secondaryMuscles: ['Deltoides anterior', 'Gluteos'],
    anatomyRegions: { front: ['abs', 'front_shoulders'], back: ['glutes'] },
  },
  'yoga-warrior-iii': {
    primaryMuscles: ['Gluteo medio', 'Isquiotibiales'],
    secondaryMuscles: ['Oblicuos', 'Deltoides'],
    anatomyRegions: { front: ['abs', 'front_shoulders'], back: ['glutes', 'hamstrings'] },
  },
  'yoga-revolved-triangle': {
    primaryMuscles: ['Oblicuos', 'Isquiotibiales'],
    secondaryMuscles: ['Gluteos', 'Erectores torácicos'],
    anatomyRegions: { front: ['obliques', 'adductors'], back: ['hamstrings', 'glutes', 'upper_back'] },
  },
  'yoga-side-plank-pose': {
    primaryMuscles: ['Oblicuos'],
    secondaryMuscles: ['Deltoides', 'Gluteo medio'],
    anatomyRegions: { front: ['abs', 'obliques', 'front_shoulders'], back: ['glutes'] },
  },
  'yoga-chaturanga-hold': {
    primaryMuscles: ['Pectoral', 'Triceps'],
    secondaryMuscles: ['Serrato anterior', 'Core'],
    anatomyRegions: { front: ['chest', 'front_shoulders', 'abs'], back: ['triceps'] },
  },
  'yoga-upward-facing-dog': {
    primaryMuscles: ['Lumbar', 'Gluteos'],
    secondaryMuscles: ['Pectoral', 'Triceps'],
    anatomyRegions: { front: ['chest'], back: ['lower_back', 'glutes', 'triceps'] },
  },
  'yoga-lizard-pose': {
    primaryMuscles: ['Flexores de cadera', 'Aductores'],
    secondaryMuscles: ['Gluteos'],
    anatomyRegions: { front: ['adductors', 'quadriceps'], back: ['glutes'] },
  },
  'yoga-thread-the-needle': {
    primaryMuscles: ['Trapecio medio', 'Oblicuos'],
    secondaryMuscles: ['Deltoides posterior'],
    anatomyRegions: { front: ['obliques'], back: ['upper_back', 'rear_shoulders'] },
  },
  'yoga-bound-angle-pose': {
    primaryMuscles: ['Aductores'],
    secondaryMuscles: ['Movilidad de cadera'],
    anatomyRegions: { front: ['adductors'], back: [] },
  },
  'yoga-supine-twist': {
    primaryMuscles: ['Oblicuos'],
    secondaryMuscles: ['Movilidad lumbar'],
    anatomyRegions: { front: ['obliques', 'abs'], back: ['lower_back'] },
  },
  'yoga-standing-forward-fold': {
    primaryMuscles: ['Isquiotibiales'],
    secondaryMuscles: ['Gemelos', 'Erectores espinales'],
    anatomyRegions: { front: ['calves'], back: ['hamstrings', 'lower_back'] },
  },
  'yoga-fish-pose': {
    primaryMuscles: ['Pectoral', 'Erectores torácicos'],
    secondaryMuscles: ['Flexores de cadera'],
    anatomyRegions: { front: ['chest', 'quadriceps'], back: ['upper_back'] },
  },
  'yoga-pyramid-pose': {
    primaryMuscles: ['Isquiotibiales', 'Gluteos'],
    secondaryMuscles: ['Oblicuos'],
    anatomyRegions: { front: ['adductors'], back: ['hamstrings', 'glutes'] },
  },
  'pilates-double-leg-stretch': {
    primaryMuscles: ['Recto abdominal', 'Transverso abdominal'],
    secondaryMuscles: ['Flexores de cadera'],
    anatomyRegions: { front: ['abs'], back: [] },
  },
  'pilates-criss-cross': {
    primaryMuscles: ['Oblicuos', 'Recto abdominal'],
    secondaryMuscles: ['Flexores de cadera'],
    anatomyRegions: { front: ['abs', 'obliques'], back: [] },
  },
  'pilates-saw': {
    primaryMuscles: ['Oblicuos'],
    secondaryMuscles: ['Isquiotibiales', 'Erectores torácicos'],
    anatomyRegions: { front: ['obliques', 'adductors'], back: ['hamstrings', 'upper_back'] },
  },
  'pilates-teaser': {
    primaryMuscles: ['Recto abdominal', 'Flexores de cadera'],
    secondaryMuscles: ['Oblicuos'],
    anatomyRegions: { front: ['abs', 'quadriceps'], back: [] },
  },
  'pilates-leg-circles': {
    primaryMuscles: ['Flexores de cadera', 'Core'],
    secondaryMuscles: ['Aductores'],
    anatomyRegions: { front: ['abs', 'quadriceps'], back: [] },
  },
  'pilates-side-kick-series': {
    primaryMuscles: ['Gluteo medio', 'Abductores'],
    secondaryMuscles: ['Oblicuos'],
    anatomyRegions: { front: ['abs'], back: ['glutes'] },
  },
  'pilates-shoulder-bridge': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['glutes', 'hamstrings'] },
  },
  'pilates-bridge-march': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Oblicuos'],
    anatomyRegions: { front: ['abs', 'obliques'], back: ['glutes', 'hamstrings'] },
  },
  'pilates-side-bend': {
    primaryMuscles: ['Oblicuos'],
    secondaryMuscles: ['Serrato anterior', 'Gluteo medio'],
    anatomyRegions: { front: ['obliques', 'abs'], back: ['glutes', 'rear_shoulders'] },
  },
  'pilates-shoulder-bridge-kick': {
    primaryMuscles: ['Gluteos'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['glutes', 'hamstrings'] },
  },
  'pilates-scissors': {
    primaryMuscles: ['Recto abdominal', 'Isquiotibiales'],
    secondaryMuscles: ['Flexores de cadera'],
    anatomyRegions: { front: ['abs', 'quadriceps'], back: ['hamstrings'] },
  },
  'pilates-double-leg-lower-lift': {
    primaryMuscles: ['Recto abdominal', 'Transverso abdominal'],
    secondaryMuscles: ['Flexores de cadera'],
    anatomyRegions: { front: ['abs', 'quadriceps'], back: [] },
  },
  'pilates-front-support': {
    primaryMuscles: ['Recto abdominal', 'Serrato anterior'],
    secondaryMuscles: ['Deltoides anterior', 'Gluteos'],
    anatomyRegions: { front: ['abs', 'front_shoulders'], back: ['glutes'] },
  },
  'pilates-leg-pull-front': {
    primaryMuscles: ['Recto abdominal', 'Gluteos'],
    secondaryMuscles: ['Deltoides', 'Isquiotibiales'],
    anatomyRegions: { front: ['abs', 'front_shoulders'], back: ['glutes', 'hamstrings'] },
  },
  'pilates-leg-pull-back': {
    primaryMuscles: ['Gluteos', 'Deltoides posterior'],
    secondaryMuscles: ['Isquiotibiales', 'Triceps'],
    anatomyRegions: { front: ['chest'], back: ['glutes', 'hamstrings', 'rear_shoulders', 'triceps'] },
  },
  'pilates-seal': {
    primaryMuscles: ['Core'],
    secondaryMuscles: ['Flexores de cadera', 'Movilidad espinal'],
    anatomyRegions: { front: ['abs'], back: ['lower_back'] },
  },
  'pilates-twist': {
    primaryMuscles: ['Oblicuos'],
    secondaryMuscles: ['Erectores torácicos'],
    anatomyRegions: { front: ['abs', 'obliques'], back: ['upper_back'] },
  },
  'pilates-jackknife': {
    primaryMuscles: ['Recto abdominal', 'Transverso abdominal'],
    secondaryMuscles: ['Gluteos', 'Flexores de cadera'],
    anatomyRegions: { front: ['abs', 'quadriceps'], back: ['glutes'] },
  },
  'pilates-wall-roll-down': {
    primaryMuscles: ['Movilidad espinal'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['hamstrings', 'lower_back'] },
  },
  'pilates-side-lying-clam': {
    primaryMuscles: ['Gluteo medio'],
    secondaryMuscles: ['Rotadores externos de cadera'],
    anatomyRegions: { front: [], back: ['glutes'] },
  },
  'pilates-swan-prep': {
    primaryMuscles: ['Lumbar', 'Gluteos'],
    secondaryMuscles: ['Deltoides posterior'],
    anatomyRegions: { front: ['chest'], back: ['lower_back', 'glutes', 'rear_shoulders'] },
  },
  'pilates-standing-roll-down': {
    primaryMuscles: ['Movilidad espinal'],
    secondaryMuscles: ['Isquiotibiales', 'Core'],
    anatomyRegions: { front: ['abs'], back: ['hamstrings', 'lower_back'] },
  },
  'gym-hack-squat': {
    primaryMuscles: ['Cuadriceps', 'Gluteos'],
    secondaryMuscles: ['Gemelos'],
    anatomyRegions: { front: ['quadriceps'], back: ['glutes', 'calves'] },
  },
  'gym-chest-supported-row': {
    primaryMuscles: ['Dorsal ancho', 'Romboides'],
    secondaryMuscles: ['Biceps', 'Deltoides posterior'],
    anatomyRegions: { front: ['biceps'], back: ['lats', 'upper_back', 'rear_shoulders'] },
  },
  'gym-leg-curl': {
    primaryMuscles: ['Isquiotibiales'],
    secondaryMuscles: ['Gemelos'],
    anatomyRegions: { front: [], back: ['hamstrings', 'calves'] },
  },
  'gym-cable-fly': {
    primaryMuscles: ['Pectoral'],
    secondaryMuscles: ['Deltoides anterior'],
    anatomyRegions: { front: ['chest', 'front_shoulders'], back: [] },
  },
  'gym-lateral-raise': {
    primaryMuscles: ['Deltoides lateral'],
    secondaryMuscles: ['Trapecio superior'],
    anatomyRegions: { front: ['front_shoulders'], back: ['rear_shoulders'] },
  },
  'gym-triceps-pushdown': {
    primaryMuscles: ['Triceps'],
    secondaryMuscles: ['Deltoides anterior'],
    anatomyRegions: { front: [], back: ['triceps'] },
  },
  'gym-db-curl': {
    primaryMuscles: ['Biceps'],
    secondaryMuscles: ['Antebrazos'],
    anatomyRegions: { front: ['biceps'], back: [] },
  },
};

const SESSION_CATEGORY_MAP = {
  resistance: new Set(['lower_body_strength', 'lower_body_unilateral', 'upper_push', 'upper_pull', 'posterior_chain', 'core', 'lower_body_accessory']),
  aerobic: new Set(['cardio_base', 'cardio_threshold', 'cardio_interval', 'cardio_skill']),
  mixed: new Set(['conditioning', 'upper_push', 'upper_pull', 'lower_body_strength', 'lower_body_unilateral', 'posterior_chain', 'cardio_interval', 'core']),
  mindbody: new Set(['mobility', 'mobility_strength', 'core_mobility', 'core', 'neuromotor', 'posterior_chain', 'recovery']),
  recovery: new Set(['recovery', 'mobility', 'core']),
};

const SESSION_FOCUS_CATEGORY_MAP = {
  upper: new Set(['upper_push', 'upper_pull', 'core']),
  push: new Set(['upper_push', 'core']),
  pull: new Set(['upper_pull', 'core']),
  lower: new Set(['lower_body_strength', 'lower_body_unilateral', 'lower_body_accessory', 'posterior_chain', 'core']),
  lower_conditioning: new Set(['lower_body_strength', 'lower_body_unilateral', 'lower_body_accessory', 'posterior_chain', 'conditioning', 'core']),
  full_body: new Set(['upper_push', 'upper_pull', 'lower_body_strength', 'lower_body_unilateral', 'posterior_chain', 'conditioning', 'core']),
  cardio: SESSION_CATEGORY_MAP.aerobic,
  mindbody: SESSION_CATEGORY_MAP.mindbody,
  recovery: SESSION_CATEGORY_MAP.recovery,
  general_resistance: SESSION_CATEGORY_MAP.resistance,
  general_mixed: SESSION_CATEGORY_MAP.mixed,
};

const SESSION_FOCUS_PRIORITY = {
  upper: ['upper_push', 'upper_pull', 'upper_push', 'upper_pull', 'core'],
  push: ['upper_push', 'upper_push', 'upper_push', 'core', 'core'],
  pull: ['upper_pull', 'upper_pull', 'upper_pull', 'core', 'core'],
  lower: ['lower_body_strength', 'posterior_chain', 'lower_body_unilateral', 'lower_body_accessory', 'core'],
  lower_conditioning: ['lower_body_strength', 'posterior_chain', 'lower_body_unilateral', 'conditioning', 'core'],
  full_body: ['lower_body_strength', 'upper_push', 'upper_pull', 'posterior_chain', 'core'],
  cardio: ['cardio_base', 'cardio_threshold', 'cardio_interval', 'cardio_skill'],
  mindbody: ['mobility_strength', 'mobility', 'core_mobility', 'neuromotor', 'recovery', 'posterior_chain', 'core'],
  recovery: ['recovery', 'mobility', 'core'],
  general_resistance: ['upper_push', 'upper_pull', 'lower_body_strength', 'posterior_chain', 'core'],
  general_mixed: ['conditioning', 'upper_push', 'upper_pull', 'lower_body_strength', 'posterior_chain', 'core'],
};

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function resolveSessionFocus({ modality = null, sessionType = '', sessionTitle = '' } = {}) {
  const title = normalizeSearchText(sessionTitle);

  if (sessionType === 'recovery') return 'recovery';
  if (sessionType === 'aerobic') return 'cardio';
  if (sessionType === 'mindbody') return 'mindbody';

  if (
    title.includes('torso')
    || title.includes('upper')
    || title.includes('push/pull')
    || title.includes('push pull')
  ) {
    return 'upper';
  }

  if (title.includes('empuje') || /(^|[^a-z])push($|[^a-z])/.test(title)) {
    return 'push';
  }

  if (title.includes('traccion') || /(^|[^a-z])pull($|[^a-z])/.test(title)) {
    return 'pull';
  }

  if (title.includes('pierna') || title.includes('lower body') || title.includes('leg')) {
    return title.includes('acondicion') || title.includes('conditioning') ? 'lower_conditioning' : 'lower';
  }

  if (
    title.includes('full body')
    || title.includes('fuerza total')
    || title.includes('circuito')
    || title.includes('mixto')
    || title.includes('mixed')
  ) {
    return 'full_body';
  }

  if (
    (modality === TrainingModality.RUNNING || modality === TrainingModality.CYCLING)
    && sessionType === 'resistance'
  ) {
    return 'lower';
  }

  if (sessionType === 'mixed') return 'full_body';
  if (sessionType === 'resistance') return 'general_resistance';
  return 'general_mixed';
}

function resolveFocusCategories(sessionType, sessionFocus) {
  return SESSION_FOCUS_CATEGORY_MAP[sessionFocus] || SESSION_CATEGORY_MAP[sessionType] || new Set();
}

function modalityFallback(modality) {
  if (modality === TrainingModality.MIXED) return [TrainingModality.FULL_GYM, TrainingModality.HOME, TrainingModality.TRX];
  if (modality === TrainingModality.RUNNING || modality === TrainingModality.CYCLING) {
    return [TrainingModality.HOME, TrainingModality.FULL_GYM, TrainingModality.MIXED];
  }
  if (modality === TrainingModality.YOGA || modality === TrainingModality.PILATES) {
    return [TrainingModality.HOME, TrainingModality.MIXED];
  }
  return [modality];
}

function listBaseSessionExercises(modality, sessionType, sessionFocus = null) {
  const categories = resolveFocusCategories(sessionType, sessionFocus);
  const allowedModalities = new Set([modality, ...modalityFallback(modality)]);

  return EXERCISES.filter((exercise) => {
    const byModality = exercise.modalities.some((m) => allowedModalities.has(m));
    const bySessionType = exercise.sessionTypes.includes(sessionType);
    const byCategory = categories.has(exercise.category);
    return byModality && bySessionType && byCategory;
  });
}

function getExerciseById(exerciseId) {
  if (!exerciseId) return null;
  return EXERCISES.find((exercise) => exercise.id === exerciseId) || null;
}

export function isExerciseCompatibleWithSessionFocus(exerciseLike, { sessionType, sessionFocus = null } = {}) {
  if (!exerciseLike || !sessionType) return true;

  const exercise = exerciseLike?.id ? getExerciseById(exerciseLike.id) || exerciseLike : exerciseLike;
  const categories = resolveFocusCategories(sessionType, sessionFocus);
  if (!categories.size) return true;
  return categories.has(exercise?.category);
}

function buildExerciseMuscleProfile(exercise) {
  if (!exercise) {
    return {
      primaryMuscles: ['Trabajo general'],
      secondaryMuscles: ['Estabilizadores'],
      anatomyRegions: { front: [], back: [] },
    };
  }

  const override = EXERCISE_MUSCLE_OVERRIDES[exercise.id];
  const categoryProfile = CATEGORY_MUSCLE_PROFILES[exercise.category];
  const resolved = override || categoryProfile || {
    primaryMuscles: ['Trabajo general'],
    secondaryMuscles: ['Estabilizadores'],
    anatomyRegions: { front: [], back: [] },
  };

  return {
    primaryMuscles: resolved.primaryMuscles || [],
    secondaryMuscles: resolved.secondaryMuscles || [],
    anatomyRegions: {
      front: resolved.anatomyRegions?.front || [],
      back: resolved.anatomyRegions?.back || [],
    },
  };
}

export function resolveExerciseMetadata(exerciseLike = null) {
  if (!exerciseLike) {
    return buildExerciseMuscleProfile(null);
  }

  const libraryExercise = exerciseLike.id ? getExerciseById(exerciseLike.id) : null;
  const baseExercise = libraryExercise || exerciseLike;
  const muscleProfile = buildExerciseMuscleProfile(baseExercise);

  return {
    ...muscleProfile,
    primaryMuscles: Array.isArray(exerciseLike.primaryMuscles) && exerciseLike.primaryMuscles.length
      ? exerciseLike.primaryMuscles
      : muscleProfile.primaryMuscles,
    secondaryMuscles: Array.isArray(exerciseLike.secondaryMuscles) && exerciseLike.secondaryMuscles.length
      ? exerciseLike.secondaryMuscles
      : muscleProfile.secondaryMuscles,
    anatomyRegions: exerciseLike.anatomyRegions || muscleProfile.anatomyRegions,
  };
}

function scoreAlternativeExercise(candidate, target, modality) {
  let score = 0;

  if (candidate.category === target.category) score += 60;
  if (candidate.loadType === target.loadType) score += 20;
  if (candidate.equipment !== target.equipment) score += 10;
  if (candidate.modalities.includes(modality)) score += 8;
  if (candidate.sessionTypes.some((sessionType) => target.sessionTypes.includes(sessionType))) score += 4;

  return score;
}

function selectExercisesFromPool(pool, { desiredCount, sessionType, sessionFocus, daySeed }) {
  if (pool.length <= desiredCount) {
    return pool.slice(0, desiredCount);
  }

  const groups = new Map();
  for (const exercise of pool) {
    if (!groups.has(exercise.category)) {
      groups.set(exercise.category, []);
    }
    groups.get(exercise.category).push(exercise);
  }

  const priority = SESSION_FOCUS_PRIORITY[sessionFocus]
    || Array.from(resolveFocusCategories(sessionType, sessionFocus));
  const cursors = new Map();
  const selected = [];
  const used = new Set();

  function takeFromCategory(category) {
    const group = groups.get(category) || [];
    if (!group.length) return null;

    const start = cursors.get(category) ?? (daySeed % group.length);
    for (let offset = 0; offset < group.length; offset += 1) {
      const candidate = group[(start + offset) % group.length];
      if (used.has(candidate.id)) continue;
      cursors.set(category, (start + offset + 1) % group.length);
      return candidate;
    }
    return null;
  }

  for (const category of priority) {
    if (selected.length >= desiredCount) break;
    const candidate = takeFromCategory(category);
    if (!candidate) continue;
    selected.push(candidate);
    used.add(candidate.id);
  }

  for (let index = 0; selected.length < desiredCount && index < pool.length; index += 1) {
    const candidate = pool[(daySeed + index) % pool.length];
    if (used.has(candidate.id)) continue;
    selected.push(candidate);
    used.add(candidate.id);
  }

  return selected.slice(0, desiredCount);
}

function resolveRepRange(goal) {
  if (goal === GoalType.STRENGTH) return { reps: '3-6', sets: 4 };
  if (goal === GoalType.HYPERTROPHY) return { reps: '6-12', sets: 4 };
  if (goal === GoalType.ENDURANCE) return { reps: '12-20', sets: 3 };
  if (goal === GoalType.WEIGHT_LOSS || goal === GoalType.GLYCEMIC_CONTROL) return { reps: '8-15', sets: 3 };
  return { reps: '6-12', sets: 3 };
}

function resolveTimePrescription(sessionType) {
  if (sessionType === 'aerobic') return { durationMinutes: 30, workRatio: 'continuo' };
  if (sessionType === 'recovery') return { durationMinutes: 8, workRatio: 'suave' };
  if (sessionType === 'mindbody') return { durationMinutes: 10, workRatio: 'control respiratorio' };
  return { durationMinutes: 6, workRatio: 'intervalado' };
}

function prescribeLoadKg(exercise, profile, adaptiveTuning) {
  if (exercise.loadType !== 'external') {
    return null;
  }

  const bodyWeight = clamp(toNumber(profile?.weightKg, 75), 35, 250);
  const ratio = toNumber(exercise.loadRatio, 0.15);
  const volumeFactor = toNumber(adaptiveTuning?.workout?.volumeFactor, 1);
  const readinessModifier = toNumber(adaptiveTuning?.workout?.rpeShift, 0) * 0.03;
  const raw = bodyWeight * ratio * (1 + readinessModifier) * volumeFactor;
  const bounded = clamp(raw, 5, bodyWeight * 1.2);
  return roundToStep(bounded, 2.5);
}

function buildExercisePrescription(exercise, { goal, sessionType, profile, adaptiveTuning }) {
  if (exercise.loadType === 'time') {
    const time = resolveTimePrescription(sessionType);
    const baseMinutes = time.durationMinutes;
    const durationMinutes = Math.max(4, Math.round(baseMinutes * toNumber(adaptiveTuning?.workout?.volumeFactor, 1)));
    return {
      format: 'time',
      sets: sessionType === 'aerobic' ? 1 : 2,
      durationMinutes,
      restSeconds: sessionType === 'aerobic' ? 0 : 45,
      workRatio: time.workRatio,
      loadKg: null,
      loadGuidance: 'Prioriza técnica, respiración y control del esfuerzo.',
    };
  }

  const repRange = resolveRepRange(goal);
  const setFactor = sessionType === 'mixed' ? 0.9 : 1;
  const sets = Math.max(2, Math.round(repRange.sets * toNumber(adaptiveTuning?.workout?.volumeFactor, 1) * setFactor));
  const loadKg = prescribeLoadKg(exercise, profile, adaptiveTuning);

  return {
    format: 'reps',
    sets,
    reps: repRange.reps,
    restSeconds: goal === GoalType.STRENGTH ? 120 : 75,
    loadKg,
    loadGuidance:
      loadKg != null
        ? 'Ajusta carga para terminar cada serie con 1-3 repeticiones en reserva (RIR).'
        : 'Usa progresión de dificultad (ángulo, palanca o tempo) para mantener RPE objetivo.',
  };
}

export function getExerciseLibrarySummary() {
  return {
    totalExercises: EXERCISES.length,
    modalities: Object.values(TrainingModality).map((modality) => ({
      modality,
      count: EXERCISES.filter((exercise) => exercise.modalities.includes(modality)).length,
    })),
  };
}

export function getExerciseLibraryAuditSchema() {
  return EXERCISE_AUDIT_SCHEMA;
}

export function getExerciseLibraryCatalog() {
  return EXERCISES
    .map((exercise) => {
      const metadata = resolveExerciseMetadata(exercise);
      return {
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        modalities: exercise.modalities,
        sessionTypes: exercise.sessionTypes,
        equipment: exercise.equipment,
        loadType: exercise.loadType,
        loadRatio: exercise.loadRatio,
        primaryMuscles: metadata.primaryMuscles,
        secondaryMuscles: metadata.secondaryMuscles,
        anatomyRegions: metadata.anatomyRegions,
        difficulty: exercise.difficulty || '',
        youtubeQuery: exercise.youtubeQuery || '',
        progressions: exercise.progressions || [],
        regressions: exercise.regressions || [],
        contraindications: exercise.contraindications || [],
        cues: exercise.cues,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function exportExerciseLibraryCatalogCsv(catalog = getExerciseLibraryCatalog()) {
  return serializeExerciseCatalogAsCsv(catalog, { mode: 'audit' });
}

export function exportExerciseLibraryCatalogJson(catalog = getExerciseLibraryCatalog()) {
  return JSON.stringify(catalog, null, 2);
}

export function validateExerciseLibraryAuditCatalog(catalog) {
  return validateExerciseCatalog(catalog, { mode: 'audit' });
}

export function parseExerciseLibraryAuditText(text, { format = 'auto' } = {}) {
  return parseExerciseCatalogText(text, { format, mode: 'audit' });
}

export function suggestExerciseAlternatives({
  currentExerciseId,
  currentExercise = null,
  modality,
  sessionType,
  sessionTitle = '',
  sessionFocus = null,
  goal,
  profile,
  adaptiveTuning,
  limit = 4,
}) {
  const resolvedSessionFocus = sessionFocus || resolveSessionFocus({ modality, sessionType, sessionTitle });
  const pool = listBaseSessionExercises(modality, sessionType, resolvedSessionFocus);
  if (!pool.length) return [];

  const targetExercise = getExerciseById(currentExerciseId)
    || (currentExercise?.id ? getExerciseById(currentExercise.id) : null);

  let rankedPool = pool;
  if (targetExercise) {
    rankedPool = pool
      .filter((exercise) => exercise.id !== targetExercise.id)
      .map((exercise) => ({
        exercise,
        score: scoreAlternativeExercise(exercise, targetExercise, modality),
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.exercise);
  }

  return rankedPool.slice(0, Math.max(1, limit)).map((exercise) => {
    const links = youtubeLinks(resolveYoutubeQuery(exercise, modality));
    const metadata = resolveExerciseMetadata(exercise);
    return {
      id: exercise.id,
      name: exercise.name,
      category: exercise.category,
      equipment: exercise.equipment,
      difficulty: exercise.difficulty || '',
      youtubeQuery: resolveYoutubeQuery(exercise, modality),
      progressions: exercise.progressions || [],
      regressions: exercise.regressions || [],
      contraindications: exercise.contraindications || [],
      cues: exercise.cues,
      ...metadata,
      ...links,
      prescription: buildExercisePrescription(exercise, {
        goal,
        sessionType,
        profile,
        adaptiveTuning,
      }),
    };
  });
}

export function buildWarmupProtocol({ sessionType, modality }) {
  const common = [
    { step: 'Movilidad articular global', durationMinutes: 4, details: 'Tobillos, caderas, columna torácica y hombros.' },
    { step: 'Activación cardiometabólica progresiva', durationMinutes: 4, details: 'Caminar rápido, bici suave o saltos de bajo impacto.' },
  ];

  if (sessionType === 'resistance' || sessionType === 'mixed') {
    common.push({
      step: 'Series de aproximación',
      durationMinutes: 5,
      details: '2-3 series con carga creciente antes del ejercicio principal.',
    });
  }

  if (modality === TrainingModality.YOGA || modality === TrainingModality.PILATES) {
    common.push({
      step: 'Respiración diafragmática',
      durationMinutes: 3,
      details: 'Inhala 4s, exhala 6s para mejorar control neuromotor.',
    });
  }

  return common;
}

export function buildCooldownProtocol({ sessionType }) {
  const steps = [
    { step: 'Vuelta a la calma', durationMinutes: 4, details: 'Reducir pulso progresivamente hasta conversación cómoda.' },
    { step: 'Movilidad y estiramientos', durationMinutes: 6, details: '10-30s por grupo muscular principal.' },
  ];

  if (sessionType === 'aerobic' || sessionType === 'mixed') {
    steps.push({
      step: 'Respiración de recuperación',
      durationMinutes: 3,
      details: 'Respiración nasal lenta para acelerar recuperación autonómica.',
    });
  }
  return steps;
}

export function buildSessionExercises({
  modality,
  sessionType,
  sessionTitle = '',
  sessionFocus = null,
  goal,
  profile,
  adaptiveTuning,
  daySeed = 0,
}) {
  const resolvedSessionFocus = sessionFocus || resolveSessionFocus({ modality, sessionType, sessionTitle });
  const pool = listBaseSessionExercises(modality, sessionType, resolvedSessionFocus);
  const desiredCount = sessionType === 'recovery' ? 3 : sessionType === 'aerobic' ? 2 : 5;
  const selectedPool = selectExercisesFromPool(pool, {
    desiredCount: Math.min(desiredCount, pool.length),
    sessionType,
    sessionFocus: resolvedSessionFocus,
    daySeed,
  });

  const selected = selectedPool.map((exercise) => {
    const links = youtubeLinks(resolveYoutubeQuery(exercise, modality));
    const metadata = resolveExerciseMetadata(exercise);
    return {
      id: exercise.id,
      name: exercise.name,
      category: exercise.category,
      equipment: exercise.equipment,
      difficulty: exercise.difficulty || '',
      youtubeQuery: resolveYoutubeQuery(exercise, modality),
      progressions: exercise.progressions || [],
      regressions: exercise.regressions || [],
      contraindications: exercise.contraindications || [],
      cues: exercise.cues,
      ...metadata,
      ...links,
      prescription: buildExercisePrescription(exercise, {
        goal,
        sessionType,
        profile,
        adaptiveTuning,
      }),
    };
  });

  return selected;
}
