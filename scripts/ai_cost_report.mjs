// Reporte de coste de IA por flujo y por día, leído de la colección `aiMetrics`.
// Cierra el bucle de la observabilidad (parte 9, 20-jul-2026): convierte los contadores
// de tokens en un coste estimado en USD, atribuido por endpoint.
//
// Precios gemini-2.5-flash (Developer API, jul-2026; AJUSTAR si cambian):
//   entrada $0.30/M · salida (incluye "pensamiento") $2.50/M · entrada cacheada $0.075/M
// El script tolera docs históricos con claves PLANAS ("endpoint.campo") y docs nuevos con
// mapas anidados; suma ambos.
//
// Uso: node --env-file=.env.local scripts/ai_cost_report.mjs [desde=YYYY-MM-DD] [hasta=YYYY-MM-DD]
import { getAdminServices } from '../src/lib/firebaseAdmin.js';

const PRICES = { in: 0.30 / 1e6, out: 2.50 / 1e6, cached: 0.075 / 1e6 };
const COUNTERS = ['calls', 'errors', 'fallbacks', 'redFlags', 'feedbackUp', 'feedbackDown', 'tokensIn', 'tokensOut', 'tokensThink', 'tokensCached'];

const from = process.argv[2] || '2026-06-01';
const to = process.argv[3] || new Date().toISOString().slice(0, 10);

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
console.log(`\n=== Coste de IA por día (${from} → ${to}) ===`);
for (const { day, data } of days) {
  const byEp = normalize(data);
  let dayCost = 0;
  const parts = [];
  for (const [ep, m] of Object.entries(byEp)) {
    const c = costOf(m);
    dayCost += c;
    totals[ep] = totals[ep] || { calls: 0, tokensIn: 0, tokensOut: 0, tokensThink: 0, tokensCached: 0, errors: 0, fallbacks: 0, cost: 0 };
    for (const k of ['calls', 'tokensIn', 'tokensOut', 'tokensThink', 'tokensCached', 'errors', 'fallbacks']) totals[ep][k] += m[k] || 0;
    totals[ep].cost += c;
    parts.push(`${ep} $${c.toFixed(4)} (c${m.calls || 0}${m.tokensThink ? ` think${m.tokensThink}` : ''}${m.fallbacks ? ` fb${m.fallbacks}` : ''})`);
  }
  console.log(`${day}  $${dayCost.toFixed(4)}  ·  ${parts.join(' · ') || 'sin datos'}`);
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
console.log('\nNota: coste ESTIMADO con precios de gemini-2.5-flash (jul-2026). Contrasta con la factura real de GCP; si el desglose por SKU difiere, ajusta PRICES en este script.');
process.exit(0);
