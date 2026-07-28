// Reporte de coste de IA por flujo y por día, leído de la colección `aiMetrics`.
// Cierra el bucle de la observabilidad (parte 9, 20-jul-2026): convierte los contadores
// de tokens en un coste estimado en USD, atribuido por endpoint.
//
// Precios gemini-2.5-flash (Developer API, jul-2026; AJUSTAR si cambian):
//   entrada $0.30/M · salida (incluye "pensamiento") $2.50/M · entrada cacheada $0.075/M
// El script tolera docs históricos con claves PLANAS ("endpoint.campo") y docs nuevos con
// mapas anidados; suma ambos.
//
// Además del coste, vigila la SALUD de cada flujo (fallbacks, errores, truncados, votos
// negativos, aprovechamiento de la caché) con umbrales: un flujo puede costar poco justo
// porque se ha roto y está cayendo al heurístico.
//
// Uso: node --env-file=.env.local scripts/ai_cost_report.mjs [desde=YYYY-MM-DD] [hasta=YYYY-MM-DD] [--alert]
//   --alert  sale con código 1 si algún umbral se supera (para tarea programada)
import { getAdminServices } from '../src/lib/firebaseAdmin.js';

const PRICES = { in: 0.30 / 1e6, out: 2.50 / 1e6, cached: 0.075 / 1e6 };
const COUNTERS = ['calls', 'errors', 'fallbacks', 'redFlags', 'truncated', 'feedbackUp', 'feedbackDown',
  'fbTimeout', 'fbHttp', 'fbParse', 'fbInvalid', 'fbNotConfigured', 'fbBudget', 'fbOther',
  'tokensIn', 'tokensOut', 'tokensThink', 'tokensCached'];
// Motivos del fallback, para que el aviso diga QUE hacer y no solo que algo va mal.
const FB_REASONS = { fbTimeout: 'timeout', fbHttp: 'HTTP/cuota', fbParse: 'JSON ilegible', fbInvalid: 'respuesta incompleta', fbNotConfigured: 'sin configurar', fbBudget: 'freno de gasto', fbOther: 'otros' };

// Umbrales de salud. El dinero no es lo único que conviene vigilar: entre junio y julio de
// 2026 el plan semanal cayó al heurístico en más de la mitad de las llamadas durante semanas
// y nadie se enteró — el coach había dejado de ser IA sin que ninguna alerta lo dijera.
// `MIN_SAMPLE` evita que un día con dos llamadas dispare avisos por ruido.
const THRESHOLDS = {
  dailyCostUsd: Number(process.env.AI_COST_DAILY_ALERT_USD) || 1.0,
  fallbackRate: 0.25,   // el flujo dejó de ser IA
  errorRate: 0.10,
  truncatedRate: 0.15,  // el tope de salida se queda corto de forma sistemática
  feedbackDownRate: 0.40,
  minSample: 5,
};

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const alertMode = process.argv.includes('--alert'); // sale con 1 si algo supera el umbral
const from = args[0] || '2026-06-01';
const to = args[1] || new Date().toISOString().slice(0, 10);

const { db } = await getAdminServices();
const snap = await db.collection('aiMetrics').get();
const days = snap.docs
  .map((d) => ({ day: d.id, data: d.data() }))
  .filter((d) => d.day >= from && d.day <= to)
  .sort((a, b) => a.day.localeCompare(b.day));

// Normaliza un doc (mezcla de claves planas "ep.campo" y mapas anidados {ep:{campo}}) a
// { endpoint: { campo: n } }.
function normalize(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'updatedAt') continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Mapa anidado: { calls, tokensIn, ... }
      out[key] = out[key] || {};
      for (const [k, n] of Object.entries(value)) if (COUNTERS.includes(k)) out[key][k] = (out[key][k] || 0) + (Number(n) || 0);
    } else if (key.includes('.')) {
      // Clave plana legacy: "coach-analysis.calls"
      const [ep, k] = key.split('.');
      if (COUNTERS.includes(k)) { out[ep] = out[ep] || {}; out[ep][k] = (out[ep][k] || 0) + (Number(value) || 0); }
    }
  }
  return out;
}

function costOf(m) {
  return (m.tokensIn || 0) * PRICES.in
    + ((m.tokensOut || 0) + (m.tokensThink || 0)) * PRICES.out
    - (m.tokensCached || 0) * (PRICES.in - PRICES.cached); // el cacheado ya cuenta en tokensIn; aquí el descuento
}

