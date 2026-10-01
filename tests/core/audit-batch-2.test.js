import { describe, expect, it } from 'vitest';
import { applyUnavailableDays, normalizeUnavailableDays } from '../../src/core/availabilityCalendar.js';
import { buildClinicalPause, symptomAdvice, emptySymptoms } from '../../src/core/clinicalPause.js';
import { generateWeeklyPlan, goalCalorieDelta, refreshDayNutrition } from '../../src/core/planner.js';
import { assessDietPreferences } from '../../src/core/dietSuitability.js';

const profile = {
  goal: 'endurance', trainingModality: 'hybrid_run_gym', trainingExperience: 'intermediate', runRaceGoal: 'race_10k',
  age: 37, sex: 'male', weightKg: 90, heightCm: 178, activityLevel: 'light', mealsPerDay: 4,
};

describe('#9 guardias, viajes y salientes', () => {
  it('normaliza: fechas válidas, tipo conocido, sin duplicados y sin antiguas', () => {
    const r = normalizeUnavailableDays([
      { date: '2026-10-10', kind: 'guardia' }, { date: '2026-10-10', kind: 'viaje' },
      { date: 'mañana', kind: 'guardia' }, { date: '2026-10-12', kind: 'fiesta' }, { date: '2026-01-01', kind: 'otro' },
    ], { today: '2026-10-01' });
    expect(r).toEqual([{ date: '2026-10-10', kind: 'viaje' }]);
  });

  it('guardia sin entreno; la sesión clave se mueve; el saliente no tiene nada duro', () => {
    const plan = generateWeeklyPlan({ profile, startDate: '2026-10-05' });
    const longIdx = plan.days.findIndex((d) => d.sessionFocus === 'cardio_long');
    const guardia = plan.days[longIdx].date;
    const plan2 = generateWeeklyPlan({ profile: { ...profile, unavailableDays: [{ date: guardia, kind: 'guardia' }] }, startDate: '2026-10-05' });
    const g = plan2.days.find((d) => d.date === guardia);
    expect(g.sessionType).toBe('recovery');
    expect(g.workout.title).toBe('Guardia');
    const saliente = plan2.days[longIdx + 1];
    if (saliente) {
      const hard = ['cardio_long', 'cardio_intervals', 'cardio_tempo'].includes(saliente.sessionFocus) || ['lower', 'full'].includes(saliente.sessionFocus);
      expect(hard).toBe(false);
    }
    const moved = plan2.unavailableWeek.moved.length + plan2.unavailableWeek.dropped.length;
    expect(moved).toBeGreaterThan(0);
    if (plan2.unavailableWeek.moved.length) expect(plan2.days.some((d) => d.sessionFocus === 'cardio_long')).toBe(true);
  });

  it('applyUnavailableDays no toca nada sin días marcados', () => {
    expect(applyUnavailableDays([{ date: '2026-10-05' }], [])).toBeNull();
  });
});

describe('#15 síntomas críticos y pausa', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const checkin = (date, sy) => ({ source: 'daily_checkin', performedAt: `${date}T12:00:00.000Z`, symptoms: { ...emptySymptoms(), ...sy } });
  it('dolor torácico → aviso crítico con 112 y pausa', () => {
    expect(symptomAdvice({ chestPain: true }).level).toBe('critical');
    expect(symptomAdvice({ chestPain: true }).text).toMatch(/112/);
    const p = buildClinicalPause({ workouts: [checkin('2026-10-08', { chestPain: true })], now });
    expect(p.active).toBe(true);
    expect(p.symptoms.join(' ')).toMatch(/pecho/);
  });
  it('la valoración declarada posterior levanta la pausa', () => {
    const p = buildClinicalPause({ workouts: [checkin('2026-10-08', { syncope: true })], profile: { clinicalClearanceAt: '2026-10-09T09:00:00Z' }, now });
    expect(p).toBeNull();
  });
  it('síntomas no críticos no pausan; hipoglucemia da pauta de 15-20 g', () => {
    expect(buildClinicalPause({ workouts: [checkin('2026-10-08', { jointPain: true })], now })).toBeNull();
    expect(symptomAdvice({ hypoglycemia: true }).text).toMatch(/15-20 g/);
  });
  it('fuera de la ventana de 14 días no pausa', () => {
    expect(buildClinicalPause({ workouts: [checkin('2026-09-20', { chestPain: true })], now })).toBeNull();
  });
});

describe('#13/#14 objetivo secundario', () => {
  it('resistencia + perder grasa → déficit moderado; con hipertrofia, pequeño', () => {
    expect(goalCalorieDelta('endurance', null)).toBe(150);
    expect(goalCalorieDelta('endurance', 'weight_loss')).toBe(-350);
    expect(goalCalorieDelta('hypertrophy', 'weight_loss')).toBe(-150);
    expect(goalCalorieDelta('weight_loss', 'weight_loss')).toBe(-450);
  });
  it('el plan con secundario de pérdida de peso tiene menos kcal; el día de carrera, sin déficit', () => {
    const a = generateWeeklyPlan({ profile, startDate: '2026-10-05' });
    const b = generateWeeklyPlan({ profile: { ...profile, secondaryGoal: 'weight_loss' }, startDate: '2026-10-05' });
    expect(b.baseTarget.targetCalories).toBeLessThan(a.baseTarget.targetCalories - 400);
    const day = { ...b.days.find((d) => d.sessionType === 'aerobic'), raceDay: true };
    const before = { ...b.days.find((d) => d.sessionType === 'aerobic') };
    refreshDayNutrition(before, { plan: b, profile: { ...profile, secondaryGoal: 'weight_loss' } });
    refreshDayNutrition(day, { plan: b, profile: { ...profile, secondaryGoal: 'weight_loss' } });
    expect(day.nutritionTarget.calories - before.nutritionTarget.calories).toBeGreaterThanOrEqual(340);
  });
  it('controlar glucosa como secundario → IG bajo como preferencia', () => {
    const r = assessDietPreferences({ goal: 'endurance', secondaryGoal: 'glycemic_control' });
    expect(r.lowGlycemic).toBe(true);
    expect(r.lowGlycemicLockedByHealth).toBe(false);
  });
});

describe('#10 frecuencia pedida vs prescrita', () => {
  it('explica por qué hay menos sesiones que días pedidos', () => {
    const plan = generateWeeklyPlan({ profile: { ...profile, studioAvailability: true, daysPerWeek: 7, preferredDurationMinutes: 60 }, startDate: '2026-10-05' });
    expect(plan.frequencyNote).toMatch(/Pediste 7 días/);
  });
});
