import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdminServices: vi.fn(),
}));

vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: mocks.getAdminServices,
}));

const { createWorkout } = await import('../../src/lib/repositories/firestoreRepository.js');

function createInMemoryDb() {
  const records = new Map();
  let autoId = 0;

  function createRef(path, id) {
    return {
      id,
      path,
      set: async (value) => records.set(path, value),
    };
  }

  const db = {
    collection: (collectionName) => ({
      doc: (documentId) => ({
        collection: (subcollectionName) => ({
          doc: (subdocumentId = `auto-${++autoId}`) => createRef(
            `${collectionName}/${documentId}/${subcollectionName}/${subdocumentId}`,
            subdocumentId
          ),
        }),
      }),
    }),
    runTransaction: async (handler) => handler({
      get: async (ref) => ({
        exists: records.has(ref.path),
        data: () => records.get(ref.path),
      }),
      set: (ref, value) => records.set(ref.path, value),
    }),
  };

  return { db, records };
}

function skippedCheckin(overrides = {}) {
  return {
    title: 'Sesión omitida',
    mode: 'full_gym',
    source: 'daily_checkin',
    dailyCheckinDate: '2026-06-01',
    checkinSkipped: true,
    symptoms: {
      dyspnea: false,
      jointPain: false,
      dizziness: false,
      tachycardia: false,
    },
    performedAt: '2026-06-01T12:00:00.000Z',
    completed: false,
    ...overrides,
  };
}

describe('Firestore workout persistence', () => {
  let records;

  beforeEach(() => {
    const memory = createInMemoryDb();
    records = memory.records;
    mocks.getAdminServices.mockReset();
    mocks.getAdminServices.mockResolvedValue({ db: memory.db });
  });

  it('upserts one deterministic document per daily check-in date', async () => {
    await createWorkout('user-1', skippedCheckin());
    const updated = await createWorkout('user-1', skippedCheckin({ title: 'Sesión actualizada' }));

    expect(records.size).toBe(1);
    expect(updated.id).toBe('daily-2026-06-01');
    expect(updated.title).toBe('Sesión actualizada');
  });

  it('preserves unknown subjective metrics as null instead of zero', async () => {
    const skipped = await createWorkout('user-1', skippedCheckin());
    const manual = await createWorkout('user-1', {
      title: 'Sesión manual',
      mode: 'full_gym',
      performedAt: '2026-06-01T18:00:00.000Z',
      sessionRpe: null,
      fatigue: null,
      sleepHours: null,
    });

    expect(skipped.sessionRpe).toBeNull();
    expect(skipped.fatigue).toBeNull();
    expect(skipped.sleepHours).toBeNull();
    expect(manual.sessionRpe).toBeNull();
  });
});
