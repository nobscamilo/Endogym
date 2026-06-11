import { describe, expect, it } from 'vitest';
import { filterRestrictedExercises, listActiveRestrictionRules } from '../../src/core/comorbidityRestrictions.js';
import { buildSessionExercises } from '../../src/core/exerciseLibrary.js';

const EX = {
  crunch: { id: 'gym-crunch', name: 'Encogimiento abdominal', category: 'core' },
  woodchop: { id: 'home-band-woodchop', name: 'Leñador con banda', category: 'core' },
  plank: { id: 'gym-plank', name: 'Plancha', category: 'core' },
  burpee: { id: 'gym-burpee', name: 'Burpee', category: 'conditioning' },
  squat: { id: 'gym-barbell-back-squat', name: 'Sentadilla trasera con barra', category: 'lower_body_strength' },
  deadlift: { id: 'gym-conventional-deadlift', name: 'Peso muerto convencional', category: 'posterior_chain' },
  rdl: { id: 'gym-romanian-deadlift', name: 'Peso muerto rumano', category: 'posterior_chain' },
  ohp: { id: 'gym-overhead-press', name: 'Press militar', category: 'upper_push' },
  bench: { id: 'gym-bench-press', name: 'Press banca', category: 'upper_push' },
  dips: { id: 'gym-dips', name: 'Fondos', category: 'upper_push' },
};
const ALL = Object.values(EX);

describe('filterRestrictedExercises (selección por comorbilidad)', () => {
  it('perfil limpio: no filtra nada', () => {
    const { allowed, excluded } = filterRestrictedExercises(ALL, { medicalConditions: '' });
    expect(allowed).toHaveLength(ALL.length);
    expect(excluded).toHaveLength(0);
  });

  it('osteoporosis: bloquea flexión espinal cargada (crunch, leñador) pero CONSERVA plancha y sentadilla', () => {
    const { allowed, excluded } = filterRestrictedExercises(ALL, { medicalConditions: 'osteoporosis' });
    const exIds = excluded.map((e) => e.id);
    expect(exIds).toContain('gym-crunch');
    expect(exIds).toContain('home-band-woodchop');
    expect(allowed.map((e) => e.id)).toEqual(expect.arrayContaining(['gym-plank', 'gym-barbell-back-squat']));
    expect(excluded[0].reason).toMatch(/fractura vertebral/i);
  });

  it('artrosis: bloquea saltos/burpees; lesión de rodilla también', () => {
    expect(filterRestrictedExercises(ALL, { medicalConditions: 'artrosis' }).excluded.map((e) => e.id)).toContain('gym-burpee');
    expect(filterRestrictedExercises(ALL, { physicalInjuries: 'menisco rodilla derecha' }).excluded.map((e) => e.id)).toContain('gym-burpee');
  });

  it('lumbar sensible: bloquea peso muerto convencional pero CONSERVA el rumano (decisión documentada)', () => {
    const { allowed, excluded } = filterRestrictedExercises(ALL, { physicalInjuries: 'hernia discal lumbar' });
    expect(excluded.map((e) => e.id)).toContain('gym-conventional-deadlift');
    expect(allowed.map((e) => e.id)).toContain('gym-romanian-deadlift');
  });

  it('hombro sensible: bloquea press militar y fondos pero conserva press banca', () => {
    const { allowed, excluded } = filterRestrictedExercises(ALL, { physicalInjuries: 'tendinitis de hombro' });
    const exIds = excluded.map((e) => e.id);
    expect(exIds).toContain('gym-overhead-press');
    expect(exIds).toContain('gym-dips');
    expect(allowed.map((e) => e.id)).toContain('gym-bench-press');
  });

  it('hipertensión NO bloquea ejercicios (decisión documentada: se gestiona con RPE/Valsalva)', () => {
    expect(listActiveRestrictionRules({ medicalConditions: 'hipertensión' })).toHaveLength(0);
  });
});

describe('integración con la selección real del planner', () => {
  it('una sesión de core con osteoporosis no contiene crunch/woodchop/russian y SÍ alternativas neutras', () => {
    const exercises = buildSessionExercises({
      modality: 'home',
      sessionType: 'resistance',
      sessionFocus: 'full_body',
      goal: 'recomposition',
      profile: { medicalConditions: 'osteoporosis', weightKg: 70 },
      adaptiveTuning: null,
      sessionMinutes: 60,
    });
    const ids = exercises.map((e) => e.id).join(' ');
    expect(ids).not.toMatch(/crunch|woodchop|russian|sit-?up|knee-tuck/);
    expect(exercises.length).toBeGreaterThanOrEqual(4); // el filtro no deja la sesión vacía
  });

  it('la misma sesión sin comorbilidades puede incluir esos ejercicios (control)', () => {
    const restricted = buildSessionExercises({
      modality: 'home', sessionType: 'resistance', sessionFocus: 'full_body', goal: 'recomposition',
      profile: { medicalConditions: 'osteoporosis', weightKg: 70 }, adaptiveTuning: null, sessionMinutes: 60,
    }).map((e) => e.id);
    const free = buildSessionExercises({
      modality: 'home', sessionType: 'resistance', sessionFocus: 'full_body', goal: 'recomposition',
      profile: { weightKg: 70 }, adaptiveTuning: null, sessionMinutes: 60,
    }).map((e) => e.id);
    expect(free.length).toBeGreaterThanOrEqual(restricted.length - 1);
  });
});
