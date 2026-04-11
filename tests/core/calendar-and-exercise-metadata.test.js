import { describe, expect, it } from 'vitest';

import { GoalType, TrainingModality } from '../../src/domain/models.js';
import {
  generateWeeklyPlan,
  normalizeWeeklyPlanSessionFocus,
  suggestSessionAlternatives,
} from '../../src/core/planner.js';
import {
  buildSessionExercises,
  getExerciseLibraryCatalog,
  getExerciseLibrarySummary,
  isExerciseCompatibleWithSessionFocus,
  resolveExerciseMetadata,
  resolveSessionFocus,
  suggestExerciseAlternatives,
} from '../../src/core/exerciseLibrary.js';

describe('weekly plan calendar alignment', () => {
  it('rotates the weekly template to match the real weekday of the start date', () => {
    const plan = generateWeeklyPlan({
      profile: {
        goal: GoalType.RECOMPOSITION,
        trainingMode: 'gym',
        trainingModality: TrainingModality.FULL_GYM,
        metabolicProfile: 'none',
        activityLevel: 'moderate',
        sex: 'male',
        age: 30,
        weightKg: 82,
        heightCm: 180,
        mealsPerDay: 4,
      },
      startDate: '2026-04-02T09:00:00.000Z',
    });

    expect(plan.days[0].date).toBe('2026-04-02');
    expect(plan.days[0].dayName).toBe('Jueves');
    expect(plan.days[0].workout.title).toBe('Recuperación activa');
    expect(plan.days[1].dayName).toBe('Viernes');
    expect(plan.days[1].workout.title).toBe('Torso B');
  });
});

