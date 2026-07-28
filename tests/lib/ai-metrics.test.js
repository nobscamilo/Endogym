import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n) => ({ __inc: n }) },
}));

vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: async () => ({
    db: {
      collection: () => ({
        doc: () => ({ update: mocks.update, set: mocks.set }),
      }),
    },
  }),
}));

const { recordAiMetric, tokensFromGeminiResponse, addTokenUsage, fallbackReasonField } = await import('../../src/lib/aiMetrics.js');

describe('aiMetrics — observabilidad de IA (20-jul-2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue();
    mocks.set.mockResolvedValue();
  });

  it('usa update() con rutas anidadas "endpoint.campo" (fix del bug de claves planas de set+merge)', async () => {
    await recordAiMetric('studio-nutrition', { calls: 5, tokensIn: 1200, tokensOut: 900, tokensThink: 100 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const arg = mocks.update.mock.calls[0][0];
    expect(arg['studio-nutrition.calls']).toEqual({ __inc: 5 });
    expect(arg['studio-nutrition.tokensIn']).toEqual({ __inc: 1200 });
    expect(arg['studio-nutrition.tokensThink']).toEqual({ __inc: 100 });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('si el doc del día no existe, cae a set() con la MISMA forma anidada (mapa por endpoint)', async () => {
    mocks.update.mockRejectedValue(new Error('NOT_FOUND'));
    await recordAiMetric('coach-chat', { calls: 1, tokensOut: 200 });
    expect(mocks.set).toHaveBeenCalledTimes(1);
    const [doc, opts] = mocks.set.mock.calls[0];
    expect(doc['coach-chat']).toEqual({ calls: { __inc: 1 }, tokensOut: { __inc: 200 } });
    expect(opts).toEqual({ merge: true });
  });

  it('ignora campos desconocidos, valores no numéricos y ceros; nunca lanza', async () => {
    await recordAiMetric('coach-chat', { calls: 0, invented: 9, tokensIn: 'x' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    // Fallo total de Firestore → best-effort, sin excepción.
    mocks.update.mockRejectedValue(new Error('down'));
    mocks.set.mockRejectedValue(new Error('down'));
    await expect(recordAiMetric('coach-chat', { calls: 1 })).resolves.toBeUndefined();
  });

  it('tokensFromGeminiResponse extrae in/out/pensamiento/cacheado (los cuatro se facturan distinto)', () => {
    const usage = tokensFromGeminiResponse({ usageMetadata: {
      promptTokenCount: 900, candidatesTokenCount: 300, thoughtsTokenCount: 7700, cachedContentTokenCount: 598,
    } });
    expect(usage).toEqual({ tokensIn: 900, tokensOut: 300, tokensThink: 7700, tokensCached: 598 });
    expect(tokensFromGeminiResponse({})).toEqual({ tokensIn: 0, tokensOut: 0, tokensThink: 0, tokensCached: 0 });
  });

  it('addTokenUsage acumula entre llamadas de una misma operación (trozos de nutrición)', () => {
    const total = addTokenUsage(
      { tokensIn: 900, tokensOut: 600 },
      { tokensIn: 950, tokensOut: 620, tokensThink: 10, tokensCached: 500 },
    );
    expect(total).toEqual({ tokensIn: 1850, tokensOut: 1220, tokensThink: 10, tokensCached: 500 });
  });

  it('fallbackReasonField traduce cada codigo de fallo a su contador', async () => {
    expect(fallbackReasonField('GEMINI_COACH_TIMEOUT')).toBe('fbTimeout');
    expect(fallbackReasonField('GEMINI_COACH_HTTP_RETRIABLE')).toBe('fbHttp');
    expect(fallbackReasonField('GEMINI_COACH_HTTP_ERROR')).toBe('fbHttp');
    expect(fallbackReasonField('GEMINI_COACH_PARSE_ERROR')).toBe('fbParse');
    expect(fallbackReasonField('GEMINI_COACH_INVALID_PAYLOAD')).toBe('fbInvalid');
    expect(fallbackReasonField('GEMINI_COACH_NOT_CONFIGURED')).toBe('fbNotConfigured');
    // Un codigo desconocido no se pierde: cae en fbOther, nunca en undefined.
    expect(fallbackReasonField('LO_QUE_SEA')).toBe('fbOther');
    expect(fallbackReasonField(undefined)).toBe('fbOther');
  });

  it('los contadores de motivo pasan el filtro de campos permitidos', async () => {
    await recordAiMetric('weekly-plan', { fallbacks: 1, fbTimeout: 1 });
    const arg = mocks.update.mock.calls[0][0];
    expect(arg['weekly-plan.fbTimeout']).toEqual({ __inc: 1 });
    expect(arg['weekly-plan.fallbacks']).toEqual({ __inc: 1 });
  });
});
