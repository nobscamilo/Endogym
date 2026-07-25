// Reporte del feedback 👍👎 del coach. Cierra un bucle que estaba abierto: la app guardaba
// un documento por voto en users/{uid}/coachFeedback desde la FASE 3.4 y NADIE lo leía nunca
// — el 👎 solo movía un contador diario en aiMetrics, sin decir qué respuestas fallan.
//
// Agrega por endpoint y por `contextHash` (hash corto del texto de la respuesta), de forma
// que una misma respuesta votada 👎 por varias personas sale arriba.
//
// LÍMITE DE DISEÑO, a propósito: solo se guarda el hash, nunca el texto. Eso significa que
// este reporte te dice CUÁNTO y CUÁNTAS VECES falla algo, pero no QUÉ dijo el coach. Para
// diagnosticar el caso concreto habría que persistir el par pregunta/respuesta de los votos
// negativos, y eso es una decisión de privacidad (y de consentimiento), no técnica: son
// datos de salud escritos por la persona usuaria. Hoy la decisión tomada es no guardarlos.
//
// Uso: node --env-file=.env.local scripts/coach_feedback_report.mjs [desde=YYYY-MM-DD]
import { getAdminServices } from '../src/lib/firebaseAdmin.js';

const from = process.argv[2] || '2026-06-01';

const { db } = await getAdminServices();
// collectionGroup: recorre users/{uid}/coachFeedback de todos los usuarios sin índice
// compuesto (consulta sin filtros ni orden).
const snap = await db.collectionGroup('coachFeedback').get();

const votes = snap.docs
  .map((d) => d.data())
  .filter((v) => String(v?.createdAt || '') >= from);

if (!votes.length) {
  console.log(`Sin votos desde ${from}. (Total de documentos leídos: ${snap.size}.)`);
  process.exit(0);
}

const byEndpoint = {};
const byHash = {};
for (const v of votes) {
  const ep = v.endpoint || 'desconocido';
  const rating = v.rating === 'up' ? 'up' : 'down';
  byEndpoint[ep] = byEndpoint[ep] || { up: 0, down: 0 };
  byEndpoint[ep][rating] += 1;
  if (rating === 'down' && v.contextHash) {
    const key = `${ep}:${v.contextHash}`;
    byHash[key] = byHash[key] || { ep, hash: v.contextHash, down: 0, last: '' };
    byHash[key].down += 1;
    if (String(v.createdAt || '') > byHash[key].last) byHash[key].last = String(v.createdAt || '').slice(0, 10);
  }
}

console.log(`\n=== Feedback del coach (desde ${from}) · ${votes.length} votos ===\n`);
for (const [ep, r] of Object.entries(byEndpoint).sort((a, b) => (b[1].up + b[1].down) - (a[1].up + a[1].down))) {
  const total = r.up + r.down;
  const rate = total ? ((r.down / total) * 100).toFixed(0) : '0';
  console.log(`${ep.padEnd(20)} 👍 ${String(r.up).padStart(4)}   👎 ${String(r.down).padStart(4)}   (${rate}% negativos de ${total})`);
}

const repeated = Object.values(byHash).filter((h) => h.down > 1).sort((a, b) => b.down - a.down);
if (repeated.length) {
  console.log('\n=== Respuestas con MÁS DE UN voto negativo ===');
  console.log('(mismo contextHash = misma respuesta; suele señalar un patrón, no una opinión suelta)\n');
  for (const h of repeated.slice(0, 20)) {
    console.log(`  ${h.ep.padEnd(18)} hash ${h.hash.padEnd(10)} 👎 ${h.down}   último ${h.last}`);
  }
} else {
  console.log('\nNingún contextHash acumula más de un voto negativo: los 👎 están repartidos.');
}

console.log('\nEl contenido de las respuestas NO se guarda (solo el hash), así que este reporte');
console.log('localiza el patrón pero no permite leer el caso. Ver la cabecera del script.');
process.exit(0);
