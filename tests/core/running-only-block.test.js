import { describe, expect, it } from 'vitest';
import { generateBlockPlan } from '../../src/core/planner.js';

// Modalidad "Solo correr" (26-jul-2026). El planner ya soportaba `running` desde siempre
// (MODALITY_TEMPLATES), pero la UI no la ofrecía y la lista blanca de la encuesta la
// descartaba en silencio. Estos tests fijan lo que un bloque de solo correr DEBE producir,
// para que añadir la opción no deje al usuario con un plan incoherente.

const runnerProfile = (overrides = {}) => ({
  sex: 'male',
  age: 38,
  weightKg: 74,
  heightCm: 178,
  activityLevel: 'moderate',
  goal: 'endurance',
  trainingModality: 'running',
  daysPerWeek: 5,
  preferredDurationMinutes: 50,
  mealsPerDay: 4,
  trainingExperience: 'intermediate',
  runRaceGoal: 'race_10k',
  raceDate: '2026-10-04',
  ...overrides,
});

describe('bloque de "Solo correr"', () => {
  const plan = generateBlockPlan({ profile: runnerProfile(), startDate: '2026-07-27' });

  it('genera 21 días con la modalidad pedida, sin caer a gimnasio', () => {
    expect(plan.days).toHaveLength(21);
    expect(plan.trainingModality).toBe('running');
  });

  it('la carrera domina el bloque y las sesiones aeróbicas llevan prescripción de carrera', () => {
    const aerobic = plan.days.filter((d) => d.sessionType === 'aerobic');
    expect(aerobic.length).toBeGreaterThanOrEqual(9);
    // Sin prescripción, una sesión aeróbica es "corre 45 min" y no dice a qué ritmo ni por qué.
    const conPrescripcion = aerobic.filter((d) => d.workout?.runPrescription?.runType);
    expect(conPrescripcion.length).toBe(aerobic.length);
  });

  it('varía los tipos de carrera en vez de repetir rodaje suave 12 veces', () => {
    const tipos = new Set(plan.days.map((d) => d.workout?.runPrescription?.runType).filter(Boolean));
    // Un bloque útil mezcla suave, calidad y tirada larga.
    expect(tipos.has('easy')).toBe(true);
    expect(tipos.has('long')).toBe(true);
    expect(tipos.size).toBeGreaterThanOrEqual(3);
  });

  it('conserva la fuerza preventiva: correr sin fuerza es más lesión, no más rendimiento', () => {
    // La plantilla incluye 1 sesión de fuerza por semana (ACSM, prevención de lesiones).
    // Por eso la tarjeta de la UI dice "Carrera + 1 fuerza preventiva" y no "solo carrera".
    const fuerza = plan.days.filter((d) => d.sessionType === 'resistance');
    expect(fuerza.length).toBeGreaterThanOrEqual(2);
    expect(fuerza.length).toBeLessThanOrEqual(4);
  });

  it('NO aplica formato de circuito híbrido (interferencia con el estímulo aeróbico)', () => {
    const conCircuito = plan.days.filter((d) => d.workout?.hybridCircuit);
    expect(conCircuito).toHaveLength(0);
  });

  it('sin marca de referencia NO inventa ritmos', () => {
    // deriveRunPaces devuelve null sin un esfuerzo real: mejor sin ritmos que con ritmos falsos.
    expect(plan.runPaces == null).toBe(true);
  });

  it('con una marca real sí publica los ritmos del bloque', () => {
    const conMarca = generateBlockPlan({
      profile: runnerProfile({ runRefDistanceMeters: 5000, runRefTimeSeconds: 1500 }), // 5 km en 25:00
      startDate: '2026-07-27',
    });
    expect(conMarca.runPaces).toBeTruthy();
    expect(typeof conMarca.runPaces.facil).toBe('string');
  });
});
