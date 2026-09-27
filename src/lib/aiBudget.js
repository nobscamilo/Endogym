// Freno de gasto de IA: presupuesto DIARIO por usuario y presupuesto diario GLOBAL.
//
// Por qué no basta con el rate limit que ya existe: cuenta LLAMADAS, no dinero. Veinte
// preguntas por hora son 480 al día si alguien insiste, y una llamada del plan semanal
// cuesta nueve veces una del chat (34.000 tokens de entrada frente a 2.400). Contar
// llamadas trata igual dos cosas que no cuestan igual.
//
// Dos frenos, con propósitos distintos:
//   - Por usuario: que una sola persona (o un script con su token) no multiplique la
//     factura. El tope por defecto, $0,50/día, es ~100 veces el uso normal ($0,005/día):
//     no lo va a tocar nadie usando la app de verdad.
//   - Global: techo duro de todo el sistema. Protege de lo que no se puede prever —un bug
//     que llame en bucle, un pico de altas, un abuso repartido entre muchas cuentas—.
//
// DEGRADACIÓN, no caída: agotado el presupuesto, los flujos con heurístico (plan semanal,
// análisis) lo usan y el usuario sigue teniendo su plan; el chat, que no tiene alternativa,
// responde con un aviso honesto. Nada de esto afecta a las red flags: se resuelven antes,
// sin IA, y siguen funcionando aunque el presupuesto esté a cero.
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminServices } from './firebaseAdmin.js';
import { logError, logInfo } from './logger.js';

// Precios por 1M tokens (Gemini Developer API, tier de pago). El modelo cambió el 27-sep-2026
// (gemini-2.5-flash → gemini-3.8-flash) y 3.x Flash tiene precio promocional hasta fin de 2026,
// así que el precio depende del DÍA del gasto. Fuente: ai.google.dev/gemini-api/docs/pricing
// (consultado 27-sep-2026). Si se vuelve a 2.5 por variable de entorno, esto SOBREESTIMA (el
// freno salta antes, nunca después). Mismos tramos que scripts/ai_cost_report.mjs.
export const TOKEN_PRICE_PERIODS = [
  { from: '0000-00-00', model: 'gemini-2.5-flash', in: 0.30 / 1e6, out: 2.50 / 1e6, cached: 0.075 / 1e6 },
  { from: '2026-09-28', model: 'gemini-3.8-flash (promo)', in: 0.75 / 1e6, out: 3.75 / 1e6, cached: 0.075 / 1e6 },
  { from: '2027-01-01', model: 'gemini-3.8-flash', in: 1.50 / 1e6, out: 7.50 / 1e6, cached: 0.15 / 1e6 },
];

export function tokenPricesFor(dayKey = new Date().toISOString().slice(0, 10)) {
  const key = String(dayKey || '').slice(0, 10);
  let chosen = TOKEN_PRICE_PERIODS[0];
  for (const period of TOKEN_PRICE_PERIODS) if (key >= period.from) chosen = period;
  return chosen;
}

// Compatibilidad: precios vigentes HOY.
export const TOKEN_PRICES_USD = tokenPricesFor();

export function estimateCostUsd({ tokensIn = 0, tokensOut = 0, tokensThink = 0, tokensCached = 0 } = {}, dayKey) {
  const P = tokenPricesFor(dayKey);
  const cost = (Number(tokensIn) || 0) * P.in
    + ((Number(tokensOut) || 0) + (Number(tokensThink) || 0)) * P.out
    // Lo cacheado ya viene contado dentro de tokensIn: aquí se aplica su descuento.
    - (Number(tokensCached) || 0) * (P.in - P.cached);
  return cost > 0 ? cost : 0;
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveBudgets() {
  return {
    userDailyUsd: positiveNumber(process.env.AI_USER_DAILY_BUDGET_USD, 0.5),
    globalDailyUsd: positiveNumber(process.env.AI_GLOBAL_DAILY_BUDGET_USD, 10),
  };
}

/** Día civil UTC. Coincide con la clave que ya usa aiMetrics. */
export function budgetDayKey(now = new Date()) {
  return (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()).toISOString().slice(0, 10);
}

// Caché en proceso del gasto GLOBAL. Sin esto, cada llamada de IA añadiría una lectura de
// Firestore para un dato que cambia despacio. La ventana es corta a propósito: es un freno,
// no una contabilidad, y conviene que reaccione rápido cuando algo se desborda.
const GLOBAL_CACHE_MS = 30_000;
let globalCache = { day: null, spentUsd: 0, at: 0 };

export function __resetAiBudgetCache() {
  globalCache = { day: null, spentUsd: 0, at: 0 };
}

function sumMetricsCost(data, dayKey) {
  let total = 0;
  const flat = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'updatedAt') continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      total += estimateCostUsd(value, dayKey);
    } else if (key.includes('.')) {
      // Documentos legacy con claves planas ("coach-chat.tokensIn").
      const [ep, field] = key.split('.');
      flat[ep] = flat[ep] || {};
      flat[ep][field] = Number(value) || 0;
    }
  }
  for (const m of Object.values(flat)) total += estimateCostUsd(m, dayKey);
  return total;
}

