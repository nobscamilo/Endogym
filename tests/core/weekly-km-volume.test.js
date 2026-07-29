import { describe, expect, it } from 'vitest';
import { buildWeeklyKmTarget, distributeWeeklyKm, deriveRunPaces, MAX_WEEKLY_KM_INCREASE } from '../../src/core/running.js';
import { buildProgressMemory } from '../../src/core/progressMemory.js';
import { generateBlockPlan } from '../../src/core/planner.js';

// El plan progresaba en MINUTOS y nadie leía `distanceKm`, que llega de Strava en cada
// actividad. Para un objetivo de carrera el kilometraje semanal es la variable central.
// Estos tests fijan la progresión en km y, sobre todo, su freno: la regla del 10%.

const NOW = new Date('2026-07-29T09:00:00.000Z');
const carrera = (dias, km, minutos) => ({
  source: 'strava', sportType: 'Run', completed: true,
  performedAt: new Date(NOW.getTime() - dias * 864e5).toISOString(),
  distanceKm: km, durationMinutes: minutos,
});

const runner = (overrides = {}) => ({
  sex: 'male', age: 38, weightKg: 74, heightCm: 178, activityLevel: 'moderate',
  goal: 'endurance', trainingModality: 'running', daysPerWeek: 5, mealsPerDay: 4,
  trainingExperience: 'intermediate', runRaceGoal: 'race_10k',
  runRefDistanceMeters: 5000, runRefTimeSeconds: 1500,
  ...overrides,
});

describe('volumen semanal en kilómetros', () => {
  it('nunca sube más del 10% sobre la base, que es el freno contra la lesión', () => {
    const target = buildWeeklyKmTarget({ baselineKm: 40, runsLast28d: 12 });
    expect(target).toBeLessThanOrEqual(40 * (1 + MAX_WEEKLY_KM_INCREASE) + 0.05);
    expect(target).toBeGreaterThan(40);
  });

  it('el taper y la fatiga solo pueden RECORTAR, nunca empujar por encima del tope', () => {
    const base = buildWeeklyKmTarget({ baselineKm: 40, runsLast28d: 12 });
    const conTaper = buildWeeklyKmTarget({ baselineKm: 40, runsLast28d: 12, phaseFactor: 0.7 });
    const conFatiga = buildWeeklyKmTarget({ baselineKm: 40, runsLast28d: 12, volumeFactor: 0.9 });
    expect(conTaper).toBeLessThan(base);
    expect(conFatiga).toBeLessThan(base);
    // Un factor >1 no debe saltarse el tope del 10%.
    expect(buildWeeklyKmTarget({ baselineKm: 40, runsLast28d: 12, volumeFactor: 1.2 })).toBeLessThanOrEqual(base);
  });

  it('sin base real suficiente no inventa volumen', () => {
    expect(buildWeeklyKmTarget({ baselineKm: 30, runsLast28d: 2 })).toBeNull();
    expect(buildWeeklyKmTarget({ baselineKm: null, runsLast28d: 12 })).toBeNull();
  });

  it('reparte dando el mayor peso a la tirada larga y traduce cada trozo con SU ritmo', () => {
    const paces = deriveRunPaces(300);
    const r = distributeWeeklyKm({ weeklyKmTarget: 40, runTypesInWeek: ['easy', 'intervals', 'tempo', 'long'], paces });
    expect(r.long.km).toBeGreaterThan(r.easy.km);
    expect(r.easy.km).toBeGreaterThan(r.tempo.km);
    expect(r.tempo.km).toBeGreaterThan(r.intervals.km);
    // Los intervalos van más rápido: menos minutos por km que la tirada larga.
    expect(r.intervals.minutes / r.intervals.km).toBeLessThan(r.long.minutes / r.long.km);
  });

  it('la base recoge la subida reciente y no solo la media de 4 semanas', () => {
    // Alguien que acaba de subir de ~3 a ~22 km/semana: la media de 4 semanas lo dejaría
    // muy por debajo de lo que ya corre.
    const workouts = [
      carrera(1, 8, 45), carrera(3, 7, 40), carrera(5, 7, 40), // ~22 km esta semana
      carrera(10, 3, 18), carrera(18, 3, 18), carrera(25, 3, 18),
    ];
    const pm = buildProgressMemory({ workouts, meals: [], metrics: [], now: NOW });
    const media4 = (8 + 7 + 7 + 3 + 3 + 3) / 4;
    expect(pm.running.weeklyKmBaseline).toBeGreaterThan(media4);
  });

  it('el plan reparte el objetivo entre los días de carrera y la suma cuadra', () => {
    const workouts = [carrera(2, 8, 45), carrera(4, 7, 40), carrera(6, 7, 40), carrera(9, 6, 35), carrera(12, 6, 35)];
    const pm = buildProgressMemory({ workouts, meals: [], metrics: [], now: NOW });
    const plan = generateBlockPlan({ profile: runner(), startDate: '2026-07-29', progressMemory: pm });

    expect(plan.weeklyKmTarget).toBeGreaterThan(0);
    const semana1 = plan.days.slice(0, 7).filter((d) => d.workout?.runPrescription?.targetKm);
    expect(semana1.length).toBeGreaterThanOrEqual(3);
    const suma = semana1.reduce((acc, d) => acc + d.workout.runPrescription.targetKm, 0);
    expect(Math.abs(suma - plan.weeklyKmTarget)).toBeLessThan(1);
  });

  it('la duración preferida acota la sesión, y entonces el km objetivo baja con ella', () => {
    const workouts = [carrera(2, 14, 80), carrera(4, 13, 75), carrera(6, 13, 75), carrera(9, 12, 70)];
    const pm = buildProgressMemory({ workouts, meals: [], metrics: [], now: NOW });
    // 25 min por sesión no dan para el km que tocaría: el plan no puede prometerlo igual.
    // `studioAvailability: true` es lo que activa el ajuste por duración preferida (si el
    // perfil no ha pasado por la encuesta, ese bloque del planner ni se ejecuta).
    const plan = generateBlockPlan({
      profile: runner({ preferredDurationMinutes: 25, studioAvailability: true, daysPerWeek: 5 }),
      startDate: '2026-07-29',
      progressMemory: pm,
    });
    const cortos = plan.days.slice(0, 7).filter((d) => d.workout?.runPrescription?.targetKm && d.sessionFocus !== 'cardio_long');
    expect(cortos.length).toBeGreaterThan(0);
    cortos.forEach((d) => expect(d.workout.durationMinutes).toBeLessThanOrEqual(25));
  });

  it('sin carreras reales el plan sigue funcionando por minutos (sin regresión)', () => {
    const pm = buildProgressMemory({ workouts: [], meals: [], metrics: [], now: NOW });
    const plan = generateBlockPlan({ profile: runner(), startDate: '2026-07-29', progressMemory: pm });
    expect(plan.weeklyKmTarget).toBeNull();
    const aerobicos = plan.days.filter((d) => d.sessionType === 'aerobic');
    expect(aerobicos.length).toBeGreaterThan(0);
    aerobicos.forEach((d) => expect(d.workout.durationMinutes).toBeGreaterThan(0));
  });
});
