import { describe, expect, it } from 'vitest';
import { carbStrategyForDay } from '../../src/core/running.js';
import { generateWeeklyPlan, refreshDayNutrition } from '../../src/core/planner.js';
import { buildPrePostNutrition } from '../../src/core/prePostNutrition.js';
import { detectComorbidities } from '../../src/core/warmupCooldown.js';
import { assessDietPreferences } from '../../src/core/dietSuitability.js';

const f = (o) => carbStrategyForDay(o).factor;

describe('carbStrategyForDay — tipo + duración', () => {
  it('más minutos de tirada larga → más hidratos', () => {
    expect(f({ sessionType: 'aerobic', sessionFocus: 'cardio_long', durationMinutes: 150 }))
      .toBeGreaterThan(f({ sessionType: 'aerobic', sessionFocus: 'cardio_long', durationMinutes: 75 }));
  });
  it('a igual duración: series > umbral > rodaje; pierna > torso; descanso el mínimo', () => {
    const d = 60;
    expect(f({ sessionType: 'aerobic', sessionFocus: 'cardio_intervals', durationMinutes: d })).toBeGreaterThan(f({ sessionType: 'aerobic', sessionFocus: 'cardio_tempo', durationMinutes: d }));
    expect(f({ sessionType: 'aerobic', sessionFocus: 'cardio_tempo', durationMinutes: d })).toBeGreaterThan(f({ sessionType: 'aerobic', sessionFocus: 'cardio_easy', durationMinutes: d }));
    expect(f({ sessionType: 'resistance', sessionFocus: 'lower', durationMinutes: d })).toBeGreaterThan(f({ sessionType: 'resistance', sessionFocus: 'upper', durationMinutes: d }));
    expect(f({ sessionType: 'recovery' })).toBe(0.8);
  });
  it('circuito y mind-body tienen regla propia', () => {
    expect(f({ sessionType: 'resistance', sessionFocus: 'full', durationMinutes: 45, hybridCircuit: true }))
      .toBeGreaterThan(f({ sessionType: 'resistance', sessionFocus: 'full', durationMinutes: 45 }));
    expect(carbStrategyForDay({ sessionType: 'mindbody', sessionFocus: 'mindbody', durationMinutes: 40 }).level).toBe('bajo');
  });
  it('carrera >75 min añade avituallamiento durante', () => {
    expect(carbStrategyForDay({ sessionType: 'aerobic', sessionFocus: 'cardio_long', durationMinutes: 90 }).timing).toMatch(/30-60 g/);
    expect(carbStrategyForDay({ sessionType: 'aerobic', sessionFocus: 'cardio_long', durationMinutes: 180 }).timing).toMatch(/60-90 g/);
  });
});

const profile = { goal: 'endurance', age: 37, weightKg: 90, heightCm: 178, sex: 'male', activityLevel: 'light', mealsPerDay: 4, trainingModality: 'hybrid_run_gym', runRaceGoal: 'race_10k' };

describe('planner — los macros siguen a la sesión definitiva', () => {
  it('un día convertido en descanso por disponibilidad recibe hidratos de descanso', () => {
    const plan = generateWeeklyPlan({ profile: { ...profile, studioAvailability: true, daysPerWeek: 3, preferredDurationMinutes: 60 }, startDate: '2026-10-05' });
    const rest = plan.days.filter((d) => d.sessionType === 'recovery');
    expect(rest.length).toBeGreaterThan(0);
    rest.forEach((d) => expect(d.nutritionTarget.carbLevel).toBe('bajo'));
  });
  it('refreshDayNutrition: convertir la tirada larga en fuerza de torso baja los hidratos', () => {
    const plan = generateWeeklyPlan({ profile, startDate: '2026-10-05' });
    const long = plan.days.find((d) => d.sessionFocus === 'cardio_long');
    const before = long.nutritionTarget.carbsGrams;
    long.sessionType = 'resistance';
    long.sessionFocus = 'upper';
    long.workout.sessionFocus = 'upper';
    long.workout.durationMinutes = 45;
    refreshDayNutrition(long, { plan, profile });
    expect(long.nutritionTarget.carbsGrams).toBeLessThan(before);
    expect(long.meals.length).toBe(4);
  });
  it('ampliar la duración sube los hidratos del día', () => {
    const plan = generateWeeklyPlan({ profile, startDate: '2026-10-05' });
    const easy = plan.days.find((d) => d.sessionFocus === 'cardio_easy');
    const before = easy.nutritionTarget.carbsGrams;
    easy.workout.durationMinutes += 45;
    refreshDayNutrition(easy, { plan, profile });
    expect(easy.nutritionTarget.carbsGrams).toBeGreaterThan(before);
  });
  it('la hora de entreno se guarda en el plan', () => {
    expect(generateWeeklyPlan({ profile: { ...profile, trainingTime: '18:00' }, startDate: '2026-10-05' }).trainingTime).toBe('18:00');
  });
});

describe('separación dieta / salud', () => {
  const day = { sessionType: 'aerobic', sessionFocus: 'cardio_long', workout: { durationMinutes: 90 } };
  it('el objetivo "controlar glucosa" ya NO se trata como diabetes', () => {
    expect(detectComorbidities({ goal: 'glycemic_control' }).diabetes).toBe(false);
    expect(detectComorbidities({ metabolicProfile: 'type2_diabetes' }).diabetes).toBe(true);
    expect(buildPrePostNutrition({ day, profile: { goal: 'glycemic_control' } }).pre.caution).toBeNull();
  });
  it('controlar glucosa activa IG bajo como PREFERENCIA (no bloqueada)', () => {
    const a = assessDietPreferences({ goal: 'glycemic_control' });
    expect(a.lowGlycemic).toBe(true);
    expect(a.lowGlycemicLockedByHealth).toBe(false);
  });
  it('pre/post respeta la dieta: keto no pide hidratos; con HTA no añade sal', () => {
    const keto = buildPrePostNutrition({ day, profile: { nutritionPreferences: { dietaryPattern: 'keto' } } });
    expect(keto.pre.items.join(' ')).toMatch(/cetogénica/);
    expect(keto.post.items.join(' ')).not.toMatch(/Repón carbohidrato/);
    const hta = buildPrePostNutrition({ day, profile: { conditions: { hypertension: true } } });
    expect(hta.post.items.join(' ')).toMatch(/no añadas sal/);
  });
  it('IG bajo: hidrato rápido solo alrededor de la sesión exigente', () => {
    const r = buildPrePostNutrition({ day, profile: { nutritionPreferences: { lowGlycemic: true } } });
    expect(r.pre.items.join(' ')).toMatch(/índice glucémico bajo/);
    expect(r.pre.items.join(' ')).toMatch(/hidrato rápido/);
  });
});
