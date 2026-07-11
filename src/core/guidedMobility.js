import { deriveWorkedGroups, detectComorbidities } from './warmupCooldown.js';

const ALLOWED_DURATIONS = Object.freeze([5, 10, 15, 20]);
const WARMUP_DURATIONS = Object.freeze([5, 10, 15]);

// Biblioteca ORIGINAL de movimientos. No procede de clases, guiones ni secuencias de terceros.
// `targets` enlaza cada movimiento con las categorías reales del catálogo que lo justifican.
const MOVEMENTS = Object.freeze([
  { id: 'breathing-stand', name: 'Respiración de pie', targets: ['all'], seconds: 45, side: null, equipment: 'Sin equipo', cue: 'Inhala por la nariz y alarga la exhalación mientras bajas hombros.' },
  { id: 'calf-wall', name: 'Gemelo contra pared', targets: ['lower', 'run', 'bike'], seconds: 60, side: '30 s por lado', equipment: 'Pared', cue: 'Talón apoyado y pie orientado al frente; no rebotes.' },
  { id: 'hip-flexor-half-kneel', name: 'Flexor de cadera en media rodilla', targets: ['lower', 'run', 'bike'], seconds: 60, side: '30 s por lado', equipment: 'Esterilla', cue: 'Retroversión suave de pelvis; avanza sin arquear la zona lumbar.' },
  { id: 'hamstring-hinge', name: 'Isquios con bisagra de pie', targets: ['lower', 'run'], seconds: 60, side: '30 s por lado', equipment: 'Sin equipo', cue: 'Espalda neutra y cadera atrás; busca tensión cómoda, nunca dolor.' },
  { id: 'figure-four-chair', name: 'Glúteo en figura cuatro', targets: ['lower', 'run', 'bike'], seconds: 60, side: '30 s por lado', equipment: 'Silla opcional', cue: 'Mantén el pie activo y el tronco largo al inclinarte.' },
  { id: 'adductor-rockback', name: 'Aductores en balanceo controlado', targets: ['lower'], seconds: 60, side: '30 s por lado', equipment: 'Esterilla', cue: 'Desplaza la cadera lentamente y detente antes de perder control.' },
  { id: 'ankle-knee-wall', name: 'Tobillo: rodilla a pared', targets: ['lower', 'run'], seconds: 60, side: '30 s por lado', equipment: 'Pared', cue: 'Talón pegado al suelo; lleva la rodilla en línea con el segundo dedo.' },
  { id: 'quad-standing', name: 'Cuádriceps de pie con apoyo', targets: ['lower', 'run', 'bike'], seconds: 60, side: '30 s por lado', equipment: 'Pared opcional', cue: 'Rodillas próximas y pelvis neutra; no tires del tobillo.' },
  { id: 'child-pose-lat', name: 'Dorsal en postura de descanso', targets: ['pull', 'push', 'core'], seconds: 60, side: null, equipment: 'Esterilla', cue: 'Lleva caderas atrás y manos al frente sin forzar hombros ni lumbar.' },
  { id: 'doorway-pec', name: 'Pectoral en marco de puerta', targets: ['push'], seconds: 60, side: '30 s por lado', equipment: 'Pared o puerta', cue: 'Gira el tronco poco a poco con el hombro lejos de la oreja.' },
  { id: 'triceps-overhead', name: 'Tríceps por encima de la cabeza', targets: ['push'], seconds: 60, side: '30 s por lado', equipment: 'Sin equipo', cue: 'Costillas recogidas; guía el codo sin empujar el cuello.' },
  { id: 'posterior-shoulder', name: 'Hombro posterior cruzado', targets: ['pull', 'push'], seconds: 60, side: '30 s por lado', equipment: 'Sin equipo', cue: 'Brazo a la altura del pecho y escápula estable; presión suave.' },
  { id: 'lat-bench', name: 'Dorsal con apoyo', targets: ['pull'], seconds: 60, side: null, equipment: 'Banco o silla', cue: 'Cadera atrás, pecho entre brazos y abdomen activo.' },
  { id: 'wrist-flexor', name: 'Antebrazo y muñeca', targets: ['pull', 'push'], seconds: 60, side: '30 s por lado', equipment: 'Sin equipo', cue: 'Codo extendido sin bloquear; mueve la muñeca con suavidad.' },
  { id: 'thoracic-open-book', name: 'Rotación torácica de lado', targets: ['pull', 'push', 'core'], seconds: 60, side: '30 s por lado', equipment: 'Esterilla', cue: 'Rodillas juntas y giro desde el tórax, sin arrastrar la lumbar.' },
  { id: 'cobra-low', name: 'Extensión abdominal baja', targets: ['core'], seconds: 45, side: null, equipment: 'Esterilla', cue: 'Apóyate en antebrazos y alarga el abdomen sin comprimir la lumbar.' },
  { id: 'supine-knee-hug', name: 'Rodillas al pecho alternas', targets: ['core', 'lower'], seconds: 60, side: '30 s por lado', equipment: 'Esterilla', cue: 'La pierna libre permanece cómoda; respira sin aplastar la espalda.' },
  { id: 'neck-side', name: 'Cuello y trapecio sin tracción', targets: ['pull', 'push', 'all'], seconds: 45, side: '20 s por lado', equipment: 'Sin equipo', cue: 'Inclina la cabeza por su propio peso; no tires con la mano.' },
  { id: 'full-body-reach', name: 'Alcance global con respiración', targets: ['all'], seconds: 45, side: null, equipment: 'Sin equipo', cue: 'Crece al inhalar y suelta tensión al exhalar, sin buscar rango máximo.' },
]);

