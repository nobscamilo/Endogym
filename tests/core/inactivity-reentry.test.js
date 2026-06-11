import { describe, expect, it } from 'vitest';
import { buildProgressMemory, buildAdaptiveTuning } from '../../src/core/progressMemory.js';
import { buildExercisePrescription } from '../../src/core/exerciseLibrary.js';
import { stepDownRunFocus } from '../../src/core/running.js';

const NOW = new Date('2026-06-11T12:00:00.000Z');

function doneWorkout(daysAgo) {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return { source: 'manual', performedAt: d.toISOString(), completed: true, title: 'Sesión' };
}

function pm(workouts, extra = {}) {
  return buildProgressMemory({ workouts, meals: [], metrics: [], lookbackDays: 21, now: NOW, ...extra });
}

function tuning(workouts, { profile = {}, extra = {} } = {}) {
  return buildAdaptiveTuning({ profile, progressMemory: pm(workouts, extra), screening: null });
}

describe('FASE 1.3 — inactividad en buildProgressMemory', () => {
  it('calcula daysSinceLastDone del último entreno HECHO', () => {
    const m = pm([doneWorkout(10), doneWorkout(15)]);
    expect(m.inactivity.daysSinceLastDone).toBe(10);
    expect(m.inactivity.lastDoneAt).toContain('2026-06-01');
  });

  it('usuario nuevo (sin entrenos): null, sin reglas de reentrada', () => {
    const m = pm([]);
    expect(m.inactivity.daysSinceLastDone).toBeNull();
    const t = tuning([]);
    expect(t.appliedRules.map((r) => r.id)).not.toContain('INACTIVITY_RESET');
    expect(t.workout.loadFactor).toBe(1);
    expect(t.workout.planStale).toBe(false);
  });

  it('un check-in "no entrené" (completed=false) NO cuenta como entreno hecho', () => {
    const checkin = { source: 'daily_checkin', performedAt: NOW.toISOString(), completed: false };
    const m = pm([checkin, doneWorkout(9)]);
    expect(m.inactivity.daysSinceLastDone).toBe(9);
  });

  it('lastDoneAtHint cubre parones más largos que la ventana de consulta', () => {
    const d = new Date(NOW);
    d.setUTCDate(d.getUTCDate() - 30);
    const m = pm([], { lastDoneAtHint: d.toISOString() });
    expect(m.inactivity.daysSinceLastDone).toBe(30);
  });
});

