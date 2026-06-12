import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  listWeeklyPlans: vi.fn(),
  getUserProfile: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  createWeeklyPlan: vi.fn(),
  updateWeeklyPlanAdaptiveOverlay: vi.fn(),
  updateWeeklyPlanCustomizations: vi.fn(),
  listMealsSince: vi.fn(),
  listMetricsSince: vi.fn(),
  listWorkoutsSince: vi.fn(),
  getLastDoneWorkoutAt: vi.fn(async () => null),
  upsertUserProfile: vi.fn(),
  isGeminiConfigured: vi.fn(),
  callGeminiExerciseCoach: vi.fn(),
  resolveGeminiCoachModel: vi.fn(),
  enforceUserRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
  logInfo: vi.fn(),
}));

const envBackup = vi.hoisted(() => ({
  GEMINI_FORCE_MOCK: process.env.GEMINI_FORCE_MOCK,
  GEMINI_FALLBACK_TO_MOCK: process.env.GEMINI_FALLBACK_TO_MOCK,
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  listWeeklyPlans: mocks.listWeeklyPlans,
  getUserProfile: mocks.getUserProfile,
  getLatestWeeklyPlan: mocks.getLatestWeeklyPlan,
  createWeeklyPlan: mocks.createWeeklyPlan,
  updateWeeklyPlanAdaptiveOverlay: mocks.updateWeeklyPlanAdaptiveOverlay,
  updateWeeklyPlanCustomizations: mocks.updateWeeklyPlanCustomizations,
  listMealsSince: mocks.listMealsSince,
  listMetricsSince: mocks.listMetricsSince,
  listWorkoutsSince: mocks.listWorkoutsSince,
  getLastDoneWorkoutAt: mocks.getLastDoneWorkoutAt,
  upsertUserProfile: mocks.upsertUserProfile,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logInfo: mocks.logInfo,
  logError: vi.fn(),
}));

vi.mock('../../src/lib/rateLimit.js', () => ({
  RATE_LIMIT_SCOPES: {
    WEEKLY_PLAN_GENERATE: 'weekly-plan-generate',
  },
  enforceUserRateLimit: mocks.enforceUserRateLimit,
  getRateLimitHeaders: mocks.getRateLimitHeaders,
}));

vi.mock('../../src/services/exerciseCoachClient.js', () => ({
  isGeminiConfigured: mocks.isGeminiConfigured,
  callGeminiExerciseCoach: mocks.callGeminiExerciseCoach,
  resolveGeminiCoachModel: mocks.resolveGeminiCoachModel,
}));

// FASE 3.6 — métricas best-effort anuladas en tests.
vi.mock('../../src/lib/aiMetrics.js', () => ({
  recordAiMetric: vi.fn(async () => {}),
  tokensFromGeminiResponse: () => ({ tokensIn: 0, tokensOut: 0 }),
}));

const { GET, POST, PATCH } = await import('../../src/app/api/weekly-plan/route.js');

async function readJson(response) {
  return response.json();
}

