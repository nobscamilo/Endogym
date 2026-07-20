import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getUserProfile: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  listWorkoutsSince: vi.fn(),
  listMetricsSince: vi.fn(),
  listMealsSince: vi.fn(),
  getWorkoutById: vi.fn(),
  getLastDoneWorkoutAt: vi.fn(),
  getCoachRecommendation: vi.fn(),
  saveCoachAnalysis: vi.fn(),
  getCoachAnalysis: vi.fn(),
  saveCoachRecommendation: vi.fn(),
  requestGoogleGenerateContent: vi.fn(),
  enforceUserRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return { AuthenticationError, getAuthenticatedUser: mocks.getAuthenticatedUser };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  getUserProfile: mocks.getUserProfile,
  getLatestWeeklyPlan: mocks.getLatestWeeklyPlan,
  listWorkoutsSince: mocks.listWorkoutsSince,
  listMetricsSince: mocks.listMetricsSince,
  listMealsSince: mocks.listMealsSince,
  getWorkoutById: mocks.getWorkoutById,
  getLastDoneWorkoutAt: mocks.getLastDoneWorkoutAt,
  getCoachRecommendation: mocks.getCoachRecommendation,
  saveCoachAnalysis: mocks.saveCoachAnalysis,
  getCoachAnalysis: mocks.getCoachAnalysis,
  saveCoachRecommendation: mocks.saveCoachRecommendation,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-coach-analysis' }),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/lib/rateLimit.js', () => ({
  RATE_LIMIT_SCOPES: { COACH_ANALYSIS: 'coach-analysis' },
  enforceUserRateLimit: mocks.enforceUserRateLimit,
  getRateLimitHeaders: mocks.getRateLimitHeaders,
}));

vi.mock('../../src/services/googleGenAiTransport.js', () => ({
  isValidGoogleAiModelName: vi.fn(() => true),
  requestGoogleGenerateContent: mocks.requestGoogleGenerateContent,
}));

vi.mock('../../src/services/exerciseCoachClient.js', () => ({
  resolveGeminiCoachModel: vi.fn(() => 'gemini-2.5-flash'),
}));

vi.mock('../../src/lib/aiMetrics.js', () => ({
  recordAiMetric: vi.fn(async () => {}),
}));

const { GET, POST } = await import('../../src/app/api/coach-analysis/route.js');

