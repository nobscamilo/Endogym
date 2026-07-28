import { describe, expect, it } from 'vitest';
import { mapActivityToWorkout } from '../../src/services/stravaClient.js';
import { estimateSessionRpeFromHr, resolveHrMax } from '../../src/core/running.js';
import { buildProgressMemory } from '../../src/core/progressMemory.js';

// El motor adaptativo se mueve con `sessionRpe`, que solo llegaba del check-in manual. Quien
// entrenaba y sincronizaba por Strava sin rellenarlo dejaba el esfuerzo ciego. Estos tests
// fijan la automatización y —tan importante— que un esfuerzo ESTIMADO nunca se disfrace de
// esfuerzo reportado.

const actividad = (extra = {}) => ({
  id: 1,
  name: 'Carrera nocturna',
  sport_type: 'Run',
  start_date: '2026-07-28T19:00:00Z',
  distance: 6219.8,
  moving_time: 3661,
  average_heartrate: 144,
  max_heartrate: 160,
  total_elevation_gain: 17.2,
  suffer_score: 77,
  ...extra,
});

describe('esfuerzo importado de Strava', () => {
  it('estimateSessionRpeFromHr crece con el %FCmáx y se queda en rango 1-10', () => {
    const hrMax = 180;
    const suave = estimateSessionRpeFromHr({ avgHeartRate: 108, hrMax }); // 60%
    const medio = estimateSessionRpeFromHr({ avgHeartRate: 144, hrMax }); // 80%
    const duro = estimateSessionRpeFromHr({ avgHeartRate: 171, hrMax }); // 95%
    expect(suave).toBeLessThan(medio);
    expect(medio).toBeLessThan(duro);
    expect(suave).toBeGreaterThanOrEqual(1);
    expect(duro).toBeLessThanOrEqual(10);
  });

  it('no estima nada sin FC, sin FCmáx creíble o fuera de rango fisiológico', () => {
    expect(estimateSessionRpeFromHr({ avgHeartRate: null, hrMax: 180 })).toBeNull();
    expect(estimateSessionRpeFromHr({ avgHeartRate: 140, hrMax: 90 })).toBeNull();
    expect(estimateSessionRpeFromHr({ avgHeartRate: 40, hrMax: 180 })).toBeNull(); // 22%: no creíble
  });

  it('guarda la carga real de Strava y el desnivel, que antes se tiraban', () => {
    const w = mapActivityToWorkout(actividad(), { hrMax: 180 });
    expect(w.relativeEffort).toBe(77); // Relative Effort, viene gratis en la lista
    expect(w.elevationGainM).toBe(17);
    expect(w.avgPaceSecPerKm).toBeGreaterThan(0);
  });

  it('con FCmáx estima el esfuerzo y lo marca como estimado, sin tocar sessionRpe', () => {
    const w = mapActivityToWorkout(actividad(), { hrMax: 180 });
    expect(w.sessionRpe).toBeNull();            // nadie lo ha reportado
    expect(w.sessionRpeEstimated).toBeGreaterThan(0);
    expect(w.rpeSource).toBe('hr_estimate');
  });

  it('si la persona puso su RPE en Strava, ESE manda y no se estima nada', () => {
    const w = mapActivityToWorkout(actividad({ perceived_exertion: 8 }), { hrMax: 180 });
    expect(w.sessionRpe).toBe(8);               // percepción declarada: es un dato real
    expect(w.sessionRpeEstimated).toBeNull();
    expect(w.rpeSource).toBe('strava_reported');
  });

  it('sin FCmáx no inventa esfuerzo', () => {
    const w = mapActivityToWorkout(actividad());
    expect(w.sessionRpeEstimated).toBeNull();
    expect(w.rpeSource).toBeNull();
  });

  it('resolveHrMax prioriza la medida, luego la observada y por último la edad', () => {
    expect(resolveHrMax({ profile: { hrMaxBpm: 190, age: 40 } }).hrMax).toBe(190);
    // Si ha superado su máxima declarada, manda lo observado.
    expect(resolveHrMax({ profile: { hrMaxBpm: 180, age: 40 }, observedMaxHr: 194 }).hrMax).toBe(194);
    expect(resolveHrMax({ profile: { age: 40 } }).source).toBe('estimada por edad');
    expect(resolveHrMax({ profile: {} })).toBeNull();
  });

  it('el motor adaptativo ya ve esfuerzo con solo actividades de Strava (sin check-in)', () => {
    const now = new Date('2026-07-29T09:00:00Z');
    const workouts = [1, 3, 5].map((d) => mapActivityToWorkout(
      actividad({ id: d, start_date: new Date(now.getTime() - d * 864e5).toISOString() }),
      { hrMax: 180 },
    ));

    const pm = buildProgressMemory({ workouts, meals: [], metrics: [], now });
    expect(pm.metrics.avgSessionRpe).toBeGreaterThan(0);
    // Y queda constancia de que ese esfuerzo es estimado, no declarado.
    expect(pm.metrics.rpeEstimatedCount).toBe(3);
    expect(pm.metrics.rpeReportedCount).toBe(0);
  });
});
