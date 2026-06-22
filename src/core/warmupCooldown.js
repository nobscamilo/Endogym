// Calentamiento y vuelta a la calma DINÁMICOS y OBLIGATORIOS.
//
// No se pregunta "¿vas a calentar?": cada sesión ensambla su protocolo cruzando el
// tipo/foco del día + los EJERCICIOS reales seleccionados con las comorbilidades del
// perfil (hipertensión y su control, artrosis, diabetes, osteoporosis, asma/broncoespasmo,
// embarazo/postparto, lesiones previas) y la edad. Tres bloques:
//   1. Calentamiento GENERAL  — termorregulación / activación cardiovascular gradual.
//   2. Calentamiento ESPECÍFICO — movilidad + activación biomecánica de lo que toca hoy.
//   3. VUELTA A LA CALMA — retorno gradual + estiramientos de los grupos trabajados.
// Determinista, sin IA. Educativo: las notas adaptan, nunca diagnostican.
//
// Precisión por GRUPO/PATRÓN: los músculos reales del día se derivan de `exercise.category`
// (el catálogo runtime no expone primaryMuscles), reusando un mapeo a grupos legibles.
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

// Región corporal de cada zona lesionada, para priorizar la activación dirigida según
// lo que se entrena hoy (si hoy es pierna, primero rodilla/cadera/lumbar/tobillo).
const ZONE_REGION = {
  lumbar: 'lower', cadera: 'lower', rodilla: 'lower', tobillo: 'lower',
  hombro: 'upper', cervical: 'upper', muñeca: 'upper',
};

// Activación dirigida CONCRETA por zona sensible (en vez de una sola frase genérica).
const ZONE_PREP = {
  lumbar: 'bird-dog y puente de glúteo suaves + bracing del core, sin cargar la zona todavía',
  rodilla: 'sentadilla parcial sin dolor + activación de cuádriceps y glúteo medio (monster walk)',
  hombro: 'rotaciones de manguito con banda ligera + control escapular antes de empujar/tirar',
  tobillo: 'movilidad de tobillo (rodilla a la pared) + elevaciones de talón controladas',
  cadera: 'movilidad de cadera (90/90, zancada con rotación) + activación de glúteo',
  cervical: 'movilidad cervical suave en rango sin dolor + retracción y descenso escapular',
  muñeca: 'movilidad de muñeca y antebrazo + apoyos progresivos antes de cargar peso',
};

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
  const hypertension = structured.hypertension === true
    || /(hipertension|presion (arterial )?alta|tension alta|\bhta\b|hipertenso)/.test(text);
  return {
    hypertension,
    // Gravedad: si está marcada como controlada, la nota se suaviza (la duración se mantiene
    // por seguridad). Sin dato explícito, se asume NO controlada (conservador).
    hypertensionControlled: hypertension && (structured.hypertensionControlled === true
      || /(hipertension|tension|hta)[^.]{0,30}(controlada|tratada|estable)/.test(text)),
    osteoarthritis: structured.osteoarthritis === true
      || /(artrosis|osteoartritis|artritis)/.test(text),
    diabetes: structured.diabetes === true
      || /(diabetes|diabetic|glucemia alta|azucar alta|\bdm2?\b)/.test(text)
      || profile.goal === 'glycemic_control',
    osteoporosis: structured.osteoporosis === true
      || /(osteoporosis|osteopenia)/.test(text),
    asthma: structured.asthma === true
      || /(asma|broncoespasmo|bronquitis|\bepoc\b|asmatic)/.test(text),
    pregnant: structured.pregnant === true
      || /(embaraz|gestaci|postparto|posparto|puerperio)/.test(text),
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
  mindbody: { mobility: 'Movilidad articular suave de columna, cadera y hombro con respiración.', activation: 'Control lumbo-pélvico y activación del core profundo (transverso) sin tensión.' },
  recovery: { mobility: 'Movilidad articular muy suave de cuerpo completo, sin buscar rango máximo.', activation: 'Activación ligera de glúteo y core para despertar la musculatura, sin fatigar.' },
  cardio_easy: { mobility: 'Tobillos, caderas e isquios en dinámico.', activation: 'Empieza los primeros minutos del rodaje claramente más lento.' },
  cardio_long: { mobility: 'Tobillos, caderas e isquios en dinámico.', activation: 'Primeros 10 minutos de la tirada en ritmo muy cómodo.' },
  cardio_tempo: { mobility: 'Movilidad dinámica de cadera y tobillo.', activation: 'Progresivos: 3-4 rectas de 60-80 m subiendo ritmo, con pausa.' },
  cardio_intervals: { mobility: 'Movilidad dinámica de cadera y tobillo.', activation: 'Drills (A-skip, talones) + 4 progresivos de 80 m antes de la primera serie.' },
  cardio_drills: { mobility: 'Movilidad dinámica completa de cadera/tobillo.', activation: 'Técnica en seco: postura, cadencia y pisada antes de los drills.' },
};

