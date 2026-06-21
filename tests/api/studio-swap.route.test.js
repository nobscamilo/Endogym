import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getUserProfile: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  getAdminServices: vi.fn(),
  updatePlan: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  getUserProfile: mocks.getUserProfile,
  getLatestWeeklyPlan: mocks.getLatestWeeklyPlan,
}));

vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: mocks.getAdminServices,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
  logError: vi.fn(),
}));

vi.mock('../../src/lib/appTime.js', () => ({
  dateKeyInTimeZone: () => '2026-06-15',
}));

const { POST } = await import('../../src/app/api/studio-swap/route.js');
const { isExerciseCompatibleWithSessionFocus } = await import('../../src/core/exerciseLibrary.js');

function adminDbMock() {
  const planDoc = { update: mocks.updatePlan };
  const weeklyPlans = { doc: vi.fn(() => planDoc) };
  const userDoc = { collection: vi.fn(() => weeklyPlans) };
  const users = { doc: vi.fn(() => userDoc) };
  return { collection: vi.fn(() => users) };
}

function planWith(days) {
  return {
    id: 'plan-1',
    goal: 'hypertrophy',
    trainingMode: 'gym',
    trainingModality: 'full_gym',
    days,
  };
}

function trainingDay(date, sessionFocus, title) {
  return {
    date,
    dayName: 'Lunes',
    isTrainingDay: true,
    sessionType: 'resistance',
    sessionFocus,
    workout: {
      title,
      sessionFocus,
      durationMinutes: 60,
      intensityRpe: 'RPE 7-8',
      exercises: [{ id: 'gym-barbell-back-squat', name: 'Back Squat', category: 'lower_body_strength' }],
    },
  };
}

