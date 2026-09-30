import { describe, expect, it } from 'vitest';
import { buildRunLoadPolicy, capTrainingPhase } from '../../src/core/runLoadPolicy.js';
import { buildProgressMemory } from '../../src/core/progressMemory.js';
import { generateBlockPlan, generateWeeklyPlan } from '../../src/core/planner.js';

const NOW = new Date('2026-09-30T20:00:00Z');
const run = (daysAgo, km, min, hr = null) => {
  const d = new Date(NOW); d.setUTCDate(d.getUTCDate() - daysAgo);
  return { source: 'strava', sportType: 'Run', performedAt: d.toISOString(), distanceKm: km, durationMinutes: min, avgHeartRate: hr };
};
// Caso real anonimizado (auditoría 30-sep): pocas carreras, FC por encima del techo del rodaje.
const lowBaseRuns = [run(28, 3.5, 37, 141), run(6, 3.2, 30, 142), run(3, 6.5, 60, 158), run(2, 2.8, 30, 145)];
const profile = {
  goal: 'endurance', trainingModality: 'hybrid_run_gym', trainingExperience: 'novice', runRaceGoal: 'race_10k',
  raceDate: '2026-10-17', age: 37, sex: 'male', weightKg: 105, heightCm: 178, activityLevel: 'light', mealsPerDay: 4,
  studioAvailability: true, daysPerWeek: 6, preferredDurationMinutes: 60,
};

describe('buildRunLoadPolicy', () => {
  it('base baja: techo desde la carga real, sin calidad y con correr/caminar por FC', () => {
    const pm = buildProgressMemory({ workouts: lowBaseRuns, now: NOW });
    const p = buildRunLoadPolicy({ progressMemory: pm, profile, hrMax: 182 });
    expect(p.lowBase).toBe(true);
    expect(p.maxQuality).toBe(0);
    expect(p.startCapMin).toBeLessThan(120);
    expect(p.runWalk).toMatchObject({ run: 3, walk: 1 });
    expect(p.maxPhase).toBe('base');
  });
  it('base consolidada: 2 de calidad y sin correr/caminar', () => {
    const runs = Array.from({ length: 12 }, (_, i) => run(i * 2 + 1, 8, 45, 130));
    const p = buildRunLoadPolicy({ progressMemory: buildProgressMemory({ workouts: runs, now: NOW }), profile: { ...profile, trainingExperience: 'intermediate' }, hrMax: 182 });
    expect(p.lowBase).toBe(false);
    expect(p.maxQuality).toBe(2);
    expect(p.runWalk).toBeNull();
  });
  it('sin datos: se confía en el nivel declarado', () => {
    const p = buildRunLoadPolicy({ progressMemory: buildProgressMemory({ workouts: [], now: NOW }), profile: { ...profile, trainingExperience: 'advanced' } });
    expect(p.noData).toBe(true);
    expect(p.maxQuality).toBe(2);
    expect(Number.isFinite(p.startCapMin)).toBe(false);
  });
  it('cribado sin alta intensidad → 0 sesiones de calidad', () => {
    const runs = Array.from({ length: 12 }, (_, i) => run(i * 2 + 1, 8, 45, 130));
    const p = buildRunLoadPolicy({ progressMemory: buildProgressMemory({ workouts: runs, now: NOW }), profile: { ...profile, trainingExperience: 'advanced' }, screening: { highIntensityAllowed: false } });
    expect(p.maxQuality).toBe(0);
  });
  it('capTrainingPhase: Base nunca pasa de "base"; sin taper de 2 semanas con base baja', () => {
    const low = { lowBase: true, maxPhase: 'base' };
    expect(capTrainingPhase('peak', low, 3)).toBe('base');
    expect(capTrainingPhase('taper', low, 2)).toBe('base');
    expect(capTrainingPhase('taper', low, 1)).toBe('taper');
    expect(capTrainingPhase('peak', { lowBase: false, maxPhase: 'peak' }, 3)).toBe('peak');
  });
});

describe('planner con política de carga y semana de carrera', () => {
  const pm = buildProgressMemory({ workouts: lowBaseRuns, now: NOW });
  const plan = generateBlockPlan({ profile, startDate: '2026-10-01', progressMemory: pm });
  const runs = (days) => days.filter((d) => d.sessionType === 'aerobic' && !d.raceDay);

  it('#1 el volumen de carrera parte de la carga real (≤ techo) y progresa (#29)', () => {
    const w1 = runs(plan.days.slice(0, 7)).reduce((a, d) => a + d.workout.durationMinutes, 0);
    const w2 = runs(plan.days.slice(7, 14)).reduce((a, d) => a + d.workout.durationMinutes, 0);
    expect(w1).toBeLessThanOrEqual(plan.blockWeeks[0].runLoadWeek.weeklyCapMin);
    expect(w1).toBeLessThan(150);
    expect(w2).toBeGreaterThanOrEqual(w1);
  });
  it('#2 nivel Base a 3 semanas: fase base, no pico', () => {
    expect(plan.blockWeeks[0].phase).toBe('base');
  });
  it('#6 sin series ni umbral con base baja', () => {
    expect(plan.days.some((d) => ['cardio_intervals', 'cardio_tempo'].includes(d.sessionFocus))).toBe(false);
  });
  it('#7 rodajes como correr/caminar', () => {
    runs(plan.days).forEach((d) => expect(d.workout.runPrescription.runWalk).toMatchObject({ run: 3, walk: 1 }));
  });
  it('#3 semana de carrera: día D "Carrera", víspera descanso, sin pierna 4 días antes, recuperación después', () => {
    const idx = plan.days.findIndex((d) => d.date === '2026-10-17');
    const race = plan.days[idx];
    expect(race.raceDay).toBe(true);
    expect(race.sessionFocus).toBe('race');
    expect(race.workout.runPrescription.structure).toMatch(/Correr\/caminar 3:1/);
    expect(plan.days[idx - 1].sessionType).toBe('recovery');
    expect(plan.days[idx - 1].nutritionTarget.carbLevel).not.toBe('bajo');
    for (let i = idx - 4; i < idx; i += 1) expect(plan.days[i].sessionType === 'resistance' && plan.days[i].sessionFocus === 'lower').toBe(false);
    expect(plan.days[idx + 1].sessionType).toBe('recovery');
  });
  it('sin fecha en la semana no hay día de carrera', () => {
    const wk = generateWeeklyPlan({ profile: { ...profile, raceDate: '2026-12-20' }, startDate: '2026-10-01', progressMemory: pm });
    expect(wk.days.some((d) => d.raceDay)).toBe(false);
  });
});
