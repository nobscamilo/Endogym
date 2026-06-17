import { describe, it, expect } from 'vitest';
import { buildWaistAssessment } from '../../src/core/waistRisk.js';

describe('waistRisk', () => {
  it('ICA: <0,5 saludable, 0,5-0,6 aumentado, ≥0,6 alto', () => {
    expect(buildWaistAssessment({ waistCm: 80, heightCm: 180, sex: 'male' }).whtrBand.level).toBe('ok');
    expect(buildWaistAssessment({ waistCm: 90, heightCm: 180, sex: 'male' }).whtrBand.level).toBe('raised'); // 0,5
    expect(buildWaistAssessment({ waistCm: 110, heightCm: 180, sex: 'male' }).whtrBand.level).toBe('high');  // 0,61
  });

  it('cintura por sexo (cortes IDF/NCEP)', () => {
    expect(buildWaistAssessment({ waistCm: 90, heightCm: 200, sex: 'male' }).waistBand.level).toBe('ok');     // <94
    expect(buildWaistAssessment({ waistCm: 98, heightCm: 200, sex: 'male' }).waistBand.level).toBe('raised'); // 94-102
    expect(buildWaistAssessment({ waistCm: 104, heightCm: 200, sex: 'male' }).waistBand.level).toBe('high');  // ≥102
    expect(buildWaistAssessment({ waistCm: 78, heightCm: 200, sex: 'female' }).waistBand.level).toBe('ok');   // <80
    expect(buildWaistAssessment({ waistCm: 84, heightCm: 200, sex: 'female' }).waistBand.level).toBe('raised'); // 80-88
    expect(buildWaistAssessment({ waistCm: 92, heightCm: 200, sex: 'female' }).waistBand.level).toBe('high');  // ≥88
  });

  it('nivel global = el peor de ICA y cintura', () => {
    // ICA alto (0,61) + cintura ok (<94) → high
    const r = buildWaistAssessment({ waistCm: 92, heightCm: 150, sex: 'male' });
    expect(r.whtrBand.level).toBe('high');
    expect(r.waistBand.level).toBe('ok');
    expect(r.level).toBe('high');
  });

  it('sin altura no calcula ICA; sin sexo no calcula banda de cintura', () => {
    const noHeight = buildWaistAssessment({ waistCm: 100, sex: 'male' });
    expect(noHeight.whtr).toBeUndefined();
    expect(noHeight.waistBand.level).toBe('raised');
    const noSex = buildWaistAssessment({ waistCm: 100, heightCm: 180 });
    expect(noSex.waistBand).toBeUndefined();
    expect(noSex.whtr).toBeCloseTo(0.56, 2);
  });

  it('valor inválido → null; incluye aviso de etnia', () => {
    expect(buildWaistAssessment({ waistCm: 0, heightCm: 180, sex: 'male' })).toBeNull();
    expect(buildWaistAssessment({ waistCm: 90, heightCm: 180, sex: 'male' }).note).toMatch(/asi[aá]tico/i);
  });
});
