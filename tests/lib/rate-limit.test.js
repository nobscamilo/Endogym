import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdminServices: vi.fn(),
}));

vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: mocks.getAdminServices,
}));

const {
  enforceUserRateLimit,
  getRateLimitHeaders,
  RATE_LIMIT_SCOPES,
} = await import('../../src/lib/rateLimit.js');

function createInMemoryDb() {
  const records = new Map();
  const db = {
    collection: (collectionName) => ({
      doc: (documentId) => ({
        collection: (subcollectionName) => ({
          doc: (subdocumentId) => ({
            path: `${collectionName}/${documentId}/${subcollectionName}/${subdocumentId}`,
          }),
        }),
      }),
    }),
    runTransaction: async (handler) => handler({
      get: async (ref) => ({
        exists: records.has(ref.path),
        data: () => records.get(ref.path),
      }),
      set: (ref, value) => {
        records.set(ref.path, value);
      },
    }),
  };

  return { db, records };
}

describe('persistent Firestore rate limit', () => {
  const envBackup = {
    PLATE_ANALYSIS_RATE_LIMIT_MAX: process.env.PLATE_ANALYSIS_RATE_LIMIT_MAX,
    PLATE_ANALYSIS_RATE_LIMIT_WINDOW_SECONDS: process.env.PLATE_ANALYSIS_RATE_LIMIT_WINDOW_SECONDS,
  };

  beforeEach(() => {
    mocks.getAdminServices.mockReset();
    const { db } = createInMemoryDb();
    mocks.getAdminServices.mockResolvedValue({ db });
    process.env.PLATE_ANALYSIS_RATE_LIMIT_MAX = '2';
    process.env.PLATE_ANALYSIS_RATE_LIMIT_WINDOW_SECONDS = '60';
  });

  afterEach(() => {
    process.env.PLATE_ANALYSIS_RATE_LIMIT_MAX = envBackup.PLATE_ANALYSIS_RATE_LIMIT_MAX;
    process.env.PLATE_ANALYSIS_RATE_LIMIT_WINDOW_SECONDS = envBackup.PLATE_ANALYSIS_RATE_LIMIT_WINDOW_SECONDS;
  });

  it('allows requests until the distributed window is exhausted', async () => {
    const now = new Date('2026-05-31T20:00:00.000Z');
    const first = await enforceUserRateLimit({
      userId: 'user-1',
      scope: RATE_LIMIT_SCOPES.PLATE_ANALYSIS,
      now,
    });
    const second = await enforceUserRateLimit({
      userId: 'user-1',
      scope: RATE_LIMIT_SCOPES.PLATE_ANALYSIS,
      now,
    });
    const third = await enforceUserRateLimit({
      userId: 'user-1',
      scope: RATE_LIMIT_SCOPES.PLATE_ANALYSIS,
      now,
    });

    expect(first).toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterSeconds: 60,
    });
    expect(second.remaining).toBe(0);
    expect(third).toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 60,
    });
  });

  it('resets the counter after the configured window', async () => {
    await enforceUserRateLimit({
      userId: 'user-1',
      scope: RATE_LIMIT_SCOPES.PLATE_ANALYSIS,
      now: new Date('2026-05-31T20:00:00.000Z'),
    });
    const afterWindow = await enforceUserRateLimit({
      userId: 'user-1',
      scope: RATE_LIMIT_SCOPES.PLATE_ANALYSIS,
      now: new Date('2026-05-31T20:01:01.000Z'),
    });

    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(1);
    expect(afterWindow.retryAfterSeconds).toBe(60);
  });

  it('adds Retry-After only when a request is rejected', () => {
    expect(getRateLimitHeaders({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterSeconds: 60,
    })).not.toHaveProperty('retry-after');

    expect(getRateLimitHeaders({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 60,
    })).toEqual({
      'ratelimit-limit': '2',
      'ratelimit-remaining': '0',
      'ratelimit-reset': '60',
      'retry-after': '60',
    });
  });
});
