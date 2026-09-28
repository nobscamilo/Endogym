import { describe, expect, it } from 'vitest';
import { RUN_RPE_BY_TYPE, effectiveIntensityRpe, targetHrRangeForRunType, estimateSessionRpeFromHr, hrZone } from '../../src/core/running.js';

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

  it('rodaje fácil: techo al 75 % de la FCmáx (decisión 28-sep-2026), no al 85 %', () => {
    const hr = targetHrRangeForRunType('easy', 182);
    expect(hr).toEqual({ min: 110, max: 136, label: 'Z2' });
    // El techo no puede meter el rodaje en la "zona gris" (>~80 %).
    expect(hr.max / 182).toBeLessThan(0.76);
    const rpeHigh = estimateSessionRpeFromHr({ avgHeartRate: hr.max, hrMax: 182 });
    expect(rpeHigh).toBeLessThanOrEqual(5);
  });

  it('las zonas del modelo son contiguas y la carrera real del 27-sep (158 ppm) es umbral, no Z2', () => {
    expect(hrZone(136, 182).zone).toBe(2);
    expect(hrZone(137, 182).zone).toBe(3);
    expect(hrZone(158, 182).zone).toBe(4);
    expect(targetHrRangeForRunType('intervals', 182)).toEqual({ min: 150, max: 181, label: 'Z4–5' });
  });
});
