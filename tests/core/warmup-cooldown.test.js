import { describe, expect, it } from 'vitest';
import { detectComorbidities, buildWarmupProtocol, buildCooldownProtocol, deriveWorkedGroups } from '../../src/core/warmupCooldown.js';

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

  it('checkboxes estructurados mandan aunque el texto libre esté vacío (y se unen al léxico)', () => {
    const c = detectComorbidities({
      conditions: { hypertension: true, osteoporosis: true, injuryZones: ['rodilla'] },
      physicalInjuries: 'molestia de hombro',
    });
    expect(c.hypertension).toBe(true);
    expect(c.osteoporosis).toBe(true);
    expect(c.diabetes).toBe(false);
    expect(c.injuries).toEqual(expect.arrayContaining(['rodilla', 'hombro']));
  });

  it('texto coloquial "tensión alta" ahora también detecta hipertensión (léxico ampliado)', () => {
    expect(detectComorbidities({ medicalConditions: 'tengo la tensión alta' }).hypertension).toBe(true);
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

describe('fusión del calentamiento técnico de carrera (fuente única)', () => {
  it('los drills concretos de runPrescription sustituyen al texto genérico de activación', async () => {
    const { mergeRunDrillsIntoWarmup } = await import('../../src/core/planner.js');
    const workout = {
      warmup: buildWarmupProtocol({ sessionType: 'aerobic', sessionFocus: 'cardio_intervals', profile: {} }),
      runPrescription: { drills: ['Movilidad de tobillo y cadera (3 min)', 'A-skip y skipping bajo (2×20 m)', '4-6 rectas progresivas (strides) de 60-80 m'] },
    };
    mergeRunDrillsIntoWarmup(workout);
    const act = workout.warmup.find((s) => s.step === 'Activación biomecánica');
    expect(act.details).toContain('A-skip y skipping bajo (2×20 m)');
    expect(act.details).toContain('rectas progresivas');
  });

  it('sin drills (rodaje fácil) el protocolo queda intacto', async () => {
    const { mergeRunDrillsIntoWarmup } = await import('../../src/core/planner.js');
    const workout = {
      warmup: buildWarmupProtocol({ sessionType: 'aerobic', sessionFocus: 'cardio_easy', profile: {} }),
      runPrescription: { drills: [] },
    };
    const before = workout.warmup.find((s) => s.step === 'Activación biomecánica').details;
    mergeRunDrillsIntoWarmup(workout);
    expect(workout.warmup.find((s) => s.step === 'Activación biomecánica').details).toBe(before);
  });
});

describe('warmup/cooldown dirigidos por ejercicios reales (grupos/patrón) y nuevas patologías', () => {
  const lowerEx = [{ category: 'lower_body_strength' }, { category: 'posterior_chain' }];
  const pushEx = [{ category: 'upper_push' }, { category: 'core' }];

  it('deriveWorkedGroups mapea category → grupos legibles y deduplicados', () => {
    expect(deriveWorkedGroups(lowerEx)).toEqual(['cuádriceps y glúteos', 'isquiosurales, glúteos y lumbar']);
    expect(deriveWorkedGroups([])).toEqual([]);
  });

  it('cooldown nombra los grupos realmente trabajados hoy', () => {
    const cd = buildCooldownProtocol({ sessionType: 'resistance', profile: {}, exercises: pushEx });
    const stretch = cd.find((s) => s.step === 'Estiramientos suaves');
    expect(stretch.details).toMatch(/pecho, hombros y tríceps/);
    expect(stretch.details).toMatch(/core/);
  });

  it('cooldown sin ejercicios conserva el texto genérico (compat)', () => {
    const cd = buildCooldownProtocol({ sessionType: 'resistance', profile: {} });
    expect(cd.find((s) => s.step === 'Estiramientos suaves').details).toMatch(/grupo muscular trabajado hoy/);
  });

  it('warmup añade preparación específica por patrón presente (bisagra/empuje)', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'lower', profile: {}, exercises: lowerEx });
    const act = w.find((s) => s.step === 'Activación biomecánica');
    expect(act.details).toMatch(/Prepara lo que harás hoy/);
    expect(act.details).toMatch(/bisagra de cadera/);
  });

  it('asma: calentamiento general ≥10 min con aviso de inhalador/broncoespasmo', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'push', profile: { conditions: { asthma: true } } });
    expect(w[0].durationMinutes).toBeGreaterThanOrEqual(10);
    expect(w[0].details).toMatch(/inhalador|broncoespasmo/i);
  });

  it('embarazo: anti-Valsalva en aproximación y aviso de decúbito supino en estiramientos', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'lower', profile: { conditions: { pregnant: true } }, exercises: lowerEx });
    expect(w.find((s) => s.step === 'Series de aproximación').details).toMatch(/Valsalva/i);
    const cd = buildCooldownProtocol({ sessionType: 'resistance', profile: { conditions: { pregnant: true } }, exercises: lowerEx });
    expect(cd.find((s) => s.step === 'Estiramientos suaves').details).toMatch(/boca arriba/i);
  });

  it('HTA controlada: misma duración (8 min) con la nota suavizada', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'push', profile: { conditions: { hypertension: true, hypertensionControlled: true } } });
    expect(w[0].durationMinutes).toBe(8);
    expect(w[0].details).toMatch(/controlada/i);
  });

  it('cubre múltiples lesiones (no solo 2) y prioriza la región del día', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'lower', profile: { conditions: { injuryZones: ['hombro', 'rodilla', 'lumbar'] } }, exercises: lowerEx });
    const zoneSteps = w.filter((s) => s.step.startsWith('Cuidado de tu zona sensible'));
    expect(zoneSteps.length).toBe(3);
    expect(zoneSteps[0].step).not.toMatch(/hombro/);
  });

  it('mindbody y recovery tienen movilidad/activación propias (no caen al bloque de fuerza)', () => {
    const yoga = buildWarmupProtocol({ sessionType: 'mindbody', sessionFocus: 'mindbody', profile: {} });
    expect(yoga.find((s) => s.step === 'Movilidad específica').details).toMatch(/columna|respiración/i);
    const rec = buildWarmupProtocol({ sessionType: 'recovery', sessionFocus: 'recovery', profile: {} });
    expect(rec.find((s) => s.step === 'Activación biomecánica').details).toMatch(/sin fatigar/i);
  });

  it('día con menos recuperación (gentle): alarga general y añade respiración parasimpática', () => {
    const w = buildWarmupProtocol({ sessionType: 'resistance', sessionFocus: 'lower', profile: {}, exercises: lowerEx, adaptive: { gentle: true } });
    expect(w[0].durationMinutes).toBeGreaterThanOrEqual(6);
    expect(w[0].details).toMatch(/menos recuperación/i);
    const cd = buildCooldownProtocol({ sessionType: 'resistance', profile: {}, exercises: lowerEx, adaptive: { gentle: true } });
    expect(cd.find((s) => s.step === 'Respiración de recuperación')).toBeTruthy();
  });
});
