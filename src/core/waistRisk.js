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
