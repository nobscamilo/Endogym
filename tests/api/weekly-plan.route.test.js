import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  listWeeklyPlans: vi.fn(),
  getUserProfile: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  createWeeklyPlan: vi.fn(),
  updateWeeklyPlanCustomizations: vi.fn(),
  listMealsSince: vi.fn(),
  listMetricsSince: vi.fn(),
  listWorkoutsSince: vi.fn(),
  upsertUserProfile: vi.fn(),
  isGeminiConfigured: vi.fn(),
  callGeminiExerciseCoach: vi.fn(),
  resolveGeminiCoachModel: vi.fn(),
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
  updateWeeklyPlanCustomizations: mocks.updateWeeklyPlanCustomizations,
  listMealsSince: mocks.listMealsSince,
  listMetricsSince: mocks.listMetricsSince,
  listWorkoutsSince: mocks.listWorkoutsSince,
  upsertUserProfile: mocks.upsertUserProfile,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/services/exerciseCoachClient.js', () => ({
  isGeminiConfigured: mocks.isGeminiConfigured,
  callGeminiExerciseCoach: mocks.callGeminiExerciseCoach,
  resolveGeminiCoachModel: mocks.resolveGeminiCoachModel,
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
    mocks.updateWeeklyPlanCustomizations.mockReset();
    mocks.listMealsSince.mockReset();
    mocks.listMetricsSince.mockReset();
    mocks.listWorkoutsSince.mockReset();
    mocks.upsertUserProfile.mockReset();
    mocks.isGeminiConfigured.mockReset();
    mocks.callGeminiExerciseCoach.mockReset();
    mocks.resolveGeminiCoachModel.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.isGeminiConfigured.mockReturnValue(false);
    mocks.resolveGeminiCoachModel.mockReturnValue('gemini-coach-model');
    mocks.listMealsSince.mockResolvedValue([]);
    mocks.listMetricsSince.mockResolvedValue([]);
    mocks.listWorkoutsSince.mockResolvedValue([]);
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
    expect(json.plan.days).toHaveLength(7);
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
