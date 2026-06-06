import { describe, expect, it } from 'vitest';

import { generateWeeklyPlan } from '../../src/core/planner.js';

const baseProfile = {
  goal: 'hypertrophy',
  trainingModality: 'full_gym',
  age: 30,
  weightKg: 75,
  heightCm: 175,
  sex: 'male',
  activityLevel: 'moderate',
  mealsPerDay: 4,
};
const startDate = '2026-06-08';

describe('studio availability honored in planner', () => {
  it('ignores availability fields by default (no studioAvailability flag)', () => {
    const plan = generateWeeklyPlan({
      profile: { ...baseProfile, daysPerWeek: 2, preferredDurationMinutes: 40 },
      startDate,
    });
    const training = plan.days.filter((d) => d.isTrainingDay);
    // Plantilla por defecto: más de 2 días de entreno y duraciones no forzadas a 40.
    expect(training.length).toBeGreaterThan(2);
    expect(training.every((d) => d.workout.durationMinutes === 40)).toBe(false);
  });

  it('honors daysPerWeek and preferredDurationMinutes when studioAvailability is true', () => {
    const plan = generateWeeklyPlan({
      profile: { ...baseProfile, studioAvailability: true, daysPerWeek: 2, preferredDurationMinutes: 40 },
      startDate,
    });
    const training = plan.days.filter((d) => d.isTrainingDay);
    expect(training.length).toBe(2);
    training.forEach((d) => expect(d.workout.durationMinutes).toBe(40));
    // Sigue habiendo 7 días en total (los sobrantes pasan a descanso activo).
    expect(plan.days.length).toBe(7);
  });
});
