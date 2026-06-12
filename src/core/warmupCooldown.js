// Calentamiento y vuelta a la calma DINÁMICOS y OBLIGATORIOS.
//
// No se pregunta "¿vas a calentar?": cada sesión ensambla su protocolo cruzando el
// tipo/foco del día con las comorbilidades del perfil (hipertensión, artrosis,
// diabetes, osteoporosis, lesiones previas) y la edad. Tres bloques:
//   1. Calentamiento GENERAL  — termorregulación / activación cardiovascular gradual.
//   2. Calentamiento ESPECÍFICO — movilidad + activación biomecánica de lo que toca hoy.
//   3. VUELTA A LA CALMA — retorno gradual + estiramientos (crítico con hipertensión).
// Determinista, sin IA. Educativo: las notas adaptan, nunca diagnostican.
import { TrainingModality } from '../domain/models.js';

const ACCENT_RE = /[̀-ͯ]/g;
function norm(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(ACCENT_RE, '').trim();
}

const INJURY_ZONES = [
  ['lumbar', /(lumbar|lumbalgia|espalda baja|hernia (discal|lumbar)|ciatic)/],
  ['rodilla', /(rodilla|menisco|ligamento cruzado|rotulian|condromalacia)/],
  ['hombro', /(hombro|manguito|supraespinoso|luxacion de hombro)/],
  ['tobillo', /(tobillo|esguince)/],
  ['cadera', /(cadera|psoas|trocanter)/],
  ['cervical', /(cervical|cuello|cervicalgia)/],
  ['muñeca', /(muneca|carpiano|tendinitis de muneca)/],
];

export const INJURY_ZONE_KEYS = INJURY_ZONES.map(([zone]) => zone);

/**
 * Detección determinista de comorbilidades. Fuente PRINCIPAL: los checkboxes
 * estructurados del perfil (`profile.conditions`, encuesta de Perfil). Fuente
 * COMPLEMENTARIA (OR): léxico ES sobre el texto libre de medicalConditions/
 * physicalInjuries (cubre perfiles antiguos y matices escritos a mano).
 * Conservadora: solo marca lo explícito.
 */
export function detectComorbidities(profile = {}) {
  const text = norm(`${profile.medicalConditions || ''} ${profile.physicalInjuries || ''}`);
  const screening = profile.preparticipation || {};
  const structured = profile.conditions && typeof profile.conditions === 'object' ? profile.conditions : {};
  const age = Number(profile.age);
  const lexicalInjuries = INJURY_ZONES.filter(([, re]) => re.test(text)).map(([zone]) => zone);
  const structuredInjuries = (Array.isArray(structured.injuryZones) ? structured.injuryZones : [])
    .filter((zone) => INJURY_ZONE_KEYS.includes(zone));
  return {
    hypertension: structured.hypertension === true
      || /(hipertension|presion (arterial )?alta|tension alta|\bhta\b|hipertenso)/.test(text),
    osteoarthritis: structured.osteoarthritis === true
      || /(artrosis|osteoartritis|artritis)/.test(text),
    diabetes: structured.diabetes === true
      || /(diabetes|diabetic|glucemia alta|azucar alta|\bdm2?\b)/.test(text)
      || profile.goal === 'glycemic_control',
    osteoporosis: structured.osteoporosis === true
      || /(osteoporosis|osteopenia)/.test(text),
    cardiometabolic: screening.knownCardiometabolicDisease === true,
    injuries: [...new Set([...structuredInjuries, ...lexicalInjuries])],
    older: Number.isFinite(age) && age >= 60,
  };
}

const SPECIFIC_BY_FOCUS = {
  push: { mobility: 'Movilidad de hombro y columna torácica (círculos, pared, rotaciones).', activation: 'Activación de manguito rotador y escápulas con banda (2×12 suaves).' },
  pull: { mobility: 'Movilidad de hombro y torácica + apertura de pecho.', activation: 'Retracciones escapulares y remo ligero con banda (2×12).' },
  upper: { mobility: 'Movilidad de hombro, torácica y muñecas.', activation: 'Manguito rotador + escápulas con banda (2×12).' },
  lower: { mobility: 'Movilidad de cadera y tobillo (sentadilla profunda asistida, zancada con rotación).', activation: 'Glúteo medio (monster walk o puente) + core (plancha breve).' },
  lower_conditioning: { mobility: 'Movilidad de cadera y tobillo.', activation: 'Glúteos y core antes de cargar (puente + plancha).' },
  full_body: { mobility: 'Cadena completa: tobillo, cadera, torácica y hombro.', activation: 'Glúteos + escápulas con banda y core breve.' },
  general_resistance: { mobility: 'Cadena completa: tobillo, cadera, torácica y hombro.', activation: 'Glúteos + escápulas con banda y core breve.' },
  general_mixed: { mobility: 'Cadena completa con énfasis en cadera y hombro.', activation: 'Activación global suave: glúteos, core y escápulas.' },
  cardio_easy: { mobility: 'Tobillos, caderas e isquios en dinámico.', activation: 'Empieza los primeros minutos del rodaje claramente más lento.' },
  cardio_long: { mobility: 'Tobillos, caderas e isquios en dinámico.', activation: 'Primeros 10 minutos de la tirada en ritmo muy cómodo.' },
  cardio_tempo: { mobility: 'Movilidad dinámica de cadera y tobillo.', activation: 'Progresivos: 3-4 rectas de 60-80 m subiendo ritmo, con pausa.' },
  cardio_intervals: { mobility: 'Movilidad dinámica de cadera y tobillo.', activation: 'Drills (A-skip, talones) + 4 progresivos de 80 m antes de la primera serie.' },
  cardio_drills: { mobility: 'Movilidad dinámica completa de cadera/tobillo.', activation: 'Técnica en seco: postura, cadencia y pisada antes de los drills.' },
};

