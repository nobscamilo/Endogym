import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkout: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  listWorkouts: vi.fn(),
}));

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  createWorkout: mocks.createWorkout,
  listWorkouts: mocks.listWorkouts,
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
}));

const { GET, POST } = await import('../../src/app/api/workouts/route.js');

function dailyCheckinPayload(overrides = {}) {
  return {
    title: 'Torso A',
    mode: 'full_gym',
    source: 'daily_checkin',
    dailyCheckinDate: '2026-06-01',
    checkinSkipped: false,
    symptoms: {
      dyspnea: false,
      jointPain: false,
      dizziness: true,
      tachycardia: false,
    },
    performedAt: '2026-06-01T12:00:00.000Z',
    durationMinutes: 55,
    sessionRpe: 7,
    fatigue: 6,
    sleepHours: 7.5,
    completed: true,
    notes: 'Ligero mareo al terminar.',
    ...overrides,
  };
}

describe('/api/workouts route', () => {
  beforeEach(() => {
    mocks.createWorkout.mockReset();
    mocks.getAuthenticatedUser.mockReset();
    mocks.listWorkouts.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
  });

  it('GET returns the authenticated workout history', async () => {
    mocks.listWorkouts.mockResolvedValue([{ id: 'workout-1' }]);

    const response = await GET(new Request('http://localhost/api/workouts?limit=10'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listWorkouts).toHaveBeenCalledWith('user-1', 10);
    expect(json.workouts).toEqual([{ id: 'workout-1' }]);
  });

  it('POST accepts a structured daily check-in', async () => {
    const payload = dailyCheckinPayload();
    mocks.createWorkout.mockResolvedValue({ id: 'daily-2026-06-01', ...payload });

    const response = await POST(new Request('http://localhost/api/workouts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createWorkout).toHaveBeenCalledWith('user-1', payload);
  });

  it('POST accepts manual exercise ids for future load progression', async () => {
    const payload = {
      title: 'Torso con cargas',
      mode: 'studio',
      source: 'manual',
      performedAt: '2026-06-01T18:00:00.000Z',
      completed: true,
      exercises: [
        {
          id: 'gym-bench-press',
          name: 'Press banca',
          sets: 4,
          reps: 6,
          weightKg: 80,
        },
      ],
    };
    mocks.createWorkout.mockResolvedValue({ id: 'workout-1', ...payload });

    const response = await POST(new Request('http://localhost/api/workouts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createWorkout).toHaveBeenCalledWith('user-1', payload);
  });

  it('POST accepts an omitted survey only when subjective metrics are absent', async () => {
    const payload = dailyCheckinPayload({
      checkinSkipped: true,
      symptoms: {
        dyspnea: false,
        jointPain: false,
        dizziness: false,
        tachycardia: false,
      },
      completed: false,
      sessionRpe: null,
      fatigue: null,
      sleepHours: null,
    });
    mocks.createWorkout.mockResolvedValue({ id: 'daily-2026-06-01', ...payload });

    const response = await POST(new Request('http://localhost/api/workouts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(201);
  });

  it('POST rejects future daily check-ins', async () => {
    const response = await POST(new Request('http://localhost/api/workouts', {
      method: 'POST',
      body: JSON.stringify(dailyCheckinPayload({
        dailyCheckinDate: '2999-01-01',
        performedAt: '2999-01-01T12:00:00.000Z',
      })),
    }));

    expect(response.status).toBe(400);
    expect(mocks.createWorkout).not.toHaveBeenCalled();
  });

  it('POST rejects zero-filled skipped surveys', async () => {
    const response = await POST(new Request('http://localhost/api/workouts', {
      method: 'POST',
      body: JSON.stringify(dailyCheckinPayload({
        checkinSkipped: true,
        completed: false,
        sessionRpe: 0,
        fatigue: 0,
        sleepHours: 0,
      })),
    }));

    expect(response.status).toBe(400);
    expect(mocks.createWorkout).not.toHaveBeenCalled();
  });
});
