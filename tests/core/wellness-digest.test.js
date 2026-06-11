import { describe, expect, it } from 'vitest';
import {
  buildNutritionDigest,
  describeNutritionDigest,
  buildRecoveryTrend,
  describeRecoveryTrend,
} from '../../src/core/wellnessDigest.js';

const NOW = new Date('2026-06-11T12:00:00.000Z');

function meal(date, calories, proteinGrams, carbsGrams) {
  return { eatenAt: `${date}T13:00:00.000Z`, totals: { calories, proteinGrams, carbsGrams, fatGrams: 30 } };
}

describe('buildNutritionDigest (FASE 1.1)', () => {
  it('agrega por día y compara con el target del plan de ESE día', () => {
    const meals = [
      meal('2026-06-10', 1200, 60, 120),
      meal('2026-06-10', 1300, 70, 130), // mismo día: suma 2500/130/250
      meal('2026-06-09', 2000, 100, 200),
    ];
    const plan = {
      days: [
        { date: '2026-06-10', nutritionTarget: { calories: 2500, proteinGrams: 130, carbsGrams: 250, fatGrams: 80 } },
        { date: '2026-06-09', nutritionTarget: { calories: 2000, proteinGrams: 100, carbsGrams: 200, fatGrams: 70 } },
      ],
    };
    const d = buildNutritionDigest({ meals, plan, days: 7, now: NOW });
    expect(d.daysWithLogs).toBe(2);
    expect(d.loggedPct).toBe(Math.round((2 / 7) * 100));
    expect(d.real.calories).toBe(Math.round((2500 + 2000) / 2));
    expect(d.deltaPct.calories).toBe(0); // clavado al objetivo de cada día
    expect(d.deltaPct.proteinGrams).toBe(0);
    const text = describeNutritionDigest(d);
    expect(text).toContain('2/7 días');
    expect(text).toContain('OJO'); // <50% de días registrados
  });

  it('devuelve null sin registros (no rellena con ceros) e ignora comidas fuera de ventana', () => {
    expect(buildNutritionDigest({ meals: [], plan: null, now: NOW })).toBeNull();
    // comida antigua (fuera de los 7 días) y comida con kcal 0 → null
    const meals = [meal('2026-05-20', 2000, 100, 200), meal('2026-06-10', 0, 0, 0)];
    expect(buildNutritionDigest({ meals, plan: null, now: NOW })).toBeNull();
    expect(describeNutritionDigest(null)).toBeNull();
  });

  it('sin plan o sin target: reporta solo promedios reales (target null)', () => {
    const d = buildNutritionDigest({ meals: [meal('2026-06-10', 1800, 90, 180)], plan: null, now: NOW });
    expect(d.real.calories).toBe(1800);
    expect(d.target).toBeNull();
    expect(d.deltaPct).toBeNull();
    expect(describeNutritionDigest(d)).not.toContain('Vs objetivo');
  });

  it('detecta déficit relevante frente al target', () => {
    const plan = { days: [{ date: '2026-06-10', nutritionTarget: { calories: 2700, proteinGrams: 150, carbsGrams: 300 } }] };
    const d = buildNutritionDigest({ meals: [meal('2026-06-10', 1800, 90, 180)], plan, now: NOW });
    expect(d.deltaPct.calories).toBe(Math.round(((1800 - 2700) / 2700) * 100)); // -33%
    expect(describeNutritionDigest(d)).toContain('-33%');
  });
});

function checkin(date, { sleep = null, fatigue = null, skipped = false } = {}) {
  return {
    source: 'daily_checkin',
    performedAt: `${date}T07:00:00.000Z`,
    sleepHours: sleep,
    fatigue,
    checkinSkipped: skipped,
    completed: true,
  };
}

describe('buildRecoveryTrend (FASE 1.2)', () => {
  it('media de sueño/fatiga 7 días y tendencia vs semana anterior', () => {
    const workouts = [
      checkin('2026-06-10', { sleep: 7, fatigue: 7 }),
      checkin('2026-06-08', { sleep: 6, fatigue: 8 }),
      // semana anterior
      checkin('2026-06-02', { sleep: 8, fatigue: 4 }),
      checkin('2026-06-01', { sleep: 7.5, fatigue: 5 }),
    ];
    const r = buildRecoveryTrend({ workouts, days: 7, now: NOW });
    expect(r.avgSleepHours).toBe(6.5);
    expect(r.avgFatigue).toBe(7.5);
    expect(r.prevAvgFatigue).toBe(4.5);
    expect(r.fatigueTrend).toBe('subiendo');
    const text = describeRecoveryTrend(r);
    expect(text).toContain('sueño medio 6.5');
    expect(text).toContain('subiendo');
  });

  it('null sin datos recientes; los check-ins omitidos no cuentan', () => {
    expect(buildRecoveryTrend({ workouts: [], now: NOW })).toBeNull();
    const skippedOnly = [checkin('2026-06-10', { skipped: true })];
    expect(buildRecoveryTrend({ workouts: skippedOnly, now: NOW })).toBeNull();
    // dato viejo (solo semana anterior) → null
    expect(buildRecoveryTrend({ workouts: [checkin('2026-06-01', { sleep: 8, fatigue: 3 })], now: NOW })).toBeNull();
  });

  it('sin semana anterior no inventa tendencia; fatiga 0 es válida', () => {
    const r = buildRecoveryTrend({ workouts: [checkin('2026-06-10', { sleep: 8, fatigue: 0 })], now: NOW });
    expect(r.avgFatigue).toBe(0);
    expect(r.fatigueTrend).toBeNull();
    expect(describeRecoveryTrend(r)).toContain('fatiga media 0/10');
  });

  it('aviso de sueño bajo (<6.5 h)', () => {
    const r = buildRecoveryTrend({ workouts: [checkin('2026-06-10', { sleep: 5.5, fatigue: 6 })], now: NOW });
    expect(describeRecoveryTrend(r)).toContain('BAJO');
  });
});
