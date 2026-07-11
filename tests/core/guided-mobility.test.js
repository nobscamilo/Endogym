import { describe, expect, it } from 'vitest';
import { buildGuidedMobilityRoutine, buildGuidedWarmupRoutine } from '../../src/core/guidedMobility.js';

describe('buildGuidedMobilityRoutine — secuencia original ligada a lo trabajado', () => {
  it('pierna selecciona movilidad de cadera/isquios y explica los grupos reales', () => {
    const routine = buildGuidedMobilityRoutine({
      exercises: [{ category: 'lower_body_strength' }, { category: 'posterior_chain' }],
      durationMinutes: 10,
    });
    expect(routine.context).toMatch(/cuádriceps y glúteos/);
    expect(routine.context).toMatch(/isquiosurales/);
    expect(routine.movements.map((m) => m.id)).toEqual(expect.arrayContaining(['hip-flexor-half-kneel', 'hamstring-hinge']));
    expect(routine.movements.reduce((sum, m) => sum + m.seconds, 0)).toBe(600);
    expect(routine.selectionReason).toMatch(/ejercicios reales/i);
  });

  it('empuje no recibe una rutina dominada por pierna', () => {
    const routine = buildGuidedMobilityRoutine({ exercises: [{ category: 'upper_push' }], durationMinutes: 5 });
    const ids = routine.movements.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['doorway-pec', 'triceps-overhead']));
    expect(ids).not.toContain('hamstring-hinge');
    expect(routine.movements.reduce((sum, m) => sum + m.seconds, 0)).toBe(300);
  });

  it('tracción selecciona dorsal/hombro posterior', () => {
    const routine = buildGuidedMobilityRoutine({ exercises: [{ category: 'upper_pull' }] });
    expect(routine.movements.map((m) => m.id)).toEqual(expect.arrayContaining(['lat-bench', 'posterior-shoulder']));
  });

  it('aplica guardarraíles de embarazo y osteoporosis', () => {
    const pregnant = buildGuidedMobilityRoutine({ exercises: [{ category: 'core' }], profile: { conditions: { pregnant: true } } });
    expect(pregnant.movements.map((m) => m.id)).not.toEqual(expect.arrayContaining(['cobra-low', 'supine-knee-hug', 'thoracic-open-book']));
    const osteoporosis = buildGuidedMobilityRoutine({ exercises: [{ category: 'upper_pull' }], profile: { conditions: { osteoporosis: true } } });
    expect(osteoporosis.movements.map((m) => m.id)).not.toContain('thoracic-open-book');
  });

  it('solo acepta las duraciones públicas y cae a 10 min con una inválida', () => {
    expect(buildGuidedMobilityRoutine({ durationMinutes: 15 }).durationMinutes).toBe(15);
    expect(buildGuidedMobilityRoutine({ durationMinutes: 7 }).durationMinutes).toBe(10);
    expect(buildGuidedMobilityRoutine().durationOptions).toEqual([5, 10, 15, 20]);
  });
});

describe('buildGuidedWarmupRoutine — preparación dinámica ligada a la sesión', () => {
  it('empuje prepara hombro y escápulas e incluye aproximación en fuerza', () => {
    const routine = buildGuidedWarmupRoutine({ exercises: [{ category: 'upper_push' }], sessionType: 'resistance' });
    const ids = routine.movements.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['band-external-rotation', 'wall-slides', 'ramp-sets']));
    expect(ids).not.toContain('bodyweight-squat-rehearsal');
    expect(routine.context).toMatch(/pecho, hombros y tríceps/i);
    expect(routine.movements.reduce((sum, m) => sum + m.seconds, 0)).toBe(600);
  });

  it('pierna prepara tobillo, sentadilla y bisagra según categorías reales', () => {
    const routine = buildGuidedWarmupRoutine({ exercises: [{ category: 'lower_body_strength' }, { category: 'posterior_chain' }], durationMinutes: 5 });
    expect(routine.movements.map((m) => m.id)).toEqual(expect.arrayContaining(['ankle-rocks', 'bodyweight-squat-rehearsal', 'hip-hinge-rehearsal']));
    expect(routine.movements.reduce((sum, m) => sum + m.seconds, 0)).toBe(300);
  });

  it('embarazo evita el dead bug supino y mantiene una alternativa de core', () => {
    const routine = buildGuidedWarmupRoutine({ exercises: [{ category: 'core' }], profile: { conditions: { pregnant: true } } });
    expect(routine.movements.map((m) => m.id)).not.toContain('dead-bug-primer');
  });
});
