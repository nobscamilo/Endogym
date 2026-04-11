import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  deleteUserAccountData: vi.fn(),
  getAdminServices: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  deleteUserAccountData: mocks.deleteUserAccountData,
}));

vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: mocks.getAdminServices,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
}));

const { AuthenticationError } = await import('../../src/lib/auth.js');
const { DELETE } = await import('../../src/app/api/account/delete/route.js');

async function readJson(response) {
  return response.json();
}

describe('/api/account/delete route', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.deleteUserAccountData.mockReset();
    mocks.getAdminServices.mockReset();
    mocks.deleteUser.mockReset();

    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1', dev: false });
    mocks.deleteUserAccountData.mockResolvedValue({
      deletedCollections: {
        profile: 1,
        meals: 2,
        workouts: 1,
        metrics: 0,
        weeklyPlans: 1,
      },
      deletedStorageFiles: 2,
      storageCleanupError: null,
    });
    mocks.getAdminServices.mockReturnValue({
      auth: {
        deleteUser: mocks.deleteUser,
      },
    });
    mocks.deleteUser.mockResolvedValue(undefined);
  });

  it('DELETE returns 400 when confirmation text does not match', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/account/delete', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmText: 'BORRAR' }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(400);
    expect(json.error).toContain('Confirmación inválida');
    expect(mocks.deleteUserAccountData).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('DELETE returns 403 when re-authentication header is missing', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/account/delete', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmText: 'ELIMINAR MI CUENTA' }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(403);
    expect(json.error).toContain('re-autenticarte');
    expect(mocks.deleteUserAccountData).not.toHaveBeenCalled();
  });

  it('DELETE purges account data and auth user for non-dev users', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/account/delete', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'x-recent-auth-token': 'fresh-token' },
        body: JSON.stringify({ confirmText: 'ELIMINAR MI CUENTA' }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.traceId).toBe('trace-test');
    expect(json.deleted).toBe(true);
    expect(json.authDeleted).toBe(true);
    expect(json.purge.deletedStorageFiles).toBe(2);
    expect(mocks.deleteUserAccountData).toHaveBeenCalledWith('user-1');
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('DELETE skips auth deletion for dev users', async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'dev-user', dev: true });

    const response = await DELETE(
      new Request('http://localhost/api/account/delete', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmText: 'ELIMINAR MI CUENTA' }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.authDeleted).toBe(false);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('DELETE returns 401 when auth fails', async () => {
    mocks.getAuthenticatedUser.mockRejectedValue(new AuthenticationError('No token'));

    const response = await DELETE(
      new Request('http://localhost/api/account/delete', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmText: 'ELIMINAR MI CUENTA' }),
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(401);
    expect(json.error).toContain('No token');
  });
});
