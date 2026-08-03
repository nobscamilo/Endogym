// Evals del auditor del PLAN SEMANAL. Hermano de scripts/coach_evals.mjs, pero aquí no se
// evalúa lo que el coach DICE sino lo que el coach HACE: sus `structuredAdjustments` se
// aplican al plan de verdad (applyCoachAdjustments), así que un día o un ejercicio inventado
// no produce un texto raro — produce un ajuste que se pierde en silencio.
//
// La métrica que más importa es la última: cuántos de los ajustes propuestos ACABAN
// APLICÁNDOSE. Si el modelo devuelve 8 y se aplican 0, la capa de IA es decorativa y el
// usuario cree que su plan está personalizado cuando no lo está.
//
// NO va en CI: llama a Gemini y cuesta dinero. Se ejecuta antes y después de tocar el prompt
// del auditor, el esquema o el modelo.
//
// Uso:
//   node --env-file=.env.local scripts/weekly_plan_evals.mjs [uid] [--repeat=3]

import { generateBlockPlan, applyCoachAdjustments, findPlanDayByLabel } from '../src/core/planner.js';
import { buildProgressMemory, buildAdaptiveTuning } from '../src/core/progressMemory.js';
import { callGeminiExerciseCoach } from '../src/services/exerciseCoachClient.js';
import { retrieveGuidelinesContext } from '../src/services/guidelinesRetriever.js';
import { getUserProfile, listWorkoutsSince, listMealsSince, listMetricsSince } from '../src/lib/repositories/firestoreRepository.js';

const uid = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '58aICQYmu7g7IwooVfatiuP2HQ72';
const repeat = Number((process.argv.find((a) => a.startsWith('--repeat=')) || '').split('=')[1]) || 1;