describe('/api/studio-swap route', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.getUserProfile.mockReset();
    mocks.getLatestWeeklyPlan.mockReset();
    mocks.getAdminServices.mockReset();
    mocks.updatePlan.mockReset();

    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.getUserProfile.mockResolvedValue({
      goal: 'hypertrophy',
      trainingMode: 'gym',
      trainingModality: 'full_gym',
      weightKg: 84,
    });
    mocks.getAdminServices.mockResolvedValue({ db: adminDbMock() });
    mocks.updatePlan.mockResolvedValue();
  });

  it('rejects a muscle-group change that would repeat the next strength family', async () => {
    mocks.getLatestWeeklyPlan.mockResolvedValue(planWith([
      trainingDay('2026-06-15', 'lower', 'Pierna actual'),
      trainingDay('2026-06-16', 'upper', 'Torso mañana'),
    ]));

    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'upper' }),
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('siguiente');
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });

  it('rejects a non-adjacent change that would overload a strength family for the week', async () => {
    const aerobicDay = (date) => ({
      date,
      dayName: 'Cardio',
      isTrainingDay: true,
      sessionType: 'aerobic',
      sessionFocus: 'cardio_easy',
      workout: { title: 'Rodaje suave', durationMinutes: 40, exercises: [] },
    });
    mocks.getLatestWeeklyPlan.mockResolvedValue(planWith([
      trainingDay('2026-06-13', 'upper', 'Torso lunes'),
      aerobicDay('2026-06-14'),
      trainingDay('2026-06-15', 'lower', 'Pierna actual'),
      aerobicDay('2026-06-16'),
      trainingDay('2026-06-17', 'upper', 'Torso viernes'),
    ]));

    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'upper' }),
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('Sobrecargaría');
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });

  it('persists a safe muscle-group change for today', async () => {
    mocks.getLatestWeeklyPlan.mockResolvedValue(planWith([
      trainingDay('2026-06-15', 'lower', 'Pierna actual'),
      {
        date: '2026-06-16',
        dayName: 'Martes',
        isTrainingDay: true,
        sessionType: 'aerobic',
        sessionFocus: 'cardio_easy',
        workout: { title: 'Rodaje suave', durationMinutes: 40, exercises: [] },
      },
    ]));

    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'upper' }),
    }));
    const json = await response.json();
    const patch = mocks.updatePlan.mock.calls[0]?.[0];
    const updatedToday = patch.days[0];

    expect(response.status).toBe(200);
    expect(json.sessionFocus).toBe('upper');
    expect(updatedToday.sessionFocus).toBe('upper');
    expect(updatedToday.workout.title).toContain('Torso');
    expect(updatedToday.workout.exercises.length).toBeGreaterThan(0);
    expect(updatedToday.workout.exercises.every((exercise) =>
      isExerciseCompatibleWithSessionFocus(exercise, {
        sessionType: 'resistance',
        sessionFocus: 'upper',
      })
    )).toBe(true);
  });

  it('converts a non-strength (cardio) day into a strength session with a clinical warning', async () => {
    mocks.getLatestWeeklyPlan.mockResolvedValue(planWith([
      {
        date: '2026-06-15', dayName: 'Martes', isTrainingDay: true,
        sessionType: 'aerobic', sessionFocus: 'cardio_easy',
        workout: { title: 'Rodaje suave', durationMinutes: 40, exercises: [{ id: 'run-z2', name: 'Carrera zona 2' }] },
      },
      trainingDay('2026-06-16', 'lower', 'Pierna mañana'),
    ]));

    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'upper' }),
    }));
    const json = await response.json();
    const patch = mocks.updatePlan.mock.calls[0]?.[0];
    const updatedToday = patch.days[0];

    expect(response.status).toBe(200);
    expect(json.sessionFocus).toBe('upper');
    expect(json.converted).toBe(true);
    expect(typeof json.warning).toBe('string');
    expect(json.warning.length).toBeGreaterThan(0);
    expect(updatedToday.sessionType).toBe('resistance');
    expect(updatedToday.isTrainingDay).toBe(true);
    expect(updatedToday.workout.exercises.length).toBeGreaterThan(0);
    expect(updatedToday.workout.runPrescription).toBeUndefined();
  });

  const planForSore = () => planWith([
    trainingDay('2026-06-15', 'lower', 'Pierna actual'),
    {
      date: '2026-06-16', dayName: 'Martes', isTrainingDay: true,
      sessionType: 'aerobic', sessionFocus: 'cardio_easy',
      workout: { title: 'Rodaje suave', durationMinutes: 40, exercises: [] },
    },
  ]);

  it('#3 modula la sesión cuando la zona dolorida carga el grupo elegido', async () => {
    mocks.getLatestWeeklyPlan.mockResolvedValue(planForSore());
    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'upper', soreAreas: ['torso'] }),
    }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.soreApplied).toBe(true);
    expect(json.soreNote).toMatch(/molestias/i);
  });

  it('#3 no modula si la zona dolorida no carga el grupo elegido', async () => {
    mocks.getLatestWeeklyPlan.mockResolvedValue(planForSore());
    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'upper', soreAreas: ['leg'] }),
    }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.soreApplied).toBe(false);
    expect(json.soreNote).toBeNull();
  });

  it('#2 reprograma por intercambio cuando el grupo elegido choca con el vecino', async () => {
    mocks.getLatestWeeklyPlan.mockResolvedValue(planWith([
      trainingDay('2026-06-15', 'lower', 'Pierna actual'),
      trainingDay('2026-06-16', 'upper', 'Torso mañana'),
    ]));
    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'upper', action: 'reschedule' }),
    }));
    const json = await response.json();
    const patch = mocks.updatePlan.mock.calls[0]?.[0];
    expect(response.status).toBe(200);
    expect(json.rescheduled).toBe(true);
    expect(json.note).toMatch(/reprogram/i);
    expect(patch.days[0].sessionFocus).toBe('upper');
    expect(patch.days[1].sessionFocus).toBe('lower');
  });

  it('#2 no reprograma si el bloqueo es por volumen semanal (no por adyacencia)', async () => {
    const aerobicDay = (date) => ({
      date, dayName: 'Cardio', isTrainingDay: true,
      sessionType: 'aerobic', sessionFocus: 'cardio_easy',
      workout: { title: 'Rodaje suave', durationMinutes: 40, exercises: [] },
    });
    mocks.getLatestWeeklyPlan.mockResolvedValue(planWith([
      trainingDay('2026-06-13', 'upper', 'Torso lunes'),
      aerobicDay('2026-06-14'),
      trainingDay('2026-06-15', 'lower', 'Pierna actual'),
      aerobicDay('2026-06-16'),
      trainingDay('2026-06-17', 'upper', 'Torso viernes'),
    ]));
    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'upper', action: 'reschedule' }),
    }));
    expect(response.status).toBe(409);
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });

  it('rechaza un bloque vencido en vez de modificar su primer día', async () => {
    mocks.getLatestWeeklyPlan.mockResolvedValue(planWith([
      trainingDay('2026-05-01', 'upper', 'Sesión antigua'),
    ]));
    const response = await POST(new Request('http://localhost/api/studio-swap', {
      method: 'POST',
      body: JSON.stringify({ scope: 'focus', sessionFocus: 'lower' }),
    }));
    const json = await response.json();
    expect(response.status).toBe(409);
    expect(json.error).toMatch(/no contiene el día de hoy/i);
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });
});