describe('exercise muscle metadata', () => {
  it('resolves primary and secondary muscles for strength exercises', () => {
    const metadata = resolveExerciseMetadata({ id: 'gym-bench-press' });

    expect(metadata.primaryMuscles).toContain('Pectoral mayor');
    expect(metadata.secondaryMuscles).toContain('Deltoides anterior');
    expect(metadata.anatomyRegions.front).toContain('chest');
  });

  it('exposes the audit catalog with modalities and muscle metadata', () => {
    const catalog = getExerciseLibraryCatalog();
    const trxRow = catalog.find((exercise) => exercise.id === 'trx-row');

    expect(catalog.length).toBeGreaterThanOrEqual(180);
    expect(trxRow).toBeTruthy();
    expect(trxRow.modalities).toContain(TrainingModality.TRX);
    expect(trxRow.primaryMuscles).toContain('Dorsal ancho');
  });

  it('keeps non-gym modalities above a minimum useful catalog size', () => {
    const summary = getExerciseLibrarySummary();
    const counts = Object.fromEntries(summary.modalities.map(({ modality, count }) => [modality, count]));

    expect(summary.totalExercises).toBeGreaterThanOrEqual(180);
    expect(counts[TrainingModality.HOME]).toBeGreaterThanOrEqual(45);
    expect(counts[TrainingModality.TRX]).toBeGreaterThanOrEqual(34);
    expect(counts[TrainingModality.YOGA]).toBeGreaterThanOrEqual(38);
    expect(counts[TrainingModality.PILATES]).toBeGreaterThanOrEqual(42);
    expect(counts[TrainingModality.RUNNING]).toBeGreaterThanOrEqual(8);
    expect(counts[TrainingModality.CYCLING]).toBeGreaterThanOrEqual(8);
  });

  it('applies override anatomy to expanded and corrected exercise ids', () => {
    const atomic = resolveExerciseMetadata({ id: 'trx-atomic-pushup' });
    const lateralRaise = resolveExerciseMetadata({ id: 'gym-lateral-raise' });

    expect(atomic.primaryMuscles).toContain('Pectoral');
    expect(atomic.anatomyRegions.front).toContain('abs');
    expect(lateralRaise.primaryMuscles).toContain('Deltoides lateral');
    expect(lateralRaise.anatomyRegions.back).toContain('rear_shoulders');
  });

  it('exposes strong expansion metadata for the highlighted non-gym modalities', () => {
    const catalog = getExerciseLibraryCatalog();
    const homePress = catalog.find((exercise) => exercise.id === 'home-band-overhead-press');
    const trxFly = catalog.find((exercise) => exercise.id === 'trx-chest-fly');
    const yogaTriangle = catalog.find((exercise) => exercise.id === 'yoga-triangle-pose');
    const pilatesCrissCross = catalog.find((exercise) => exercise.id === 'pilates-criss-cross');
    const trxSingleArmRow = catalog.find((exercise) => exercise.id === 'trx-single-arm-row');
    const yogaWarriorThree = catalog.find((exercise) => exercise.id === 'yoga-warrior-iii');
    const pilatesJackknife = catalog.find((exercise) => exercise.id === 'pilates-jackknife');

    expect(homePress?.difficulty).toBe('build');
    expect(homePress?.progressions.length).toBeGreaterThanOrEqual(3);
    expect(trxFly?.difficulty).toBe('performance');
    expect(trxFly?.contraindications).toContain('Dolor anterior de hombro');
    expect(yogaTriangle?.primaryMuscles).toContain('Oblicuos');
    expect(pilatesCrissCross?.regressions.length).toBeGreaterThanOrEqual(3);
    expect(trxSingleArmRow?.youtubeQuery).toContain('single arm row');
    expect(yogaWarriorThree?.primaryMuscles).toContain('Gluteo medio');
    expect(pilatesJackknife?.difficulty).toBe('performance');
  });

  it('keeps torso sessions limited to upper-body and core categories', () => {
    const plan = generateWeeklyPlan({
      profile: {
        goal: GoalType.RECOMPOSITION,
        trainingMode: 'gym',
        trainingModality: TrainingModality.FULL_GYM,
        metabolicProfile: 'none',
        activityLevel: 'moderate',
        sex: 'male',
        age: 30,
        weightKg: 82,
        heightCm: 180,
        mealsPerDay: 4,
      },
      startDate: '2026-04-06T09:00:00.000Z',
    });

    const torso = plan.days[0];
    expect(torso.workout.title).toBe('Torso A');
    expect(torso.sessionFocus).toBe('upper');
    expect(torso.workout.exercises.length).toBeGreaterThanOrEqual(4);
    expect(
      torso.workout.exercises.every((exercise) =>
        isExerciseCompatibleWithSessionFocus(exercise, {
          sessionType: torso.sessionType,
          sessionFocus: torso.sessionFocus,
        })
      )
    ).toBe(true);
    expect(
      torso.workout.exercises.some((exercise) =>
        ['lower_body_strength', 'lower_body_unilateral', 'lower_body_accessory', 'posterior_chain'].includes(exercise.category)
      )
    ).toBe(false);
  });

  it('matches exercise swap suggestions to the session focus', () => {
    const sessionFocus = resolveSessionFocus({
      modality: TrainingModality.FULL_GYM,
      sessionType: 'resistance',
      sessionTitle: 'Torso B',
    });

    const baseExercises = buildSessionExercises({
      modality: TrainingModality.FULL_GYM,
      sessionType: 'resistance',
      sessionTitle: 'Torso B',
      sessionFocus,
      goal: GoalType.HYPERTROPHY,
      profile: { weightKg: 84 },
      adaptiveTuning: null,
      daySeed: 2,
    });

    const alternatives = suggestExerciseAlternatives({
      currentExerciseId: baseExercises[0].id,
      currentExercise: baseExercises[0],
      modality: TrainingModality.FULL_GYM,
      sessionType: 'resistance',
      sessionTitle: 'Torso B',
      sessionFocus,
      goal: GoalType.HYPERTROPHY,
      profile: { weightKg: 84 },
      adaptiveTuning: null,
      limit: 4,
    });

    expect(alternatives.length).toBeGreaterThan(0);
    expect(
      alternatives.every((exercise) =>
        isExerciseCompatibleWithSessionFocus(exercise, {
          sessionType: 'resistance',
          sessionFocus,
        })
      )
    ).toBe(true);
  });

  it('keeps whole-session swap suggestions compatible with adjacent training days', () => {
    const alternatives = suggestSessionAlternatives({
      days: [
        {
          date: '2026-04-06',
          sessionType: 'aerobic',
          sessionFocus: 'cardio',
          workout: { title: 'Base aeróbica' },
        },
        {
          date: '2026-04-07',
          sessionType: 'resistance',
          sessionFocus: 'upper',
          workout: {
            title: 'Torso B',
            durationMinutes: 64,
            intensityRpe: 'RPE 7-8',
          },
        },
        {
          date: '2026-04-08',
          sessionType: 'resistance',
          sessionFocus: 'lower',
          workout: { title: 'Pierna A' },
        },
      ],
      dayIndex: 1,
      profile: {
        goal: GoalType.HYPERTROPHY,
        trainingMode: 'gym',
        trainingModality: TrainingModality.FULL_GYM,
        weightKg: 84,
      },
      adaptiveTuning: null,
      limit: 6,
    });

    expect(alternatives.length).toBeGreaterThan(0);
    expect(
      alternatives.every((session) => ['upper', 'push', 'pull'].includes(session.sessionFocus))
    ).toBe(true);
    expect(
      alternatives.every((session) => session.workout.exercises.every((exercise) =>
        isExerciseCompatibleWithSessionFocus(exercise, {
          sessionType: 'resistance',
          sessionFocus: session.sessionFocus,
        })
      ))
    ).toBe(true);
  });

  it('repairs old persisted torso days that contain lower-body exercises', () => {
    const repaired = normalizeWeeklyPlanSessionFocus({
      goal: GoalType.RECOMPOSITION,
      trainingMode: 'gym',
      trainingModality: TrainingModality.FULL_GYM,
      adaptiveTuning: null,
      days: [
        {
          date: '2026-04-06',
          dayName: 'Lunes',
          sessionType: 'resistance',
          workout: {
            title: 'Torso A',
            exercises: [
              { id: 'gym-bench-press', category: 'upper_push' },
              { id: 'gym-overhead-press', category: 'upper_push' },
              { id: 'gym-seated-row', category: 'upper_pull' },
              { id: 'gym-leg-press', category: 'lower_body_strength' },
              { id: 'gym-bulgarian-split-squat', category: 'lower_body_unilateral' },
            ],
          },
        },
      ],
    }, {
      goal: GoalType.RECOMPOSITION,
      trainingMode: 'gym',
      trainingModality: TrainingModality.FULL_GYM,
      weightKg: 82,
    });

    expect(repaired.days[0].workout.focusRepairApplied).toBe(true);
    expect(repaired.days[0].sessionFocus).toBe('upper');
    expect(
      repaired.days[0].workout.exercises.every((exercise) =>
        isExerciseCompatibleWithSessionFocus(exercise, {
          sessionType: 'resistance',
          sessionFocus: 'upper',
        })
      )
    ).toBe(true);
  });
});
