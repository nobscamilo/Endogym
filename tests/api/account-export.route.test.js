import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  exportUserAccountData: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  exportUserAccountData: mocks.exportUserAccountData,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
}));

const { AuthenticationError } = await import('../../src/lib/auth.js');
const { GET } = await import('../../src/app/api/account/export/route.js');

async function readJson(response) {
  return response.json();
}

describe('/api/account/export route', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.exportUserAccountData.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user_1' });
  });

  it('GET returns downloadable account data payload', async () => {
    mocks.exportUserAccountData.mockResolvedValue({
      profile: { id: 'main' },
      meals: [],
      workouts: [],
      metrics: [],
      weeklyPlans: [],
      meta: { maxDocsPerCollection: 5000, truncatedCollections: [] },
    });

    const response = await GET(new Request('http://localhost/api/account/export'));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-disposition')).toMatch(
      /attachment; filename="endogym-export-user_1-\d{4}-\d{2}-\d{2}\.json"/
    );
    expect(json.traceId).toBe('trace-test');
    expect(json.userId).toBe('user_1');
    expect(json.exportedAt).toBeTruthy();
    expect(json.exportData.profile.id).toBe('main');
  });

  it('GET returns 401 when auth fails', async () => {
    mocks.getAuthenticatedUser.mockRejectedValue(new AuthenticationError('No token'));

    const response = await GET(new Request('http://localhost/api/account/export'));
    const json = await readJson(response);

    expect(response.status).toBe(401);
    expect(json.error).toContain('No token');
  });

  it('GET returns 500 on unexpected errors', async () => {
    mocks.exportUserAccountData.mockRejectedValue(new Error('db unavailable'));

    const response = await GET(new Request('http://localhost/api/account/export'));
    const json = await readJson(response);

    expect(response.status).toBe(500);
    expect(json.error).toContain('Error interno al exportar datos de la cuenta');
  });
});
