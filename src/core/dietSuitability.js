/**
 * Idoneidad de patrones de dieta según el perfil de salud y de entrenamiento.
 *
 * Separa dos cosas que antes iban mezcladas (30-sep-2026):
 *   - PREFERENCIAS de dieta (lo que la persona elige comer): patrón + "carga glucémica baja".
 *   - RESTRICCIONES por salud (lo que impone una condición real): un MÍNIMO que la preferencia
 *     no puede relajar. Consenso = se aplica la más restrictiva de las dos.
 *
 * Motivo: el usuario marcaba "diabetes" para conseguir un menú de IG bajo. Eso contamina el
 * cribado de ejercicio y el contexto del coach con una enfermedad que no tiene.
 *
 * Es un motor DETERMINISTA a propósito: la IA (coach/menú) EXPLICA y aplica este resultado,
 * no decide la idoneidad por su cuenta. Educativo, no diagnóstico.
 *
 * Evidencia de referencia (resumida en los textos de abajo):
 *   - Mediterránea: PREDIMED (NEJM 2018, reanálisis) — menos eventos CV mayores; patrón con
 *     más evidencia en riesgo cardiometabólico. ESC 2021 prevención CV.
 *   - Diabetes: consenso ADA 2019 (Evert et al., Diabetes Care) y Standards of Care: varios
 *     patrones son aceptables (mediterráneo, DASH, vegetariano, bajo en HC). El bajo en HC /
 *     muy bajo reduce HbA1c a corto plazo, pero con insulina/sulfonilureas hay que ajustar
 *     medicación (hipoglucemia) y con iSGLT2 hay riesgo de cetoacidosis euglucémica.
 *   - Keto y rendimiento: Burke et al., J Physiol 2017 (PMID 28012184) — la adaptación LCHF
 *     empeora la economía y el rendimiento a intensidades altas en fondistas.
 *   - Keto y lípidos: sube el LDL en una parte de las personas (sobre todo con grasa saturada).
 */

export const DIET_PATTERNS = Object.freeze([
  'omnivore', 'mediterranean', 'vegetarian', 'vegan', 'paleo', 'keto',
]);

export const DIET_PATTERN_META = Object.freeze({
  omnivore: {
    label: 'Omnívora',
    short: 'Sin exclusiones: de todo, con equilibrio.',
    menuRules: 'Dieta omnívora equilibrada.',
  },
  mediterranean: {
    label: 'Mediterránea',
    short: 'Aceite de oliva, verdura, legumbre, pescado, frutos secos; poca carne roja y ultraprocesado.',
    menuRules: 'Patrón MEDITERRÁNEO: aceite de oliva virgen extra como grasa principal; verdura y fruta a diario; legumbres ≥3 veces/semana; pescado ≥2-3 veces/semana (azul al menos 1); frutos secos a diario; cereales preferentemente integrales; carne roja y procesada como mucho 1 vez/semana; sin bebidas azucaradas.',
  },
  vegetarian: {
    label: 'Vegetariana',
    short: 'Sin carne ni pescado; huevos y lácteos sí.',
    menuRules: 'Dieta ovolactovegetariana: sin carne ni pescado (tampoco caldos ni gelatina de origen animal).',
  },
  vegan: {
    label: 'Vegana',
    short: 'Solo alimentos vegetales.',
    menuRules: 'Dieta vegana: ningún alimento de origen animal (ni lácteos, huevo, miel o gelatina). Combina legumbre + cereal para completar la proteína.',
  },
  paleo: {
    label: 'Paleo',
    short: 'Carne, pescado, huevo, verdura, fruta, tubérculos y frutos secos; sin cereales, legumbres ni lácteos.',
    menuRules: 'Patrón PALEO: sin cereales (tampoco pan, pasta, arroz ni avena), sin legumbres, sin lácteos y sin azúcar añadido ni ultraprocesados. Hidratos a partir de patata, boniato, yuca, plátano, fruta y verdura. Prioriza pescado, aves y huevo sobre carne roja; grasa de aceite de oliva, aguacate y frutos secos.',
  },
  keto: {
    label: 'Cetogénica (keto)',
    short: 'Muy baja en hidratos (≤50 g/día), alta en grasa.',
    menuRules: 'Patrón CETOGÉNICO: hidratos totales del día ≤50 g (sin pan, pasta, arroz, patata, legumbres, fruta dulce ni azúcar); verdura de hoja y crucíferas a diario para la fibra; grasa preferentemente INSATURADA (aceite de oliva, aguacate, frutos secos, pescado azul) y NO basada en embutido, mantequilla o nata; proteína moderada. Agua suficiente.',
  },
});

