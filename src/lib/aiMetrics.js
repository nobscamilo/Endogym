// FASE 3.6 — Observabilidad de IA: contadores diarios por endpoint, SIN PII.
//
// Documento por día en la colección raíz `aiMetrics` (no cuelga de users/: aquí no
// hay nada personal): { 'coach-chat': { calls, errors, fallbacks, redFlags,
// tokensIn, tokensOut, tokensThink, tokensCached }, ... }.
// SIEMPRE best-effort: la métrica jamás rompe ni retrasa críticamente una respuesta.
//
// BUG corregido (20-jul-2026): set(..., {merge:true}) trata las claves con punto como
// NOMBRES LITERALES (a diferencia de update()) — los docs antiguos quedaron con campos
// planos tipo "coach-analysis.calls" en vez de mapas anidados. Ahora se usa update()
// (que SÍ interpreta el punto como ruta) con fallback a set anidado si el doc no existe.
// Los docs históricos con claves planas se dejan como están (solo lectura histórica).
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminServices } from './firebaseAdmin.js';

const FIELDS = new Set(['calls', 'errors', 'fallbacks', 'redFlags', 'feedbackUp', 'feedbackDown', 'tokensIn', 'tokensOut', 'tokensThink', 'tokensCached']);

export async function recordAiMetric(endpoint, fields = {}) {
  try {
    const ep = String(endpoint || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    if (!ep) return;
    const increments = {};
    for (const [key, value] of Object.entries(fields)) {
      const n = Number(value);
      if (FIELDS.has(key) && Number.isFinite(n) && n > 0) {
        increments[key] = Math.round(n);
      }
    }
    if (!Object.keys(increments).length) return;
    const { db } = await getAdminServices();
    const day = new Date().toISOString().slice(0, 10);
    const ref = db.collection('aiMetrics').doc(day);
    const updates = { updatedAt: new Date().toISOString() };
    for (const [key, n] of Object.entries(increments)) {
      updates[`${ep}.${key}`] = FieldValue.increment(n);
    }
    try {
      // update() interpreta "ep.campo" como RUTA anidada (mapa por endpoint).
      await ref.update(updates);
    } catch {
      // El doc del día aún no existe: créalo con la forma anidada equivalente.
      const nested = { updatedAt: updates.updatedAt, [ep]: {} };
      for (const [key, n] of Object.entries(increments)) nested[ep][key] = FieldValue.increment(n);
      await ref.set(nested, { merge: true });
    }
  } catch { /* best-effort: nunca propagar */ }
}

/** Extrae tokens de la respuesta de la Gemini Developer API si vienen.
    tokensThink (pensamiento) y tokensCached (prefijo cacheado) se facturan distinto:
    visibilidad imprescindible para atribuir costes. */
export function tokensFromGeminiResponse(data) {
  const usage = data?.usageMetadata;
  return {
    tokensIn: Number(usage?.promptTokenCount) || 0,
    tokensOut: Number(usage?.candidatesTokenCount) || 0,
    tokensThink: Number(usage?.thoughtsTokenCount) || 0,
    tokensCached: Number(usage?.cachedContentTokenCount) || 0,
  };
}

/** Suma dos objetos de tokens (para flujos con varias llamadas por operación). */
export function addTokenUsage(a = {}, b = {}) {
  return {
    tokensIn: (Number(a.tokensIn) || 0) + (Number(b.tokensIn) || 0),
    tokensOut: (Number(a.tokensOut) || 0) + (Number(b.tokensOut) || 0),
    tokensThink: (Number(a.tokensThink) || 0) + (Number(b.tokensThink) || 0),
    tokensCached: (Number(a.tokensCached) || 0) + (Number(b.tokensCached) || 0),
  };
}
