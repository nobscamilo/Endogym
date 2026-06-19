import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getUserProfile: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  listMealsSince: vi.fn(),
  listMetricsSince: vi.fn(),
  listWorkoutsSince: vi.fn(),
  getLastDoneWorkoutAt: vi.fn(),
  getStravaConnection: vi.fn(),
}));

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  getUserProfile: mocks.getUserProfile,
  getLatestWeeklyPlan: mocks.getLatestWeeklyPlan,
  listMealsSince: mocks.listMealsSince,
  listMetricsSince: mocks.listMetricsSince,
  listWorkoutsSince: mocks.listWorkoutsSince,
  getLastDoneWorkoutAt: mocks.getLastDoneWorkoutAt,
  getStravaConnection: mocks.getStravaConnection,
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return { AuthenticationError, getAuthenticatedUser: mocks.getAuthenticatedUser };
});

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logError: vi.fn(),
}));

const {
  GET,
  isValidDateKey,
  dayDiff,
  validateBacklogDate,
  MAX_BACKLOG_DAYS,
} = await import('../../src/app/api/session-for-date/route.js');

function ymd(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

function get(date) {
  const url = date == null
    ? 'http://localhost/api/session-for-date'
    : `http://localhost/api/session-for-date?date=${encodeURIComponent(date)}`;
  return GET(new Request(url));
}

describe('session-for-date helpers', () => {
  it('isValidDateKey acepta solo YYYY-MM-DD reales', () => {
    expect(isValidDateKey('2026-06-18')).toBe(true);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-6-1')).toBe(false);
    expect(isValidDateKey('ayer')).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });

  it('dayDiff cuenta días civiles (b - a)', () => {
    expect(dayDiff('2026-06-18', '2026-06-19')).toBe(1);
    expect(dayDiff('2026-06-19', '2026-06-18')).toBe(-1);
    expect(dayDiff('2026-06-05', '2026-06-19')).toBe(14);
  });

  it('validateBacklogDate respeta la ventana de 14 días y rechaza futuro', () => {
    const today = '2026-06-19';
    expect(validateBacklogDate('2026-06-18', today).ok).toBe(true);
    expect(validateBacklogDate('2026-06-19', today).ok).toBe(true); // hoy también vale
    expect(validateBacklogDate('2026-06-20', today).error).toMatch(/futura/);
    expect(validateBacklogDate(ymdFromFixed(today, -(MAX_BACKLOG_DAYS + 1)), today).error).toMatch(/14 días/);
    expect(validateBacklogDate('basura', today).error).toMatch(/YYYY-MM-DD/);
  });
});

function ymdFromFixed(today, offset) {
  return new Date(Date.parse(`${today}T00:00:00.000Z`) + offset * 86400000).toISOString().slice(0, 10);
}

describe('GET /api/session-for-date', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.getUserProfile.mockResolvedValue(null);
    mocks.getLatestWeeklyPlan.mockResolvedValue(null);
    mocks.listMealsSince.mockResolvedValue([]);
    mocks.listMetricsSince.mockResolvedValue([]);
    mocks.listWorkoutsSince.mockResolvedValue([]);
    mocks.getLastDoneWorkoutAt.mockResolvedValue(null);
    mocks.getStravaConnection.mockResolvedValue(null);
  });

  it('responde 401 si no hay sesión', async () => {
    const { AuthenticationError } = await import('../../src/lib/auth.js');
    mocks.getAuthenticatedUser.mockRejectedValue(new AuthenticationError('no auth'));
    const res = await get(ymd(-1));
    expect(res.status).toBe(401);
  });

  it('rechaza fecha inválida, futura y demasiado antigua', async () => {
    expect((await get('nope')).status).toBe(400);
    expect((await get(ymd(1))).status).toBe(400); // mañana
    expect((await get(ymd(-(MAX_BACKLOG_DAYS + 2)))).status).toBe(400);
  });

  it('devuelve ok con isTrainingDay=false cuando no hay plan activo', async () => {
    const res = await get(ymd(-1));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.isTrainingDay).toBe(false);
    expect(json.session).toBeNull();
    expect(json.logged).toBeNull();
  });

  it('expone el resumen de un día ya registrado para poder editarlo', async () => {
    const date = ymd(-2);
    mocks.listWorkoutsSince.mockResolvedValue([
      {
        source: 'manual',
        performedAt: `${date}T12:00:00.000Z`,
        completed: true,
        sessionRpe: 8,
        exercises: [{ id: 'gym-bench-press', name: 'Press banca', weightKg: 80, reps: 6, sets: 4 }],
      },
      {
        source: 'daily_checkin',
        performedAt: `${date}T12:00:00.000Z`,
        completed: true,
        fatigue: 5,
        sleepHours: 7,
        symptoms: { dyspnea: false, jointPain: true, dizziness: false, tachycardia: false },
      },
    ]);

    const res = await get(date);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.logged).not.toBeNull();
    expect(json.logged.sessionRpe).toBe(8);
    expect(json.logged.fatigue).toBe(5);
    expect(json.logged.lifts).toEqual([
      { id: 'gym-bench-press', name: 'Press banca', kg: 80, reps: 6, sets: 4 },
    ]);
  });
});