describe('FASE 1.3 — reglas de reentrada en buildAdaptiveTuning', () => {
  it('3-6 días sin entrenar: NO emite regla de inactividad', () => {
    const t = tuning([doneWorkout(5)]);
    const ids = t.appliedRules.map((r) => r.id);
    expect(ids).not.toContain('INACTIVITY_REENTRY');
    expect(ids).not.toContain('INACTIVITY_RESET');
    expect(t.workout.loadFactor).toBe(1);
  });

  it('7-14 días: −10% carga, carrera un escalón abajo, frecuencia intacta (volumen sin tocar)', () => {
    const t = tuning([doneWorkout(10)]);
    const rule = t.appliedRules.find((r) => r.id === 'INACTIVITY_REENTRY');
    expect(rule).toBeTruthy();
    expect(rule.reason).toBeTruthy();
    expect(rule.effect).toContain('−10%');
    expect(t.workout.loadFactor).toBe(0.9);
    expect(t.workout.runIntensityStepDown).toBe(true);
    expect(t.workout.bridgeSession).toBe(true);
    expect(t.workout.volumeFactor).toBe(1); // frecuencia/volumen intactos en este nivel
    expect(t.workout.planStale).toBe(false);
  });

  it('>14 días: plan inválido + volumen 0.7-0.8 para regenerar con rampa', () => {
    const t = tuning([doneWorkout(20)]);
    const rule = t.appliedRules.find((r) => r.id === 'INACTIVITY_RESET');
    expect(rule).toBeTruthy();
    expect(t.workout.planStale).toBe(true);
    expect(t.workout.volumeFactor).toBeGreaterThanOrEqual(0.7);
    expect(t.workout.volumeFactor).toBeLessThanOrEqual(0.8);
    expect(t.workout.loadFactor).toBe(0.85);
    expect(t.workout.bridgeSession).toBe(true);
  });

  it('rampa tras volver (ya entrenó): semana 1 con parón largo → volumen ×0.8', () => {
    const answeredAt = new Date(NOW); answeredAt.setUTCDate(answeredAt.getUTCDate() - 3);
    const t = tuning([doneWorkout(1)], {
      profile: { reentry: { reason: 'vacaciones', answeredAt: answeredAt.toISOString(), daysOut: 20 } },
    });
    const rule = t.appliedRules.find((r) => r.id === 'REENTRY_RAMP');
    expect(rule).toBeTruthy();
    expect(t.workout.volumeFactor).toBe(0.8);
    expect(t.workout.loadFactor).toBe(0.85);
    expect(t.workout.runIntensityStepDown).toBe(true);
    expect(t.workout.planStale).toBe(false);
  });

  it('rampa semana 2 (parón largo): volumen ×0.9', () => {
    const answeredAt = new Date(NOW); answeredAt.setUTCDate(answeredAt.getUTCDate() - 10);
    const t = tuning([doneWorkout(2)], {
      profile: { reentry: { reason: 'otro', answeredAt: answeredAt.toISOString(), daysOut: 21 } },
    });
    expect(t.appliedRules.find((r) => r.id === 'REENTRY_RAMP_W2')).toBeTruthy();
    expect(t.workout.volumeFactor).toBe(0.9);
    expect(t.workout.loadFactor).toBe(0.95);
  });

  it('enfermedad: regla extra conservadora, RPE capado a 6 y sugerencia de re-cribado', () => {
    const answeredAt = new Date(NOW); answeredAt.setUTCDate(answeredAt.getUTCDate() - 2);
    const t = tuning([doneWorkout(1)], {
      profile: { reentry: { reason: 'enfermedad', answeredAt: answeredAt.toISOString(), daysOut: 10 } },
    });
    const rule = t.appliedRules.find((r) => r.id === 'REENTRY_ILLNESS');
    expect(rule).toBeTruthy();
    expect(rule.effect).toMatch(/cribado/i);
    expect(t.workout.suggestRescreening).toBe(true);
    expect(t.workout.maxRpeCap).toBe(6);
    expect(t.workout.volumeFactor).toBeLessThanOrEqual(0.85);
  });

  it('la rampa expira: respondido hace 20 días → sin reglas de reentrada', () => {
    const answeredAt = new Date(NOW); answeredAt.setUTCDate(answeredAt.getUTCDate() - 20);
    const t = tuning([doneWorkout(2)], {
      profile: { reentry: { reason: 'enfermedad', answeredAt: answeredAt.toISOString(), daysOut: 20 } },
    });
    expect(t.appliedRules.filter((r) => r.id.startsWith('REENTRY') || r.id.startsWith('INACTIVITY'))).toHaveLength(0);
    expect(t.workout.loadFactor).toBe(1);
  });
});

describe('FASE 1.3 — consumo en la prescripción', () => {
  const exercise = { id: 'gym-press', name: 'Press banca', loadType: 'external', loadRatio: 0.5 };

  it('loadFactor 0.9 reduce un 10% la carga partida del historial', () => {
    const base = buildExercisePrescription(exercise, {
      goal: 'strength', sessionType: 'strength', profile: { weightKg: 80 },
      adaptiveTuning: { workout: { volumeFactor: 1, rpeShift: 0, loadFactor: 1 } },
      liftHistory: { 'gym-press': { weightKg: 100 } },
    });
    const reduced = buildExercisePrescription(exercise, {
      goal: 'strength', sessionType: 'strength', profile: { weightKg: 80 },
      adaptiveTuning: { workout: { volumeFactor: 1, rpeShift: 0, loadFactor: 0.9 } },
      liftHistory: { 'gym-press': { weightKg: 100 } },
    });
    expect(base.loadKg).toBe(100);
    expect(reduced.loadKg).toBe(90);
    expect(reduced.loadSource).toBe('history');
  });

  it('stepDownRunFocus baja un escalón series y tempo; no toca fácil/larga', () => {
    expect(stepDownRunFocus('cardio_intervals')).toBe('cardio_tempo');
    expect(stepDownRunFocus('cardio_tempo')).toBe('cardio_easy');
    expect(stepDownRunFocus('cardio_easy')).toBe('cardio_easy');
    expect(stepDownRunFocus('cardio_long')).toBe('cardio_long');
  });
});
