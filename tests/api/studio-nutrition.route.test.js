import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getUserProfile: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  getStudioNutritionPlan: vi.fn(),
  saveStudioNutritionPlan: vi.fn(),
  requestGoogleGenerateContent: vi.fn(),
  resolveGeminiCoachModel: vi.fn(),
  logInfo: vi.fn(),
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
  getUserProfile: mocks.getUserProfile,
  getLatestWeeklyPlan: mocks.getLatestWeeklyPlan,
  getStudioNutritionPlan: mocks.getStudioNutritionPlan,
  saveStudioNutritionPlan: mocks.saveStudioNutritionPlan,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logInfo: mocks.logInfo,
  logError: mocks.logError,
}));

vi.mock('../../src/lib/rateLimit.js', () => ({
  RATE_LIMIT_SCOPES: { STUDIO_NUTRITION: 'studio-nutrition' },
  enforceUserRateLimit: vi.fn(async () => ({ allowed: true, limit: 12, remaining: 11, retryAfterSeconds: 3600 })),
  getRateLimitHeaders: vi.fn(() => ({ 'ratelimit-limit': '12' })),
}));

vi.mock('../../src/services/googleGenAiTransport.js', () => ({
  isValidGoogleAiModelName: vi.fn(() => true),
  requestGoogleGenerateContent: mocks.requestGoogleGenerateContent,
}));

vi.mock('../../src/services/exerciseCoachClient.js', () => ({
  resolveGeminiCoachModel: mocks.resolveGeminiCoachModel,
}));

const { GET, POST } = await import('../../src/app/api/studio-nutrition/route.js');

const DAY_NAMES = [
  ['lunes', 'Lun'],
  ['martes', 'Mar'],
  ['miércoles', 'Mié'],
  ['jueves', 'Jue'],
  ['viernes', 'Vie'],
  ['sábado', 'Sáb'],
  ['domingo', 'Dom'],
];

function meal(slot, kcal, p) {
  return {
    slot,
    dish: `${slot} test`,
    kcal,
    p,
    c: 20,
    f: 10,
    ingredients: ['Ingrediente 100 g'],
    steps: ['Preparar', 'Servir'],
    serving: 'Ajustado al objetivo',
  };
}

function dayPlan(day, kcal = 1000, protein = 100) {
  const perMealKcal = Math.round(kcal / 4);
  const perMealProtein = Math.round(protein / 4);
  return {
    day,
    meals: ['Desayuno', 'Comida', 'Merienda', 'Cena'].map((slot) => meal(slot, perMealKcal, perMealProtein)),
  };
}

function chunk(days, kcal = 1000, protein = 100) {
  return {
    days: days.map((day) => dayPlan(day, kcal, protein)),
    shopping: [{ cat: 'Proteínas', items: [{ name: 'Pollo', qty: '1 kg' }] }],
    batch: [{ title: 'Cocinar base', desc: 'Preparar proteínas', time: '45 min', day: 'Dom' }],
  };
}

function enqueueGeminiChunks(chunks) {
  const queue = [...chunks];
  mocks.requestGoogleGenerateContent.mockImplementation(async () => {
    const payload = queue.shift();
    if (!payload) throw new Error('No hay chunk en cola');
    return {
      response: {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(payload) }] } },
          ],
        }),
      },
    };
  });
}

function weeklyPlan() {
  return {
    baseTarget: { targetCalories: 1000, proteinGrams: 100, carbsGrams: 100, fatGrams: 40 },
    raceGoal: 'health',
    phaseLabel: 'Base',
    days: DAY_NAMES.map(([dayName]) => ({
      dayName,
      sessionType: 'resistance',
      workout: { title: 'Fuerza' },
      nutritionTarget: {
        calories: 1000,
        proteinGrams: 100,
        carbsGrams: 100,
        fatGrams: 40,
        carbLevel: 'medio',
      },
    })),
  };
}

async function readJson(response) {
  return response.json();
}

