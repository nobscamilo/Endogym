import { describe, expect, it, vi } from 'vitest';

// Solo se prueban los mappers puros (mapTodaySession, mapWeek). El módulo de la ruta importa el
// repositorio (que a su vez carga firebaseAdmin); se mockea para poder importar sin efectos.
vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  getUserProfile: vi.fn(),
  getLatestWeeklyPlan: vi.fn(),
  listMealsSince: vi.fn(),
  listMetricsSince: vi.fn(),
  listWorkoutsSince: vi.fn(),
  getLastDoneWorkoutAt: vi.fn(),
  getStravaConnection: vi.fn(),
}));
vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return { AuthenticationError, getAuthenticatedUser: vi.fn() };
});
vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_op, handler) => handler({ traceId: 't' }),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const { mapTodaySession, mapWeek } = await import('../../src/app/api/studio-data/route.js');

const PLAN = {
  days: [
    { date: '2026-06-17', dayName: 'Miércoles', isTrainingDay: true, sessionType: 'resistance', sessionFocus: 'upper', workout: { title: 'Gym · Torso', durationMinutes: 75, intensityRpe: 'RPE 7-8', exercises: [{ id: 'bench', name: 'Press banca', prescription: { loadKg: 40, sets: 3, reps: 8 } }] } },
    { date: '2026-06-19', dayName: 'Viernes', isTrainingDay: false, sessionType: 'recovery', sessionFocus: 'recovery', workout: { title: 'Recuperación activa', durationMinutes: 30, exercises: [{ name: 'Movilidad' }] } },
    { date: '2026-06-20', dayName: 'Sábado', isTrainingDay: true, sessionType: 'aerobic', sessionFocus: 'long_run', workout: { title: 'Tirada larga', durationMinutes: 65, exercises: [{ name: 'Carrera continua' }] } },
  ],
};

describe('mapTodaySession — resolución de "hoy" (discrepancia)', () => {
  it('en un día de recuperación devuelve ESE día (no cae al primer día de fuerza)', () => {
    const out = mapTodaySession(PLAN, '2026-06-19');
    expect(out).not.toBeNull();
    expect(out.title).toBe('Recuperación activa');
    expect(out.isRestDay).toBe(true);
  });

  it('en un día de fuerza devuelve ese día con isRestDay=false', () => {
    const out = mapTodaySession(PLAN, '2026-06-17');
    expect(out.title).toBe('Gym · Torso');
    expect(out.isRestDay).toBe(false);
  });

  it('modo exact (registro retroactivo) sigue exigiendo día de entreno → null en recuperación', () => {
    expect(mapTodaySession(PLAN, '2026-06-19', [], null, { exact: true })).toBeNull();
    expect(mapTodaySession(PLAN, '2026-06-17', [], null, { exact: true })).not.toBeNull();
  });
});

describe('mapWeek — historial por día + volumen real', () => {
  const workouts = [
    {
      source: 'manual', performedAt: '2026-06-17T12:00:00.000Z', completed: true, sessionRpe: 8,
      durationMinutes: 75, exercises: [{ name: 'Press banca', weightKg: 40, reps: 8, sets: 3 }],
    },
  ];

  it('adjunta lo realmente hecho a cada día y marca hoy/descanso', () => {
    const { days } = mapWeek(PLAN, '2026-06-19', workouts);
    const wed = days.find((d) => d.dateISO === '2026-06-17');
    const fri = days.find((d) => d.dateISO === '2026-06-19');
    expect(wed.logged).toBeTruthy();
    expect(wed.logged.sessionRpe).toBe(8);
    expect(wed.logged.lifts).toEqual([{ name: 'Press banca', kg: 40, reps: 8, sets: 3 }]);
    expect(fri.today).toBe(true);
    expect(fri.rest).toBe(true);
    expect(fri.logged).toBeUndefined();
  });

  it('calcula el volumen semanal real (suma de duraciones planificadas de días de entreno)', () => {
    const { volumeHours } = mapWeek(PLAN, '2026-06-19', workouts);
    // 75 (fuerza) + 65 (carrera) = 140 min; recuperación NO cuenta → 2,3 h
    expect(volumeHours).toBe(2.3);
  });
});