const totals = {};
const alerts = [];
console.log(`\n=== Coste de IA por día (${from} → ${to}) ===`);
for (const { day, data } of days) {
  const byEp = normalize(data);
  let dayCost = 0;
  const parts = [];
  for (const [ep, m] of Object.entries(byEp)) {
    const c = costOf(m);
    dayCost += c;
    totals[ep] = totals[ep] || Object.fromEntries([...COUNTERS.map((k) => [k, 0]), ['cost', 0]]);
    for (const k of COUNTERS) totals[ep][k] += m[k] || 0;
    totals[ep].cost += c;
    parts.push(`${ep} $${c.toFixed(4)} (c${m.calls || 0}${m.tokensThink ? ` think${m.tokensThink}` : ''}${m.fallbacks ? ` fb${m.fallbacks}` : ''})`);
  }
  console.log(`${day}  $${dayCost.toFixed(4)}  ·  ${parts.join(' · ') || 'sin datos'}`);
  if (dayCost > THRESHOLDS.dailyCostUsd) {
    alerts.push(`${day}: coste diario $${dayCost.toFixed(4)} supera el umbral de $${THRESHOLDS.dailyCostUsd.toFixed(2)}`);
  }
}

console.log(`\n=== Totales por flujo (${from} → ${to}) ===`);
const rows = Object.entries(totals).sort((a, b) => b[1].cost - a[1].cost);
let grand = 0;
for (const [ep, t] of rows) {
  grand += t.cost;
  console.log(
    ep.padEnd(20),
    `$${t.cost.toFixed(4)}`.padStart(10),
    `| calls ${String(t.calls).padStart(4)}`,
    `| in ${String(t.tokensIn).padStart(8)}`,
    `| out ${String(t.tokensOut).padStart(7)}`,
    `| think ${String(t.tokensThink).padStart(7)}`,
    `| cached ${String(t.tokensCached).padStart(6)}`,
    t.fallbacks ? `| fb ${t.fallbacks}` : '',
  );
}
console.log('-'.repeat(60));
console.log('TOTAL'.padEnd(20), `$${grand.toFixed(4)}`.padStart(10));

// --- Salud por flujo -------------------------------------------------------
// Un flujo puede costar poco y estar roto: si cae al heurístico, el usuario recibe
// "Resumen automático (sin IA)" y el coste baja, así que mirar solo el dinero lo esconde.
console.log(`\n=== Salud por flujo (muestra mínima: ${THRESHOLDS.minSample} llamadas) ===`);
const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(0)}%` : '—');
for (const [ep, t] of rows) {
  const votes = t.feedbackUp + t.feedbackDown;
  console.log(
    ep.padEnd(20),
    `| fallback ${pct(t.fallbacks, t.calls).padStart(4)}`,
    `| error ${pct(t.errors, t.calls).padStart(4)}`,
    `| truncado ${pct(t.truncated, t.calls).padStart(4)}`,
    `| 👎 ${pct(t.feedbackDown, votes).padStart(4)} (${votes} votos)`,
    `| cacheado ${pct(t.tokensCached, t.tokensIn).padStart(4)} de la entrada`,
  );
  if (t.calls < THRESHOLDS.minSample) continue;
  if (t.fallbacks / t.calls > THRESHOLDS.fallbackRate) {
    // El motivo dominante convierte el aviso en una instrucción: un timeout se arregla con
    // presupuesto, un 429 con cuota y una respuesta incompleta tocando el prompt.
    const motivos = Object.entries(FB_REASONS)
      .filter(([k]) => t[k] > 0)
      .sort((a, b) => t[b[0]] - t[a[0]])
      .map(([k, label]) => `${label} ${t[k]}`);
    const detalle = motivos.length ? ` · motivos: ${motivos.join(', ')}` : ' · motivo no registrado (deploy anterior al 26-jul-2026)';
    alerts.push(`${ep}: ${pct(t.fallbacks, t.calls)} de fallback heurístico — el flujo ha dejado de ser IA para esa fracción de usuarios${detalle}`);
  }
  if (t.errors / t.calls > THRESHOLDS.errorRate) {
    alerts.push(`${ep}: ${pct(t.errors, t.calls)} de errores`);
  }
  if (t.truncated / t.calls > THRESHOLDS.truncatedRate) {
    alerts.push(`${ep}: ${pct(t.truncated, t.calls)} de respuestas truncadas — revisa maxOutputTokens, no sigas recortando frases`);
  }
  if (votes >= THRESHOLDS.minSample && t.feedbackDown / votes > THRESHOLDS.feedbackDownRate) {
    alerts.push(`${ep}: ${pct(t.feedbackDown, votes)} de votos negativos (${votes} votos) — mira scripts/coach_feedback_report.mjs`);
  }
}

console.log('\nNota: coste ESTIMADO con precios de gemini-2.5-flash (jul-2026). Contrasta con la factura real de GCP; si el desglose por SKU difiere, ajusta PRICES en este script.');
console.log('"cacheado" es la fracción de tokens de entrada que Gemini sirvió de su caché de prefijo: sube si el bloque estable del prompt (persona, base científica) no cambia entre llamadas.');

if (alerts.length) {
  console.log(`\n=== AVISOS (${alerts.length}) ===`);
  alerts.forEach((a) => console.log(`  ⚠ ${a}`));
} else {
  console.log('\nSin avisos: coste, fallbacks, errores, truncados y feedback dentro de umbrales.');
}

process.exit(alertMode && alerts.length ? 1 : 0);
