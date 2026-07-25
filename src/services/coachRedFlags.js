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

// --- Conducta alimentaria (añadido 25-jul-2026) ---
//
// Ignios es una app de pérdida de peso con registro de comidas: hablar de déficit calórico,
// de bajar kilos o de ayuno intermitente es la conversación NORMAL. Por eso aquí se invierte
// el criterio de las reglas cardiorrespiratorias: allí "ante la duda, dispara" es gratis
// (parar de entrenar no cuesta nada), pero aquí un falso positivo lanza un mensaje sobre la
// relación con la comida a alguien que solo preguntaba cuántas calorías cenar. Eso es
// paternalista, se siente como un juicio y hace que la persona deje de contarle cosas al
// coach — justo lo contrario de lo que buscamos.
//
// Por eso el léxico exige señales ESPECÍFICAS (purga, restricción prolongada, compensación
// explícita de lo comido, autodesprecio ligado a comer) y nunca dispara con vocabulario de
// dieta corriente. Preferimos un falso negativo, que cae en el flujo normal del coach —
// cuya persona ya le prohíbe diagnosticar y le obliga a derivar ante duda clínica — antes
// que un falso positivo.

// Purga: vómito autoinducido (incluido el eufemismo más habitual, "meterse los dedos"),
// laxantes o diuréticos con finalidad de peso.
const ED_PURGE_RE = /vomit\w*[^.]{0,45}(adelgaz|engordar|peso|compensar|para no)|(despues de comer|tras comer|cuando como|despues de cenar|tras cenar)[^.]{0,25}(vomit|me meto los dedos)|(me (hago|provoco)|provocarme)[^.]{0,15}(vomit|el vomito)|me meto los dedos|(laxante|diuretico)\w*[^.]{0,40}(adelgaz|peso|pesar|bascula|compensar|dieta|comer)/;

// Restricción prolongada o intencionadamente severa (no "hoy he comido poco").
//
// Ojo con las dietas de EXCLUSIÓN, que se describen igual: "llevo dos semanas sin comer
// carne" (vegetarianismo), "no como nada de gluten desde el lunes" (celiaquía). Por eso
// "sin comer" y "no como nada" solo cuentan cuando NO les sigue un alimento: o cierran la
// frase, o van con un cuantificador de ausencia total (nada, casi nada, apenas).
const ED_RESTRICTION_PERIOD = '(llevo|voy)[^.]{0,20}(dias|semana)\\w*[^.]{0,25}sin comer';
const ED_RESTRICTION_RE = new RegExp([
  `${ED_RESTRICTION_PERIOD}(?! [a-z])`,              // "llevo 3 días sin comer, ¿entreno?"
  `${ED_RESTRICTION_PERIOD} (casi nada|nada|apenas)`, // "...sin comer casi nada"
  'no como (nada|casi nada)(?! de (?!nada))[^.]{0,25}(dias|semana|desde)',
  'dejar de comer[^.]{0,25}(adelgaz|peso|rapido)',
].join('|'));

// Ejercicio o ayuno como castigo/compensación de lo que se ha comido.
const ED_COMPENSATION_RE = /(he comido de mas|me he pasado comiendo|me pase comiendo|me pase con la (cena|comida)|comi de mas|el atracon|ese atracon)[^.]{0,70}(compensar|compensarlo|quemarlo|quemar todo|doble sesion|entreno el doble|entrenar el doble|castigar|purgar)|(compensar|quemar|castigarme)[^.]{0,35}(lo que (he )?com|el atracon|las calorias de|la cena de ayer)/;

// Saltarse comidas de forma HABITUAL con finalidad de peso o para compensar. Un salto
// puntual ("hoy no me dio tiempo a comer") no cuenta, y el ayuno intermitente es un
// protocolo legítimo que se describe igual: si el mensaje lo menciona, no se dispara.
const ED_INTERMITTENT_FASTING = /(ayuno intermitente|16\/8|18\/6|20\/4|ventana de alimentacion)/;
const ED_SKIPPING_RE = /(me salto|saltarme|salto)[^.]{0,25}(la cena|el desayuno|la comida|comidas)[^.]{0,45}(todos los dias|cada dia|siempre|a diario)|(todos los dias|cada dia|siempre|a diario)[^.]{0,45}(me salto|saltarme|salto)[^.]{0,25}(la cena|el desayuno|la comida|comidas)/;
const ED_SKIPPING_INTENT = /(adelgaz|bajar de peso|perder peso|para bajar|entreno el doble|entrenar el doble|doble sesion|quemar|compensar|no engordar)/;

// Atracones descritos con pérdida de control o culpa (no "me di un atracón de pizza").
const ED_BINGE_RE = /atracon\w*[^.]{0,70}(culpa|culpable|asco|vomit|purg|no puedo parar|descontrol|me odio)|(culpa|culpable|asco|no puedo parar|descontrol)[^.]{0,70}atracon/;

// Autodesprecio explícitamente ligado a comer.
const ED_GUILT_RE = /(me odio|me da asco|asco de mi|no me merezco|no merezco)[^.]{0,35}(comer|comida|comiendo|que como|haber comido)/;

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
  // Va la ÚLTIMA a propósito: si el mensaje describe además un síntoma agudo (desmayo,
  // palpitaciones), gana la regla clínica y la respuesta que manda es la de parar y buscar
  // valoración urgente. Lo agudo primero.
  {
    category: 'conducta_alimentaria',
    test: (t) => ED_PURGE_RE.test(t)
      || ED_RESTRICTION_RE.test(t)
      || ED_COMPENSATION_RE.test(t)
      || ED_BINGE_RE.test(t)
      || ED_GUILT_RE.test(t)
      || (ED_SKIPPING_RE.test(t) && ED_SKIPPING_INTENT.test(t) && !ED_INTERMITTENT_FASTING.test(t)),
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

// La respuesta de "para de entrenar y ve a urgencias" no sirve aquí: ni el problema es
// agudo ni el ejercicio es el asunto. Este texto (1) no diagnostica, (2) se NIEGA
// explícitamente a dar la pauta de restricción o compensación que se le pide —callarse y
// responder igual sería lo dañino—, (3) deriva a quien corresponde, (4) cubre el riesgo
// físico agudo por si lo hay y (5) no juzga ni cierra la puerta. Sin recursos inventados:
// médico de cabecera y 112, que son los que existen con seguridad.
export const EATING_DISORDER_RESPONSE = 'Por lo que cuentas, esto tiene que ver con tu relación con la comida, y ahí no debo orientarte yo: '
  + 'una respuesta mía sobre calorías o sobre cuánto entrenar podría hacerte más daño que bien. '
  + 'No voy a darte pautas para restringir ni para compensar lo que has comido. '
  + 'Cuéntaselo a tu médico de cabecera y pídele valoración: desde ahí pueden derivarte a psicología o a nutrición clínica, '
  + 'que es quien acompaña esto de verdad y sabe hacerlo. '
  + 'Si ahora mismo te encuentras mal físicamente (mareo, desmayo, palpitaciones), busca atención urgente o llama al 112. '
  + 'Esto no es un juicio sobre ti ni cambia nada entre nosotros: cuando quieras, seguimos con tu entrenamiento.';

const RESPONSES_BY_CATEGORY = {
  conducta_alimentaria: EATING_DISORDER_RESPONSE,
};

/** Texto fijo que corresponde a la categoría detectada. */
export function redFlagResponse(category) {
  return RESPONSES_BY_CATEGORY[category] || RED_FLAG_RESPONSE;
}
