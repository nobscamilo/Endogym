import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  saveStravaCredentials: vi.fn(),
  getStravaCredentials: vi.fn(),
  deleteStravaCredentials: vi.fn(),
  createWorkout: vi.fn(),
  upsertUserProfile: vi.fn(),
}));

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  saveStravaCredentials: mocks.saveStravaCredentials,
  getStravaCredentials: mocks.getStravaCredentials,
  deleteStravaCredentials: mocks.deleteStravaCredentials,
  createWorkout: mocks.createWorkout,
  upsertUserProfile: mocks.upsertUserProfile,
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logInfo: () => {},
  logError: () => {},
}));

const { GET: GET_AUTH } = await import('../../src/app/api/integrations/strava/authorize/route.js');
const { POST: POST_CONNECT } = await import('../../src/app/api/integrations/strava/connect/route.js');
const { POST: POST_SYNC } = await import('../../src/app/api/integrations/strava/sync/route.js');
const { POST: POST_DISCONNECT } = await import('../../src/app/api/integrations/strava/disconnect/route.js');

describe('Strava Integration API routes', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getAuthenticatedUser.mockReset();
    mocks.saveStravaCredentials.mockReset();
    mocks.getStravaCredentials.mockReset();
    mocks.deleteStravaCredentials.mockReset();
    mocks.createWorkout.mockReset();
    mocks.createWorkout.mockImplementation((userId, workout) => Promise.resolve(workout));
    mocks.upsertUserProfile.mockReset();

    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });

    process.env = {
      ...oldEnv,
      STRAVA_CLIENT_ID: 'test-client-id',
      STRAVA_CLIENT_SECRET: 'test-client-secret',
      STRAVA_REDIRECT_URI: 'http://localhost:3000/dashboard',
    };
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  describe('GET /authorize', () => {
    it('generates the correct Strava authorization URL', async () => {
      const response = await GET_AUTH(new Request('http://localhost/api/integrations/strava/authorize'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.url).toContain('https://www.strava.com/oauth/authorize');
      expect(json.url).toContain('client_id=test-client-id');
      expect(json.url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fdashboard');
      expect(json.url).toContain('scope=activity:read_all');
    });

    it('returns 500 if STRAVA_CLIENT_ID is missing', async () => {
      delete process.env.STRAVA_CLIENT_ID;

      const response = await GET_AUTH(new Request('http://localhost/api/integrations/strava/authorize'));
      expect(response.status).toBe(500);
    });
  });

  describe('POST /connect', () => {
    it('exchanges OAuth code for access and refresh tokens and stores them in profile', async () => {
      const globalFetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access-123',
          refresh_token: 'refresh-123',
          expires_at: 1800000000,
          athlete: { id: 98765 },
        }),
      });
      global.fetch = globalFetchMock;

      const response = await POST_CONNECT(new Request('http://localhost/api/integrations/strava/connect', {
        method: 'POST',
        body: JSON.stringify({ code: 'oauth-code-abc' }),
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.athleteId).toBe('98765');

      expect(mocks.saveStravaCredentials).toHaveBeenCalledWith('user-1', {
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiresAt: 1800000000,
        athleteId: '98765',
      });

      expect(mocks.upsertUserProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({
        stravaConnected: true,
        stravaAthleteId: '98765',
      }));
    });

    it('returns 400 if code is missing', async () => {
      const response = await POST_CONNECT(new Request('http://localhost/api/integrations/strava/connect', {
        method: 'POST',
        body: JSON.stringify({}),
      }));
      expect(response.status).toBe(400);
    });
  });

  describe('POST /sync', () => {
    it('fetches activities from Strava, refreshes token if needed, and saves workouts', async () => {
      // Mock credentials (expired)
      mocks.getStravaCredentials.mockResolvedValue({
        accessToken: 'old-access',
        refreshToken: 'refresh-123',
        expiresAt: 1000, // already expired
        athleteId: '98765',
      });

      const fetchResponses = [
        // 1st fetch: Token Refresh
        {
          ok: true,
          json: async () => ({
            access_token: 'new-access',
            refresh_token: 'refresh-new',
            expires_at: 2000000000,
          }),
        },
        // 2nd fetch: Get Athlete Activities
        {
          ok: true,
          json: async () => [
            {
              id: 111,
              name: 'Morning Run',
              type: 'Run',
              sport_type: 'Run',
              start_date: '2026-06-01T08:00:00Z',
              elapsed_time: 1800,
              moving_time: 1750,
              distance: 5000,
              perceived_exertion: 6,
            },
            {
              id: 222,
              name: 'Recovery Yoga',
              type: 'Yoga',
              sport_type: 'Yoga',
              start_date: '2026-06-02T18:00:00Z',
              elapsed_time: 2400,
              moving_time: 2400,
              suffer_score: null,
            }
          ],
        }
      ];

      let fetchIndex = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        return fetchResponses[fetchIndex++];
      });

      const response = await POST_SYNC(new Request('http://localhost/api/integrations/strava/sync', {
        method: 'POST',
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.syncedCount).toBe(2);

      // Verify credentials saved
      expect(mocks.saveStravaCredentials).toHaveBeenCalledWith('user-1', expect.objectContaining({
        accessToken: 'new-access',
        refreshToken: 'refresh-new',
        expiresAt: 2000000000,
      }));

      // Verify workouts created
      expect(mocks.createWorkout).toHaveBeenCalledTimes(2);

      // Verify first workout parameters
      expect(mocks.createWorkout).toHaveBeenNthCalledWith(1, 'user-1', {
        id: 'strava-111',
        source: 'strava',
        title: 'Morning Run',
        mode: 'running',
        performedAt: '2026-06-01T08:00:00Z',
        durationMinutes: 29,
        sessionRpe: 6,
        completed: true,
        notes: expect.stringContaining('Distancia: 5.00 km'),
        exercises: [],
      });

      // Verify profile is updated with sync time
      expect(mocks.upsertUserProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({
        stravaLastSyncAt: expect.any(String),
      }));
    });
  });

  describe('POST /disconnect', () => {
    it('removes credentials and updates user profile state', async () => {
      const response = await POST_DISCONNECT(new Request('http://localhost/api/integrations/strava/disconnect', {
        method: 'POST',
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mocks.deleteStravaCredentials).toHaveBeenCalledWith('user-1');
      expect(mocks.upsertUserProfile).toHaveBeenCalledWith('user-1', {
        stravaConnected: false,
        stravaAthleteId: null,
      });
    });
  });
});
