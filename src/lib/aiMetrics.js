// FASE 3.6 — Observabilidad de IA: contadores diarios por endpoint, SIN PII.
//
// Documento por día en la colección raíz `aiMetrics` (no cuelga de users/: aquí no
// hay nada personal): { 'coach-chat': { calls, errors, fallbacks, redFlags,
// tokensIn, tokensOut }, ... }. Escritura con FieldValue.increment + merge.
// SIEMPRE best-effort: la métrica jamás rompe ni retrasa críticamente una respuesta.
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminServices } from './firebaseAdmin.js';

const FIELDS = new Set(['calls', 'errors', 'fallbacks', 'redFlags', 'feedbackUp', 'feedbackDown', 'tokensIn', 'tokensOut']);

export async function recordAiMetric(endpoint, fields = {}) {
  try {
    const ep = String(endpoint || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    if (!ep) return;
    const updates = {};
    for (const [key, value] of Object.entries(fields)) {
      const n = Number(value);
      if (FIELDS.has(key) && Number.isFinite(n) && n > 0) {
        updates[`${ep}.${key}`] = FieldValue.increment(Math.round(n));
      }
    }
    if (!Object.keys(updates).length) return;
    const { db } = await getAdminServices();
    const day = new Date().toISOString().slice(0, 10);
    await db.collection('aiMetrics').doc(day).set({ ...updates, updatedAt: new Date().toISOString() }, { merge: true });
  } catch { /* best-effort: nunca propagar */ }
}

/** Extrae tokens de la respuesta de la Gemini Developer API si vienen. */
export function tokensFromGeminiResponse(data) {
  const usage = data?.usageMetadata;
  return {
    tokensIn: Number(usage?.promptTokenCount) || 0,
    tokensOut: Number(usage?.candidatesTokenCount) || 0,
  };
}
