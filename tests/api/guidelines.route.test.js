import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getAdminServices: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: mocks.getAdminServices,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
}));

const { GET } = await import('../../src/app/api/guidelines/route.js');

async function readJson(response) {
  return response.json();
}

describe('/api/guidelines route', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.getAdminServices.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1', email: 'user@example.com' });
  });

  it('returns 400 if id parameter is missing', async () => {
    const response = await GET(new Request('http://localhost/api/guidelines'));
    const json = await readJson(response);

    expect(response.status).toBe(400);
    expect(json.error).toContain('"id"');
  });

  it('returns 404 if guideline does not exist', async () => {
    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      doc: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        exists: false,
      }),
    };
    mocks.getAdminServices.mockResolvedValue({ db: mockDb });

    const response = await GET(new Request('http://localhost/api/guidelines?id=non-existent'));
    const json = await readJson(response);

    expect(response.status).toBe(404);
    expect(json.error).toContain('no encontrada');
  });

  it('returns 200 and guideline data if it exists', async () => {
    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      doc: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        exists: true,
        id: 'guideline-1',
        data: () => ({
          source: { fileName: 'test-guideline.pdf' },
          pages: [
            { pageNumber: 1, text: 'Test content here.' },
          ],
        }),
      }),
    };
    mocks.getAdminServices.mockResolvedValue({ db: mockDb });

    const response = await GET(new Request('http://localhost/api/guidelines?id=guideline-1'));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.guideline.id).toBe('guideline-1');
    expect(json.guideline.fileName).toBe('test-guideline.pdf');
    expect(json.guideline.pages).toHaveLength(1);
    expect(json.guideline.pages[0].text).toBe('Test content here.');
  });
});
