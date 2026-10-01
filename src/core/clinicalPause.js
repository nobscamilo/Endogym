/**
 * Síntomas del check-in y PAUSA clínica del plan (auditoría externa #15, 30-sep-2026).
 *
 * Antes: 4 síntomas (falta de aire, dolor articular, mareo, palpitaciones) que solo bajaban el
 * volumen en la siguiente regeneración del plan. Faltaban los que obligan a PARAR (dolor
 * torácico, síncope/presíncope), la hipoglucemia y el dolor que va a más/cojera, y el plan
 * seguía prescribiendo sesiones tras marcarlos.
 *
 * Ahora: los síntomas CRÍTICOS ponen el plan en pausa hasta que la persona declara que ya ha
 * sido valorada (profile.clinicalClearanceAt). Es una salvaguarda educativa, no un diagnóstico.
 * Compartido por servidor y bundle del Studio (una sola lista).
 */

export const CHECKIN_SYMPTOM_DEFS = Object.freeze([
  { key: 'chestPain', label: 'Dolor u opresión en el pecho', severity: 'critical' },
  { key: 'syncope', label: 'Desmayo o casi desmayo', severity: 'critical' },
  { key: 'tachycardia', label: 'Palpitaciones', severity: 'caution' },
  { key: 'dyspnea', label: 'Falta de aire desproporcionada', severity: 'caution' },
  { key: 'dizziness', label: 'Mareo', severity: 'caution' },
  { key: 'hypoglycemia', label: 'Síntomas de hipoglucemia (temblor, sudor frío, confusión)', severity: 'caution' },
  { key: 'worseningPain', label: 'Dolor que va a más o cojera', severity: 'caution' },
  { key: 'jointPain', label: 'Dolor articular', severity: 'caution' },
]);

// Claves de siempre: el endpoint de workouts las exige; las nuevas son opcionales para no romper
// clientes antiguos que solo envían estas 4.
export const LEGACY_SYMPTOM_KEYS = Object.freeze(['dyspnea', 'jointPain', 'dizziness', 'tachycardia']);
export const SYMPTOM_KEYS = Object.freeze(CHECKIN_SYMPTOM_DEFS.map((s) => s.key));
const CRITICAL = new Set(CHECKIN_SYMPTOM_DEFS.filter((s) => s.severity === 'critical').map((s) => s.key));
const LABEL = Object.fromEntries(CHECKIN_SYMPTOM_DEFS.map((s) => [s.key, s.label]));

export function emptySymptoms() {
  return Object.fromEntries(SYMPTOM_KEYS.map((k) => [k, false]));
}

/** Mensaje inmediato al marcar síntomas en el check-in (antes de guardar). */
export function symptomAdvice(symptoms = {}) {
  const on = SYMPTOM_KEYS.filter((k) => symptoms?.[k] === true);
  if (!on.length) return null;
  if (on.some((k) => CRITICAL.has(k))) {
    return {
      level: 'critical',
      text: 'Para de entrenar. Si te está pasando ahora o no se pasa en reposo, llama al 112. '
        + 'El plan quedará en pausa hasta que te valore un médico.',
    };
  }
  if (on.includes('hypoglycemia')) {
    return {
      level: 'caution',
      text: 'Si notas hipoglucemia: para, toma 15-20 g de hidrato rápido y repite a los 15 min si no mejora. '
        + 'Si usas insulina o sulfonilureas, revisa la pauta con tu médico. Se limitará la intensidad.',
    };
  }
  if (on.includes('worseningPain')) {
    return {
      level: 'caution',
      text: 'Con dolor que va a más o cojera, no corras con dolor: descansa y, si dura más de 3-5 días o es intenso, que te valoren. Se limitará la intensidad.',
    };
  }
  return { level: 'caution', text: 'El coach limitará la intensidad y recomendará valoración médica si se repite.' };
}

function dateOf(w) {
  const raw = w?.performedAt || w?.createdAt || null;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * Pausa activa si hay un check-in de los últimos 14 días con un síntoma CRÍTICO posterior a la
 * última valoración declarada. Devuelve null si no hay pausa.
 */
export function buildClinicalPause({ workouts = [], profile = null, now = Date.now(), windowDays = 14 } = {}) {
  const since = now - windowDays * 86400000;
  const cleared = profile?.clinicalClearanceAt ? Date.parse(profile.clinicalClearanceAt) : NaN;
  const hits = (Array.isArray(workouts) ? workouts : [])
    .filter((w) => w?.symptoms && typeof w.symptoms === 'object')
    .map((w) => ({ t: dateOf(w), keys: SYMPTOM_KEYS.filter((k) => CRITICAL.has(k) && w.symptoms[k] === true) }))
    .filter((x) => x.t != null && x.t >= since && x.keys.length && !(Number.isFinite(cleared) && x.t <= cleared))
    .sort((a, b) => b.t - a.t);
  if (!hits.length) return null;
  const symptoms = [...new Set(hits.flatMap((h) => h.keys))].map((k) => LABEL[k]);
  return {
    active: true,
    since: new Date(hits[0].t).toISOString().slice(0, 10),
    symptoms,
    message: `Plan en pausa: el ${new Date(hits[0].t).toISOString().slice(0, 10).split('-').reverse().join('/')} marcaste ${symptoms.join(' y ').toLowerCase()}. `
      + 'No entrenes hasta que te valore un médico. Si ocurre ahora, llama al 112.',
  };
}
