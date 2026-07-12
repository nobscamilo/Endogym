import { describe, expect, it } from 'vitest';

import { generateWeeklyPlan } from '../../src/core/planner.js';

// Cobertura de las decisiones aceptadas al integrar la rama del compañero
// (fix-nutrition-and-rag-macros, 11 jul 2026):
// 1. workoutFactor en el TDEE: +4% (volumen normal) / +8% (≥4 días/sem o >60 min/sesión).
// 2. Regresión: el adaptedTemplate descartado NO debe volver — un corredor (hybrid_run_gym)
//    en recomposición conserva sus días de fuerza tradicionales.

const baseProfile = {
  goal: 'strength',
  trainingModality: 'full_gym',
  age: 30,
  weightKg: 75,
  heightCm: 175,
  sex: 'male',
  activityLevel: 'moderate',
  mealsPerDay: 4,
};
const startDate = '2026-07-06';

describe('TDEE workoutFactor (decisión aceptada de la rama)', () => {
  it('aplica ×1.04 en volumen normal y ×1.08 con ≥4 días/semana (Mifflin-St Jeor + factor de actividad)', () => {
    // BMR hombre: 10·75 + 6.25·175 − 5·30 + 5 = 1698.75; moderate = 1.55; strength delta = +100.
    const bmrTimesActivity = 1698.75 * 1.55;
    const low = generateWeeklyPlan({ profile: { ...baseProfile, daysPerWeek: 3 }, startDate });
    const high = generateWeeklyPlan({ profile: { ...baseProfile, daysPerWeek: 5 }, startDate });
    // ±2 kcal: redondeos internos (coma flotante + anclaje de proteína) no clínicamente relevantes.
    expect(Math.abs(low.baseTarget.targetCalories - (Math.round(bmrTimesActivity * 1.04) + 100))).toBeLessThanOrEqual(2);
    expect(Math.abs(high.baseTarget.targetCalories - (Math.round(bmrTimesActivity * 1.08) + 100))).toBeLessThanOrEqual(2);
    expect(high.baseTarget.targetCalories).toBeGreaterThan(low.baseTarget.targetCalories);
  });

  it('también activa ×1.08 con sesiones largas (>60 min) aunque entrene pocos días', () => {
    const bmrTimesActivity = 1698.75 * 1.55;
    const longSessions = generateWeeklyPlan({
      profile: { ...baseProfile, daysPerWeek: 3, preferredDurationMinutes: 75 },
      startDate,
    });
    expect(Math.abs(longSessions.baseTarget.targetCalories - (Math.round(bmrTimesActivity * 1.08) + 100))).toBeLessThanOrEqual(2);
  });
});

describe('Regresión: sin adaptedTemplate (descartado en la revisión de la rama)', () => {
  it('un corredor hybrid_run_gym en recomposición conserva sus días de fuerza tradicionales', () => {
    const plan = generateWeeklyPlan({
      profile: {
        ...baseProfile,
        goal: 'recomposition',
        trainingModality: 'hybrid_run_gym',
        prefersHybridCircuit: true,
        runRaceGoal: 'race_21k',
      },
      startDate,
    });
    const resistance = plan.days.filter((d) => d.sessionType === 'resistance');
    expect(resistance.length).toBeGreaterThanOrEqual(2); // Pierna + Torso intactos
    expect(plan.days.some((d) => /en Circuito/i.test(d.workout?.title || ''))).toBe(false);
    expect(plan.hybridCircuitDays).toBe(0);
  });

  it('running en recomposición conserva su día de fuerza complementaria', () => {
    const plan = generateWeeklyPlan({
      profile: { ...baseProfile, goal: 'recomposition', trainingModality: 'running' },
      startDate,
    });
    expect(plan.days.filter((d) => d.sessionType === 'resistance').length).toBe(1);
    expect(plan.days.some((d) => /en Circuito/i.test(d.workout?.title || ''))).toBe(false);
  });
});