// `category` (catálogo runtime) → grupo muscular legible para nombrar lo trabajado en el
// enfriamiento. El catálogo no expone primaryMuscles, así que la category es la fuente fiable.
const CATEGORY_GROUP = {
  lower_body_strength: 'cuádriceps y glúteos',
  lower_body_unilateral: 'cuádriceps y glúteos',
  lower_body_accessory: 'piernas',
  posterior_chain: 'isquiosurales, glúteos y lumbar',
  upper_push: 'pecho, hombros y tríceps',
  upper_pull: 'espalda y bíceps',
  core: 'core',
  core_mobility: 'core',
  conditioning: 'cuerpo completo',
  mobility: 'movilidad general',
  mobility_strength: 'movilidad general',
  neuromotor: 'control y equilibrio',
  cardio_base: 'piernas (cadena de carrera)',
  cardio_threshold: 'piernas (cadena de carrera)',
  cardio_interval: 'piernas (cadena de carrera)',
  cardio_skill: 'piernas (cadena de carrera)',
};

// `category` → preparación específica concreta para el calentamiento (patrón de movimiento).
const CATEGORY_PREP = {
  lower_body_strength: 'glúteo medio, tobillo y patrón de sentadilla',
  lower_body_unilateral: 'glúteo medio y estabilidad sobre una pierna',
  lower_body_accessory: 'glúteo y cadena de pierna',
  posterior_chain: 'bisagra de cadera con isquios y glúteo',
  upper_push: 'manguito rotador y escápulas (empuje)',
  upper_pull: 'activación escapular y dorsal (tracción)',
  core: 'core anti-extensión breve',
};

function categoriesOf(exercises) {
  return (Array.isArray(exercises) ? exercises : [])
    .map((e) => String(e?.category || '').trim())
    .filter(Boolean);
}

