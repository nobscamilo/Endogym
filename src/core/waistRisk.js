// Perímetro abdominal (cintura) y riesgo cardiometabólico. Decisión (usuario, 16 jun 2026):
// ICA primero (índice cintura/altura, robusto y casi independiente de etnia) + banda por cintura
// según sexo, con aviso de etnia. SIN % de grasa (evitamos falsa precisión: estimarlo solo con la
// cintura no es fiable). Es un indicador de riesgo, no un diagnóstico.

const WHTR_NOTE = 'Umbrales de población general; en personas de origen asiático los cortes de cintura son menores (p. ej. hombre ≥90, mujer ≥80 cm). Es un indicador de riesgo, no un diagnóstico.';

export function buildWaistAssessment({ waistCm, heightCm, sex } = {}) {
  const w = Number(waistCm);
  if (!Number.isFinite(w) || w <= 0) return null;

  const out = { waistCm: Math.round(w * 10) / 10, note: WHTR_NOTE };

  // Índice cintura/altura (ICA / WHtR): regla robusta < 0,5.
  const h = Number(heightCm);
  if (Number.isFinite(h) && h > 0) {
    const whtr = w / h;
    out.whtr = Math.round(whtr * 100) / 100;
    out.whtrBand = whtr < 0.5 ? { level: 'ok', label: 'saludable' }
      : whtr < 0.6 ? { level: 'raised', label: 'aumentado' }
        : { level: 'high', label: 'alto' };
  }

  // Banda por cintura según sexo (cortes IDF/NCEP de población general).
  const s = sex === 'female' ? 'female' : sex === 'male' ? 'male' : null;
  if (s) {
    const [raised, high] = s === 'male' ? [94, 102] : [80, 88];
    out.sex = s;
    out.waistBand = w < raised ? { level: 'ok', label: 'saludable' }
      : w < high ? { level: 'raised', label: 'aumentado' }
        : { level: 'high', label: 'alto' };
  }

  // Nivel global = el peor de los disponibles (conservador).
  const order = { ok: 0, raised: 1, high: 2 };
  const levels = [out.whtrBand?.level, out.waistBand?.level].filter(Boolean);
  out.level = levels.length ? levels.reduce((a, b) => (order[b] > order[a] ? b : a)) : null;

  return out;
}

const NAVY_NOTE = 'Estimación por el método U.S. Navy (cinta métrica), con un margen de error de ±3-4% frente a métodos como DEXA. Útil para seguir tu tendencia, no como valor exacto.';

// % grasa OPCIONAL por método Navy (versión métrica, log10). Hombres: cintura+cuello+altura;
// mujeres: además cadera. Devuelve null si faltan medidas o salen valores inválidos.
export function estimateBodyFatNavy({ sex, waistCm, neckCm, heightCm, hipCm } = {}) {
  const waist = Number(waistCm);
  const neck = Number(neckCm);
  const height = Number(heightCm);
  if (![waist, neck, height].every((v) => Number.isFinite(v) && v > 0)) return null;
  const s = sex === 'female' ? 'female' : sex === 'male' ? 'male' : null;
  if (!s) return null;

  let pct;
  if (s === 'male') {
    const d = waist - neck;
    if (d <= 0) return null;
    pct = 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(height)) - 450;
  } else {
    const hip = Number(hipCm);
    if (!Number.isFinite(hip) || hip <= 0) return null;
    const d = waist + hip - neck;
    if (d <= 0) return null;
    pct = 495 / (1.29579 - 0.35004 * Math.log10(d) + 0.221 * Math.log10(height)) - 450;
  }
  if (!Number.isFinite(pct)) return null;
  return {
    bodyFatPct: Math.round(Math.min(60, Math.max(3, pct)) * 10) / 10,
    method: 'navy',
    note: NAVY_NOTE,
  };
}
