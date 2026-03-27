/**
 * Contratos básicos de dominio de Endogym.
 */

export const GoalType = Object.freeze({
  CUT: 'cut',
  MAINTENANCE: 'maintenance',
  BULK: 'bulk',
  RECOMPOSITION: 'recomposition',
  GLYCEMIC_CONTROL: 'glycemic_control',
});

export const TrainingMode = Object.freeze({
  HOME: 'home',
  GYM: 'gym',
});

export function createUserProfile(data) {
  return {
    id: data.id,
    email: data.email,
    displayName: data.displayName,
    goal: data.goal,
    trainingMode: data.trainingMode,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createMealLog(data) {
  return {
    id: data.id,
    userId: data.userId,
    eatenAt: data.eatenAt,
    foods: data.foods,
    totals: data.totals,
    aiAnalysis: data.aiAnalysis ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}
