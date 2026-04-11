import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getUserProfile: vi.fn(),
  upsertUserProfile: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  getUserProfile: mocks.getUserProfile,
  upsertUserProfile: mocks.upsertUserProfile,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
}));

const { GET, PUT } = await import('../../src/app/api/profile/route.js');

async function readJson(response) {
  return response.json();
}

describe('/api/profile route', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.getUserProfile.mockReset();
    mocks.upsertUserProfile.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1', email: 'user@example.com' });
  });

  it('GET returns default profile when no profile exists', async () => {
    mocks.getUserProfile.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/profile'));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.traceId).toBe('trace-test');
    expect(json.profile.userId).toBe('user-1');
    expect(json.profile.needsSetup).toBe(true);
    expect(json.profile.goal).toBe('weight_loss');
    expect(json.profile.trainingModality).toBe('full_gym');
    expect(json.profile.metabolicProfile).toBe('none');
    expect(json.profile.preparticipation).toBeTruthy();
    expect(json.profile.preparticipation.desiredIntensity).toBe('moderate');
    expect(json.profile.preparticipationUpdatedAt).toBeNull();
    expect(json.profile.screeningRefreshDays).toBe(15);
    expect(json.profile.nutritionPreferences).toBeTruthy();
    expect(json.profile.adaptiveThresholds).toBeTruthy();
  });

  it('PUT normalizes payload and persists profile with target macros', async () => {
    mocks.upsertUserProfile.mockImplementation(async (uid, payload) => ({
      id: 'main',
      userId: uid,
      ...payload,
    }));

    const response = await PUT(
      new Request('http://localhost/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: '  Juan  ',
          goal: 'invalid-goal',
          trainingMode: 'gym',
          activityLevel: 'high',
          sex: 'male',
          age: 32,
          weightKg: 82,
          heightCm: 178,
          mealsPerDay: 4,
          trainingModality: 'trx',
          metabolicProfile: 'prediabetes',
          preparticipation: {
            knownCardiometabolicDisease: true,
            exerciseSymptoms: false,
            currentlyActive: false,
            medicalClearance: false,
            contraindications: false,
            desiredIntensity: 'vigorous',
          },
          nutritionPreferences: {
            dietaryPattern: 'omnivore',
            allergies: ['marisco'],
            intolerances: ['lactosa'],
            dislikedFoods: ['brócoli'],
          },
          adaptiveThresholds: {
            highFatigue: 7.5,
            highSessionRpe: 8.4,
            lowCompletionRate: 0.58,
            lowAdherencePercent: 62,
            highReadiness: 80,
          },
        }),
      })
    );

    const json = await readJson(response);
    expect(response.status).toBe(200);
    expect(json.profile.displayName).toBe('Juan');
    expect(json.profile.goal).toBe('weight_loss');
    expect(json.profile.trainingModality).toBe('trx');
    expect(json.profile.metabolicProfile).toBe('prediabetes');
    expect(json.profile.preparticipation.knownCardiometabolicDisease).toBe(true);
    expect(json.profile.preparticipation.desiredIntensity).toBe('vigorous');
    expect(typeof json.profile.preparticipationUpdatedAt).toBe('string');
    expect(json.profile.screeningRefreshDays).toBe(15);
    expect(json.profile.nutritionPreferences.allergies).toContain('marisco');
    expect(json.profile.adaptiveThresholds.highFatigue).toBe(7.5);
    expect(json.profile.targetMacros).toBeTruthy();
    expect(json.profile.targetMacros.targetCalories).toBeGreaterThan(0);
  });

  it('PUT conserva fecha de cribado si no cambian respuestas y respeta ventana mínima', async () => {
    mocks.getUserProfile.mockResolvedValue({
      preparticipation: {
        knownCardiometabolicDisease: false,
        exerciseSymptoms: false,
        currentlyActive: true,
        medicalClearance: false,
        contraindications: false,
        desiredIntensity: 'moderate',
      },
      preparticipationUpdatedAt: '2026-03-10T00:00:00.000Z',
      screeningRefreshDays: 30,
    });
    mocks.upsertUserProfile.mockImplementation(async (uid, payload) => ({
      id: 'main',
      userId: uid,
      ...payload,
    }));

    const response = await PUT(
      new Request('http://localhost/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preparticipation: {
            knownCardiometabolicDisease: false,
            exerciseSymptoms: false,
            currentlyActive: true,
            medicalClearance: false,
            contraindications: false,
            desiredIntensity: 'moderate',
          },
          screeningRefreshDays: 10,
        }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.profile.preparticipationUpdatedAt).toBe('2026-03-10T00:00:00.000Z');
    expect(json.profile.screeningRefreshDays).toBe(15);
  });

  it('PUT returns 400 for invalid JSON body', async () => {
    const response = await PUT(
      new Request('http://localhost/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{"badJson":',
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(400);
    expect(json.error).toContain('JSON inválido');
  });
});
