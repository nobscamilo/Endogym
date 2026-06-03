import { describe, expect, it } from 'vitest';

import { buildAdaptiveTuning, buildProgressMemory } from '../../src/core/progressMemory.js';
import { buildHeuristicCoachPlan, generateWeeklyPlan } from '../../src/core/planner.js';
import { evaluatePreparticipationScreening } from '../../src/core/screening.js';

describe('adaptive planning pipeline', () => {
  it('sets stop gate when symptoms are reported in screening', () => {
    const screening = evaluatePreparticipationScreening({
      exerciseSymptoms: true,
      contraindications: false,
      knownCardiometabolicDisease: false,
      currentlyActive: true,
      desiredIntensity: 'vigorous',
    });

    expect(screening.readinessGate).toBe('stop');
    expect(screening.maxAllowedSessionRpe).toBeLessThanOrEqual(4);
    expect(screening.clearanceStatus).toBe('required');
  });

  it('reduces load when fatigue and completion are poor', () => {
    const progressMemory = buildProgressMemory({
      workouts: [
        { performedAt: '2026-03-30T09:00:00.000Z', sessionRpe: 9, fatigue: 8, completed: true },
        { performedAt: '2026-03-28T09:00:00.000Z', sessionRpe: 8, fatigue: 7, completed: false },
        { performedAt: '2026-03-26T09:00:00.000Z', sessionRpe: 9, fatigue: 8, completed: false },
      ],
      meals: [
        { eatenAt: '2026-03-29T12:00:00.000Z', adherence: { scorePercent: 52 } },
        { eatenAt: '2026-03-28T12:00:00.000Z', adherence: { scorePercent: 58 } },
        { eatenAt: '2026-03-27T12:00:00.000Z', adherence: { scorePercent: 55 } },
        { eatenAt: '2026-03-26T12:00:00.000Z', adherence: { scorePercent: 57 } },
        { eatenAt: '2026-03-25T12:00:00.000Z', adherence: { scorePercent: 54 } },
      ],
      lookbackDays: 21,
      now: new Date('2026-03-31T12:00:00.000Z'),
    });

    const screening = evaluatePreparticipationScreening({
      knownCardiometabolicDisease: true,
      medicalClearance: false,
      currentlyActive: false,
      desiredIntensity: 'vigorous',
    });
    const adaptive = buildAdaptiveTuning({
      profile: { goal: 'weight_loss' },
      progressMemory,
      screening,
    });

    expect(adaptive.workout.volumeFactor).toBeLessThan(1);
    expect(adaptive.workout.rpeShift).toBeLessThan(0);
    expect(adaptive.workout.maxRpeCap).toBeLessThanOrEqual(6);
    expect(adaptive.appliedRules.length).toBeGreaterThan(1);
  });

  it('applies adaptive tuning to generated weekly plan', () => {
    const screening = evaluatePreparticipationScreening({
      knownCardiometabolicDisease: true,
      medicalClearance: false,
      currentlyActive: false,
      desiredIntensity: 'vigorous',
    });
    const progressMemory = {
      readinessScore: 50,
      readinessState: 'low',
      metrics: {
        completionRate: 0.45,
        avgSessionRpe: 8.3,
        avgFatigue: 7.1,
        avgNutritionAdherence: 58,
      },
      samples: { workouts: 5, meals: 7, adherenceMeals: 7 },
    };
    const adaptive = buildAdaptiveTuning({
      profile: { goal: 'weight_loss' },
      progressMemory,
      screening,
    });

    const plan = generateWeeklyPlan({
      profile: {
        goal: 'weight_loss',
        trainingMode: 'gym',
        trainingModality: 'full_gym',
        metabolicProfile: 'none',
        activityLevel: 'moderate',
        sex: 'male',
        age: 30,
        weightKg: 80,
        heightCm: 178,
        mealsPerDay: 4,
      },
      startDate: '2026-04-06T10:00:00.000Z',
      preparticipationScreening: screening,
      progressMemory,
      adaptiveTuning: adaptive,
    });

    expect(plan.preparticipationScreening.readinessGate).toBe('caution');
    expect(plan.progressMemory.readinessScore).toBe(50);
    expect(plan.adaptiveTuning.workout.volumeFactor).toBeLessThan(1);
    expect(plan.clinicalAuditTrail.length).toBeGreaterThan(1);
    expect(plan.days[0].workout.intensityRpe).toMatch(/^RPE\s/);
  });

  it('ignores unknown subjective values when a daily survey was skipped', () => {
    const progressMemory = buildProgressMemory({
      workouts: [
        {
          performedAt: '2026-03-30T09:00:00.000Z',
          sessionRpe: null,
          fatigue: null,
          sleepHours: null,
          completed: false,
          checkinSkipped: true,
        },
        {
          performedAt: '2026-03-29T09:00:00.000Z',
          sessionRpe: 8,
          fatigue: 7,
          sleepHours: 6,
          completed: true,
        },
      ],
      now: new Date('2026-03-31T12:00:00.000Z'),
    });

    expect(progressMemory.samples.workouts).toBe(2);
    expect(progressMemory.samples.subjectiveWorkouts).toBe(1);
    expect(progressMemory.metrics.avgSessionRpe).toBe(8);
    expect(progressMemory.metrics.avgFatigue).toBe(7);
    expect(progressMemory.metrics.avgSleepHours).toBe(6);
  });

  it('blocks high intensity when a recent daily check-in contains alarm symptoms', () => {
    const progressMemory = buildProgressMemory({
      workouts: [
        {
          performedAt: '2026-03-30T09:00:00.000Z',
          sessionRpe: 5,
          fatigue: 3,
          sleepHours: 8,
          completed: true,
          symptoms: {
            dyspnea: false,
            jointPain: false,
            dizziness: true,
            tachycardia: false,
          },
        },
      ],
      now: new Date('2026-03-31T12:00:00.000Z'),
    });
    const screening = evaluatePreparticipationScreening({
      currentlyActive: true,
      desiredIntensity: 'vigorous',
    });
    const adaptive = buildAdaptiveTuning({
      profile: { goal: 'recomposition' },
      progressMemory,
      screening,
    });
    const coachPlan = buildHeuristicCoachPlan({
      profile: { goal: 'recomposition', trainingModality: 'full_gym' },
      weeklyPlan: {
        days: [],
        progressMemory,
        preparticipationScreening: screening,
        adaptiveTuning: adaptive,
      },
    });

    expect(progressMemory.clinicalSignals.readinessGate).toBe('stop');
    expect(adaptive.workout.highIntensityBlocked).toBe(true);
    expect(adaptive.workout.maxRpeCap).toBe(4);
    expect(adaptive.appliedRules.map((rule) => rule.id)).toContain('DAILY_CHECKIN_ALARM_SYMPTOMS');
    expect(coachPlan.riskFlags[0]).toContain('Síntomas de alarma');
  });
});
