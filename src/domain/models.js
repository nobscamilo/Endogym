/**
 * Contratos básicos de dominio de Endogym.
 */

export const GoalType = Object.freeze({
  WEIGHT_LOSS: 'weight_loss',
  MAINTAIN_WEIGHT: 'maintain_weight',
  ENDURANCE: 'endurance',
  HYPERTROPHY: 'hypertrophy',
  STRENGTH: 'strength',
  RECOMPOSITION: 'recomposition',
  GLYCEMIC_CONTROL: 'glycemic_control',
  // Legacy values kept for backward compatibility
  CUT: 'cut',
  MAINTENANCE: 'maintenance',
  BULK: 'bulk',
});

export const TrainingMode = Object.freeze({
  HOME: 'home',
  GYM: 'gym',
});

export const TrainingModality = Object.freeze({
  FULL_GYM: 'full_gym',
  HOME: 'home',
  YOGA: 'yoga',
  TRX: 'trx',
  CALISTHENICS: 'calisthenics',
  RUNNING: 'running',
  CYCLING: 'cycling',
  PILATES: 'pilates',
  MIXED: 'mixed',
});

export const MetabolicProfile = Object.freeze({
  NONE: 'none',
  INSULIN_RESISTANCE: 'insulin_resistance',
  PREDIABETES: 'prediabetes',
  TYPE2_DIABETES: 'type2_diabetes',
  HYPOTHYROIDISM: 'hypothyroidism',
  PCOS: 'pcos',
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