// Niveles, de mejor a peor.
export const DIET_LEVELS = Object.freeze(['recommended', 'suitable', 'caution', 'not_advised']);
export const DIET_LEVEL_LABELS = Object.freeze({
  recommended: 'Recomendada para ti',
  suitable: 'Adecuada',
  caution: 'Con precaución',
  not_advised: 'No aconsejada para ti',
});
const LEVEL_RANK = { recommended: 0, suitable: 1, caution: 2, not_advised: 3 };

function worse(a, b) {
  return LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a;
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function normalizeDietPattern(value) {
  return DIET_PATTERNS.includes(value) ? value : 'omnivore';
}

/**
 * Señales de salud y de entrenamiento relevantes para la dieta. Solo condiciones que la
 * persona DECLARA (casillas, perfil metabólico o texto libre); no se infiere nada.
 */
export function dietHealthSignals(profile = {}) {
  const c = profile.conditions && typeof profile.conditions === 'object' ? profile.conditions : {};
  const text = norm(profile.medicalConditions);
  const mp = profile.metabolicProfile;
  const diabetes = c.diabetes === true || mp === 'type2_diabetes'
    || /(diabetes|diabetic|\bdm ?[12]?\b)/.test(text);
  const prediabetes = !diabetes && (mp === 'prediabetes' || mp === 'insulin_resistance'
    || /(prediabet|resistencia a la insulina|insulinorresisten)/.test(text));
  const cardiovascular = c.cardiovascular === true
    || /(cardiopat|infarto|coronari|angina|insuficiencia cardiaca|ictus|\bacv\b|stent|bypass)/.test(text);
  const kidneyDisease = c.kidneyDisease === true
    || /(insuficiencia renal|enfermedad renal|\berc\b|nefropat)/.test(text);
  const hypercholesterolemia = c.hypercholesterolemia === true
    || /(colesterol|hipercolesterol|dislipem|hiperlipem)/.test(text);
  const hypertension = c.hypertension === true || /(hipertension|tension alta|\bhta\b)/.test(text);
  const pregnant = c.pregnant === true;
  const raceGoal = profile.runRaceGoal || profile.raceGoal || 'health';
  const modality = profile.trainingModality || '';
  const endurance = profile.goal === 'endurance'
    || (raceGoal && raceGoal !== 'health')
    || modality === 'running' || modality === 'hybrid_run_gym';
  const age = Number(profile.age);
  return {
    diabetes, prediabetes, cardiovascular, kidneyDisease, hypercholesterolemia, hypertension,
    pregnant, endurance, minor: Number.isFinite(age) && age > 0 && age < 18,
  };
}

/** Etiquetas de las condiciones DECLARADAS relevantes para la dieta (sin el texto libre). */
export function declaredConditionLabels(profile = {}) {
  const s = dietHealthSignals(profile);
  const labels = [];
  if (s.diabetes) labels.push('diabetes');
  if (s.prediabetes) labels.push('prediabetes/resistencia a la insulina');
  if (s.cardiovascular) labels.push('enfermedad cardiovascular');
  if (s.kidneyDisease) labels.push('enfermedad renal');
  if (s.hypercholesterolemia) labels.push('colesterol elevado');
  if (s.hypertension) labels.push('hipertensión');
  if (s.pregnant) labels.push('embarazo');
  return labels;
}

/**
 * Restricciones que impone la SALUD (mínimo no negociable). La preferencia puede sumarse
 * (p. ej. IG bajo sin enfermedad) pero no quitarlas.
 */
export function healthDietConstraints(profile = {}) {
  const s = dietHealthSignals(profile);
  const constraints = [];
  let lowGlycemicRequired = false;
  if (s.diabetes || s.prediabetes) {
    lowGlycemicRequired = true;
    constraints.push({
      key: 'glycemic',
      reason: s.diabetes ? 'diabetes' : 'prediabetes/resistencia a la insulina',
      rule: 'Carga glucémica baja-moderada en cada comida: hidratos integrales o de IG bajo, siempre acompañados de proteína, grasa o fibra; nada de bebidas azucaradas ni azúcar/miel/dátiles fuera del entreno. Alrededor de sesiones largas o intensas se permiten hidratos rápidos en cantidad ajustada.',
    });
  }
  if (s.hypercholesterolemia || s.cardiovascular) {
    constraints.push({
      key: 'lipids',
      reason: s.cardiovascular ? 'enfermedad cardiovascular' : 'colesterol elevado',
      rule: 'Grasa saturada <10 % de las kcal (idealmente <7 %): nada de embutido, mantequilla, nata ni carne procesada como base; grasa de aceite de oliva, frutos secos y pescado azul; fibra soluble a diario.',
    });
  }
  if (s.hypertension || s.cardiovascular || s.kidneyDisease) {
    constraints.push({
      key: 'sodium',
      reason: s.kidneyDisease ? 'enfermedad renal' : (s.hypertension ? 'hipertensión' : 'enfermedad cardiovascular'),
      rule: 'Sal <5 g/día: sin precocinados, embutidos ni pastillas de caldo; condimentar con hierbas, especias y limón.',
    });
  }
  if (s.kidneyDisease) {
    constraints.push({
      key: 'kidney',
      reason: 'enfermedad renal',
      rule: 'No superar la proteína del objetivo del día; la cantidad adecuada de proteína, potasio y fósforo debe pautarla su nefrólogo o dietista.',
    });
  }
  return { lowGlycemicRequired, constraints, signals: s };
}

/**
 * Evalúa UN patrón para el perfil. Devuelve { pattern, level, reasons[], risks[] }.
 * reasons = por qué ese nivel; risks = lo que la persona debe saber si lo elige (se muestra
 * y, si el nivel es caution/not_advised, se pide confirmación explícita).
 */
export function assessDietPattern(pattern, profile = {}) {
  const p = normalizeDietPattern(pattern);
  const s = dietHealthSignals(profile);
  const cardiometabolic = s.diabetes || s.prediabetes || s.cardiovascular || s.hypercholesterolemia || s.hypertension;
  let level = 'suitable';
  const reasons = [];
  const risks = [];

  if (p === 'mediterranean') {
    level = 'recommended';
    reasons.push(cardiometabolic
      ? 'Es el patrón con más evidencia para reducir el riesgo cardiovascular y mejorar el control glucémico.'
      : 'Es el patrón con más evidencia en salud a largo plazo y compatible con cualquier entrenamiento.');
  } else if (p === 'omnivore') {
    reasons.push('Equilibrada y sin exclusiones; el menú se ajusta a tus macros.');
  } else if (p === 'vegetarian') {
    reasons.push('Bien planificada es adecuada en cualquier etapa y favorable en riesgo cardiometabólico.');
    risks.push('Vigila hierro y vitamina B12 si tomas pocos huevos o lácteos.');
  } else if (p === 'vegan') {
    reasons.push('Bien planificada es adecuada y favorable en riesgo cardiometabólico.');
    risks.push('Necesitas suplemento de vitamina B12 sí o sí; vigila hierro, calcio, yodo, omega-3 y vitamina D.');
    if (s.pregnant) {
      level = worse(level, 'caution');
      risks.push('En el embarazo exige planificación con un profesional (B12, hierro, yodo, DHA, colina).');
    }
    if (s.minor) level = worse(level, 'caution');
  } else if (p === 'paleo') {
    reasons.push('Prioriza comida real y quita ultraprocesados, pero elimina grupos con beneficio demostrado.');
    risks.push('Sin legumbres ni cereales integrales baja la fibra; sin lácteos, vigila calcio y vitamina D.');
    if (s.hypercholesterolemia || s.cardiovascular) {
      level = worse(level, 'caution');
      risks.push('Si se basa en carne roja y grasa animal puede subir el LDL: prioriza pescado, aves y aceite de oliva.');
    }
    if (s.kidneyDisease) {
      level = worse(level, 'caution');
      risks.push('Tiende a ser alta en proteína, lo que no conviene con enfermedad renal.');
    }
  } else if (p === 'keto') {
    level = 'caution';
    reasons.push('Muy restrictiva: difícil de mantener y sin ventaja clara frente a otras dietas cuando se iguala el déficit calórico.');
    risks.push('Adaptación inicial ("gripe keto"): cansancio, cefalea, estreñimiento, calambres.');
    risks.push('En parte de las personas sube mucho el colesterol LDL.');
    if (s.endurance) {
      risks.push('Empeora el rendimiento en series, umbral y ritmos de carrera: sin glucógeno, la economía de carrera cae a intensidades altas.');
    }
    if (s.diabetes) {
      reasons.push('Con diabetes no es la primera opción: la bajada de HbA1c es a corto plazo y exige ajustar la medicación.');
      risks.push('Con insulina o sulfonilureas hay riesgo de hipoglucemia: solo con ajuste médico de la dosis.');
      risks.push('Con iSGLT2 (empagliflozina, dapagliflozina…) hay riesgo de cetoacidosis euglucémica: no sin consultar a tu médico.');
    }
    if (s.hypercholesterolemia || s.cardiovascular) {
      level = worse(level, 'not_advised');
      reasons.push(s.cardiovascular ? 'Con enfermedad cardiovascular, subir el LDL es un riesgo directo.' : 'Con colesterol alto, puede empeorarlo.');
    }
    if (s.kidneyDisease) {
      level = worse(level, 'not_advised');
      reasons.push('Con enfermedad renal aumenta el riesgo de litiasis y desequilibrios; requiere control especializado.');
    }
    if (s.pregnant) {
      level = worse(level, 'not_advised');
      reasons.push('No se recomienda en el embarazo.');
    }
    if (s.minor) {
      level = worse(level, 'not_advised');
      reasons.push('No se recomienda en menores fuera de indicación médica.');
    }
  }
  return { pattern: p, label: DIET_PATTERN_META[p].label, level, levelLabel: DIET_LEVEL_LABELS[level], reasons, risks };
}

/**
 * Evaluación completa: todos los patrones, el sugerido y el efectivo con su consenso.
 * `requiresAck` = la persona eligió un patrón con precaución/no aconsejado y debe confirmar
 * que ha leído los riesgos.
 */
export function assessDietPreferences(profile = {}) {
  const pref = profile.nutritionPreferences || {};
  const chosen = normalizeDietPattern(pref.dietaryPattern);
  const assessments = DIET_PATTERNS.map((p) => assessDietPattern(p, profile));
  const byPattern = Object.fromEntries(assessments.map((a) => [a.pattern, a]));
  const health = healthDietConstraints(profile);
  // Sugerencia: la mejor por nivel; a igual nivel manda el orden de DIET_PATTERNS
  // (mediterránea queda como "recomendada" siempre; es la de más evidencia).
  const suggested = [...assessments].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])[0];
  const chosenAssessment = byPattern[chosen];
  // El OBJETIVO "controlar glucosa" activa el IG bajo como PREFERENCIA (no bloqueada, no
  // implica enfermedad). Solo una condición declarada lo bloquea.
  const lowGlycemicPreferred = pref.lowGlycemic === true || profile.goal === 'glycemic_control';
  const lowGlycemic = lowGlycemicPreferred || health.lowGlycemicRequired;
  const ack = pref.riskAcknowledgement && typeof pref.riskAcknowledgement === 'object' ? pref.riskAcknowledgement : null;
  const requiresAck = chosenAssessment.level === 'caution' || chosenAssessment.level === 'not_advised';
  const acknowledged = requiresAck && ack?.pattern === chosen && ack?.level === chosenAssessment.level;
  return {
    chosen: chosenAssessment,
    suggested: { pattern: suggested.pattern, label: suggested.label, level: suggested.level, reasons: suggested.reasons },
    assessments,
    lowGlycemic,
    lowGlycemicPreferred,
    lowGlycemicLockedByHealth: health.lowGlycemicRequired,
    healthConstraints: health.constraints,
    requiresAck,
    acknowledged,
  };
}