// Calentamiento: movimientos dinámicos y ensayos de patrón, no estiramiento estático.
const WARMUP_MOVEMENTS = Object.freeze([
  { id: 'march-progressive', name: 'Marcha progresiva', targets: ['all'], side: null, equipment: 'Sin equipo', cue: 'Empieza muy suave y aumenta el ritmo hasta notar calor, sin jadear.' },
  { id: 'shoulder-circles', name: 'Círculos de hombro controlados', targets: ['push', 'pull', 'all'], side: null, equipment: 'Sin equipo', cue: 'Recorrido cómodo hacia delante y atrás, sin elevar los hombros.' },
  { id: 'wall-slides', name: 'Deslizamientos escapulares en pared', targets: ['push', 'pull'], side: null, equipment: 'Pared', cue: 'Costillas recogidas; desliza brazos sin perder contacto ni forzar rango.' },
  { id: 'band-external-rotation', name: 'Rotación externa con banda', targets: ['push'], side: null, equipment: 'Banda ligera', cue: 'Codos junto al cuerpo y escápulas estables; tensión muy ligera.' },
  { id: 'scapular-pull', name: 'Retracción escapular', targets: ['pull'], side: null, equipment: 'Banda opcional', cue: 'Lleva escápulas atrás y abajo sin doblar demasiado los codos.' },
  { id: 'thoracic-rotation-stand', name: 'Rotación torácica de pie', targets: ['push', 'pull', 'core'], side: 'Alterna lados', equipment: 'Sin equipo', cue: 'Pelvis estable y giro desde el tórax, con respiración fluida.' },
  { id: 'ankle-rocks', name: 'Balanceo dinámico de tobillo', targets: ['lower', 'run', 'bike'], side: 'Alterna lados', equipment: 'Pared opcional', cue: 'Rodilla sigue la línea del pie y el talón permanece apoyado.' },
  { id: 'hip-openers', name: 'Aperturas dinámicas de cadera', targets: ['lower', 'run', 'bike'], side: 'Alterna lados', equipment: 'Apoyo opcional', cue: 'Movimiento pequeño y controlado; pelvis estable.' },
  { id: 'bodyweight-squat-rehearsal', name: 'Ensayo de sentadilla sin carga', targets: ['lower'], side: null, equipment: 'Sin equipo', cue: 'Baja solo hasta mantener pies firmes, rodillas estables y columna neutra.' },
  { id: 'hip-hinge-rehearsal', name: 'Ensayo de bisagra de cadera', targets: ['lower'], side: null, equipment: 'Palo opcional', cue: 'Cadera atrás con espalda neutra; siente isquios sin buscar estiramiento máximo.' },
  { id: 'glute-bridge-dynamic', name: 'Puente de glúteos dinámico', targets: ['lower', 'core'], side: null, equipment: 'Esterilla', cue: 'Sube exhalando y baja con control, sin hiperextender la lumbar.' },
  { id: 'dead-bug-primer', name: 'Dead bug de activación', targets: ['core', 'push', 'pull'], side: 'Alterna lados', equipment: 'Esterilla', cue: 'Mantén costillas y pelvis estables mientras mueves brazo y pierna contrarios.' },
  { id: 'running-a-march', name: 'A-march técnico', targets: ['run'], side: 'Alterna lados', equipment: 'Sin equipo', cue: 'Postura alta, apoyo bajo la cadera y ritmo progresivo, sin saltar.' },
  { id: 'bike-cadence-primer', name: 'Pedaleo de cadencia progresiva', targets: ['bike'], side: null, equipment: 'Bicicleta', cue: 'Sube cadencia poco a poco con resistencia ligera, sin acumular fatiga.' },
  { id: 'ramp-sets', name: 'Series de aproximación', targets: ['strength'], side: null, equipment: 'Material del primer ejercicio', cue: 'Haz 2-3 series con carga creciente y técnica limpia antes de la primera serie efectiva.' },
]);