async function readGlobalSpend(day, now) {
  if (globalCache.day === day && now - globalCache.at < GLOBAL_CACHE_MS) {
    return globalCache.spentUsd;
  }
  const { db } = await getAdminServices();
  const snap = await db.collection('aiMetrics').doc(day).get();
  const spentUsd = snap.exists ? sumMetricsCost(snap.data(), day) : 0;
  globalCache = { day, spentUsd, at: now };
  return spentUsd;
}

async function readUserSpend(userId, day) {
  const { db } = await getAdminServices();
  const snap = await db.collection('users').doc(userId).collection('aiBudget').doc(day).get();
  return snap.exists ? Number(snap.data()?.spentUsd) || 0 : 0;
}

/**
 * ¿Puede este usuario gastar IA ahora mismo?
 *
 * Devuelve { allowed, reason, spentUsd, limitUsd, scope }. NUNCA lanza: si Firestore falla,
 * permite la llamada — un freno de coste que tumba la app cuando su propia lectura falla es
 * peor que el gasto que evita.
 */
export async function checkAiBudget({ userId, now = new Date() } = {}) {
  const day = budgetDayKey(now);
  const budgets = resolveBudgets();
  try {
    const [globalSpent, userSpent] = await Promise.all([
      readGlobalSpend(day, now.getTime()),
      userId ? readUserSpend(userId, day) : Promise.resolve(0),
    ]);

    if (globalSpent >= budgets.globalDailyUsd) {
      return { allowed: false, reason: 'global_daily_budget', scope: 'global', spentUsd: globalSpent, limitUsd: budgets.globalDailyUsd };
    }
    if (userId && userSpent >= budgets.userDailyUsd) {
      return { allowed: false, reason: 'user_daily_budget', scope: 'user', spentUsd: userSpent, limitUsd: budgets.userDailyUsd };
    }
    return { allowed: true, reason: null, scope: null, spentUsd: userSpent, limitUsd: budgets.userDailyUsd };
  } catch (error) {
    logError('ai_budget_check_failed', error, { userId });
    return { allowed: true, reason: 'check_failed', scope: null, spentUsd: 0, limitUsd: budgets.userDailyUsd };
  }
}

/**
 * Apunta lo gastado por un usuario tras una llamada de IA. Best-effort, como aiMetrics:
 * nunca bloquea ni retrasa la respuesta. El acumulado GLOBAL no se toca aquí — sale de
 * aiMetrics, que ya lo lleva.
 */
export async function recordUserAiSpend(userId, tokens, now = new Date()) {
  const day = budgetDayKey(now);
  const costUsd = estimateCostUsd(tokens, day);
  if (!userId || !(costUsd > 0)) return;
  try {
    const { db } = await getAdminServices();
    const ref = db.collection('users').doc(userId).collection('aiBudget').doc(day);
    await ref.set({
      spentUsd: FieldValue.increment(costUsd),
      calls: FieldValue.increment(1),
      day,
      updatedAt: now.toISOString(),
    }, { merge: true });
    // El acumulado global cacheado se queda corto hasta el siguiente refresco: se le suma
    // lo recién gastado para que el freno no llegue tarde en un pico.
    if (globalCache.day === budgetDayKey(now)) globalCache.spentUsd += costUsd;
  } catch (error) {
    logError('ai_budget_record_failed', error, { userId });
  }
}

/** Log uniforme cuando un freno corta. Sin PII: solo cifras. */
export function logBudgetStop(endpoint, budget, extra = {}) {
  logInfo('ai_budget_exhausted', {
    endpoint,
    scope: budget.scope,
    reason: budget.reason,
    spentUsd: Number(budget.spentUsd?.toFixed?.(4) ?? budget.spentUsd),
    limitUsd: budget.limitUsd,
    ...extra,
  });
}
