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

const { GET, mapGlycemic, mapLibrary, mapMacroEaten, mapMacroTargets, mapProgress, mapTodaySession, mapWeek } = await import('../../src/app/api/studio-data/route.js');

const PLAN = {
  days: [
    { date: '2026-06-17', dayName: 'Miércoles', isTrainingDay: true, sessionType: 'resistance', sessionFocus: 'upper', workout: { title: 'Gym · Torso', durationMinutes: 75, intensityRpe: 'RPE 7-8', exercises: [{ id: 'bench', name: 'Press banca', prescription: { loadKg: 40, sets: 3, reps: 8, restSeconds: 90 } }] } },
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

  it('expone el descanso prescrito por ejercicio (restSec) y lo omite si no existe', () => {
    const out = mapTodaySession(PLAN, '2026-06-17');
    expect(out.list[0].restSec).toBe(90);
    const noRest = { days: [{ ...PLAN.days[0], workout: { ...PLAN.days[0].workout, exercises: [{ id: 'x', name: 'X', prescription: { loadKg: 20, sets: 3, reps: 8, restSeconds: null } }] } }] };
    expect(mapTodaySession(noRest, '2026-06-17').list[0].restSec).toBeUndefined();
  });

  it('recalcula calentamiento, enfriamiento y movilidad guiada desde las categorías reales', () => {
    const plan = {
      days: [{
        date: '2026-06-17', isTrainingDay: true, sessionType: 'resistance', sessionFocus: 'upper',
        workout: {
          title: 'Empuje',
          exercises: [{ id: 'press', name: 'Press', category: 'upper_push', prescription: { sets: 3, reps: 8 } }],
          // Persistido deliberadamente incorrecto: el overlay en lectura debe reemplazarlo.
          warmup: [{ step: 'Pierna genérica', durationMinutes: 4, details: 'sentadilla' }],
          cooldown: [{ step: 'Pierna genérica', durationMinutes: 4, details: 'isquios' }],
        },
      }],
    };
    const out = mapTodaySession(plan, '2026-06-17', [], {});
    expect(out.warmup.find((s) => s.step === 'Activación biomecánica').details).toMatch(/empuje/i);
    expect(out.cooldown.find((s) => s.step === 'Estiramientos suaves').details).toMatch(/pecho, hombros y tríceps/i);
    expect(out.guidedWarmup.context).toMatch(/pecho, hombros y tríceps/i);
    expect(out.guidedWarmup.movements.map((m) => m.id)).toContain('band-external-rotation');
    expect(out.guidedMobility.context).toMatch(/pecho, hombros y tríceps/i);
    expect(out.guidedMobility.movements.map((m) => m.id)).toContain('doorway-pec');
  });

  it('modo exact (registro retroactivo) sigue exigiendo día de entreno → null en recuperación', () => {
    expect(mapTodaySession(PLAN, '2026-06-19', [], null, { exact: true })).toBeNull();
    expect(mapTodaySession(PLAN, '2026-06-17', [], null, { exact: true })).not.toBeNull();
  });

  it('expone workout.hybridCircuit al contrato (tarjeta de circuito híbrido) y lo omite si no existe', () => {
    const hybridPlan = {
      days: [{
        ...PLAN.days[0],
        workout: {
          ...PLAN.days[0].workout,
          title: 'Circuito híbrido · Gym · Torso',
          hybridCircuit: {
            method: 'circuit_resistance_training',
            restBetweenExercisesSec: 25,
            restBetweenRoundsSec: 120,
            hrGuidance: 'Mantén la frecuencia cardiaca en 64-76% de tu FCmáx.',
            note: 'Encadena los ejercicios en circuito.',
          },
        },
      }],
    };
    const out = mapTodaySession(hybridPlan, '2026-06-17');
    expect(out.hybridCircuit).toMatchObject({ restBetweenExercisesSec: 25, restBetweenRoundsSec: 120 });
    expect(out.hybridCircuit.hrGuidance).toContain('64-76%');
    // Sin metadatos, el campo no aparece (contrato limpio).
    expect(mapTodaySession(PLAN, '2026-06-17').hybridCircuit).toBeUndefined();
  });

  it('fuera de las fechas del bloque devuelve null en vez de reciclar el primer entreno', () => {
    expect(mapTodaySession(PLAN, '2026-07-01')).toBeNull();
  });

  it('mapMacroTargets: con bloque VENCIDO no recicla los macros del primer día — cae a baseTarget', () => {
    const plan = {
      baseTarget: { targetCalories: 2200, proteinGrams: 150, carbsGrams: 210, fatGrams: 70 },
      days: [{ date: '2026-06-20', nutritionTarget: { calories: 1500, proteinGrams: 90, carbsGrams: 120, fatGrams: 50 } }],
    };
    // Hoy NO está en el bloque → antes devolvía los 1500 kcal del 20 de junio como si fueran de hoy.
    const out = mapMacroTargets(plan, '2026-07-12');
    expect(out.kcal).toBe(2200);
    expect(out.protein).toBe(150);
    // Con el día exacto sí usa el target diario.
    expect(mapMacroTargets(plan, '2026-06-20').kcal).toBe(1500);
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

  it('la adherencia ignora entrenos antiguos y solo cuenta fechas planificadas ya vencidas de esta semana', () => {
    const plan = { days: [
      { date: '2026-06-15', isTrainingDay: true, workout: { durationMinutes: 60 } },
      { date: '2026-06-17', isTrainingDay: true, workout: { durationMinutes: 50 } },
      { date: '2026-06-19', isTrainingDay: true, workout: { durationMinutes: 40 } },
      { date: '2026-06-22', isTrainingDay: true, workout: { durationMinutes: 70 } },
    ] };
    const workouts = [
      { performedAt: '2026-05-20T12:00:00.000Z', source: 'manual', completed: true },
      { performedAt: '2026-06-15T12:00:00.000Z', source: 'manual', completed: true },
      { performedAt: '2026-06-16T12:00:00.000Z', source: 'manual', completed: true }, // extra no planificado
    ];
    const out = mapProgress([], workouts, plan, null, '2026-06-17');
    expect(out).toMatchObject({ sessionsPlan: 3, sessionsDue: 2, sessionsDone: 1, adherence: 50, volumeWk: 2.5 });
  });

  it('sin registros de las sesiones vencidas muestra 0%, nunca 100% por historial previo', () => {
    const plan = { days: [{ date: '2026-06-17', isTrainingDay: true, workout: { durationMinutes: 45 } }] };
    const out = mapProgress([], [{ performedAt: '2026-05-20T12:00:00.000Z', completed: true }], plan, null, '2026-06-17');
    expect(out).toMatchObject({ sessionsDue: 1, sessionsDone: 0, adherence: 0 });
  });

  it('antes de la primera sesión vencida la adherencia es desconocida', () => {
    const plan = { days: [{ date: '2026-06-19', isTrainingDay: true, workout: { durationMinutes: 45 } }] };
    expect(mapProgress([], [], plan, null, '2026-06-17').adherence).toBeNull();
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