const CATEGORY_TARGETS = Object.freeze({
  lower_body_strength: ['lower'], lower_body_unilateral: ['lower'], lower_body_accessory: ['lower'], posterior_chain: ['lower'],
  upper_push: ['push'], upper_pull: ['pull'], core: ['core'], core_mobility: ['core'],
  conditioning: ['all'], mobility: ['all'], mobility_strength: ['all'], neuromotor: ['all'],
  cardio_base: ['run'], cardio_threshold: ['run'], cardio_interval: ['run'], cardio_skill: ['run'],
});

function targetsFromExercises(exercises) {
  const targets = [];
  for (const exercise of Array.isArray(exercises) ? exercises : []) {
    for (const target of CATEGORY_TARGETS[exercise?.category] || []) {
      if (!targets.includes(target)) targets.push(target);
    }
  }
  return targets.length ? targets : ['all'];
}
function safeCandidates(profile) {
  const c = detectComorbidities(profile || {});
  return MOVEMENTS.filter((movement) => {
    if (c.osteoporosis && ['thoracic-open-book', 'cobra-low'].includes(movement.id)) return false;
    if (c.pregnant && ['thoracic-open-book', 'cobra-low', 'supine-knee-hug'].includes(movement.id)) return false;
    return true;
  });
}

function takeForDuration(candidates, targets, durationMinutes) {
  const desired = Math.max(4, Math.min(12, durationMinutes));
  const ranked = candidates
    .map((movement, index) => ({ movement, index, score: movement.targets.includes('all') ? 1 : movement.targets.filter((t) => targets.includes(t)).length * 10 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.movement);
  const selected = [];
  const breathing = candidates.find((m) => m.id === 'breathing-stand');
  if (breathing) selected.push(breathing);
  for (const movement of ranked) {
    if (selected.length >= desired || selected.some((m) => m.id === movement.id)) continue;
    selected.push(movement);
  }
  for (const movement of candidates) {
    if (selected.length >= desired || selected.some((m) => m.id === movement.id)) continue;
    selected.push(movement);
  }

  // El reproductor necesita una duración total honesta: se reparte el tiempo exacto de la
  // opción escogida entre los movimientos, conservando un mínimo útil de 30 s.
  const totalSeconds = durationMinutes * 60;
  const base = Math.floor(totalSeconds / selected.length);
  let remaining = totalSeconds - (base * selected.length);
  return selected.map((movement) => {
    const seconds = base + (remaining-- > 0 ? 1 : 0);
    return { ...movement, seconds };
  });
}

export function buildGuidedMobilityRoutine({ exercises = [], profile = null, durationMinutes = 10 } = {}) {
  const duration = ALLOWED_DURATIONS.includes(Number(durationMinutes)) ? Number(durationMinutes) : 10;
  const targets = targetsFromExercises(exercises);
  const workedGroups = deriveWorkedGroups(exercises);
  const movements = takeForDuration(safeCandidates(profile), targets, duration);
  const equipment = [...new Set(movements.map((m) => m.equipment).filter((e) => e && e !== 'Sin equipo'))];
  return {
    id: `post-workout-${targets.join('-')}-${duration}`,
    title: 'Movilidad guiada',
    context: workedGroups.length ? `Hoy trabajaste ${workedGroups.join(', ')}` : 'Recuperación de cuerpo completo',
    workedGroups,
    durationMinutes: duration,
    durationOptions: [...ALLOWED_DURATIONS],
    equipment: equipment.length ? equipment : ['Sin equipo'],
    safety: 'Respira lento. Sin rebotes y sin dolor.',
    selectionReason: workedGroups.length
      ? 'La secuencia se seleccionó desde los ejercicios reales de esta sesión.'
      : 'Secuencia general porque la sesión no aporta grupos musculares concretos.',
    movements,
  };
}

function buildWarmupMovements({ exercises, profile, sessionType, durationMinutes }) {
  const targets = targetsFromExercises(exercises);
  if (sessionType === 'resistance' || sessionType === 'mixed') targets.push('strength');
  const c = detectComorbidities(profile || {});
  const candidates = WARMUP_MOVEMENTS.filter((movement) => {
    if ((c.osteoarthritis || c.pregnant) && movement.id === 'running-a-march') return false;
    if (c.pregnant && movement.id === 'dead-bug-primer') return false;
    return true;
  });
  const desired = Math.max(4, Math.min(10, durationMinutes));
  const ranked = candidates
    .map((movement, index) => ({ movement, index, score: movement.targets.includes('all') ? 2 : movement.targets.filter((t) => targets.includes(t)).length * 10 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.movement);
  const selected = [];
  const general = candidates.find((m) => m.id === 'march-progressive');
  if (general) selected.push(general);
  for (const movement of ranked) {
    if (selected.length >= desired || selected.some((m) => m.id === movement.id)) continue;
    selected.push(movement);
  }
  const totalSeconds = durationMinutes * 60;
  const base = Math.floor(totalSeconds / selected.length);
  let remaining = totalSeconds - (base * selected.length);
  return selected.map((movement) => ({ ...movement, seconds: base + (remaining-- > 0 ? 1 : 0) }));
}

export function buildGuidedWarmupRoutine({ exercises = [], profile = null, sessionType = 'resistance', durationMinutes = 10 } = {}) {
  const duration = WARMUP_DURATIONS.includes(Number(durationMinutes)) ? Number(durationMinutes) : 10;
  const workedGroups = deriveWorkedGroups(exercises);
  const movements = buildWarmupMovements({ exercises, profile, sessionType, durationMinutes: duration });
  const equipment = [...new Set(movements.map((m) => m.equipment).filter((e) => e && e !== 'Sin equipo'))];
  return {
    id: `pre-workout-${targetsFromExercises(exercises).join('-')}-${duration}`,
    kind: 'warmup',
    title: 'Calentamiento guiado',
    context: workedGroups.length ? `Prepara ${workedGroups.join(', ')}` : 'Preparación general para la sesión',
    workedGroups,
    durationMinutes: duration,
    durationOptions: [...WARMUP_DURATIONS],
    equipment: equipment.length ? equipment : ['Sin equipo'],
    safety: 'Muévete de forma progresiva. Sin dolor, mareo ni falta de aire anormal.',
    selectionReason: workedGroups.length
      ? 'La secuencia prepara los patrones de los ejercicios reales de hoy.'
      : 'Preparación general porque la sesión no aporta patrones concretos.',
    movements,
  };
}