describe('/api/coach-analysis route — alineación con objetivos', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const workout = {
    id: 'w-1', source: 'manual', completed: true,
    performedAt: '2026-06-18T12:00:00.000Z', title: 'Fuerza', sessionRpe: 7,
    exercises: [{ name: 'Press banca', weightKg: 70, reps: 8, sets: 3 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // El digest del coach filtra los entrenos a los últimos COACH_ANALYSIS_LOOKBACK_DAYS (28)
    // vía Date.now(). Con fixtures de fecha fija, el test se PUDRE al avanzar el reloj real
    // (un entreno del 18-jun quedaba fuera de la ventana a partir de mediados de julio → la ruta
    // respondía no_workouts). Congelamos "hoy" a un instante fijo cercano a los fixtures (solo
    // Date, sin tocar timers reales) para que la ventana sea determinista.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-19T08:00:00.000Z'));
    process.env.GEMINI_API_KEY = 'test-key';
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.getUserProfile.mockResolvedValue({
      goal: 'weight_loss', weightKg: 84, age: 37, sex: 'male', trainingModality: 'full_gym',
      goalTarget: { kind: 'weightKg', goal: 'weight_loss', value: 80, date: '2026-09-01' },
    });
    mocks.getLatestWeeklyPlan.mockResolvedValue({ phaseLabel: 'Base', days: [] });
    mocks.listWorkoutsSince.mockResolvedValue([workout]);
    mocks.listMetricsSince.mockResolvedValue([
      { takenAt: '2026-05-20T12:00:00.000Z', weightKg: 86 },
      { takenAt: '2026-06-18T12:00:00.000Z', weightKg: 84 },
    ]);
    mocks.listMealsSince.mockResolvedValue([]);
    mocks.getLastDoneWorkoutAt.mockResolvedValue(workout.performedAt);
    mocks.getCoachRecommendation.mockResolvedValue(null);
    mocks.enforceUserRateLimit.mockResolvedValue({ allowed: true, limit: 6, remaining: 5, retryAfterSeconds: 3600 });
    mocks.getRateLimitHeaders.mockReturnValue({ 'ratelimit-limit': '6' });
    mocks.saveCoachAnalysis.mockImplementation(async (_uid, data) => ({ ...data, updatedAt: '2026-06-19T20:00:00.000Z' }));
    mocks.saveCoachRecommendation.mockResolvedValue({});
    mocks.getCoachAnalysis.mockResolvedValue(null);
    mocks.requestGoogleGenerateContent.mockResolvedValue({
      response: {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
          lastSession: 'Sesión analizada.',
          history: 'Tendencia observada.',
          goalAlignment: 'El peso baja hacia 80 kg con la tendencia registrada.',
          adjustments: ['Mantén el plan y registra la próxima medición.'],
          warning: '',
        }) }] } }] }),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it('inyecta meta, valor actual y fecha en el prompt y exige goalAlignment en la respuesta', async () => {
    const response = await POST(new Request('http://localhost/api/coach-analysis', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.report.goalAlignment).toContain('80 kg');
    const prompt = mocks.requestGoogleGenerateContent.mock.calls[0][0].parts[0].text;
    expect(prompt).toContain('Objetivo SMART: Peso objetivo 80 kg para 2026-09-01');
    expect(prompt).toContain('Actual: 84 kg');
    expect(prompt).toContain('goalAlignment');
    expect(mocks.saveCoachAnalysis).toHaveBeenCalledWith('user-1', expect.objectContaining({
      report: expect.objectContaining({ goalAlignment: expect.any(String) }),
    }));
  });

  it('sin Gemini usa fallback orientado a endurance/21K, no una recomendación genérica de cargas', async () => {
    delete process.env.GEMINI_API_KEY;
    mocks.getUserProfile.mockResolvedValue({
      goal: 'endurance', age: 37, trainingModality: 'hybrid_run_gym',
      runRaceGoal: 'race_21k', raceDate: '2026-11-08',
    });
    mocks.getLatestWeeklyPlan.mockResolvedValue({
      phaseLabel: 'Base aeróbica', raceGoal: 'race_21k',
      days: [
        { date: '2026-06-17', workout: { runPrescription: { runType: 'long' } } },
        { date: '2026-06-18', workout: { runPrescription: { runType: 'intervals' } } },
      ],
    });
    mocks.listWorkoutsSince.mockResolvedValue([{
      id: 'run-1', source: 'strava', sportType: 'Run', completed: true,
      performedAt: '2026-06-18T12:00:00.000Z', title: 'Series', durationMinutes: 45,
      distanceKm: 7, avgHeartRate: 150, maxHeartRate: 181,
    }]);
    mocks.listMetricsSince.mockResolvedValue([]);

    const response = await POST(new Request('http://localhost/api/coach-analysis', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toBe('heuristic');
    expect(json.report.goalAlignment).toMatch(/21K|resistencia/i);
    expect(json.report.adjustments.join(' ')).toMatch(/carrera|tirada|calidad/i);
    expect(json.report.adjustments.join(' ')).not.toContain('progresión normal de cargas');
    expect(mocks.requestGoogleGenerateContent).not.toHaveBeenCalled();
  });

  it('reintenta con thinkingBudget cuando la primera respuesta degenera en JSON truncado (bucle \\t) y aún devuelve source ai', async () => {
    // Reproduce el bug del 20-jul-2026: gemini-2.5-flash con responseSchema + temperatura
    // baja devolvía '{"lastSession": "Tu \n\t\t\t…' hasta MAX_TOKENS. El primer intento
    // falla el JSON.parse; el reintento (thinkingBudget 512) debe salvar el informe.
    const degenerate = '{"lastSession": "Tu \\n' + '\\t'.repeat(200);
    mocks.requestGoogleGenerateContent
      .mockResolvedValueOnce({
        response: { ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: degenerate }] } }] }) },
      })
      .mockResolvedValueOnce({
        response: { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
          lastSession: 'Sesión recuperada en el reintento.',
          history: 'Tendencia.',
          goalAlignment: 'Avanza hacia 80 kg.',
          adjustments: ['Mantener plan.'],
          warning: '',
        }) }] } }] }) },
      });

    const response = await POST(new Request('http://localhost/api/coach-analysis', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toBe('ai');
    expect(json.report.lastSession).toContain('reintento');
    expect(mocks.requestGoogleGenerateContent).toHaveBeenCalledTimes(2);
    const firstCfg = mocks.requestGoogleGenerateContent.mock.calls[0][0].generationConfig;
    const retryCfg = mocks.requestGoogleGenerateContent.mock.calls[1][0].generationConfig;
    expect(firstCfg.thinkingConfig.thinkingBudget).toBe(0);
    expect(retryCfg.thinkingConfig.thinkingBudget).toBe(512);
    expect(firstCfg.temperature).toBe(1.0);
  });

  it('si ambos intentos de IA degeneran cae al heurístico (source heuristic), no a un 5xx', async () => {
    const degenerate = '{"lastSession": "Tu \\n' + '\\t'.repeat(200);
    mocks.requestGoogleGenerateContent.mockResolvedValue({
      response: { ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: degenerate }] } }] }) },
    });

    const response = await POST(new Request('http://localhost/api/coach-analysis', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toBe('heuristic');
    expect(json.report.lastSession).toBeTruthy();
    expect(mocks.requestGoogleGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('GET marca stale un informe legacy cuando cambia el contrato/contexto aunque no haya workout nuevo', async () => {
    mocks.getCoachAnalysis.mockResolvedValue({
      signature: '1-firma-legacy', source: 'ai', updatedAt: '2026-06-18T10:00:00Z',
      report: { lastSession: 'Anterior', history: 'Anterior', adjustments: ['Anterior'], warning: '' },
    });
    const response = await GET(new Request('http://localhost/api/coach-analysis'));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.stale).toBe(true);
  });
});
