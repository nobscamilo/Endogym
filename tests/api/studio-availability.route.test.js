import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  upsertUserProfile: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return { AuthenticationError, getAuthenticatedUser: mocks.getAuthenticatedUser };
});

vi.mock('../../src/lib/repositories/firestoreRepository.js', () => ({
  upsertUserProfile: mocks.upsertUserProfile,
}));

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_op, handler) => handler({ traceId: 'trace-test' }),
  logError: vi.fn(),
}));

const { POST } = await import('../../src/app/api/studio-availability/route.js');

function post(body) {
  return POST(new Request('http://localhost/api/studio-availability', {
    method: 'POST',
    body: JSON.stringify(body),
  }));
}

function completeSurvey(overrides = {}) {
  return {
    goal: 'strength',
    trainingModality: 'full_gym',
    trainingExperience: 'intermediate',
    activityLevel: 'moderate',
    sex: 'male',
    age: 32,
    weightKg: 80,
    heightCm: 178,
    mealsPerDay: 4,
    sessionMinutes: 60,
    daysPerWeek: 4,
    ...overrides,
  };
}

describe('/api/studio-availability — objetivo SMART y reentrada', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.upsertUserProfile.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    mocks.upsertUserProfile.mockResolvedValue(undefined);
  });

  it('persiste goalTarget con kind derivado del goal (fuerza → e1rmKg)', async () => {
    const res = await post({ goal: 'strength', goalTargetValue: 140, goalTargetDate: '2026-12-01' });
    expect(res.status).toBe(200);
    const patch = mocks.upsertUserProfile.mock.calls[0][1];
    expect(patch.goalTarget).toMatchObject({ kind: 'e1rmKg', goal: 'strength', value: 140, date: '2026-12-01' });
    expect(patch.goalTarget.setAt).toBeTruthy();
  });

  it('perder grasa → weightKg; valores fuera de rango se ignoran', async () => {
    await post({ goal: 'weight_loss', goalTargetValue: 78.55, goalTargetDate: '2026-09-01' });
    expect(mocks.upsertUserProfile.mock.calls[0][1].goalTarget).toMatchObject({ kind: 'weightKg', value: 78.6 });

    await post({ goal: 'weight_loss', goalTargetValue: 10 }); // <30 kg: absurdo
    expect(mocks.upsertUserProfile.mock.calls[1][1].goalTarget).toBeUndefined();
  });

  it('goalTargetValue null borra el objetivo; endurance no genera target numérico', async () => {
    await post({ goal: 'weight_loss', goalTargetValue: null });
    expect(mocks.upsertUserProfile.mock.calls[0][1].goalTarget).toBeNull();

    await post({ goal: 'endurance', goalTargetValue: 50 });
    expect(mocks.upsertUserProfile.mock.calls[1][1].goalTarget).toBeUndefined();
  });

  it('un POST solo-reentrada persiste profile.reentry SIN marcar studioAvailability', async () => {
    const res = await post({ reentryReason: 'enfermedad', reentryDaysOut: 12 });
    expect(res.status).toBe(200);
    const patch = mocks.upsertUserProfile.mock.calls[0][1];
    expect(patch.reentry).toMatchObject({ reason: 'enfermedad', daysOut: 12 });
    expect(patch.reentry.answeredAt).toBeTruthy();
    expect(patch.studioAvailability).toBeUndefined();
    expect(patch.lastSurveyAt).toBeUndefined();
  });

  it('la encuesta completa con reentrada sí marca studioAvailability', async () => {
    await post(completeSurvey({ reentryReason: 'otro' }));
    const patch = mocks.upsertUserProfile.mock.calls[0][1];
    expect(patch.studioAvailability).toBe(true);
    expect(patch.reentry.reason).toBe('otro');
  });

  it('rechaza una encuesta incompleta en vez de completar el perfil con supuestos', async () => {
    const res = await post({ goal: 'strength', trainingModality: 'full_gym', daysPerWeek: 4 });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.details.missingFields).toContain('weightKg');
    expect(json.details.missingFields).toContain('activityLevel');
    expect(mocks.upsertUserProfile).not.toHaveBeenCalled();
  });

  it('persiste comorbilidades estructuradas validando zonas', async () => {
    await post({ conditions: { hypertension: true, diabetes: false, osteoarthritis: true, osteoporosis: false, injuryZones: ['rodilla', 'inventada', 'lumbar'] } });
    const patch = mocks.upsertUserProfile.mock.calls[0][1];
    expect(patch.conditions).toEqual({
      hypertension: true, diabetes: false, osteoarthritis: true, osteoporosis: false,
      injuryZones: ['rodilla', 'lumbar'],
    });
  });

  it('persiste el nivel de entrenamiento cuando es válido', async () => {
    await post({ trainingExperience: 'novice' });
    expect(mocks.upsertUserProfile.mock.calls[0][1].trainingExperience).toBe('novice');

    await post({ trainingExperience: 'élite' });
    expect(mocks.upsertUserProfile.mock.calls[1][1].trainingExperience).toBeUndefined();
  });

  it('razón de reentrada inválida se ignora', async () => {
    await post({ reentryReason: 'hackeo' });
    expect(mocks.upsertUserProfile.mock.calls[0][1].reentry).toBeUndefined();
  });
});
