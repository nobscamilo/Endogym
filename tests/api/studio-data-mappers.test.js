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

const { GET, mapGlycemic, mapLibrary, mapMacroEaten, mapProgress, mapTodaySession, mapWeek } = await import('../../src/app/api/studio-data/route.js');

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

  it('fuera de las fechas del bloque devuelve null en vez de reciclar el primer entreno', () => {
    expect(mapTodaySession(PLAN, '2026-07-01')).toBeNull();
  });

  it('reemplaza el vídeo persistido obsoleto por la asociación curada actual', () => {
    const plan = {
      days: [{
        date: '2026-06-20', isTrainingDay: true, sessionType: 'resistance',
        workout: {
          title: 'Pecho',
          exercises: [{
            id: 'gym-incline-db-press', name: 'Press inclinado con mancuernas',
            videoEmbedId: 'XjrsqShr-Ic',
          }],
        },
      }],
    };

    expect(mapTodaySession(plan, '2026-06-20').list[0].yt).toBe('IP4oeKh1Sd4');
  });

  it('retira del bloque activo un vídeo aproximado aunque siga persistido en el plan', () => {
    const plan = {
      days: [{
        date: '2026-06-20', isTrainingDay: true, sessionType: 'resistance',
        workout: {
          title: 'Tirón',
          exercises: [{ id: 'trx-row', name: 'Remo TRX', videoEmbedId: 'ZuV_NokRESN' }],
        },
      }],
    };

    const exercise = mapTodaySession(plan, '2026-06-20').list[0];
    expect(exercise).not.toHaveProperty('yt');
    expect(exercise.videoUrl).toContain('youtube.com/results');
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

  it('no presenta la primera semana de un bloque vencido como semana actual', () => {
    expect(mapWeek(PLAN, '2026-07-01', workouts)).toBeNull();
  });
});

describe('mapLibrary — vídeos vigentes', () => {
  it('no confía en el vídeo obsoleto persistido en el plan', () => {
    const plan = {
      days: [{
        workout: {
          exercises: [
            { id: 'gym-db-bench-press', name: 'Press banca con mancuernas', videoEmbedId: 'XjrsqShr-Ic' },
            { id: 'trx-row', name: 'Remo TRX', videoEmbedId: 'ZuV_NokRESN' },
          ],
        },
      }],
    };

    const library = mapLibrary(plan);
    expect(library[0].yt).toBe('Y_7aHqXeCfQ');
    expect(library[1]).not.toHaveProperty('yt');
    expect(library[1].videoUrl).toContain('youtube.com/results');
  });
});

describe('mappers de verdad — vacío no equivale a muestra', () => {
  it('sin comidas devuelve macros consumidas en cero y glucemia desconocida', () => {
    expect(mapMacroEaten([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(mapGlycemic([])).toBeNull();
  });

  it('la glucemia real no fabrica una curva continua', () => {
    const out = mapGlycemic([{ totals: { glycemicLoad: 31, insulinIndex: 42 } }]);
    expect(out).toMatchObject({ dayLoad: 31, dayClass: 'mid', insulinIndex: 42 });
    expect(out).not.toHaveProperty('points');
  });

  it('la serie de strain termina en la fecha civil recibida, no en el día UTC del proceso', () => {
    const out = mapProgress([], [{ performedAt: '2026-06-20T12:00:00.000Z', sessionRpe: 8 }], null, null, '2026-06-20');
    expect(out.strain).toEqual([0, 0, 0, 0, 0, 0, 8]);
  });
});

describe('GET /api/studio-data — contrato autenticado explícito', () => {
  it('reemplaza cada sección demo por real, null o vacío cuando el usuario no tiene datos', async () => {
    const auth = await import('../../src/lib/auth.js');
    const repo = await import('../../src/lib/repositories/firestoreRepository.js');
    auth.getAuthenticatedUser.mockResolvedValue({ uid: 'u-empty', email: 'real@example.com' });
    repo.getUserProfile.mockResolvedValue(null);
    repo.getLatestWeeklyPlan.mockResolvedValue(null);
    repo.listMealsSince.mockResolvedValue([]);
    repo.listMetricsSince.mockResolvedValue([]);
    repo.listWorkoutsSince.mockResolvedValue([]);
    repo.getLastDoneWorkoutAt.mockResolvedValue(null);
    repo.getStravaConnection.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/studio-data'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.overrides).toMatchObject({
      mode: 'authenticated', dataStatus: 'ready', planStatus: 'missing',
      todaySession: null, week: [], library: [], macroTargets: null,
      macroEaten: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      glycemic: null, nutritionDays: [], meals: [], shopping: [], batch: [],
    });
    expect(json.overrides.user).not.toHaveProperty('age');
    expect(json.overrides.user).not.toHaveProperty('weightKg');
    expect(json.overrides.user.profileComplete).toBe(false);
  });
});
