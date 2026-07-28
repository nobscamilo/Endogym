import { describe, expect, it } from 'vitest';
import { estimate5kPaceFromRuns, buildRunPaceNotice, STALE_PACE_THRESHOLD_SEC_PER_KM } from '../../src/core/running.js';
import { buildProgressMemory } from '../../src/core/progressMemory.js';
import { generateBlockPlan } from '../../src/core/planner.js';

// Los ritmos que prescribe el plan salían SOLO de una marca escrita a mano. Sin marca, el
// plan mandaba a correr sin ningún ritmo objetivo aunque hubiera decenas de carreras reales
// sincronizadas de Strava; y si la persona mejoraba, seguía prescribiendo sobre la marca
// vieja. Estos tests fijan las dos correcciones: respaldo automático y aviso de marca vieja.

const NOW = new Date('2026-07-29T09:00:00.000Z');
const diasAtras = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();

const carrera = (dias, km, minutos) => ({
  source: 'strava',
  sportType: 'Run',
  performedAt: diasAtras(dias),
  distanceKm: km,
  durationMinutes: minutos,
  completed: true,
});

const runnerProfile = (overrides = {}) => ({
  sex: 'male', age: 38, weightKg: 74, heightCm: 178, activityLevel: 'moderate',
  goal: 'endurance', trainingModality: 'running', daysPerWeek: 5,
  preferredDurationMinutes: 50, mealsPerDay: 4, trainingExperience: 'intermediate',
  runRaceGoal: 'race_10k',
  ...overrides,
});

describe('ritmo de referencia deducido de carreras reales', () => {
  it('estima el ritmo de 5K desde el mejor esfuerzo real', () => {
    const runs = [carrera(10, 5, 25), carrera(20, 10, 55), carrera(5, 3, 16)];
    const out = estimate5kPaceFromRuns(runs, { now: NOW });
    expect(out).toBeTruthy();
    // El mejor esfuerzo (5 km en 25 min = 5:00/km) manda sobre los demás.
    expect(out.p5SecPerKm).toBeGreaterThan(280);
    expect(out.p5SecPerKm).toBeLessThan(320);
    expect(out.basedOn.distanceKm).toBe(5);
  });

  it('descarta rodajes demasiado cortos y carreras demasiado antiguas', () => {
    // 1,5 km no describe capacidad; 200 días atrás no describe la forma de hoy.
    expect(estimate5kPaceFromRuns([carrera(5, 1.5, 7)], { now: NOW })).toBeNull();
    expect(estimate5kPaceFromRuns([carrera(200, 5, 25)], { now: NOW })).toBeNull();
    expect(estimate5kPaceFromRuns([], { now: NOW })).toBeNull();
  });

  it('el aviso solo salta si la mejora supera el umbral de ruido', () => {
    const rapido = { p5SecPerKm: 300, basedOn: { date: '2026-07-01' } };
    // 5 s/km es ruido (un día bueno, una bajada): no avisa.
    expect(buildRunPaceNotice({ manualP5SecPerKm: 305, runsEstimate: rapido })).toBeNull();
    // Por encima del umbral sí, y el mensaje dice ambas cifras sin duplicar la unidad.
    const aviso = buildRunPaceNotice({ manualP5SecPerKm: 300 + STALE_PACE_THRESHOLD_SEC_PER_KM + 5, runsEstimate: rapido });
    expect(aviso).toBeTruthy();
    expect(aviso.message).not.toContain('/km/km');
    expect(aviso.gainSecPerKm).toBe(STALE_PACE_THRESHOLD_SEC_PER_KM + 5);
  });

  it('no avisa si la marca manual es más rápida que las carreras (no se le regaña por un mal día)', () => {
    const lento = { p5SecPerKm: 360, basedOn: { date: '2026-07-01' } };
    expect(buildRunPaceNotice({ manualP5SecPerKm: 300, runsEstimate: lento })).toBeNull();
  });

  it('sin marca manual, el plan prescribe ritmos deducidos de Strava', () => {
    const workouts = [carrera(10, 5, 25), carrera(25, 8, 44), carrera(40, 6, 33)];
    const progressMemory = buildProgressMemory({ workouts, meals: [], metrics: [], now: NOW });
    expect(progressMemory.running.paceRefFromRuns).toBeTruthy();

    const plan = generateBlockPlan({
      profile: runnerProfile({ runRefDistanceMeters: null, runRefTimeSeconds: null }),
      startDate: '2026-07-29',
      progressMemory,
    });

    expect(plan.runPacesSource).toBe('strava');
    expect(plan.runPaces).toBeTruthy();
    // Lo que importa de verdad: los días de carrera salen CON ritmo objetivo, no vacíos.
    const conCarrera = plan.days.filter((d) => d.workout?.runPrescription);
    expect(conCarrera.length).toBeGreaterThan(0);
    expect(conCarrera.every((d) => d.workout.runPrescription.targetPace)).toBe(true);
  });

  it('sin marca y sin carreras, sigue sin inventar ritmos', () => {
    const plan = generateBlockPlan({
      profile: runnerProfile({ runRefDistanceMeters: null, runRefTimeSeconds: null }),
      startDate: '2026-07-29',
      progressMemory: buildProgressMemory({ workouts: [], meals: [], metrics: [], now: NOW }),
    });
    expect(plan.runPacesSource).toBeNull();
    expect(plan.runPaces == null).toBe(true);
  });

  it('la marca manual sigue mandando sobre los ritmos, pero el plan avisa si se quedó atrás', () => {
    const workouts = [carrera(10, 5, 24)]; // ~4:48/km: bastante más rápido que la marca
    const progressMemory = buildProgressMemory({ workouts, meals: [], metrics: [], now: NOW });
    const plan = generateBlockPlan({
      // Marca declarada: 5 km en 30:00 (6:00/km).
      profile: runnerProfile({ runRefDistanceMeters: 5000, runRefTimeSeconds: 1800 }),
      startDate: '2026-07-29',
      progressMemory,
    });

    // El dato declarado NO se pisa solo: sigue siendo la fuente de los ritmos.
    expect(plan.runPacesSource).toBe('manual');
    expect(plan.runPacesNotice).toBeTruthy();
    expect(plan.runPacesNotice.kind).toBe('stale_manual_ref');
  });
});
