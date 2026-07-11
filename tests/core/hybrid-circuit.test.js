import { describe, expect, it } from 'vitest';

import { generateWeeklyPlan, resolveHybridCircuitDays } from '../../src/core/planner.js';

// MÉTODO HÍBRIDO (fuerza en circuito): formato dentro de la modalidad actual, NO una
// modalidad nueva. Activación: preferencia explícita (`prefersHybridCircuit`) o sesgo
// suave cuando el objetivo es recomposición. Ver planner.js (applyHybridCircuitFormatToDay).

const baseProfile = {
  goal: 'recomposition',
  trainingModality: 'full_gym',
  age: 30,
  weightKg: 75,
  heightCm: 175,
  sex: 'male',
  activityLevel: 'moderate',
  mealsPerDay: 4,
};
const startDate = '2026-07-06'; // lunes: la plantilla no rota

describe('resolveHybridCircuitDays — matriz de decisión', () => {
  it('preferencia explícita manda; recomposición sesga 1; modalidades de resistencia quedan fuera', () => {
    expect(resolveHybridCircuitDays({ goal: 'recomposition', modality: 'full_gym', prefersHybridCircuit: undefined })).toBe(1);
    expect(resolveHybridCircuitDays({ goal: 'recomposition', modality: 'full_gym', prefersHybridCircuit: false })).toBe(0);
    expect(resolveHybridCircuitDays({ goal: 'strength', modality: 'full_gym', prefersHybridCircuit: true })).toBe(2);
    expect(resolveHybridCircuitDays({ goal: 'strength', modality: 'full_gym', prefersHybridCircuit: undefined })).toBe(0);
    // Correr+gym / running / cycling: fuerza complementaria tradicional, sin circuito.
    expect(resolveHybridCircuitDays({ goal: 'recomposition', modality: 'hybrid_run_gym', prefersHybridCircuit: true })).toBe(0);
    expect(resolveHybridCircuitDays({ goal: 'recomposition', modality: 'running', prefersHybridCircuit: true })).toBe(0);
  });
});

describe('planner — circuito híbrido aplicado al plan', () => {
  it('recomposición sin preferencia: 1 circuito y la PRIMERA sesión de fuerza queda tradicional', () => {
    const plan = generateWeeklyPlan({ profile: { ...baseProfile }, startDate });

    expect(plan.hybridCircuitDays).toBe(1);
    const circuits = plan.days.filter((d) => d.workout?.hybridCircuit);
    expect(circuits.length).toBe(1);

    const resistance = plan.days.filter((d) => d.isTrainingDay && d.sessionType === 'resistance');
    expect(resistance[0].workout.hybridCircuit).toBeUndefined();
    expect(resistance[0].workout.title).not.toMatch(/Circuito híbrido/);

    const w = circuits[0].workout;
    expect(w.title).toMatch(/^Circuito híbrido · /);
    expect(w.intensityRpe).toBe('RPE 6-7');
    expect(w.hybridCircuit.method).toBe('circuit_resistance_training');
    expect(w.hybridCircuit.restBetweenExercisesSec).toBe(25);
    expect(w.hybridCircuit.hrGuidance).toContain('64-76%');
    w.exercises.filter((e) => e.prescription?.format === 'reps').forEach((e) => {
      expect(e.prescription.restSeconds).toBe(25);
      expect(e.prescription.reps).toBe('10-12');
      expect(e.prescription.loadGuidance).toContain('circuito');
    });
  });

  it('preferencia explícita true: hasta 2 circuitos incluso sin objetivo de recomposición', () => {
    const plan = generateWeeklyPlan({
      profile: { ...baseProfile, goal: 'hypertrophy', prefersHybridCircuit: true },
      startDate,
    });
    expect(plan.hybridCircuitDays).toBe(2);
    expect(plan.days.filter((d) => d.workout?.hybridCircuit).length).toBe(2);
    // La primera de fuerza sigue tradicional (cargas altas preservadas).
    const resistance = plan.days.filter((d) => d.isTrainingDay && d.sessionType === 'resistance');
    expect(resistance[0].workout.hybridCircuit).toBeUndefined();
  });

  it('preferencia explícita false anula el sesgo de recomposición', () => {
    const plan = generateWeeklyPlan({
      profile: { ...baseProfile, prefersHybridCircuit: false },
      startDate,
    });
    expect(plan.hybridCircuitDays).toBe(0);
    expect(plan.days.some((d) => d.workout?.hybridCircuit)).toBe(false);
  });

  it('hybrid_run_gym NO se convierte aunque la preferencia esté activa', () => {
    const plan = generateWeeklyPlan({
      profile: {
        ...baseProfile,
        goal: 'endurance',
        trainingModality: 'hybrid_run_gym',
        prefersHybridCircuit: true,
        runRaceGoal: 'race_21k',
      },
      startDate,
    });
    expect(plan.hybridCircuitDays).toBe(0);
    expect(plan.days.some((d) => d.workout?.hybridCircuit)).toBe(false);
  });

  it('la carga del circuito baja ~15% respecto al mismo ejercicio en formato tradicional', () => {
    const traditional = generateWeeklyPlan({
      profile: { ...baseProfile, prefersHybridCircuit: false },
      startDate,
      userId: 'user-load',
    });
    const circuit = generateWeeklyPlan({
      profile: { ...baseProfile, prefersHybridCircuit: true },
      startDate,
      userId: 'user-load',
    });

    const circuitDayIdx = circuit.days.findIndex((d) => d.workout?.hybridCircuit);
    expect(circuitDayIdx).toBeGreaterThanOrEqual(0);
    const circDay = circuit.days[circuitDayIdx];
    const tradDay = traditional.days[circuitDayIdx];

    const pairs = circDay.workout.exercises
      .map((ex) => {
        const twin = tradDay.workout.exercises.find((t) => t.id === ex.id);
        return twin ? { circ: ex.prescription, trad: twin.prescription } : null;
      })
      // OJO: Number(null) === 0 es finito; hay que descartar null explícitamente.
      .filter((p) => p && p.circ?.format === 'reps' && p.trad?.loadKg != null && Number.isFinite(Number(p.trad.loadKg)));

    expect(pairs.length).toBeGreaterThan(0);
    pairs.forEach(({ circ, trad }) => {
      const expected = Math.max(1, Math.round(Number(trad.loadKg) * 0.85 * 2) / 2);
      expect(circ.loadKg).toBe(expected);
    });
  });

  it('sesgo automático con UNA sola sesión de fuerza: no sacrifica el único estímulo de cargas altas', () => {
    // HOME + recomposición + 3 días/semana: la disponibilidad conserva mixed (98),
    // aeróbico (96) y UNA sola sesión de fuerza (94).
    const plan = generateWeeklyPlan({
      profile: { ...baseProfile, trainingModality: 'home', studioAvailability: true, daysPerWeek: 3, preferredDurationMinutes: 45 },
      startDate,
    });
    const resistance = plan.days.filter((d) => d.isTrainingDay && d.sessionType === 'resistance');
    expect(resistance.length).toBe(1);
    expect(plan.hybridCircuitDays).toBe(0);
    expect(resistance[0].workout.hybridCircuit).toBeUndefined();
  });
});