describe('/api/weekly-plan route', () => {
  beforeEach(() => {
    process.env.GEMINI_FORCE_MOCK = 'false';
    process.env.GEMINI_FALLBACK_TO_MOCK = 'true';
    mocks.getAuthenticatedUser.mockReset();
    mocks.listWeeklyPlans.mockReset();
    mocks.getUserProfile.mockReset();
    mocks.getLatestWeeklyPlan.mockReset();
    mocks.createWeeklyPlan.mockReset();
    mocks.updateWeeklyPlanAdaptiveOverlay.mockReset();
    mocks.updateWeeklyPlanCustomizations.mockReset();
    mocks.listMealsSince.mockReset();
    mocks.listMetricsSince.mockReset();
    mocks.listWorkoutsSince.mockReset();
    mocks.upsertUserProfile.mockReset();
    mocks.isGeminiConfigured.mockReset();
    mocks.callGeminiExerciseCoach.mockReset();
    mocks.resolveGeminiCoachModel.mockReset();
    mocks.enforceUserRateLimit.mockReset();
    mocks.getRateLimitHeaders.mockReset();
    mocks.logInfo.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.isGeminiConfigured.mockReturnValue(false);
    mocks.resolveGeminiCoachModel.mockReturnValue('gemini-coach-model');
    mocks.enforceUserRateLimit.mockResolvedValue({
      allowed: true,
      limit: 4,
      remaining: 3,
      retryAfterSeconds: 3600,
    });
    mocks.getRateLimitHeaders.mockReturnValue({
      'ratelimit-limit': '4',
      'ratelimit-remaining': '3',
      'ratelimit-reset': '3600',
    });
    mocks.listMealsSince.mockResolvedValue([]);
    mocks.listMetricsSince.mockResolvedValue([]);
    mocks.listWorkoutsSince.mockResolvedValue([]);
    mocks.updateWeeklyPlanAdaptiveOverlay.mockImplementation(async (_uid, _planId, patch) => ({
      id: _planId,
      isBlock: true,
      blockStartDate: '2026-06-01',
      blockEndDate: '2026-06-21',
      days: patch.days || [],
      adaptiveTuning: patch.adaptiveTuning,
      progressMemory: patch.progressMemory,
      adaptiveOverlay: patch.adaptiveOverlay,
    }));
  });

  afterEach(() => {
    process.env.GEMINI_FORCE_MOCK = envBackup.GEMINI_FORCE_MOCK;
    process.env.GEMINI_FALLBACK_TO_MOCK = envBackup.GEMINI_FALLBACK_TO_MOCK;
  });

  it('GET validates limit query param', async () => {
    const response = await GET(new Request('http://localhost/api/weekly-plan?limit=abc'));
    const json = await readJson(response);

    expect(response.status).toBe(400);
    expect(json.error).toContain('"limit"');
  });

  it('GET returns latest plan and plan list', async () => {
    mocks.listWeeklyPlans.mockResolvedValue([{ id: 'plan-2' }, { id: 'plan-1' }]);

    const response = await GET(new Request('http://localhost/api/weekly-plan?limit=2'));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.latestPlan.id).toBe('plan-2');
    expect(json.plans).toHaveLength(2);
  });

  it('POST returns 409 when profile is missing', async () => {
    mocks.getUserProfile.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/weekly-plan', { method: 'POST', body: '{}' })
    );
    const json = await readJson(response);

    expect(response.status).toBe(409);
    expect(json.error).toContain('No existe perfil');
  });

  it('POST returns 429 with Retry-After when plan generation limit is exhausted', async () => {
    mocks.enforceUserRateLimit.mockResolvedValue({
      allowed: false,
      limit: 4,
      remaining: 0,
      retryAfterSeconds: 321,
    });
    mocks.getRateLimitHeaders.mockReturnValue({
      'ratelimit-limit': '4',
      'ratelimit-remaining': '0',
      'ratelimit-reset': '321',
      'retry-after': '321',
    });

    const response = await POST(
      new Request('http://localhost/api/weekly-plan', { method: 'POST', body: '{}' })
    );
    const json = await readJson(response);

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('321');
    expect(json.details.retryAfterSeconds).toBe(321);
    expect(mocks.getUserProfile).not.toHaveBeenCalled();
    expect(mocks.logInfo).toHaveBeenCalledWith('rate_limit_exceeded', expect.objectContaining({
      scope: 'weekly-plan-generate',
    }));
  });

  it('POST generates and persists weekly plan', async () => {
    const startDate = '2026-04-06T10:00:00.000Z';
    mocks.getUserProfile.mockResolvedValue({
      goal: 'recomposition',
      trainingMode: 'gym',
      activityLevel: 'moderate',
      sex: 'male',
      age: 28,
      weightKg: 80,
      heightCm: 178,
      mealsPerDay: 4,
      preparticipation: {
        knownCardiometabolicDisease: false,
        exerciseSymptoms: false,
        currentlyActive: true,
        medicalClearance: false,
        contraindications: false,
        desiredIntensity: 'moderate',
      },
    });
    mocks.getLatestWeeklyPlan.mockResolvedValue({ id: 'previous-plan' });
    mocks.createWeeklyPlan.mockImplementation(async (_uid, payload) => ({
      id: 'new-plan',
      ...payload,
    }));

    const response = await POST(
      new Request('http://localhost/api/weekly-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(201);
    expect(json.plan.id).toBe('new-plan');
    expect(json.plan.previousPlanId).toBe('previous-plan');
    expect(json.plan.days).toHaveLength(21); // bloque/mesociclo de 3 semanas
    expect(json.plan.isBlock).toBe(true);
    expect(json.plan.startDate).toBe('2026-04-06');
    expect(json.plan.coachPlan).toBeTruthy();
    expect(json.plan.coachSource).toBe('heuristic');
    expect(json.plan.coachMeta).toBeTruthy();
    expect(json.plan.coachMeta.failureCode).toBe('GEMINI_COACH_NOT_CONFIGURED');
    expect(json.plan.preparticipationScreening).toBeTruthy();
    expect(json.plan.progressMemory).toBeTruthy();
    expect(json.plan.adaptiveTuning).toBeTruthy();
    expect(Array.isArray(json.plan.clinicalAuditTrail)).toBe(true);
    expect(Array.isArray(json.plan.systemAlerts)).toBe(true);
    expect(mocks.upsertUserProfile).not.toHaveBeenCalled();
  });

  it('POST refreshes adaptive overlay for an active block without rebuilding it', async () => {
    const { dateKeyInTimeZone } = await import('../../src/lib/appTime.js');
    const today = dateKeyInTimeZone(); // fecha CIVIL, igual que la ruta
    const days = Array.from({ length: 14 }, (_, index) => ({
      date: index === 0 ? today : `2099-01-${String(index + 1).padStart(2, '0')}`,
      dayName: index === 0 ? 'lunes' : 'martes',
      isTrainingDay: true,
      sessionType: 'resistance',
      sessionFocus: 'fuerza',
      workout: {
        title: index === 0 ? 'Torso A' : 'Sesión',
        durationMinutes: 60,
        intensityRpe: { min: 7, max: 8 },
        exercises: [],
      },
    }));
    const activeBlock = {
      id: 'block-1',
      isBlock: true,
      blockStartDate: '2026-06-01',
      blockEndDate: '2999-12-31',
      days,
    };
    mocks.getUserProfile.mockResolvedValue({
      goal: 'recomposition',
      trainingMode: 'gym',
      activityLevel: 'moderate',
      sex: 'male',
      age: 28,
      weightKg: 80,
      heightCm: 178,
      mealsPerDay: 4,
      preparticipation: {
        knownCardiometabolicDisease: false,
        exerciseSymptoms: false,
        currentlyActive: true,
        medicalClearance: false,
        contraindications: false,
        desiredIntensity: 'moderate',
      },
    });
    mocks.getLatestWeeklyPlan.mockResolvedValue(activeBlock);
    // OJO: 00:00Z y no 12:00Z — si la suite corre antes del mediodía UTC, un check-in a
    // las 12:00Z queda "en el futuro" y progressMemory lo excluye (test flaky por hora).
    mocks.listWorkoutsSince.mockResolvedValue([{
      source: 'daily_checkin',
      performedAt: `${today}T00:00:00.000Z`,
      completed: true,
      sessionRpe: 9,
      fatigue: 9,
      sleepHours: 5,
    }]);
    mocks.updateWeeklyPlanAdaptiveOverlay.mockImplementation(async (_uid, _planId, patch) => ({
      ...activeBlock,
      ...patch,
    }));

    const response = await POST(
      new Request('http://localhost/api/weekly-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.stable).toBe(true);
    expect(json.plan.id).toBe('block-1');
    expect(json.plan.adaptiveOverlay.mode).toBe('active_block_daily_overlay');
    expect(json.plan.adaptiveOverlay.rules.some((rule) => rule.id === 'HIGH_FATIGUE')).toBe(true);
    expect(json.plan.days.find((day) => day.date === today).adaptiveOverlay.scope).toBe('today');
    expect(mocks.createWeeklyPlan).not.toHaveBeenCalled();
    expect(mocks.updateWeeklyPlanAdaptiveOverlay).toHaveBeenCalledWith('user-1', 'block-1', expect.objectContaining({
      adaptiveOverlay: expect.objectContaining({ mode: 'active_block_daily_overlay' }),
    }));
  });

  it('POST marks onboarding completed when screening was already updated', async () => {
    mocks.getUserProfile.mockResolvedValue({
      goal: 'recomposition',
      trainingMode: 'gym',
      activityLevel: 'moderate',
      sex: 'male',
      age: 28,
      weightKg: 80,
      heightCm: 178,
      mealsPerDay: 4,
      onboardingCompleted: false,
      preparticipationUpdatedAt: '2026-03-20T00:00:00.000Z',
      preparticipation: {
        knownCardiometabolicDisease: false,
        exerciseSymptoms: false,
        currentlyActive: true,
        medicalClearance: false,
        contraindications: false,
        desiredIntensity: 'moderate',
      },
    });
    mocks.getLatestWeeklyPlan.mockResolvedValue(null);
    mocks.createWeeklyPlan.mockImplementation(async (_uid, payload) => ({
      id: 'new-plan',
      ...payload,
    }));

    const response = await POST(
      new Request('http://localhost/api/weekly-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.upsertUserProfile).toHaveBeenCalledWith('user-1', {
      onboardingCompleted: true,
      needsSetup: false,
    });
  });

  it('POST uses Gemini coach and stores diagnostics metadata', async () => {
    mocks.isGeminiConfigured.mockReturnValue(true);
    mocks.getUserProfile.mockResolvedValue({
      goal: 'strength',
      trainingMode: 'gym',
      trainingModality: 'full_gym',
      activityLevel: 'moderate',
      sex: 'male',
      age: 28,
      weightKg: 80,
      heightCm: 178,
      mealsPerDay: 4,
      preparticipation: {
        knownCardiometabolicDisease: false,
        exerciseSymptoms: false,
        currentlyActive: true,
        medicalClearance: false,
        contraindications: false,
        desiredIntensity: 'moderate',
      },
    });
    mocks.callGeminiExerciseCoach.mockResolvedValue({
      coachSummary: 'Resumen IA',
      acsmJustification: 'FITT definido por objetivo.',
      prescriptionAdjustments: [
        {
          day: 'Lunes 2026-04-06',
          adjustment: 'Subir carga 2.5%.',
          rationale: 'Fatiga baja y adherencia alta.',
          evidence: 'readiness=82',
        },
      ],
      riskFlags: [],
      medicalDisclaimer: 'Educativo',
      diagnostics: {
        modelRequested: 'gemini-coach-model',
        modelResolved: 'gemini-2.5-pro',
        attempts: 2,
        generatedAt: '2026-04-02T10:00:00.000Z',
      },
    });
    mocks.createWeeklyPlan.mockImplementation(async (_uid, payload) => ({ id: 'plan-ai', ...payload }));
    mocks.getLatestWeeklyPlan.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/weekly-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(201);
    expect(json.plan.coachSource).toBe('gemini');
    expect(json.plan.coachPlan.coachSummary).toBe('Resumen IA');
    expect(json.plan.coachMeta.source).toBe('gemini');
    expect(json.plan.coachMeta.fallbackApplied).toBe(false);
    expect(json.plan.coachMeta.modelResolved).toBe('gemini-2.5-pro');
    expect(json.plan.coachMeta.attempts).toBe(2);
    expect(json.plan.coachWarning).toBeNull();
  });

  it('applies only bounded structured Gemini adjustments to existing strength exercises', async () => {
    mocks.isGeminiConfigured.mockReturnValue(true);
    mocks.getUserProfile.mockResolvedValue({
      goal: 'strength',
      trainingMode: 'gym',
      trainingModality: 'full_gym',
      activityLevel: 'moderate',
      sex: 'male',
      age: 28,
      weightKg: 80,
      heightCm: 178,
      mealsPerDay: 4,
      preparticipation: {
        knownCardiometabolicDisease: false,
        exerciseSymptoms: false,
        currentlyActive: true,
        medicalClearance: false,
        contraindications: false,
        desiredIntensity: 'moderate',
      },
    });
    let target = null;
    mocks.callGeminiExerciseCoach.mockImplementation(async ({ weeklyPlan }) => {
      const day = weeklyPlan.days.find((d) =>
        Array.isArray(d.workout?.exercises)
        && d.workout.exercises.some((e) => e.prescription?.format === 'reps' && e.prescription.loadKg != null)
      );
      const exercise = day.workout.exercises.find((e) => e.prescription?.format === 'reps' && e.prescription.loadKg != null);
      target = {
        date: day.date,
        day: `${day.dayName} ${day.date}`,
        exercise: exercise.name,
        loadKg: exercise.prescription.loadKg,
        sets: exercise.prescription.sets,
      };
      return {
        coachSummary: 'Resumen IA',
        acsmJustification: 'FITT definido por objetivo.',
        prescriptionAdjustments: [
          {
            day: target.day,
            adjustment: 'Subir carga de forma controlada.',
            rationale: 'Buena recuperación.',
            evidence: 'readiness=85',
          },
        ],
        riskFlags: [],
        medicalDisclaimer: 'Educativo',
        structuredAdjustments: [
          { day: target.day, exercise: target.exercise, loadPct: 1.5, setsDelta: 4 },
          { day: target.day, exercise: 'Ejercicio inventado', loadPct: 0.5, setsDelta: -4 },
        ],
        diagnostics: {
          modelRequested: 'gemini-coach-model',
          modelResolved: 'gemini-2.5-flash',
          attempts: 1,
          generatedAt: '2026-06-08T10:00:00.000Z',
        },
      };
    });
    mocks.createWeeklyPlan.mockImplementation(async (_uid, payload) => ({ id: 'plan-ai', ...payload }));
    mocks.getLatestWeeklyPlan.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/weekly-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: '2026-06-08T00:00:00.000Z' }),
      })
    );
    const json = await readJson(response);
    const adjusted = json.plan.days
      .find((day) => day.date === target.date)
      .workout.exercises
      .find((exercise) => exercise.name === target.exercise);

    expect(response.status).toBe(201);
    expect(json.plan.coachMeta.structuredApplied).toBe(1);
    expect(adjusted.prescription.loadKg).toBe(Math.round((target.loadKg * 1.1) / 2.5) * 2.5);
    expect(adjusted.prescription.sets).toBe(target.sets + 1);
    expect(adjusted.prescription.coachAdjusted).toBe(true);
  });

  it('POST keeps fallback with failure code when Gemini coach fails', async () => {
    mocks.isGeminiConfigured.mockReturnValue(true);
    mocks.getUserProfile.mockResolvedValue({
      goal: 'hypertrophy',
      trainingMode: 'gym',
      trainingModality: 'full_gym',
      activityLevel: 'moderate',
      sex: 'male',
      age: 28,
      weightKg: 80,
      heightCm: 178,
      mealsPerDay: 4,
      preparticipation: {
        knownCardiometabolicDisease: false,
        exerciseSymptoms: false,
        currentlyActive: true,
        medicalClearance: false,
        contraindications: false,
        desiredIntensity: 'moderate',
      },
    });
    const coachError = new Error('Timeout');
    coachError.code = 'GEMINI_COACH_RUNTIME_ERROR';
    coachError.attempt = 3;
    coachError.model = 'gemini-coach-model';
    mocks.callGeminiExerciseCoach.mockRejectedValue(coachError);
    mocks.createWeeklyPlan.mockImplementation(async (_uid, payload) => ({ id: 'plan-fallback', ...payload }));
    mocks.getLatestWeeklyPlan.mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/weekly-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(201);
    expect(json.plan.coachSource).toBe('heuristic');
    expect(json.plan.coachMeta.source).toBe('heuristic');
    expect(json.plan.coachMeta.failureCode).toBe('GEMINI_COACH_RUNTIME_ERROR');
    expect(json.plan.coachMeta.fallbackApplied).toBe(true);
    expect(json.plan.coachMeta.attempts).toBe(3);
    expect(json.plan.coachWarning).toContain('GEMINI_COACH_RUNTIME_ERROR');
  });

  it('PATCH validates planId before persisting customizations', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/weekly-plan', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customizations: {} }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(400);
    expect(json.error).toContain('planId');
    expect(mocks.updateWeeklyPlanCustomizations).not.toHaveBeenCalled();
  });

  it('PATCH sanitizes and persists plan customizations', async () => {
    mocks.getUserProfile.mockResolvedValue({
      goal: 'strength',
      trainingMode: 'gym',
      trainingModality: 'full_gym',
      weightKg: 82,
    });
    mocks.updateWeeklyPlanCustomizations.mockImplementation(async (_uid, planId, customizations) => ({
      id: planId,
      goal: 'strength',
      trainingMode: 'gym',
      trainingModality: 'full_gym',
      days: [],
      customizations,
    }));

    const response = await PATCH(
      new Request('http://localhost/api/weekly-plan', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId: 'plan-123',
          customizations: {
            sessionSwapsByDate: {
              '2026-04-07': {
                title: 'Torso alternativo',
                sessionType: 'resistance',
                sessionFocus: 'upper',
                descriptor: 'Compatible',
                compatibilityNote: 'No pisa días vecinos',
                workout: {
                  title: 'Torso alternativo',
                  sessionFocus: 'upper',
                  durationMinutes: 62,
                  intensityRpe: 'RPE 7-8',
                  exercises: [
                    {
                      id: 'gym-bench-press',
                      name: 'Barbell Bench Press',
                    },
                  ],
                },
              },
            },
            exerciseSwapsByDate: {
              '2026-04-07': {
                'gym-bench-press-0': {
                  id: 'gym-incline-db-press',
                  name: 'Incline DB Press',
                },
              },
            },
          },
        }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(mocks.updateWeeklyPlanCustomizations).toHaveBeenCalledWith('user-1', 'plan-123', expect.objectContaining({
      version: 1,
      sessionSwapsByDate: expect.objectContaining({
        '2026-04-07': expect.objectContaining({
          title: 'Torso alternativo',
          sessionFocus: 'upper',
        }),
      }),
      exerciseSwapsByDate: expect.objectContaining({
        '2026-04-07': expect.objectContaining({
          'gym-bench-press-0': expect.objectContaining({
            id: 'gym-incline-db-press',
            name: 'Incline DB Press',
          }),
        }),
      }),
    }));
    expect(json.plan.customizations.sessionSwapsByDate['2026-04-07'].workout.exercises[0].id).toBe('gym-bench-press');
    expect(json.plan.customizations.exerciseSwapsByDate['2026-04-07']['gym-bench-press-0'].id).toBe('gym-incline-db-press');
  });
});
