import { describe, expect, it } from 'vitest';
import {
  runEfficiencyFactor,
  buildEfficiencyTrend,
  predictRaceTimeFromRuns,
  formatRaceTime,
  RACE_GOAL_METERS,
} from '../../src/core/running.js';

describe('fitness aeróbico (eficiencia y predicción)', () => {
  it('runEfficiencyFactor: m/min por ppm; null sin datos', () => {
    // 6:00/km = 360 s/km → 166,67 m/min; FC 150 → EF ≈ 1.11
    expect(runEfficiencyFactor({ avgPaceSecPerKm: 360, avgHeartRate: 150 })).toBeCloseTo(1.11, 2);
    expect(runEfficiencyFactor({ avgPaceSecPerKm: null, avgHeartRate: 150 })).toBeNull();
    expect(runEfficiencyFactor({ avgPaceSecPerKm: 360, avgHeartRate: 0 })).toBeNull();
  });

  it('buildEfficiencyTrend: mediana reciente vs base y % de cambio', () => {
    const run = (date, pace, hr) => ({ performedAt: `${date}T10:00:00Z`, avgPaceSecPerKm: pace, avgHeartRate: hr });
    const runs = [
      run('2026-05-01', 380, 155), run('2026-05-08', 378, 154), run('2026-05-15', 376, 153),
      run('2026-06-01', 360, 148), run('2026-06-05', 358, 147), run('2026-06-08', 356, 146),
    ];
    const t = buildEfficiencyTrend(runs);
    expect(t).not.toBeNull();
    expect(t.recentEf).toBeGreaterThan(t.baselineEf); // corre más rápido con menos pulso
    expect(t.trendPct).toBeGreaterThan(0);
    expect(buildEfficiencyTrend(runs.slice(0, 3))).toBeNull(); // insuficiente
  });

  it('predictRaceTimeFromRuns: Riegel desde el mejor esfuerzo; ignora carreras cortas', () => {
    const runs = [
      { performedAt: '2026-06-01T10:00:00Z', title: '10K test', distanceKm: 10, durationMinutes: 50 },
      { performedAt: '2026-06-05T10:00:00Z', title: 'Trote corto', distanceKm: 2, durationMinutes: 12 },
    ];
    const p = predictRaceTimeFromRuns({ distanceMeters: RACE_GOAL_METERS.race_21k, runs });
    expect(p).not.toBeNull();
    expect(p.basedOn.title).toBe('10K test');
    // 50 min a 10K → 21,097K ≈ 50 × (2.1097)^1.06 ≈ 110 min
    expect(p.seconds).toBeGreaterThan(105 * 60);
    expect(p.seconds).toBeLessThan(115 * 60);
    expect(predictRaceTimeFromRuns({ distanceMeters: 21097, runs: [] })).toBeNull();
  });

  it('formatRaceTime: h:mm:ss o m:ss', () => {
    expect(formatRaceTime(6630)).toBe('1:50:30');
    expect(formatRaceTime(1500)).toBe('25:00');
    expect(formatRaceTime(0)).toBeNull();
  });
});
