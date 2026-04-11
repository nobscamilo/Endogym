/**
 * Calcula calorías totales a partir de macros.
 */
export function calculateCalories({ proteinGrams, carbsGrams, fatGrams }) {
  if (![proteinGrams, carbsGrams, fatGrams].every((n) => Number.isFinite(n))) {
    throw new Error('Los macros deben ser números válidos.');
  }

  if ([proteinGrams, carbsGrams, fatGrams].some((n) => n < 0)) {
    throw new Error('Los macros no pueden ser negativos.');
  }

  return proteinGrams * 4 + carbsGrams * 4 + fatGrams * 9;
}

/**
 * Distribuye calorías objetivo en macros por estrategia.
 */
export function buildMacroPlan(targetCalories, strategy = 'recomposition') {
  if (!Number.isFinite(targetCalories) || targetCalories <= 0) {
    throw new Error('Las calorías objetivo deben ser mayores que cero.');
  }

  const strategies = {
    weight_loss: { protein: 0.36, carbs: 0.28, fat: 0.36 },
    maintain_weight: { protein: 0.3, carbs: 0.4, fat: 0.3 },
    endurance: { protein: 0.24, carbs: 0.56, fat: 0.2 },
    hypertrophy: { protein: 0.28, carbs: 0.5, fat: 0.22 },
    strength: { protein: 0.32, carbs: 0.43, fat: 0.25 },
    cut: { protein: 0.35, carbs: 0.3, fat: 0.35 },
    maintenance: { protein: 0.3, carbs: 0.4, fat: 0.3 },
    bulk: { protein: 0.25, carbs: 0.5, fat: 0.25 },
    recomposition: { protein: 0.33, carbs: 0.37, fat: 0.3 },
    glycemic_control: { protein: 0.35, carbs: 0.25, fat: 0.4 },
  };

  const resolvedStrategy = strategies[strategy] ? strategy : 'recomposition';
  const distribution = strategies[resolvedStrategy];

  const proteinGrams = Math.round((targetCalories * distribution.protein) / 4);
  const carbsGrams = Math.round((targetCalories * distribution.carbs) / 4);
  const fatGrams = Math.round((targetCalories * distribution.fat) / 9);

  return {
    targetCalories,
    strategy: resolvedStrategy,
    proteinGrams,
    carbsGrams,
    fatGrams,
  };
}
