function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function scoreByDistance(actual, target, tolerance = 0.2) {
  if (!target || target <= 0) return 1;
  const distance = Math.abs(actual - target) / target;
  if (distance <= tolerance) return 1;
  if (distance >= 1) return 0;
  return Number((1 - (distance - tolerance) / (1 - tolerance)).toFixed(2));
}

function classify(scorePercent) {
  if (scorePercent >= 85) return 'aligned';
  if (scorePercent >= 65) return 'acceptable';
  return 'off_plan';
}

function buildMealTargetFromDay(dayPlan) {
  if (!dayPlan?.nutritionTarget) return null;
  const mealCount = Array.isArray(dayPlan.meals) && dayPlan.meals.length > 0 ? dayPlan.meals.length : 4;
  return {
    calories: Math.round(toNumber(dayPlan.nutritionTarget.calories) / mealCount),
    proteinGrams: Math.round(toNumber(dayPlan.nutritionTarget.proteinGrams) / mealCount),
    carbsGrams: Math.round(toNumber(dayPlan.nutritionTarget.carbsGrams) / mealCount),
    fatGrams: Math.round(toNumber(dayPlan.nutritionTarget.fatGrams) / mealCount),
  };
}

export function evaluateMealAdherence({ mealTotals, weeklyPlan, eatenAt }) {
  if (!weeklyPlan?.days?.length) {
    return {
      status: 'without_plan',
      scorePercent: null,
      message: 'No hay plan semanal activo para evaluar adherencia.',
    };
  }

  const eatenDate = new Date(eatenAt || new Date());
  if (Number.isNaN(eatenDate.getTime())) {
    return {
      status: 'without_plan',
      scorePercent: null,
      message: 'Fecha de ingesta inválida para evaluar adherencia.',
    };
  }

  const year = eatenDate.getFullYear();
  const month = String(eatenDate.getMonth() + 1).padStart(2, '0');
  const day = String(eatenDate.getDate()).padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;
  const dayPlan = weeklyPlan.days.find((day) => day.date === dateKey);
  if (!dayPlan) {
    return {
      status: 'without_plan',
      scorePercent: null,
      message: 'No existe un día de plan asociado a esta fecha.',
    };
  }

  const target = buildMealTargetFromDay(dayPlan);
  if (!target) {
    return {
      status: 'without_plan',
      scorePercent: null,
      message: 'El plan activo no tiene objetivos por comida.',
    };
  }

  const actual = {
    calories: toNumber(mealTotals?.calories),
    proteinGrams: toNumber(mealTotals?.proteinGrams),
    carbsGrams: toNumber(mealTotals?.carbsGrams),
    fatGrams: toNumber(mealTotals?.fatGrams),
  };

  const componentScores = {
    calories: scoreByDistance(actual.calories, target.calories, 0.25),
    proteinGrams: scoreByDistance(actual.proteinGrams, target.proteinGrams, 0.2),
    carbsGrams: scoreByDistance(actual.carbsGrams, target.carbsGrams, 0.25),
    fatGrams: scoreByDistance(actual.fatGrams, target.fatGrams, 0.25),
  };

  const score =
    componentScores.calories * 0.25
    + componentScores.proteinGrams * 0.35
    + componentScores.carbsGrams * 0.2
    + componentScores.fatGrams * 0.2;
  const scorePercent = Math.round(score * 100);

  return {
    status: classify(scorePercent),
    scorePercent,
    date: dateKey,
    actual,
    target,
    componentScores,
  };
}
