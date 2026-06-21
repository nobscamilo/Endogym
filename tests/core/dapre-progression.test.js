import { describe, expect, it } from 'vitest';
import { computeDapreProgression, buildExercisePrescription } from '../../src/core/exerciseLibrary.js';

describe('computeDapreProgression (autorregulación por desempeño real)', () => {
  it('superó el tope del rango con RPE holgado → +5%', () => {
    expect(computeDapreProgression({ lastReps: 13, repsRange: '6-12', rpe: 7 })).toEqual({ factor: 1.05, reason: 'beat_target' });
  });

  it('lo superó por ≥3 reps → +10%', () => {
    expect(computeDapreProgression({ lastReps: 15, repsRange: '6-12', rpe: null }).factor).toBe(1.1);
  });

  it('superó reps pero con RPE máximo (9) → NO sube (en rango, misma carga)', () => {
    expect(computeDapreProgression({ lastReps: 12, repsRange: '6-12', rpe: 9 })).toEqual({ factor: 1, reason: 'in_range' });
  });

  it('no llegó al mínimo → −5%; muy por debajo → −10%', () => {
    expect(computeDapreProgression({ lastReps: 5, repsRange: '6-12', rpe: 7 }).factor).toBe(0.95);
    expect(computeDapreProgression({ lastReps: 3, repsRange: '6-12', rpe: 7 }).factor).toBe(0.9);
  });

  it('en rango con RPE 9.5+ → −5% (esfuerzo insostenible)', () => {
    expect(computeDapreProgression({ lastReps: 9, repsRange: '6-12', rpe: 9.5 }).factor).toBe(0.95);
  });

  it('en rango con esfuerzo normal → misma carga (doble progresión)', () => {
    expect(computeDapreProgression({ lastReps: 9, repsRange: '6-12', rpe: 7.5 })).toEqual({ factor: 1, reason: 'in_range' });
  });

  it('sin reps reales → null (fallback a progresión por fase)', () => {
    expect(computeDapreProgression({ lastReps: null, repsRange: '6-12', rpe: 7 }).factor).toBeNull();
    expect(computeDapreProgression({ lastReps: 10, repsRange: null, rpe: 7 }).factor).toBeNull();
  });
});

describe('buildExercisePrescription con DAPRE', () => {
  const exercise = { id: 'gym-press', name: 'Press banca', loadType: 'external', loadRatio: 0.5 };
  const base = { goal: 'hypertrophy', sessionType: 'strength', profile: { weightKg: 80 }, adaptiveTuning: { workout: { volumeFactor: 1, rpeShift: 0 } } };

  it('reps reales por encima del rango → carga +5% sobre el último registro', () => {
    const p = buildExercisePrescription(exercise, {
      ...base, liftHistory: { 'gym-press': { weightKg: 100, reps: 14, rpe: 7 } },
    });
    expect(p.loadKg).toBe(105);
    expect(p.progression).toEqual({ method: 'dapre', factor: 1.05, reason: 'beat_target' });
    expect(p.loadGuidance).toContain('superaste');
  });

  it('en rango → misma carga y guía de doble progresión', () => {
    const p = buildExercisePrescription(exercise, {
      ...base, liftHistory: { 'gym-press': { weightKg: 100, reps: 9, rpe: 7 } },
    });
    expect(p.loadKg).toBe(100);
    expect(p.progression.method).toBe('dapre');
    expect(p.loadGuidance).toContain('doble progresión');
  });

  it('sin reps registradas → fallback a la progresión por fase (comportamiento previo intacto)', () => {
    const p = buildExercisePrescription(exercise, {
      ...base, loadProgression: 1.07, liftHistory: { 'gym-press': { weightKg: 100 } },
    });
    expect(p.loadKg).toBe(107.5); // 100 × 1.07 → redondeo a paso de 2.5
    expect(p.progression.method).toBe('phase');
  });

  it('sin peso ni historial no inventa una carga inicial de 75 kg de referencia', () => {
    const p = buildExercisePrescription(exercise, {
      ...base,
      profile: { trainingExperience: 'novice' },
      liftHistory: null,
    });
    expect(p.loadKg).toBeNull();
    expect(p.loadSource).toBe('profile_required');
  });

  it('DAPRE convive con la reentrada: loadFactor 0.9 se aplica encima', () => {
    const p = buildExercisePrescription(exercise, {
      ...base,
      adaptiveTuning: { workout: { volumeFactor: 1, rpeShift: 0, loadFactor: 0.9 } },
      liftHistory: { 'gym-press': { weightKg: 100, reps: 14, rpe: 7 } },
    });
    expect(p.loadKg).toBe(95); // 100 × 1.05 × 0.9 = 94.5 → 95 (paso 2.5)
  });

  it('modula series y descanso por nivel de entrenamiento', () => {
    const novice = buildExercisePrescription(exercise, {
      ...base,
      goal: 'strength',
      profile: { weightKg: 80, trainingExperience: 'novice' },
    });
    const advanced = buildExercisePrescription(exercise, {
      ...base,
      goal: 'strength',
      profile: { weightKg: 80, trainingExperience: 'advanced' },
    });
    const intermediate = buildExercisePrescription(exercise, {
      ...base,
      goal: 'strength',
      profile: { weightKg: 80, trainingExperience: 'intermediate' },
    });

    expect(novice.sets).toBeLessThan(advanced.sets);
    expect(advanced.sets).toBeGreaterThan(intermediate.sets);
    expect(novice.restSeconds).toBe(120);
    expect(advanced.restSeconds).toBe(180);
  });
});
