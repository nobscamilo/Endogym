import { describe, expect, it } from 'vitest';
import { RUN_RPE_BY_TYPE, effectiveIntensityRpe, targetHrRangeForRunType, estimateSessionRpeFromHr } from '../../src/core/running.js';

// Bug 27-sep-2026: un "Rodaje suave · Zona 2 · conversacional" se prescribía como "RPE 5-8"
// (genérico del bloque de resistencia) y el chat improvisaba otro RPE.
describe('RPE por tipo de carrera', () => {
  it('rodaje/tirada larga son suaves y las series duras', () => {
    expect(RUN_RPE_BY_TYPE.easy).toBe('RPE 3-4');
    expect(RUN_RPE_BY_TYPE.long).toBe('RPE 3-4');
    expect(RUN_RPE_BY_TYPE.tempo).toBe('RPE 6-7');
    expect(RUN_RPE_BY_TYPE.intervals).toBe('RPE 8-9');
  });

  it('corrige al leer los bloques antiguos con "RPE 5-8" en un rodaje', () => {
    expect(effectiveIntensityRpe({ intensityRpe: 'RPE 5-8', runPrescription: { runType: 'easy' } })).toBe('RPE 3-4');
    expect(effectiveIntensityRpe({ intensityRpe: 'RPE 5-8', runPrescription: { runType: 'intervals' } })).toBe('RPE 8-9');
  });

  it('respeta el RPE de los bloques nuevos (ya ajustado) y no toca sesiones sin carrera', () => {
    expect(effectiveIntensityRpe({ intensityRpe: 'RPE 6-7', intensityRpeSource: 'run_type', runPrescription: { runType: 'intervals' } })).toBe('RPE 6-7');
    expect(effectiveIntensityRpe({ intensityRpe: 'RPE 7-8' })).toBe('RPE 7-8');
  });

  it('el rango de FC de Z2 cuadra con la estimación FC→RPE (coherencia interna)', () => {
    const hr = targetHrRangeForRunType('easy', 182);
    expect(hr).toEqual({ min: 110, max: 127, label: 'Z2' });
    const rpeLow = estimateSessionRpeFromHr({ avgHeartRate: hr.min, hrMax: 182 });
    const rpeHigh = estimateSessionRpeFromHr({ avgHeartRate: hr.max, hrMax: 182 });
    expect(rpeLow).toBeGreaterThanOrEqual(2);
    expect(rpeHigh).toBeLessThanOrEqual(4);
  });
});
