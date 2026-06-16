import { describe, it, expect } from 'vitest';
import { buildMesocycleReview } from '../../src/core/mesocycleReview.js';

function planWith(days, extra = {}) {
  return { isBlock: true, blockStartDate: '2026-06-01', days, ...extra };
}
function strengthDay(date, focusChanged = false) {
  return { date, isTrainingDay: true, sessionType: 'resistance', sessionFocus: 'upper', workout: { title: 'Torso', focusChangeApplied: focusChanged, exercises: [] } };
}
function checkin(date, { jointPain = false, fatigue = null } = {}) {
  return { source: 'daily_checkin', performedAt: `${date}T12:00:00.000Z`, completed: true, symptoms: { jointPain }, fatigue };
}

describe('mesocycleReview', () => {
  it('marca revisión si hay ≥3 cambios de foco en el bloque', () => {
    const plan = planWith([strengthDay('2026-06-02', true), strengthDay('2026-06-04', true), strengthDay('2026-06-06', true)]);
    const r = buildMesocycleReview({ plan, workouts: [], today: '2026-06-08' });
    expect(r.status).toBe('review');
    expect(r.suggestRegen).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/grupo muscular/i);
  });

  it('marca revisión si el bloque tiene ≥28 días', () => {
    const plan = planWith([strengthDay('2026-06-01')]);
    const r = buildMesocycleReview({ plan, workouts: [], today: '2026-07-01' });
    expect(r.status).toBe('review');
    expect(r.reasons.join(' ')).toMatch(/días activo/i);
  });

  it('marca revisión por dolor articular repetido', () => {
    const plan = planWith([strengthDay('2026-06-02')]);
    const workouts = [
      checkin('2026-06-03', { jointPain: true }),
      checkin('2026-06-05', { jointPain: true }),
      checkin('2026-06-07', { jointPain: true }),
    ];
    const r = buildMesocycleReview({ plan, workouts, today: '2026-06-08' });
    expect(r.status).toBe('review');
    expect(r.reasons.join(' ')).toMatch(/dolor articular/i);
  });

  it('status ok cuando no hay señales', () => {
    const plan = planWith([strengthDay('2026-06-02'), strengthDay('2026-06-04')]);
    const r = buildMesocycleReview({ plan, workouts: [checkin('2026-06-03', { fatigue: 4 })], today: '2026-06-08' });
    expect(r.status).toBe('ok');
    expect(r.suggestRegen).toBe(false);
  });
});
