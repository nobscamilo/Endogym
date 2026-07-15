import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return { AuthenticationError, getAuthenticatedUser: mocks.getAuthenticatedUser };
});

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logError: vi.fn(),
}));

const { GET } = await import('../../src/app/api/exercise-catalog/route.js');

describe('GET /api/exercise-catalog', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
  });

  it('responde 401 sin sesión', async () => {
    const { AuthenticationError } = await import('../../src/lib/auth.js');
    mocks.getAuthenticatedUser.mockRejectedValue(new AuthenticationError('no auth'));
    const res = await GET(new Request('http://localhost/api/exercise-catalog'));
    expect(res.status).toBe(401);
  });

  it('devuelve el catálogo compacto ordenado, con implemento y tipo de carga', async () => {
    const res = await GET(new Request('http://localhost/api/exercise-catalog'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.exercises)).toBe(true);
    expect(json.exercises.length).toBeGreaterThan(100);
    const item = json.exercises.find((e) => e.id === 'gym-barbell-back-squat');
    expect(item).toBeTruthy();
    expect(item.name).toMatch(/sentadilla/i);
    expect(item.equip).toMatch(/barbell/i);
    expect(item.loadType).toBe('external');
    // Compacto: sin campos pesados del catálogo completo.
    expect(item.cues).toBeUndefined();
    expect(item.progressions).toBeUndefined();
    // Ordenado alfabéticamente (es).
    const names = json.exercises.map((e) => e.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'es'));
    expect(names).toEqual(sorted);
  });
});
