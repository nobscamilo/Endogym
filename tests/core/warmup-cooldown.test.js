import { describe, expect, it } from 'vitest';
import { detectComorbidities, buildWarmupProtocol, buildCooldownProtocol } from '../../src/core/warmupCooldown.js';

describe('detectComorbidities (léxico determinista)', () => {
  it('detecta HTA, artrosis, diabetes, osteoporosis y lesiones por zona', () => {
    const c = detectComorbidities({
      medicalConditions: 'Hipertensión arterial controlada y artrosis de rodilla. Diabetes tipo 2.',
      physicalInjuries: 'Hernia discal lumbar antigua; molestias de hombro',
      age: 64,
    });
    expect(c.hypertension).toBe(true);
    expect(c.osteoarthritis).toBe(true);
    expect(c.diabetes).toBe(true);
    expect(c.injuries).toEqual(expect.arrayContaining(['lumbar', 'hombro', 'rodilla']));
    expect(c.older).toBe(true);
  });

  it('perfil limpio: nada marcado (no inventa)', () => {
    const c = detectComorbidities({ medicalConditions: '', age: 30 });
    expect(c.hypertension).toBe(false);
    expect(c.osteoarthritis).toBe(false);
    expect(c.injuries).toEqual([]);
    expect(c.older).toBe(false);
  });

  it('objetivo glucémico cuenta como señal de diabetes; el cribado como cardiometabólica', () => {
    expect(detectComorbidities({ goal: 'glycemic_control' }).diabetes).toBe(true);
    expect(detectComorbidities({ preparticipation: { knownCardiometabolicDisease: true } }).cardiometabolic).toBe(true);
  });
});

describe('buildWarmupProtocol — general + específico + comorbilidades', () => {
  it('siempre ensambla general (termorregulación) + movilidad + activación específica del foco', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'lower', profile: {} });
    const names = w.map((s) => s.step);
    expect(names[0]).toContain('Calentamiento general');
    expect(names).toContain('Movilidad específica');
    expect(names).toContain('Activación biomecánica');
    expect(names).toContain('Series de aproximación');
    const mob = w.find((s) => s.step === 'Movilidad específica');
    expect(mob.details).toMatch(/cadera y tobillo/i);
    const act = w.find((s) => s.step === 'Activación biomecánica');
    expect(act.details).toMatch(/glúteo/i);
  });

  it('hipertensión: general más largo (8 min), subida muy progresiva y aviso anti-Valsalva en fuerza', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'push', profile: { medicalConditions: 'hipertensión' } });
    const general = w[0];
    expect(general.durationMinutes).toBe(8);
    expect(general.details).toMatch(/progresiv/i);
    expect(w.find((s) => s.step === 'Series de aproximación').details).toMatch(/Valsalva/i);
  });

  it('artrosis: general sin impacto y movilidad más larga, lenta y sin rebotes', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'lower', profile: { medicalConditions: 'artrosis de cadera' } });
    expect(w[0].details).toMatch(/sin impacto/i);
    const mob = w.find((s) => s.step === 'Movilidad específica');
    expect(mob.durationMinutes).toBe(6);
    expect(mob.details).toMatch(/sin rebotes/i);
  });

  it('osteoporosis: evita flexión/rotación espinal en la movilidad', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'full_body', profile: { medicalConditions: 'osteopenia' } });
    expect(w.find((s) => s.step === 'Movilidad específica').details).toMatch(/columna|neutra/i);
  });

  it('lesión previa: añade activación dirigida de la zona', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'lower', profile: { physicalInjuries: 'rotura de menisco hace 2 años' } });
    const zona = w.find((s) => s.step.includes('rodilla'));
    expect(zona).toBeTruthy();
    expect(zona.details).toMatch(/antes de cargar/i);
  });

  it('día de series (carrera): drills y progresivos como activación', () => {
    const w = buildWarmupProtocol({ sessionType: 'aerobic', sessionFocus: 'cardio_intervals', profile: {} });
    expect(w.find((s) => s.step === 'Activación biomecánica').details).toMatch(/progresivos|drills/i);
    expect(w.find((s) => s.step === 'Series de aproximación')).toBeUndefined();
  });
});

describe('buildCooldownProtocol — fase de retorno', () => {
  it('hipertensión: retorno prolongado (7 min), prohibido parar en seco y sin cabeza bajo el corazón', () => {
    const cd = buildCooldownProtocol({ sessionType: 'aerobic', profile: { medicalConditions: 'HTA' } });
    expect(cd[0].durationMinutes).toBe(7);
    expect(cd[0].details).toMatch(/pares en seco/i);
    expect(cd.find((s) => s.step === 'Estiramientos suaves').details).toMatch(/cabeza por debajo/i);
  });

  it('diabetes: recordatorio de pies e hipoglucemia tardía, marcado como educativo', () => {
    const cd = buildCooldownProtocol({ sessionType: 'resistance', profile: { medicalConditions: 'diabetes tipo 2' } });
    const note = cd.find((s) => s.step.includes('Tras la sesión'));
    expect(note.details).toMatch(/pies/i);
    expect(note.details).toMatch(/educativo/i);
  });

  it('perfil limpio: retorno estándar de 4 min y estiramientos', () => {
    const cd = buildCooldownProtocol({ sessionType: 'resistance', profile: {} });
    expect(cd[0].durationMinutes).toBe(4);
    expect(cd.map((s) => s.step)).toContain('Estiramientos suaves');
  });
});