describe('/api/studio-nutrition route', () => {
  const envBackup = { GEMINI_API_KEY: process.env.GEMINI_API_KEY };

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mocks.getAuthenticatedUser.mockReset();
    mocks.getUserProfile.mockReset();
    mocks.getLatestWeeklyPlan.mockReset();
    mocks.getStudioNutritionPlan.mockReset();
    mocks.saveStudioNutritionPlan.mockReset();
    mocks.requestGoogleGenerateContent.mockReset();
    mocks.resolveGeminiCoachModel.mockReset();
    mocks.logInfo.mockReset();
    mocks.logError.mockReset();

    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.getUserProfile.mockResolvedValue({ goal: 'strength' });
    mocks.getLatestWeeklyPlan.mockResolvedValue(weeklyPlan());
    mocks.resolveGeminiCoachModel.mockReturnValue('gemini-2.5-flash');
    mocks.saveStudioNutritionPlan.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (envBackup.GEMINI_API_KEY === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = envBackup.GEMINI_API_KEY;
    }
  });

  it('retries when daily macro validation detects drift and saves the better plan', async () => {
    enqueueGeminiChunks([
      chunk(['Lun', 'Mar'], 600, 55),
      chunk(['Mié', 'Jue'], 1000, 100),
      chunk(['Vie', 'Sáb'], 1000, 100),
      chunk(['Dom'], 1000, 100),
      chunk(['Lun', 'Mar'], 1000, 100),
      chunk(['Mié', 'Jue'], 1000, 100),
      chunk(['Vie', 'Sáb'], 1000, 100),
      chunk(['Dom'], 1000, 100),
    ]);

    const response = await POST(new Request('http://localhost/api/studio-nutrition', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    // Reintento DIRIGIDO: solo se regenera el trozo con drift (Lun-Mar) → 4 iniciales + 1.
    expect(mocks.requestGoogleGenerateContent).toHaveBeenCalledTimes(5);
    expect(json.macroCheck.driftDays).toEqual([]);
    expect(json.nutrition.meta.planSignature).toMatch(/^[a-f0-9]{16}$/);
    expect(mocks.saveStudioNutritionPlan).toHaveBeenCalledTimes(1);
    expect(mocks.saveStudioNutritionPlan.mock.calls[0][2].meta.planSignature).toBe(json.nutrition.meta.planSignature);
    expect(mocks.logInfo).toHaveBeenCalledWith('studio_nutrition_macro_retry', expect.objectContaining({
      userId: 'user-1',
      targetedChunks: [0],
    }));
  });

  it('does not save a complete plan when severe macro drift remains after retry', async () => {
    enqueueGeminiChunks([
      chunk(['Lun', 'Mar'], 600, 55),
      chunk(['Mié', 'Jue'], 600, 55),
      chunk(['Vie', 'Sáb'], 600, 55),
      chunk(['Dom'], 600, 55),
      chunk(['Lun', 'Mar'], 600, 55),
      chunk(['Mié', 'Jue'], 600, 55),
      chunk(['Vie', 'Sáb'], 600, 55),
      chunk(['Dom'], 600, 55),
    ]);

    const response = await POST(new Request('http://localhost/api/studio-nutrition', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    const json = await readJson(response);

    expect(response.status).toBe(502);
    expect(json.details.macroCheck.severeDriftDays).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
    expect(mocks.saveStudioNutritionPlan).not.toHaveBeenCalled();
  });

  it('marks cached nutrition stale when the training plan signature changed', async () => {
    mocks.getStudioNutritionPlan.mockResolvedValue({
      days: [dayPlan('Lun')],
      shopping: [],
      batch: [],
      meta: {
        version: 1,
        planSignature: 'oldsignature0000',
      },
    });

    const response = await GET(new Request('http://localhost/api/studio-nutrition'));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.empty).toBe(true);
    expect(json.stale).toBe(true);
    expect(json.reason).toBe('training_plan_changed');
    expect(json.planSignature).toMatch(/^[a-f0-9]{16}$/);
  });
});
