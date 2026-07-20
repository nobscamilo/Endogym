// Mapa curado: ejercicio del catálogo prescribible → id de free-exercise-db (dominio
// público) para las fotos de técnica (inicio/fin). GENERADO con triple pasada de mapeo +
// verificación par a par (scratch/build-media-map.mjs) el 2026-07-20;
// REVISAR a mano al añadir entradas. Los ejercicios sin entrada simplemente no muestran fotos.
export const EXERCISE_MEDIA_MAP = {
  'calis-bench-dip': 'Bench_Dips', // Fondos en banco → Bench Dips
  'calis-inverted-row': 'Inverted_Row', // Remo invertido → Inverted Row
  'gym-barbell-back-squat': 'Barbell_Full_Squat', // Sentadilla trasera con barra → Barbell Full Squat
  'gym-barbell-row': 'Bent_Over_Barbell_Row', // Remo con barra → Bent Over Barbell Row
  'gym-bench-press': 'Barbell_Bench_Press_-_Medium_Grip', // Press de banca con barra → Barbell Bench Press - Medium Grip
  'gym-cable-fly': 'Cable_Crossover', // Cruce de poleas → Cable Crossover
  'gym-calf-raise': 'Standing_Calf_Raises', // Elevación de talones de pie → Standing Calf Raises
  'gym-conventional-deadlift': 'Barbell_Deadlift', // Peso muerto convencional → Barbell Deadlift
  'gym-db-curl': 'Dumbbell_Bicep_Curl', // Curl con mancuernas → Dumbbell Bicep Curl
  'gym-face-pull': 'Face_Pull', // Face pull → Face Pull
  'gym-front-squat': 'Front_Barbell_Squat', // Sentadilla frontal → Front Barbell Squat
  'gym-hack-squat': 'Hack_Squat', // Sentadilla hack → Hack Squat
  'gym-hip-thrust': 'Barbell_Hip_Thrust', // Hip thrust → Barbell Hip Thrust
  'gym-incline-db-press': 'Incline_Dumbbell_Press', // Press inclinado con mancuernas → Incline Dumbbell Press
  'gym-lat-pulldown': 'Full_Range-Of-Motion_Lat_Pulldown', // Jalón al pecho → Full Range-Of-Motion Lat Pulldown
  'gym-leg-curl': 'Lying_Leg_Curls', // Curl de piernas → Lying Leg Curls
  'gym-leg-press': 'Leg_Press', // Prensa de piernas → Leg Press
  'gym-seated-row': 'Seated_Cable_Rows', // Remo sentado en polea → Seated Cable Rows
  'gym-triceps-pushdown': 'Triceps_Pushdown', // Extensión de tríceps en polea → Triceps Pushdown
  'home-band-lateral-raise': 'Lateral_Raise_-_With_Bands', // Elevación lateral con banda → Lateral Raise - With Bands
  'home-band-overhead-press': 'Shoulder_Press_-_With_Bands', // Press de hombros con banda → Shoulder Press - With Bands
  'home-band-pull-apart': 'Band_Pull_Apart', // Band pull-apart → Band Pull Apart
  'home-band-row': 'Back_Flyes_-_With_Bands', // Remo con banda → Back Flyes - With Bands
  'home-banded-good-morning': 'Band_Good_Morning', // Buenos días con banda → Band Good Morning
  'home-bodyweight-squat': 'Bodyweight_Squat', // Sentadilla libre → Bodyweight Squat
  'home-dead-bug': 'Dead_Bug', // Dead bug → Dead Bug
  'home-hip-bridge': 'Butt_Lift_Bridge', // Puente de glúteos → Butt Lift (Bridge)
  'home-incline-push-up': 'Incline_Push-Up', // Flexiones inclinadas → Incline Push-Up
  'home-mountain-climber': 'Mountain_Climbers', // Escaladores (Mountain Climber) → Mountain Climbers
  'home-plank': 'Plank', // Plancha frontal → Plank
  'home-push-up': 'Pushups', // Flexiones → Pushups
  'home-side-plank': 'Side_Bridge', // Plancha lateral → Side Bridge
  'home-single-leg-glute-bridge': 'Single_Leg_Glute_Bridge', // Puente de glúteos a una pierna → Single Leg Glute Bridge
  'mobility-ankle': 'Ankle_Circles', // Movilidad de tobillo → Ankle Circles
  'pilates-spine-stretch': 'Spinal_Stretch', // Estiramiento de columna hacia adelante → Spinal Stretch
  'trx-bulgarian-split-squat': 'Suspended_Split_Squat', // Sentadilla búlgara en TRX → Suspended Split Squat
  'trx-chest-press': 'Suspended_Push-Up', // Press de pecho en TRX → Suspended Push-Up
  'trx-fallout': 'Suspended_Fallout', // Fallout en TRX → Suspended Fallout
  'trx-row': 'Suspended_Row', // Remo en TRX → Suspended Row
  'yoga-bridge-pose': 'Butt_Lift_Bridge', // Postura del puente → Butt Lift (Bridge)
  'yoga-child-pose': 'Childs_Pose', // Postura del niño → Child's Pose
  'yoga-plank-pose': 'Plank', // Postura de la plancha → Plank
  'yoga-side-plank-pose': 'Side_Bridge', // Postura de plancha lateral → Side Bridge
};

// Bucket PÚBLICO dedicado (IAM allUsers objectViewer, uniform access), separado del bucket
// privado de platos. El proyecto NO tiene Firebase Storage activado: URL directa de GCS.
const MEDIA_BUCKET = process.env.EXERCISE_MEDIA_BUCKET || 'endogym-vtety8-exercise-media';

// URLs públicas de las 2 fotos (posición inicial/final).
export function exerciseMediaUrls(catalogId) {
  const fedId = EXERCISE_MEDIA_MAP[catalogId];
  if (!fedId) return null;
  return [0, 1].map((n) => `https://storage.googleapis.com/${MEDIA_BUCKET}/exercise-media/${fedId}/${n}.jpg`);
}
