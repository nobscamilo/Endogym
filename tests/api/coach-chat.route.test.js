import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getUserProfile: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  listWorkoutsSince: vi.fn(),
  requestGoogleGenerateContent: vi.fn(),
  resolveGeminiCoachModel: vi.fn(),
  enforceUserRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
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
  listWorkoutsSince: mocks.listWorkoutsSince,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logInfo: mocks.logInfo,
  logError: mocks.logError,
}));

vi.mock('../../src/lib/rateLimit.js', () => ({
  RATE_LIMIT_SCOPES: {
    COACH_CHAT: 'coach-chat',
  },
  enforceUserRateLimit: mocks.enforceUserRateLimit,
  getRateLimitHeaders: mocks.getRateLimitHeaders,
}));

vi.mock('../../src/services/guidelinesRetriever.js', () => ({
  retrieveGuidelinesContext: vi.fn(async () => 'CONTEXTO RAG DE PRUEBA'),
}));

vi.mock('../../src/services/googleGenAiTransport.js', () => ({
  isValidGoogleAiModelName: vi.fn(() => true),
  requestGoogleGenerateContent: mocks.requestGoogleGenerateContent,
}));

vi.mock('../../src/services/exerciseCoachClient.js', () => ({
  resolveGeminiCoachModel: mocks.resolveGeminiCoachModel,
}));

const { POST } = await import('../../src/app/api/coach-chat/route.js');

async function readJson(response) {
  return response.json();
}

describe('/api/coach-chat route', () => {
  const envBackup = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    mocks.getAuthenticatedUser.mockReset();
    mocks.getUserProfile.mockReset();
    mocks.getLatestWeeklyPlan.mockReset();
    mocks.listWorkoutsSince.mockReset();
    mocks.requestGoogleGenerateContent.mockReset();
    mocks.resolveGeminiCoachModel.mockReset();
    mocks.enforceUserRateLimit.mockReset();
    mocks.getRateLimitHeaders.mockReset();
    mocks.logInfo.mockReset();
    mocks.logError.mockReset();

    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.getUserProfile.mockResolvedValue({ goal: 'strength', trainingModality: 'full_gym' });
    mocks.getLatestWeeklyPlan.mockResolvedValue(null);
    mocks.listWorkoutsSince.mockResolvedValue([]);
    mocks.resolveGeminiCoachModel.mockReturnValue('gemini-2.5-flash');
    mocks.enforceUserRateLimit.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 19,
      retryAfterSeconds: 3600,
    });
    mocks.getRateLimitHeaders.mockReturnValue({
      'ratelimit-limit': '20',
      'ratelimit-remaining': '19',
      'ratelimit-reset': '3600',
    });
    mocks.requestGoogleGenerateContent.mockResolvedValue({
      response: {
        ok: true,
        json: async () => ({
          candidates: [
            { content: { parts: [{ text: 'Respuesta personalizada.' }] } },
          ],
        }),
      },
    });
  });

  afterEach(() => {
    if (envBackup.GEMINI_API_KEY === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = envBackup.GEMINI_API_KEY;
    }
  });

  it('uses the persistent coach chat rate limit before calling Gemini', async () => {
    const response = await POST(new Request('http://localhost/api/coach-chat', {
      method: 'POST',
      body: JSON.stringify({ prompt: '¿Subo peso hoy?' }),
    }));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('ratelimit-limit')).toBe('20');
    expect(json.text).toBe('Respuesta personalizada.');
    expect(mocks.enforceUserRateLimit).toHaveBeenCalledWith({
      userId: 'user-1',
      scope: 'coach-chat',
    });
    expect(mocks.requestGoogleGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('identifica la sesión de HOY por fecha en bloques de 21 días e inyecta el RAG', async () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const days = Array.from({ length: 21 }, (_, i) => {
      const d = new Date(`${todayKey}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + (i - 10)); // hoy queda en el medio del bloque
      const date = d.toISOString().slice(0, 10);
      return {
        date,
        isTrainingDay: true,
        workout: { title: date === todayKey ? 'Sesión correcta de HOY' : `Otra sesión ${i}` },
      };
    });
    mocks.getLatestWeeklyPlan.mockResolvedValue({ days });

    const response = await POST(new Request('http://localhost/api/coach-chat', {
      method: 'POST',
      body: JSON.stringify({ prompt: '¿Qué toca hoy?' }),
    }));

    expect(response.status).toBe(200);
    const sentPrompt = mocks.requestGoogleGenerateContent.mock.calls[0][0].parts[0].text;
    expect(sentPrompt).toContain('Sesión correcta de HOY');
    expect(sentPrompt).not.toContain('Otra sesión 0'); // antes caía a days[0]
    expect(sentPrompt).toContain('CONTEXTO RAG DE PRUEBA');
  });

  it('returns 429 and skips Gemini when the coach chat budget is exhausted', async () => {
    mocks.enforceUserRateLimit.mockResolvedValue({
      allowed: false,
      limit: 20,
      remaining: 0,
      retryAfterSeconds: 120,
    });
    mocks.getRateLimitHeaders.mockReturnValue({
      'ratelimit-limit': '20',
      'ratelimit-remaining': '0',
      'ratelimit-reset': '120',
      'retry-after': '120',
    });

    const response = await POST(new Request('http://localhost/api/coach-chat', {
      method: 'POST',
      body: JSON.stringify({ prompt: '¿Qué hago hoy?' }),
    }));
    const json = await readJson(response);

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('120');
    expect(json.details.retryAfterSeconds).toBe(120);
    expect(mocks.requestGoogleGenerateContent).not.toHaveBeenCalled();
    expect(mocks.logInfo).toHaveBeenCalledWith('rate_limit_exceeded', expect.objectContaining({
      scope: 'coach-chat',
      retryAfterSeconds: 120,
    }));
  });
});
