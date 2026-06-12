import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  saveCoachFeedback: vi.fn(),
  recordAiMetric: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return { AuthenticationError, getAuthenticatedUser: mocks.getAuthenticatedUser };
});
vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  saveCoachFeedback: mocks.saveCoachFeedback,
}));
vi.mock('../../src/lib/aiMetrics.js', () => ({
  recordAiMetric: mocks.recordAiMetric,
}));
vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_op, handler) => handler({ traceId: 'trace-test' }),
  logError: vi.fn(),
}));

const { POST } = await import('../../src/app/api/coach-feedback/route.js');

function post(body) {
  return POST(new Request('http://localhost/api/coach-feedback', { method: 'POST', body: JSON.stringify(body) }));
}

describe('/api/coach-feedback (FASE 3.4)', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.saveCoachFeedback.mockReset();
    mocks.recordAiMetric.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.saveCoachFeedback.mockResolvedValue(undefined);
    mocks.recordAiMetric.mockResolvedValue(undefined);
  });

  it('guarda rating con hash (sin contenido) y cuenta la métrica', async () => {
    const res = await post({ endpoint: 'coach-chat', rating: 'up', contextHash: 'abc123' });
    expect(res.status).toBe(200);
    expect(mocks.saveCoachFeedback).toHaveBeenCalledWith('user-1', { endpoint: 'coach-chat', rating: 'up', contextHash: 'abc123' });
    expect(mocks.recordAiMetric).toHaveBeenCalledWith('coach-chat', { feedbackUp: 1 });
  });

  it('rechaza endpoint o rating inválidos con 400', async () => {
    expect((await post({ endpoint: 'otro', rating: 'up' })).status).toBe(400);
    expect((await post({ endpoint: 'coach-chat', rating: 'meh' })).status).toBe(400);
    expect(mocks.saveCoachFeedback).not.toHaveBeenCalled();
  });

  it('👎 cuenta como feedbackDown', async () => {
    await post({ endpoint: 'coach-analysis', rating: 'down' });
    expect(mocks.recordAiMetric).toHaveBeenCalledWith('coach-analysis', { feedbackDown: 1 });
  });

  it('requiere autenticación', async () => {
    const { AuthenticationError } = await import('../../src/lib/auth.js');
    mocks.getAuthenticatedUser.mockRejectedValue(new AuthenticationError('no'));
    expect((await post({ endpoint: 'coach-chat', rating: 'up' })).status).toBe(401);
  });
});