/** Grupos musculares reales trabajados hoy (legibles, deduplicados, en orden). */
export function deriveWorkedGroups(exercises) {
  const out = [];
  for (const cat of categoriesOf(exercises)) {
    const label = CATEGORY_GROUP[cat];
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** Líneas de preparación específica para el calentamiento, según patrones presentes hoy. */
function derivePrepLines(exercises) {
  const out = [];
  for (const cat of categoriesOf(exercises)) {
    const prep = CATEGORY_PREP[cat];
    if (prep && !out.includes(prep)) out.push(prep);
  }
  return out;
}

/**
 * Calentamiento dinámico. Mantiene el shape { step, durationMinutes, details } que
 * consumen studio-data y la UI.
 *
 * @param {object} args
 * @param {string} args.sessionType
 * @param {string} [args.modality]
 * @param {string} [args.sessionFocus]
 * @param {object} [args.profile]
 * @param {Array}  [args.exercises]  ejercicios reales del día (para músculos/patrón reales)
 * @param {object} [args.adaptive]   { gentle } — día con menos recuperación (fatiga/reentrada/enfermedad)
 */
export function buildWarmupProtocol({ sessionType, modality, sessionFocus = null, profile = null, exercises = [], adaptive = null } = {}) {
  const c = detectComorbidities(profile || {});
  const gentle = adaptive?.gentle === true;
  const steps = [];

  // --- 1. GENERAL: termorregulación / activación cardiovascular progresiva ---
  let generalMin = 4;
  const generalNotes = [];
  const generalDetail = c.osteoarthritis
    ? 'Caminar rápido o bici suave SIN impacto (nada de saltos): el objetivo es subir temperatura, no fatigar.'
    : 'Caminar rápido, bici suave o saltos de bajo impacto hasta sudor ligero.';
  if (c.hypertension || c.cardiometabolic) {
    generalMin = 8;
    generalNotes.push(c.hypertensionControlled
      ? 'Aun con la tensión controlada, sube pulsaciones progresivamente, sin cambios bruscos.'
      : 'Sube pulsaciones MUY progresivamente, sin cambios bruscos de intensidad.');
  }
  if (c.asthma) {
    generalMin = Math.max(generalMin, 10);
    generalNotes.push('Asma/broncoespasmo: calentamiento prolongado y MUY progresivo (el periodo refractario reduce el broncoespasmo de esfuerzo); ten tu inhalador de rescate a mano y evita arrancar en frío intenso.');
  }
  if (c.older || c.osteoarthritis) generalMin = Math.max(generalMin, 6);
  if (gentle) {
    generalMin = Math.max(generalMin, generalMin + 2);
    generalNotes.push('Hoy vienes con menos recuperación: alarga la entrada en calor y no busques intensidad.');
  }
  steps.push({
    step: 'Calentamiento general (termorregulación)',
    durationMinutes: generalMin,
    details: [generalDetail, ...generalNotes].join(' '),
  });

  // --- 2. ESPECÍFICO: movilidad + activación biomecánica de la sesión de hoy ---
  const spec = SPECIFIC_BY_FOCUS[sessionFocus] || SPECIFIC_BY_FOCUS[
    sessionType === 'aerobic' ? 'cardio_easy'
      : (sessionType === 'mixed' ? 'general_mixed'
        : (sessionType === 'mindbody' ? 'mindbody'
          : (sessionType === 'recovery' ? 'recovery' : 'general_resistance')))
  ];
  if (spec) {
    let mobility = spec.mobility;
    if (c.osteoarthritis) mobility += ' Con artrosis: rango SIN dolor, movimientos lentos y sin rebotes; dedica más tiempo a las articulaciones implicadas.';
    if (c.osteoporosis) mobility += ' Evita flexiones repetidas y rotaciones bruscas de columna; trabaja con la espalda en posición neutra.';
    steps.push({ step: 'Movilidad específica', durationMinutes: c.osteoarthritis ? 6 : 4, details: mobility });

    // Activación: base por foco + preparación CONCRETA de los patrones reales de hoy.
    const prepLines = derivePrepLines(exercises);
    let activation = spec.activation;
    if (prepLines.length) {
      activation = `Prepara lo que harás hoy: ${prepLines.join('; ')}. ${spec.activation}`;
    }
    steps.push({ step: 'Activación biomecánica', durationMinutes: 3, details: activation });
  }

  // Lesiones previas: activación dirigida CONCRETA de la zona ANTES de cargar.
  // Se priorizan las zonas de la región que se entrena hoy; se cubren todas (cap 3 por legibilidad).
  if (c.injuries.length) {
    const region = focusRegion(sessionFocus, sessionType);
    const ordered = [...c.injuries].sort((a, b) => {
      const ra = ZONE_REGION[a] === region ? 0 : 1;
      const rb = ZONE_REGION[b] === region ? 0 : 1;
      return ra - rb;
    });
    for (const zone of ordered.slice(0, 3)) {
      const how = ZONE_PREP[zone] || 'trabajo suave y controlado de la musculatura que la protege';
      steps.push({
        step: `Cuidado de tu zona sensible: ${zone}`,
        durationMinutes: 2,
        details: `Antes de cargar, ${how}. Si aparece dolor (no molestia), no fuerces y adapta el ejercicio.`,
      });
    }
  }

  // --- Series de aproximación (fuerza) ---
  if (sessionType === 'resistance' || sessionType === 'mixed') {
    const cautions = [];
    if (c.hypertension) cautions.push('Con tensión alta: EXHALA en el esfuerzo, nunca aguantes la respiración (Valsalva).');
    if (c.pregnant) cautions.push('Embarazo: evita la maniobra de Valsalva y las apneas; mantén una respiración fluida en cada repetición.');
    steps.push({
      step: 'Series de aproximación',
      durationMinutes: 4,
      details: `2-3 series con carga creciente (≈50% y 70%) antes del primer ejercicio principal.${cautions.length ? ' ' + cautions.join(' ') : ''}`,
    });
  }

  if (modality === TrainingModality.YOGA || modality === TrainingModality.PILATES) {
    steps.push({ step: 'Respiración diafragmática', durationMinutes: 3, details: 'Inhala 4s, exhala 6s para mejorar control neuromotor.' });
  }

  return steps;
}

function focusRegion(sessionFocus, sessionType) {
  if (['lower', 'lower_conditioning'].includes(sessionFocus)) return 'lower';
  if (['push', 'pull', 'upper'].includes(sessionFocus)) return 'upper';
  if (sessionType === 'aerobic') return 'lower';
  return null; // full_body / mixto / desconocido → no prioriza una región
}

/** Vuelta a la calma dinámica (fase de retorno). */
export function buildCooldownProtocol({ sessionType, profile = null, exercises = [], adaptive = null } = {}) {
  const c = detectComorbidities(profile || {});
  const gentle = adaptive?.gentle === true;
  const steps = [];

  const returnMin = (c.hypertension || c.cardiometabolic) ? 7 : 4;
  steps.push({
    step: 'Vuelta a la calma (retorno gradual)',
    durationMinutes: returnMin,
    details: (c.hypertension || c.cardiometabolic)
      ? 'NUNCA pares en seco: camina o pedalea suave bajando ritmo poco a poco hasta respirar cómodo. Parar de golpe tras el esfuerzo puede provocar bajadas bruscas de tensión (mareo).'
      : 'Reduce pulso progresivamente (caminar/pedalear suave) hasta conversación cómoda.',
  });

  // Estiramientos: nombra los grupos REALMENTE trabajados hoy (derivados de los ejercicios).
  const groups = deriveWorkedGroups(exercises);
  let stretchDetail = groups.length
    ? `Estira los grupos que trabajaste hoy — ${groups.join(', ')}: 10-30s cada uno, sin rebotes ni dolor.`
    : '10-30s por grupo muscular trabajado hoy, sin rebotes ni dolor.';
  if (c.hypertension) stretchDetail += ' Evita posiciones con la cabeza por debajo del corazón.';
  if (c.osteoporosis) stretchDetail += ' Sin flexiones profundas de columna: estira con la espalda neutra.';
  if (c.pregnant) stretchDetail += ' Embarazo: evita tumbarte boca arriba de forma prolongada (a partir del 2º trimestre); estira sin forzar (mayor laxitud ligamentosa).';
  steps.push({ step: 'Estiramientos suaves', durationMinutes: 6, details: stretchDetail });

  if (sessionType === 'aerobic' || sessionType === 'mixed' || gentle) {
    steps.push({
      step: 'Respiración de recuperación',
      durationMinutes: 3,
      details: gentle
        ? 'Respiración nasal lenta (exhalación larga) unos minutos: hoy prioriza la recuperación parasimpática sobre el rendimiento.'
        : 'Respiración nasal lenta para acelerar la recuperación autonómica.',
    });
  }

  if (c.asthma) {
    steps.push({
      step: 'Tras la sesión (asma)',
      durationMinutes: null,
      details: 'Si notas tos, pitidos o falta de aire en los minutos posteriores, usa tu inhalador según te haya indicado tu médico. Esto es educativo, no sustituye a tu médico.',
    });
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
