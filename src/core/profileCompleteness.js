import { GoalType, TrainingModality, TrainingMode } from '../domain/models.js';

const GOALS = new Set(Object.values(GoalType));
const MODALITIES = new Set(Object.values(TrainingModality));
const MODES = new Set(Object.values(TrainingMode));
const ACTIVITY_LEVELS = new Set(['sedentary', 'light', 'moderate', 'high']);
const SEX_VALUES = new Set(['male', 'female']);
const TRAINING_EXPERIENCE = new Set(['novice', 'intermediate', 'advanced']);

function numberInRange(value, min, max) {
  if (value == null || value === '') return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}

export const PROFILE_FIELD_LABELS = Object.freeze({
  goal: 'objetivo',
  trainingModality: 'modalidad',
  trainingExperience: 'nivel de entrenamiento',
  activityLevel: 'actividad cotidiana',
  sex: 'sexo para la estimación energética',
  age: 'edad',
  weightKg: 'peso',
  heightCm: 'altura',
  mealsPerDay: 'comidas al día',
  daysPerWeek: 'días de entrenamiento por semana',
  preferredDurationMinutes: 'minutos por sesión',
});

export function getMissingNutritionProfileFields(profile = {}) {
  const missing = [];
  if (!GOALS.has(profile.goal)) missing.push('goal');
  if (!ACTIVITY_LEVELS.has(profile.activityLevel)) missing.push('activityLevel');
  if (!SEX_VALUES.has(profile.sex)) missing.push('sex');
  if (!numberInRange(profile.age, 12, 100)) missing.push('age');
  if (!numberInRange(profile.weightKg, 30, 300)) missing.push('weightKg');
  if (!numberInRange(profile.heightCm, 120, 230)) missing.push('heightCm');
  if (!numberInRange(profile.mealsPerDay, 3, 6)) missing.push('mealsPerDay');
  return missing;
}

export function getMissingPrescriptionProfileFields(profile = {}) {
  const missing = getMissingNutritionProfileFields(profile);
  const hasModality = MODALITIES.has(profile.trainingModality) || MODES.has(profile.trainingMode);
  if (!hasModality) missing.push('trainingModality');
  if (!TRAINING_EXPERIENCE.has(profile.trainingExperience)) missing.push('trainingExperience');
  if (!numberInRange(profile.daysPerWeek, 1, 7)) missing.push('daysPerWeek');
  if (!numberInRange(profile.preferredDurationMinutes, 20, 150)) missing.push('preferredDurationMinutes');
  return missing;
}

export function isPrescriptionProfileComplete(profile = {}) {
  return getMissingPrescriptionProfileFields(profile).length === 0;
}