/**
 * Texto para el prompt del menú (IA): patrón + IG bajo + restricciones de salud. La IA
 * aplica esto; no decide.
 */
export function dietRulesForMenuPrompt(profile = {}) {
  const a = assessDietPreferences(profile);
  const isKeto = a.chosen.pattern === 'keto';
  const sodiumLimited = a.healthConstraints.some((c) => c.key === 'sodium');
  let patternRules = DIET_PATTERN_META[a.chosen.pattern].menuRules;
  // Keto pierde sodio por la diuresis inicial; se repone con sal/caldo SALVO si la salud
  // limita la sal (HTA, renal, CV): ahí manda la restricción de salud (consenso).
  if (isKeto && !sodiumLimited) patternRules += ' Repón sodio (caldo casero, sal al gusto) para evitar la "gripe keto".';
  const lines = [`- Patrón de dieta: ${patternRules}`];
  if (a.lowGlycemic && isKeto) {
    lines.push(`- Carga glucémica BAJA${a.lowGlycemicLockedByHealth ? ' (obligatoria por salud)' : ''}: el patrón cetogénico ya la cumple; glClass 'good' en todas las comidas.`);
  } else if (a.lowGlycemic) {
    lines.push(`- Carga glucémica BAJA${a.lowGlycemicLockedByHealth ? ' (obligatoria por salud)' : ' (preferencia del usuario)'}: base del día con hidratos integrales o de IG bajo (legumbre, avena, pan integral de verdad, arroz basmati/integral enfriado, patata cocida y enfriada, fruta entera), siempre con proteína/grasa/fibra; sin miel, dátiles, zumos, arroz jazmín ni harinas refinadas fuera del entreno. Solo alrededor de sesiones largas o intensas se admiten hidratos rápidos en la cantidad del objetivo. glClass 'high' solo en esas comidas peri-entreno.`);
  }
  for (const c of a.healthConstraints) {
    if (c.key === 'glycemic') continue; // ya cubierto arriba
    lines.push(`- Por ${c.reason}: ${c.rule}`);
  }
  return lines.join('\n');
}

