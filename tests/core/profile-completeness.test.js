import { describe, expect, it } from 'vitest';

import {
  getMissingNutritionProfileFields,
  getMissingPrescriptionProfileFields,
  isPrescriptionProfileComplete,
} from '../../src/core/profileCompleteness.js';

const COMPLETE = {
  goal: 'recomposition',
  trainingModality: 'full_gym',
  trainingExperience: 'intermediate',
  activityLevel: 'moderate',
  sex: 'male',
  age: 32,
  weightKg: 80,
  heightCm: 178,
  mealsPerDay: 4,
  daysPerWeek: 4,
  preferredDurationMinutes: 60,
};

describe('profile completeness', () => {
  it('requires real anthropometrics before calculating nutrition', () => {
    expect(getMissingNutritionProfileFields({ goal: 'recomposition' })).toEqual(expect.arrayContaining([
      'activityLevel', 'sex', 'age', 'weightKg', 'heightCm', 'mealsPerDay',
    ]));
  });

  it('accepts a complete prescription profile and rejects missing experience', () => {
    expect(isPrescriptionProfileComplete(COMPLETE)).toBe(true);
    expect(getMissingPrescriptionProfileFields({ ...COMPLETE, trainingExperience: null }))
      .toContain('trainingExperience');
  });
});