if (!process.env.GEMINI_API_KEY) {
  console.error('Falta GEMINI_API_KEY. Usa: node --env-file=.env.local scripts/weekly_plan_evals.mjs');
  process.exit(1);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const profile = await getUserProfile(uid);
if (!profile) { console.error(`Sin perfil para ${uid}`); process.exit(1); }

const desde = new Date(Date.now() - 120 * 864e5).toISOString();
const [workouts, meals, metrics] = await Promise.all([
  listWorkoutsSince(uid, desde, 400).catch(() => []),
  listMealsSince(uid, desde, 200).catch(() => []),
  listMetricsSince(uid, desde, 200).catch(() => []),
]);
const progressMemory = buildProgressMemory({ workouts, meals, metrics });
const adaptiveTuning = buildAdaptiveTuning({ profile, progressMemory, screening: null });

console.log(`\n=== Evals del auditor del plan semanal · uid ${uid.slice(0, 8)}… · ${repeat} ejecución(es) ===\n`);

const resultados = [];

for (let run = 1; run <= repeat; run += 1) {
  // Plan LIMPIO en cada vuelta: applyCoachAdjustments muta los días, así que reutilizarlo
  // falsearía el conteo de aplicados.
  const plan = generateBlockPlan({ profile, startDate: new Date().toISOString().slice(0, 10), progressMemory, adaptiveTuning });
  const rag = await retrieveGuidelinesContext({ profile, weeklyPlan: plan }).catch(() => '');

  const t0 = Date.now();
  let coach = null;
  let error = null;
  try {
    coach = await callGeminiExerciseCoach({ profile, weeklyPlan: plan, clinicalGuidelinesContext: rag || '' });
  } catch (e) {
    error = `${e.code || e.name}: ${e.message.slice(0, 120)}`;
  }
  const ms = Date.now() - t0;

  if (!coach) {
    console.log(`FALLA run ${run} · ${ms} ms · ${error}`);
    resultados.push({ ok: false, error });
    continue;
  }

  // --- Comprobaciones -----------------------------------------------------
  const fallos = [];
  const diasPlan = plan.days.map((d) => ({ date: d.date, dayName: d.dayName, title: d.workout?.title || '' }));
  const ejerciciosPorDia = new Map(plan.days.map((d) => [d.date, (d.workout?.exercises || []).map((e) => norm(e.name))]));

  // 1. Los días citados existen. Un día inventado hace que el ajuste no se aplique jamás.
  // Se usa el MISMO emparejador que el producto: si el eval matchea distinto que
  // applyCoachAdjustments, mide otra cosa y no sirve de red.
  const diaExiste = (txt) => Boolean(findPlanDayByLabel(plan.days, txt));
  const diasMalos = (coach.prescriptionAdjustments || []).map((a) => a.day).filter((d) => !diaExiste(d));
  if (diasMalos.length) fallos.push(`[dias inventados] ${diasMalos.slice(0, 3).join(' | ')}`);

  // 2. Los ejercicios de los ajustes estructurados existen en ESE día.
  const ejerciciosMalos = [];
  for (const a of coach.structuredAdjustments || []) {
    const dia = findPlanDayByLabel(plan.days, a.day);
    if (!dia) { ejerciciosMalos.push(`${a.day} (día no encontrado)`); continue; }
    const nombres = ejerciciosPorDia.get(dia.date) || [];
    if (!nombres.includes(norm(a.exercise))) ejerciciosMalos.push(`${a.exercise} no está en ${a.day}`);
  }
  if (ejerciciosMalos.length) fallos.push(`[ejercicios inventados] ${ejerciciosMalos.slice(0, 3).join(' | ')}`);

  // 3. Contrato mínimo: sin resumen ni ajustes accionables el informe no sirve.
  if (!coach.coachSummary?.trim()) fallos.push('[contrato] sin coachSummary');
  if (!coach.medicalDisclaimer?.trim()) fallos.push('[contrato] sin medicalDisclaimer');
  if (!(coach.prescriptionAdjustments || []).length) fallos.push('[contrato] sin ajustes accionables');

  // 4. Guardarraíles: el sanitizador acota, pero interesa saber si el MODELO se pasa de rango.
  const fuera = (coach.structuredAdjustments || []).filter((a) => {
    const lp = Number(a.loadPct);
    return Number.isFinite(lp) && (lp < 0.9 || lp > 1.1);
  });
  if (fuera.length) fallos.push(`[fuera de rango] ${fuera.length} ajustes de carga fuera de ±10%`);

  // 5. LA MÉTRICA QUE IMPORTA: cuántos ajustes llegan de verdad al plan.
  const propuestos = (coach.structuredAdjustments || []).length;
  const aplicados = propuestos ? applyCoachAdjustments(plan.days, coach.structuredAdjustments) : 0;
  if (propuestos && aplicados === 0) fallos.push('[inaplicable] propuso ajustes y NINGUNO se aplicó al plan');

  const ok = fallos.length === 0;
  resultados.push({ ok, ms, propuestos, aplicados, textos: (coach.prescriptionAdjustments || []).length, fallos });

  console.log(`${ok ? 'PASA ' : 'FALLA'} run ${run} · ${ms} ms · ${coach.diagnostics?.attempts || 1} intento(s) · `
    + `${(coach.prescriptionAdjustments || []).length} ajustes de texto · ${aplicados}/${propuestos} estructurados aplicados`);
  fallos.forEach((f) => console.log(`        ${f}`));
}

// --- Resumen --------------------------------------------------------------
const okCount = resultados.filter((r) => r.ok).length;
const conDatos = resultados.filter((r) => r.propuestos != null);
const totalProp = conDatos.reduce((a, r) => a + r.propuestos, 0);
const totalApl = conDatos.reduce((a, r) => a + r.aplicados, 0);

console.log('\n=== Resumen ===');
console.log(`ejecuciones limpias : ${okCount}/${resultados.length}`);
if (conDatos.length) {
  const pct = totalProp ? Math.round((totalApl / totalProp) * 100) : 0;
  console.log(`ajustes estructurados: ${totalApl}/${totalProp} aplicados (${pct}%)`);
  console.log(`latencia media       : ${Math.round(conDatos.reduce((a, r) => a + r.ms, 0) / conDatos.length)} ms`);
  if (pct < 50) {
    console.log('\nAVISO: menos de la mitad de los ajustes llegan al plan. El usuario cree que su');
    console.log('bloque está personalizado por la IA y en la práctica apenas se toca.');
  }
}
process.exit(okCount === resultados.length ? 0 : 1);
