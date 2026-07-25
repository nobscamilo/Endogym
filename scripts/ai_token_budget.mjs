// Presupuesto de tokens por flujo: cuánto cuesta UNA llamada de cada flujo de IA y qué
// factura eso al mes según el uso.
//
// Por qué existe: ai_cost_report.mjs mira hacia atrás (lo ya gastado) y depende de que las
// métricas estén bien instrumentadas. Este mira hacia delante: mide el tamaño REAL de los
// prompts con el endpoint countTokens de Gemini y proyecta el coste, para poder decidir
// ANTES de desplegar si un cambio de prompt sale caro.
//
// El prompt se mide con datos reales del usuario que se le pase (por defecto el de
// desarrollo). No genera contenido: countTokens no consume cuota de generación.
//
// Uso: node --env-file=.env.local scripts/ai_token_budget.mjs [uid] [--usuarios=100]

import { buildCoachAnalysisDigest, buildCoachAnalysisPrompt, buildWorkoutAnalysisPrompt, buildWorkoutAnalysisDigest } from '../src/services/coachAnalysis.js';
import { COACH_CHAT_PERSONA, COACH_ANALYST_PERSONA, COACH_AUDITOR_PERSONA, buildCoachChatUserContent } from '../src/services/coachPersona.js';
import { buildExerciseCoachPrompt } from '../src/services/exerciseCoachPrompt.js';
import { retrieveGuidelinesContext } from '../src/services/guidelinesRetriever.js';
import { getUserProfile, getLatestWeeklyPlan, getLastDoneWorkoutAt } from '../src/lib/repositories/firestoreRepository.js';

const PRICES = { in: 0.30 / 1e6, out: 2.50 / 1e6 }; // gemini-2.5-flash, jul-2026
const MODEL = process.env.GEMINI_MODEL_COACH || 'gemini-2.5-flash';

const uid = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '58aICQYmu7g7IwooVfatiuP2HQ72';
const usuarios = Number((process.argv.find((a) => a.startsWith('--usuarios=')) || '').split('=')[1]) || 100;

async function countTokens(text, systemInstruction) {
  // countTokens solo acepta `systemInstruction` dentro de `generateContentRequest`; suelto
  // en la raíz devuelve 400. Así se cuenta lo MISMO que se enviará al generar.
  const body = {
    generateContentRequest: {
      model: `models/${MODEL}`,
      contents: [{ role: 'user', parts: [{ text }] }],
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:countTokens`,
    { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`countTokens HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).totalTokens || 0;
}

const profile = await getUserProfile(uid);
const plan = await getLatestWeeklyPlan(uid);
if (!profile) {
  console.error(`Sin perfil para uid ${uid}. Pasa un uid con datos: node ... ai_token_budget.mjs <uid>`);
  process.exit(1);
}

// Cada entrada: cómo se construye el prompt real y el tope de salida que fija su ruta.
const flows = [];

// --- coach-chat ---
{
  const rag = await retrieveGuidelinesContext({ profile, weeklyPlan: plan || undefined, userQuery: '¿Debo subir peso en press banca?' }).catch(() => '');
  const userContext = '\n\nContexto real del usuario (úsalo para personalizar): '
    + `Objetivo: ${profile.goal || '?'}. Modalidad: ${profile.trainingModality || '?'}. Peso: ${profile.weightKg || '?'} kg.`;
  const text = buildCoachChatUserContent({
    message: '¿Debo subir peso en press banca?',
    userContext,
    guidelinesContext: rag ? `\n\n${String(rag).slice(0, 7000)}` : '',
  });
  flows.push({
    name: 'coach-chat',
    tokensIn: await countTokens(text, COACH_CHAT_PERSONA),
    maxOut: 512,
    porUsuarioMes: 20, // preguntas al mes por usuario activo (ajústalo a tu realidad)
    nota: rag ? `incluye RAG (${String(rag).length} chars)` : 'sin RAG disponible',
  });
}

// --- weekly-plan (el prompt más grande) ---
if (plan) {
  const rag = await retrieveGuidelinesContext({ profile, weeklyPlan: plan }).catch(() => '');
  const text = buildExerciseCoachPrompt({ profile, weeklyPlan: plan, clinicalGuidelinesContext: rag || '' });
  flows.push({
    name: 'weekly-plan',
    tokensIn: await countTokens(text, COACH_AUDITOR_PERSONA),
    maxOut: 3072,
    porUsuarioMes: 1.5, // un bloque cada ~3 semanas + alguna regeneración
    nota: rag ? `incluye RAG (${String(rag).length} chars)` : 'sin RAG',
  });
}

// --- coach-analysis ---
{
  const digest = await buildCoachAnalysisDigest(uid).catch(() => null);
  if (digest?.done?.length) {
    flows.push({
      name: 'coach-analysis',
      tokensIn: await countTokens(buildCoachAnalysisPrompt(digest), COACH_ANALYST_PERSONA),
      maxOut: 2500,
      porUsuarioMes: 4,
      nota: `${digest.done.length} entrenos en la ventana`,
    });

    const lastId = await getLastDoneWorkoutAt(uid).then(() => digest.last?.id).catch(() => null);
    if (lastId) {
      const wDigest = await buildWorkoutAnalysisDigest(uid, lastId).catch(() => null);
      if (wDigest) {
        flows.push({
          name: 'workout-analysis',
          tokensIn: await countTokens(buildWorkoutAnalysisPrompt(wDigest), COACH_ANALYST_PERSONA),
          maxOut: 2500,
          porUsuarioMes: 8, // se cachea para siempre: ~1 por sesión registrada
          nota: 'cacheado permanentemente por sesión',
        });
      }
    }
  }
}

console.log(`\n=== Coste por llamada · ${MODEL} · uid ${uid.slice(0, 8)}… ===\n`);
console.log('flujo'.padEnd(18), 'entrada'.padStart(8), 'salida máx'.padStart(11), 'peor caso'.padStart(11), '  nota');
let mensualPorUsuario = 0;
for (const f of flows) {
  // Peor caso: entrada real + la salida agotando su tope. La salida real suele ser menor.
  const peor = f.tokensIn * PRICES.in + f.maxOut * PRICES.out;
  mensualPorUsuario += peor * f.porUsuarioMes;
  console.log(
    f.name.padEnd(18),
    String(f.tokensIn).padStart(8),
    String(f.maxOut).padStart(11),
    `$${peor.toFixed(5)}`.padStart(11),
    ` ${f.nota}`,
  );
}

console.log(`\n=== Proyección (peor caso, con los usos/mes fijados en el script) ===`);
console.log(`por usuario activo y mes: $${mensualPorUsuario.toFixed(4)}`);
console.log(`con ${usuarios} usuarios activos: $${(mensualPorUsuario * usuarios).toFixed(2)}/mes`);
console.log('\nEs el PEOR caso: asume que cada respuesta agota su maxOutputTokens, cosa que casi');
console.log('nunca pasa (el chat gasta ~100-250 de sus 512). Sirve como techo, no como previsión.');
console.log('Los usos/mes por flujo son supuestos escritos en este script: ajústalos a tu realidad.');
process.exit(0);
