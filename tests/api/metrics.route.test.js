import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  listMetrics: vi.fn(),
  createMetricLog: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  listMetrics: mocks.listMetrics,
  createMetricLog: mocks.createMetricLog,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
}));

const { GET, POST } = await import('../../src/app/api/metrics/route.js');

async function readJson(response) {
  return response.json();
}

describe('/api/metrics route', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.listMetrics.mockReset();
    mocks.createMetricLog.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1', email: 'user@example.com' });
  });

  it('GET validates limit range', async () => {
    const response = await GET(new Request('http://localhost/api/metrics?limit=500'));
    const json = await readJson(response);

    expect(response.status).toBe(400);
    expect(json.error).toContain('"limit"');
  });

  it('GET returns metrics list', async () => {
    mocks.listMetrics.mockResolvedValue([{ id: 'm1', weightKg: 80 }]);

    const response = await GET(new Request('http://localhost/api/metrics?limit=5'));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.metrics).toHaveLength(1);
    expect(json.metrics[0].id).toBe('m1');
  });

  it('POST creates metric entry', async () => {
    mocks.createMetricLog.mockImplementation(async (_uid, payload) => ({ id: 'metric-1', ...payload }));

    const response = await POST(
      new Request('http://localhost/api/metrics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          takenAt: '2026-04-02T10:00:00.000Z',
          weightKg: 80.2,
          waistCm: 92,
          fastingGlucoseMgDl: 102,
        }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(201);
    expect(json.metric.id).toBe('metric-1');
    expect(json.metric.weightKg).toBe(80.2);
  });
});
