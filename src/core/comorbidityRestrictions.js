// Restricciones de comorbilidad en la SELECCIÓN de ejercicios (no solo avisos).
//
// Determinista y auditable: cada regla activa filtra patrones de ejercicio del pool
// ANTES de la selección, así el planner elige automáticamente un sustituto seguro de
// la MISMA categoría (sin huecos en la sesión). Basado en restricciones ACSM:
//  - Osteoporosis/osteopenia: bloqueo de flexión espinal repetida/cargada y rotación
//    balística (riesgo de fractura vertebral por compresión).
//  - Artrosis: bloqueo de alto impacto (saltos, pliometría, burpees).
//  - Rodilla sensible (lesión declarada): además, dominantes de rodilla de alto estrés
//    (pistol, sissy).
//  - Lumbar sensible: carga axial/cizalla alta (peso muerto convencional, good morning,
//    remo con barra inclinado) y flexión+rotación cargada. El hinge ligero (RDL) se
//    CONSERVA a propósito: retirar toda la bisagra perjudica la cadena posterior.
//  - Hombro sensible: empuje vertical pesado, fondos y remo al mentón.
//  - Hipertensión: DECISIÓN DOCUMENTADA — no se bloquean ejercicios; se gestiona con
//    cap de RPE, aviso anti-Valsalva (calentamiento) y retorno prolongado.
import { detectComorbidities } from './warmupCooldown.js';

const ACCENT_RE = /[̀-ͯ]/g;
function key(exercise) {
  return `${exercise?.id || ''} ${exercise?.name || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENT_RE, '');
}

export const RESTRICTION_RULES = [
  {
    id: 'OSTEOPOROSIS_SPINAL_FLEXION',
    appliesWhen: (c) => c.osteoporosis,
    label: 'Osteoporosis/osteopenia',
    reason: 'Flexión espinal repetida/cargada o rotación balística: riesgo de fractura vertebral por compresión.',
    pattern: /(crunch|sit-?up|situp|toes-to-bar|v-?up|hollow|woodchop|russian|twist|knee-tuck|pike\b|good-?morning|lenador|giro ruso|encogimiento)/,
  },
  {
    id: 'ARTHROSIS_IMPACT',
    appliesWhen: (c) => c.osteoarthritis,
    label: 'Artrosis',
    reason: 'Alto impacto articular: se sustituye por variantes sin salto.',
    pattern: /(jump|salto|burpee|plyo|bound|skater|jack\b|jacks)/,
  },
  {
    id: 'KNEE_SENSITIVE',
    appliesWhen: (c) => c.injuries.includes('rodilla'),
    label: 'Rodilla sensible',
    reason: 'Dominantes de rodilla de alto estrés e impacto: se priorizan variantes controladas.',
    pattern: /(pistol|sissy|jump|salto|burpee|skater)/,
  },
  {
    id: 'LUMBAR_SENSITIVE',
    appliesWhen: (c) => c.injuries.includes('lumbar'),
    label: 'Zona lumbar sensible',
    reason: 'Carga axial/cizalla lumbar alta o flexión+rotación cargada: se sustituye por variantes con columna neutra y soporte.',
    pattern: /(conventional-deadlift|peso muerto convencional|good-?morning|bent-?over|barbell-row|remo con barra|woodchop|russian|twist|toes-to-bar|sit-?up|crunch)/,
  },
  {
    id: 'SHOULDER_SENSITIVE',
    appliesWhen: (c) => c.injuries.includes('hombro'),
    label: 'Hombro sensible',
    reason: 'Empuje vertical pesado, fondos y remo al mentón estresan el espacio subacromial: se priorizan empujes neutros.',
    pattern: /(overhead-press|press militar|military|behind-?neck|upright-?row|remo al menton|\bdips?\b|fondos)/,
  },
];

/** Reglas activas para un perfil (para auditoría y para el filtro). */
export function listActiveRestrictionRules(profile) {
  const c = detectComorbidities(profile || {});
  return RESTRICTION_RULES.filter((rule) => rule.appliesWhen(c));
}

/**
 * Filtra el pool de candidatos. Devuelve { allowed, excluded } donde excluded lleva
 * la regla y el motivo (transparencia/auditoría). Si el filtro vaciara una categoría
 * por completo, la selección simplemente elegirá de las categorías siguientes del
 * foco (comportamiento existente del planner) — nunca se inventa un ejercicio.
 */
export function filterRestrictedExercises(exercises, profile) {
  const active = listActiveRestrictionRules(profile);
  if (!active.length) return { allowed: exercises, excluded: [] };
  const allowed = [];
  const excluded = [];
  for (const exercise of Array.isArray(exercises) ? exercises : []) {
    const k = key(exercise);
    const hit = active.find((rule) => rule.pattern.test(k));
    if (hit) excluded.push({ id: exercise.id, name: exercise.name, ruleId: hit.id, reason: hit.reason });
    else allowed.push(exercise);
  }
  return { allowed, excluded };
}