/** Resumen compacto para el contexto del coach (chat). */
export function dietContextForCoach(profile = {}) {
  const a = assessDietPreferences(profile);
  const parts = [
    `Dieta elegida: ${a.chosen.label} (${a.chosen.levelLabel.toLowerCase()} para su perfil).`,
    `Dieta sugerida por su perfil: ${a.suggested.label}.`,
  ];
  if (a.lowGlycemic) parts.push(`Carga glucémica baja: ${a.lowGlycemicLockedByHealth ? 'obligatoria por su salud' : 'preferencia suya, sin enfermedad que la exija'}.`);
  if (a.chosen.risks.length && a.requiresAck) parts.push(`Riesgos de su elección que ya se le mostraron: ${a.chosen.risks.join(' ')}`);
  const notAdvised = a.assessments.filter((x) => x.level === 'not_advised').map((x) => x.label);
  if (notAdvised.length) parts.push(`No aconsejadas para su perfil: ${notAdvised.join(', ')}.`);
  parts.push('Si pregunta qué dieta seguir, usa ESTA evaluación (no inventes otra): sugiere la de mejor nivel y explica por qué con su perfil. Si quiere una "con precaución" o "no aconsejada", respeta su decisión pero explícale los riesgos concretos y cuándo consultar a su médico. Nunca la presentes como tratamiento.');
  return parts.join(' ');
}
