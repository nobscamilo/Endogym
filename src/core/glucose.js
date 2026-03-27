/**
 * Calcula la carga glucémica de un alimento o plato.
 * Fórmula: GL = (GI * carbohidratos disponibles en gramos) / 100
 */
export function glycemicLoad(glycemicIndex, availableCarbsGrams) {
  if (glycemicIndex < 0 || availableCarbsGrams < 0) {
    throw new Error('GI y carbohidratos deben ser valores no negativos.');
  }
  return Number(((glycemicIndex * availableCarbsGrams) / 100).toFixed(2));
}

/**
 * Clasifica una carga glucémica según umbrales comunes.
 */
export function classifyGlycemicLoad(gl) {
  if (gl < 10) return 'baja';
  if (gl <= 19) return 'media';
  return 'alta';
}

/**
 * Estima impacto glucémico diario a partir de GL acumulada.
 */
export function estimateDailyGlycemicImpact(totalDailyGl) {
  if (totalDailyGl < 0) {
    throw new Error('La GL diaria no puede ser negativa.');
  }
  if (totalDailyGl < 80) return 'estable';
  if (totalDailyGl <= 120) return 'moderado';
  return 'elevado';
}

/**
 * Estimación simple del índice insulínico relativo (0-100)
 * basada en GL, proteína y procesamiento del alimento.
 */
export function estimateInsulinIndex({ gl, proteinGrams, processedLevel = 1 }) {
  const normalizedGl = Math.min(100, gl * 2);
  const proteinFactor = Math.min(25, proteinGrams * 0.8);
  const processedFactor = Math.min(20, Math.max(0, processedLevel) * 5);

  return Math.round(Math.min(100, normalizedGl * 0.6 + proteinFactor + processedFactor));
}
