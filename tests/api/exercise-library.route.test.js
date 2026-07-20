import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  listExerciseLibraryIndex: vi.fn(),
  getExerciseLibraryEntry: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return { AuthenticationError, getAuthenticatedUser: mocks.getAuthenticatedUser };
});

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_op, handler) => handler({ traceId: 'trace-exlib' }),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('../../src/services/exerciseLibraryStore.js', () => ({
  EXERCISE_MEDIA_BASE: 'https://storage.googleapis.com/test-bucket/exercise-media',
  listExerciseLibraryIndex: mocks.listExerciseLibraryIndex,
  getExerciseLibraryEntry: mocks.getExerciseLibraryEntry,
}));

const { GET } = await import('../../src/app/api/exercise-library/route.js');

describe('/api/exercise-library — biblioteca navegable (Fase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
  });

  it('exige autenticación (401 sin token)', async () => {
    const { AuthenticationError } = await import('../../src/lib/auth.js');
    mocks.getAuthenticatedUser.mockRejectedValue(new AuthenticationError('no token'));
    const res = await GET(new Request('http://localhost/api/exercise-library'));
    expect(res.status).toBe(401);
  });

  it('sin id devuelve el índice compacto con mediaBase y permite caché privada', async () => {
    mocks.listExerciseLibraryIndex.mockResolvedValue([
      { id: 'Barbell_Full_Squat', n: 'Sentadilla con barra', en: 'Barbell Full Squat', m: 'quadriceps', eq: 'barbell', lvl: 'intermediate', cat: 'strength' },
    ]);
    const res = await GET(new Request('http://localhost/api/exercise-library'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.mediaBase).toContain('exercise-media');
    expect(json.exercises).toHaveLength(1);
    expect(json.exercises[0]).toMatchObject({ id: 'Barbell_Full_Squat', n: 'Sentadilla con barra', m: 'quadriceps' });
    // Índice estático tras la ingesta: cacheable en cliente (no hereda el no-store global).
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
    expect(mocks.getExerciseLibraryEntry).not.toHaveBeenCalled();
  });

  it('con id devuelve la ficha completa (pasos ES + fotos) y 404 si no existe', async () => {
    mocks.getExerciseLibraryEntry.mockResolvedValue({
      id: 'Barbell_Full_Squat', name: 'Sentadilla con barra', steps: ['Colócate bajo la barra…'],
      images: ['https://storage.googleapis.com/test-bucket/exercise-media/Barbell_Full_Squat/0.jpg', 'https://storage.googleapis.com/test-bucket/exercise-media/Barbell_Full_Squat/1.jpg'],
      primaryMuscles: ['quadriceps'], equipment: 'barbell',
    });
    const res = await GET(new Request('http://localhost/api/exercise-library?id=Barbell_Full_Squat'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.exercise.steps.length).toBeGreaterThan(0);
    expect(json.exercise.images).toHaveLength(2);

    mocks.getExerciseLibraryEntry.mockResolvedValue(null);
    const notFound = await GET(new Request('http://localhost/api/exercise-library?id=NoExiste'));
    expect(notFound.status).toBe(404);
  });
});
