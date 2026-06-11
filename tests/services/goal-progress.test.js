import { describe, expect, it } from 'vitest';
import { buildGoalProgress, describeGoalProgress } from '../../src/services/goalProgress.js';

const NOW = new Date('2026-06-11T12:00:00.000Z');

function metric(date, weightKg) {
  return { takenAt: `${date}T08:00:00.000Z`, weightKg };
}

describe('buildGoalProgress — peso (perder grasa / ganar músculo)', () => {
  it('calcula actual, tendencia, predicción y onTrack para pérdida de peso', () => {
    const profile = { goalTarget: { kind: 'weightKg', goal: 'weight_loss', value: 80, date: '2026-09-01' } };
    // 84 kg hace 4 semanas → 82 kg hoy: −0.5 kg/sem
    const metrics = [metric('2026-05-14', 84), metric('2026-06-11', 82)];
    const gp = buildGoalProgress({ profile, metrics, workouts: [], now: NOW });
    expect(gp.currentValue).toBe(82);
    expect(gp.trendPerWeek).toBe(-0.5);
    expect(gp.predictedDate).toBe('2026-07-09'); // 2 kg restantes / 0.5 = 4 semanas
    expect(gp.onTrack).toBe(true);
    const text = describeGoalProgress(gp);
    expect(text).toContain('80 kg');
    expect(text).toContain('EN CAMINO');
  });

  it('detecta cuando NO va en camino (tendencia insuficiente para la fecha)', () => {
    const profile = { goalTarget: { kind: 'weightKg', goal: 'weight_loss', value: 75, date: '2026-07-01' } };
    const metrics = [metric('2026-05-14', 84), metric('2026-06-11', 83.5)]; // −0.13/sem aprox
    const gp = buildGoalProgress({ profile, metrics, workouts: [], now: NOW });
    expect(gp.onTrack).toBe(false);
    expect(describeGoalProgress(gp)).toContain('NO va en camino');
  });

  it('tendencia en dirección contraria: no inventa fecha de llegada', () => {
    const profile = { goalTarget: { kind: 'weightKg', goal: 'weight_loss', value: 80 } };
    const metrics = [metric('2026-05-14', 82), metric('2026-06-11', 84)]; // subiendo
    const gp = buildGoalProgress({ profile, metrics, workouts: [], now: NOW });
    expect(gp.predictedDate).toBeNull();
  });

  it('sin objetivo fijado → null; con un solo punto no hay tendencia pero sí actual', () => {
    expect(buildGoalProgress({ profile: {}, metrics: [metric('2026-06-11', 82)], now: NOW })).toBeNull();
    const gp = buildGoalProgress({
      profile: { goalTarget: { kind: 'weightKg', goal: 'hypertrophy', value: 86 } },
      metrics: [metric('2026-06-11', 82)],
      now: NOW,
    });
    expect(gp.currentValue).toBe(82);
    expect(gp.trendPerWeek).toBeNull();
    expect(gp.onTrack).toBeNull();
  });
});

describe('buildGoalProgress — fuerza (e1RM del ejercicio de referencia)', () => {
  function strengthWorkout(date, kg, reps) {
    return {
      source: 'manual', completed: true, performedAt: `${date}T18:00:00.000Z`,
      exercises: [{ id: 'gym-squat', name: 'Sentadilla', weightKg: kg, reps }],
    };
  }

  it('usa el mejor e1RM por sesión del ejercicio con más registros', () => {
    const profile = { goalTarget: { kind: 'e1rmKg', goal: 'strength', value: 140, date: '2026-12-01' } };
    const workouts = [
      strengthWorkout('2026-05-14', 100, 8), // e1RM 126.7
      strengthWorkout('2026-06-11', 105, 8), // e1RM 133
    ];
    const gp = buildGoalProgress({ profile, metrics: [], workouts, now: NOW });
    expect(gp.referenceName).toBe('Sentadilla');
    expect(gp.currentValue).toBeCloseTo(133, 0);
    expect(gp.trendPerWeek).toBeGreaterThan(0);
    expect(gp.predictedDate).toBeTruthy();
  });

  it('sin entrenos de fuerza: devuelve nota pidiendo registrar kg+reps (sin inventar)', () => {
    const profile = { goalTarget: { kind: 'e1rmKg', goal: 'strength', value: 140 } };
    const gp = buildGoalProgress({ profile, metrics: [], workouts: [], now: NOW });
    expect(gp.currentValue).toBeNull();
    expect(gp.note).toMatch(/registra/i);
  });
});