/**
 * Calentamiento dinámico. Mantiene el shape { step, durationMinutes, details } que
 * consumen studio-data y la UI.
 */
export function buildWarmupProtocol({ sessionType, modality, sessionFocus = null, profile = null } = {}) {
  const c = detectComorbidities(profile || {});
  const steps = [];

  // --- 1. GENERAL: termorregulación / activación cardiovascular progresiva ---
  let generalMin = 4;
  const generalNotes = [];
  let generalDetail = c.osteoarthritis
    ? 'Caminar rápido o bici suave SIN impacto (nada de saltos): el objetivo es subir temperatura, no fatigar.'
    : 'Caminar rápido, bici suave o saltos de bajo impacto hasta sudor ligero.';
  if (c.hypertension || c.cardiometabolic) {
    generalMin = 8;
    generalNotes.push('Sube pulsaciones MUY progresivamente, sin cambios bruscos de intensidad.');
  }
  if (c.older || c.osteoarthritis) generalMin = Math.max(generalMin, 6);
  steps.push({
    step: 'Calentamiento general (termorregulación)',
    durationMinutes: generalMin,
    details: [generalDetail, ...generalNotes].join(' '),
  });

  // --- 2. ESPECÍFICO: movilidad + activación biomecánica de la sesión de hoy ---
  const spec = SPECIFIC_BY_FOCUS[sessionFocus] || SPECIFIC_BY_FOCUS[
    sessionType === 'aerobic' ? 'cardio_easy' : (sessionType === 'mixed' ? 'general_mixed' : 'general_resistance')
  ];
  if (spec) {
    let mobility = spec.mobility;
    if (c.osteoarthritis) mobility += ' Con artrosis: rango SIN dolor, movimientos lentos y sin rebotes; dedica más tiempo a las articulaciones implicadas.';
    if (c.osteoporosis) mobility += ' Evita flexiones repetidas y rotaciones bruscas de columna; trabaja con la espalda en posición neutra.';
    steps.push({ step: 'Movilidad específica', durationMinutes: c.osteoarthritis ? 6 : 4, details: mobility });
    steps.push({ step: 'Activación biomecánica', durationMinutes: 3, details: spec.activation });
  }

  // Lesiones previas: activación dirigida de la zona ANTES de cargar.
  for (const zone of c.injuries.slice(0, 2)) {
    steps.push({
      step: `Cuidado de tu zona sensible: ${zone}`,
      durationMinutes: 2,
      details: `Activa la musculatura que protege tu ${zone} con trabajo suave y controlado antes de cargar; si aparece dolor (no molestia), no fuerces y adapta el ejercicio.`,
    });
  }

  // --- Series de aproximación (fuerza) ---
  if (sessionType === 'resistance' || sessionType === 'mixed') {
    steps.push({
      step: 'Series de aproximación',
      durationMinutes: 4,
      details: `2-3 series con carga creciente (≈50% y 70%) antes del primer ejercicio principal.${c.hypertension ? ' Con tensión alta: EXHALA en el esfuerzo, nunca aguantes la respiración (Valsalva).' : ''}`,
    });
  }

  if (modality === TrainingModality.YOGA || modality === TrainingModality.PILATES) {
    steps.push({ step: 'Respiración diafragmática', durationMinutes: 3, details: 'Inhala 4s, exhala 6s para mejorar control neuromotor.' });
  }

  return steps;
}

/** Vuelta a la calma dinámica (fase de retorno). */
export function buildCooldownProtocol({ sessionType, profile = null } = {}) {
  const c = detectComorbidities(profile || {});
  const steps = [];

  const returnMin = (c.hypertension || c.cardiometabolic) ? 7 : 4;
  steps.push({
    step: 'Vuelta a la calma (retorno gradual)',
    durationMinutes: returnMin,
    details: (c.hypertension || c.cardiometabolic)
      ? 'NUNCA pares en seco: camina o pedalea suave bajando ritmo poco a poco hasta respirar cómodo. Parar de golpe tras el esfuerzo puede provocar bajadas bruscas de tensión (mareo).'
      : 'Reduce pulso progresivamente (caminar/pedalear suave) hasta conversación cómoda.',
  });

  let stretchDetail = '10-30s por grupo muscular trabajado hoy, sin rebotes ni dolor.';
  if (c.hypertension) stretchDetail += ' Evita posiciones con la cabeza por debajo del corazón.';
  if (c.osteoporosis) stretchDetail += ' Sin flexiones profundas de columna: estira con la espalda neutra.';
  steps.push({ step: 'Estiramientos suaves', durationMinutes: 6, details: stretchDetail });

  if (sessionType === 'aerobic' || sessionType === 'mixed') {
    steps.push({ step: 'Respiración de recuperación', durationMinutes: 3, details: 'Respiración nasal lenta para acelerar la recuperación autonómica.' });
  }

  if (c.diabetes) {
    steps.push({
      step: 'Tras la sesión (recordatorio)',
      durationMinutes: null,
      details: 'Revisa tus pies (rozaduras/ampollas) y ten a mano carbohidrato rápido: el efecto del ejercicio sobre la glucosa puede notarse horas después. Esto es educativo, no sustituye a tu médico.',
    });
  }

  return steps;
}
