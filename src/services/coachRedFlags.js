// Detector DETERMINISTA de señales de alarma (red flags) en el chat del coach — FASE 0.2.
//
// Léxico, en español, sin IA: si el mensaje del usuario describe síntomas de alarma
// durante/tras el ejercicio, la ruta NO llama a Gemini y responde con un texto fijo
// que recomienda parar y buscar valoración médica.
//
// Decisión documentada sobre falsos positivos (caso "me duele el pecho de las agujetas
// de press banca"): el dolor torácico SOLO se suprime si el mensaje contiene contexto
// muscular explícito (agujetas/pectoral/press...) Y NO contiene ningún modificador de
// alarma (opresión, mareo, falta de aire, sudor frío, brazo/mandíbula...). Ante la duda
// (p. ej. "dolor en el pecho" sin más), se dispara: comportamiento conservador.

const ACCENT_RE = /[\u0300-\u036f]/g;

export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENT_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Modificadores que convierten cualquier mención torácica en alarma inmediata.
const CHEST_ALARM_MODIFIERS = [
  'opresion', 'oprime', 'aprieta', 'presion en el pecho', 'peso en el pecho',
  'mareo', 'mareado', 'mareada', 'sudor frio', 'nausea',
  'falta de aire', 'no puedo respirar', 'me ahogo', 'ahogo',
  'brazo izquierdo', 'mandibula', 'irradia',
];

// Contexto muscular benigno que puede explicar dolor "de pecho" tras entrenar.
const CHEST_MUSCULAR_CONTEXT = [
  'agujetas', 'pectoral', 'pectorales', 'press banca', 'press de banca',
  'aperturas', 'fondos', 'flexiones', 'muscular', 'contractura',
];

const CHEST_PAIN_RE = /(dolor|duele|dolia|molestia|pinchazo|punzada)[^.]{0,40}(pecho|torax|toracic)|((pecho|torax)[^.]{0,30}(dolor|duele|opresion|aprieta))/;

const RULES = [
  {
    category: 'sincope',
    test: (t) => /(sincope|desmay|perdi el conocimiento|perdida de conocimiento|me desvaneci|desvanecimiento|perdi el sentido)/.test(t),
  },
  {
    category: 'disnea',
    test: (t) => /(disnea|no puedo respirar|me ahogo|ahogo|falta de aire|sin aire|me falta el aire)/.test(t)
      && /(entren|ejercicio|correr|corriendo|carrera|serie|sesion|gym|gimnasio|esfuerzo|subir escaleras|reposo|descans)/.test(t),
  },
  {
    category: 'palpitaciones',
    test: (t) => /(palpitacion|taquicardia|corazon (muy )?acelerado|latidos (raros|irregulares|fuertes)|arritmia)/.test(t)
      && /(mareo|maread|desmay|dolor|opresion|sudor frio|vision borrosa|casi me caigo)/.test(t),
  },
  {
    category: 'lesion_aguda',
    test: (t) => /(fractura|se me ha deformado|deformidad|hueso (roto|fuera)|chasquido|crujido)[^.]{0,60}(dolor|hinchaz|no puedo (mover|apoyar))/.test(t)
      || /(no puedo (apoyar|mover) (el|la|mi))[^.]{0,30}(dolor|hinchaz|golpe|caida)/.test(t)
      || /(hinchazon|hinchado)[^.]{0,40}(golpe|caida|torcedura|esguince)[^.]{0,40}(no puedo|dolor (fuerte|intenso|agudo))/.test(t),
  },
  {
    category: 'dolor_toracico',
    test: (t) => {
      const chestAlarm = CHEST_ALARM_MODIFIERS.some((m) => t.includes(m)) && /(pecho|torax|toracic)/.test(t);
      if (chestAlarm) return true;
      if (!CHEST_PAIN_RE.test(t)) return false;
      // Supresión SOLO con contexto muscular explícito y sin modificadores de alarma.
      const muscular = CHEST_MUSCULAR_CONTEXT.some((m) => t.includes(m));
      const alarm = CHEST_ALARM_MODIFIERS.some((m) => t.includes(m));
      return !(muscular && !alarm);
    },
  },
];

/**
 * Devuelve { flagged: boolean, category: string|null }.
 */
export function detectRedFlags(message) {
  const t = normalizeText(message);
  if (!t) return { flagged: false, category: null };
  for (const rule of RULES) {
    if (rule.test(t)) return { flagged: true, category: rule.category };
  }
  return { flagged: false, category: null };
}

// Respuesta fija (sin IA), empática y conservadora. Sin diagnóstico.
export const RED_FLAG_RESPONSE = 'Lo que describes puede ser una señal de alarma y no debo orientarte yo en esto. '
  + 'Detén el ejercicio ahora y no entrenes hasta que te valore un profesional sanitario. '
  + 'Si los síntomas están ocurriendo ahora mismo (dolor u opresión en el pecho, desmayo, mucha dificultad para respirar), '
  + 'busca atención de urgencias o llama al 112. Cuando te hayan valorado, aquí estaré para adaptar tu plan con calma.';
