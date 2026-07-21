// Mapa curado: movimiento de calentamiento/movilidad (guidedMobility.js) → id de
// free-exercise-db (dominio público) para la foto de guía. GENERADO con triple mapeo +
// verificación par a par (scratch/build-warmup-media-map.mjs) el 2026-07-21.
// Los movimientos DINÁMICOS sin foto estática equivalente (marcha, círculos, pedaleo, series
// de aproximación) NO tienen entrada — simplemente no muestran foto.
export const WARMUP_MEDIA_MAP = {
  'adductor-rockback': 'Adductor_Groin', // Aductores en balanceo → Adductor/Groin
  'band-external-rotation': 'External_Rotation_with_Band', // Rotación externa con banda → External Rotation with Band
  'calf-wall': 'Calf_Stretch_Hands_Against_Wall', // Gemelo contra pared → Calf Stretch Hands Against Wall
  'child-pose-lat': 'Childs_Pose', // Dorsal en postura de descanso → Child's Pose
  'dead-bug-primer': 'Dead_Bug', // Dead bug de activación → Dead Bug
  'doorway-pec': 'Chest_And_Front_Of_Shoulder_Stretch', // Pectoral en marco de puerta → Chest And Front Of Shoulder Stretch
  'figure-four-chair': 'Ankle_On_The_Knee', // Glúteo en figura cuatro → Ankle On The Knee
  'full-body-reach': 'Upward_Stretch', // Alcance global de pie → Upward Stretch
  'hamstring-hinge': 'Hamstring_Stretch', // Isquios con bisagra de pie → Hamstring Stretch
  'hip-flexor-half-kneel': 'Kneeling_Hip_Flexor', // Flexor de cadera en media rodilla → Kneeling Hip Flexor
  'lat-bench': 'Overhead_Lat', // Dorsal con apoyo → Overhead Lat
  'neck-side': 'Side_Neck_Stretch', // Cuello y trapecio → Side Neck Stretch
  'posterior-shoulder': 'Shoulder_Stretch', // Hombro posterior cruzado → Shoulder Stretch
  'quad-standing': 'Quad_Stretch', // Cuádriceps de pie → Quad Stretch
  'scapular-pull': 'Band_Pull_Apart', // Retracción escapular → Band Pull Apart
  'supine-knee-hug': 'Hug_Knees_To_Chest', // Rodillas al pecho → Hug Knees To Chest
};

const MEDIA_BUCKET = process.env.EXERCISE_MEDIA_BUCKET || 'endogym-vtety8-exercise-media';

export function warmupMovementMedia(movementId) {
  const fedId = WARMUP_MEDIA_MAP[movementId];
  if (!fedId) return null;
  return [0, 1].map((n) => `https://storage.googleapis.com/${MEDIA_BUCKET}/exercise-media/${fedId}/${n}.jpg`);
}
