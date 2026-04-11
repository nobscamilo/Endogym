import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  getUserProfile: vi.fn(),
  createMeal: vi.fn(),
  getAdminServices: vi.fn(),
  callGeminiPlateModel: vi.fn(),
  isGeminiConfigured: vi.fn(),
  resolveGeminiPlateModel: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  getLatestWeeklyPlan: mocks.getLatestWeeklyPlan,
  getUserProfile: mocks.getUserProfile,
  createMeal: mocks.createMeal,
}));

vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: mocks.getAdminServices,
}));

vi.mock('../../src/services/geminiClient.js', () => ({
  callGeminiPlateModel: mocks.callGeminiPlateModel,
  isGeminiConfigured: mocks.isGeminiConfigured,
  resolveGeminiPlateModel: mocks.resolveGeminiPlateModel,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logError: mocks.logError,
}));

const { POST } = await import('../../src/app/api/analyze-plate/route.js');

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function readJson(response) {
  return response.json();
}

describe('/api/analyze-plate route', () => {
  const envBackup = {
    GEMINI_FORCE_MOCK: process.env.GEMINI_FORCE_MOCK,
    GEMINI_FALLBACK_TO_MOCK: process.env.GEMINI_FALLBACK_TO_MOCK,
  };

  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.getLatestWeeklyPlan.mockReset();
    mocks.createMeal.mockReset();
    mocks.getUserProfile.mockReset();
    mocks.getAdminServices.mockReset();
    mocks.callGeminiPlateModel.mockReset();
    mocks.isGeminiConfigured.mockReset();
    mocks.resolveGeminiPlateModel.mockReset();
    mocks.logError.mockReset();

    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.getLatestWeeklyPlan.mockResolvedValue({
      id: 'plan-1',
      startDate: todayIsoDate(),
      endDate: todayIsoDate(),
      days: [
        {
          date: todayIsoDate(),
          nutritionTarget: {
            calories: 2400,
            proteinGrams: 180,
            carbsGrams: 250,
            fatGrams: 80,
          },
          meals: [{ slot: 'Desayuno' }, { slot: 'Comida' }, { slot: 'Merienda' }, { slot: 'Cena' }],
        },
      ],
    });
    mocks.createMeal.mockImplementation(async (_uid, payload) => ({
      id: 'meal-1',
      ...payload,
    }));
    mocks.getUserProfile.mockResolvedValue({
      goal: 'weight_loss',
      metabolicProfile: 'none',
      activityLevel: 'moderate',
      trainingModality: 'full_gym',
      nutritionPreferences: {
        dietaryPattern: 'omnivore',
        allergies: ['marisco'],
        intolerances: [],
        dislikedFoods: [],
      },
      legalConsents: {
        dataProcessingAccepted: true,
      },
    });
    mocks.getAdminServices.mockReturnValue({
      storage: {
        bucket: () => ({
          file: () => ({
            save: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      },
    });
    mocks.resolveGeminiPlateModel.mockReturnValue('gemini-plate-model');

    process.env.GEMINI_FORCE_MOCK = 'false';
    process.env.GEMINI_FALLBACK_TO_MOCK = 'true';
  });

  afterEach(() => {
    process.env.GEMINI_FORCE_MOCK = envBackup.GEMINI_FORCE_MOCK;
    process.env.GEMINI_FALLBACK_TO_MOCK = envBackup.GEMINI_FALLBACK_TO_MOCK;
  });

  it('returns 400 when imageBase64 is missing', async () => {
    mocks.isGeminiConfigured.mockReturnValue(false);
    const response = await POST(
      new Request('http://localhost/api/analyze-plate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ context: { dish: 'x' } }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(400);
    expect(json.error).toContain('imageBase64');
  });

  it('uses Gemini output when configured and healthy', async () => {
    mocks.isGeminiConfigured.mockReturnValue(true);
    mocks.callGeminiPlateModel.mockResolvedValue({
      confidence: 0.91,
      notes: ['Alta confianza'],
      foods: [
        {
          name: 'Pollo con arroz',
          calories: 620,
          proteinGrams: 42,
          carbsGrams: 65,
          fatGrams: 16,
          availableCarbsGrams: 58,
          glycemicIndex: 57,
          processedLevel: 1,
        },
      ],
    });

    const response = await POST(
      new Request('http://localhost/api/analyze-plate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: `data:image/jpeg;base64,${Buffer.from('fake-image').toString('base64')}`,
          context: { dish: 'Pollo con arroz' },
          eatenAt: new Date().toISOString(),
        }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(201);
    expect(json.model.source).toBe('gemini');
    expect(json.model.fallbackApplied).toBe(false);
    expect(json.analysis.totals.calories).toBe(620);
    expect(json.meal.id).toBe('meal-1');
    expect(mocks.callGeminiPlateModel).toHaveBeenCalledTimes(1);
  });

  it('falls back to mock when Gemini fails and fallback is enabled', async () => {
    mocks.isGeminiConfigured.mockReturnValue(true);
    mocks.callGeminiPlateModel.mockRejectedValue(new Error('upstream failure'));

    const response = await POST(
      new Request('http://localhost/api/analyze-plate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: `data:image/jpeg;base64,${Buffer.from('fake-image').toString('base64')}`,
          context: { dish: 'Plato fallback' },
        }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(201);
    expect(json.model.source).toBe('mock');
    expect(json.model.fallbackApplied).toBe(true);
    expect(json.warning).toContain('fallback');
    expect(mocks.logError).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when Gemini fails and fallback is disabled', async () => {
    process.env.GEMINI_FALLBACK_TO_MOCK = 'false';
    mocks.isGeminiConfigured.mockReturnValue(true);
    mocks.callGeminiPlateModel.mockRejectedValue(new Error('upstream failure'));

    const response = await POST(
      new Request('http://localhost/api/analyze-plate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: `data:image/jpeg;base64,${Buffer.from('fake-image').toString('base64')}`,
          context: { dish: 'No fallback' },
        }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(500);
    expect(json.error).toContain('Error interno');
  });

  it('keeps analysis response when Firebase Storage upload fails', async () => {
    mocks.isGeminiConfigured.mockReturnValue(true);
    mocks.callGeminiPlateModel.mockResolvedValue({
      confidence: 0.76,
      notes: ['Estimación utilizable'],
      diagnostics: {
        backend: 'gemini',
        modelResolved: 'gemini-2.5-flash',
      },
      foods: [
        {
          name: 'Plato combinado',
          calories: 540,
          proteinGrams: 36,
          carbsGrams: 52,
          fatGrams: 18,
          availableCarbsGrams: 44,
          glycemicIndex: 55,
          processedLevel: 1,
        },
      ],
    });
    mocks.getAdminServices.mockReturnValue({
      storage: {
        bucket: () => ({
          file: () => ({
            save: vi.fn().mockRejectedValue(new Error('bucket offline')),
          }),
        }),
      },
    });

    const response = await POST(
      new Request('http://localhost/api/analyze-plate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: `data:image/jpeg;base64,${Buffer.from('fake-image').toString('base64')}`,
          context: { dish: 'Plato combinado' },
        }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(201);
    expect(json.analysis.totals.calories).toBe(540);
    expect(json.warning).toContain('No se pudo guardar la foto del plato');
    expect(json.storagePath).toBeNull();
  });
});
