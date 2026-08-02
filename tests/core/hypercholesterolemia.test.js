import { describe, expect, it } from 'vitest';
import { detectComorbidities } from '../../src/core/warmupCooldown.js';
import { buildDietQualityTargets, generateBlockPlan } from '../../src/core/planner.js';
import { filterRestrictedExercises } from '../../src/core/comorbidityRestrictions.js';

// Hipercolesterolemia: se añadió a la lista de condiciones el 29-jul-2026, pero NO es una
// restricción de ejercicio — el aeróbico es parte del tratamiento. Estos tests fijan las tres
// cosas que importan: que se detecte (checkbox y texto libre), que NO restrinja ni limite la
// intensidad, y que cambie la CALIDAD de la dieta sin tocar los macros del objetivo.

const base = {
  sex: 'male', age: 45, weightKg: 88, heightCm: 176, activityLevel: 'moderate',
  goal: 'weight_loss', trainingModality: 'full_gym', daysPerWeek: 4, mealsPerDay: 4,
  trainingExperience: 'intermediate',
};

describe('hipercolesterolemia', () => {
  it('se detecta por checkbox y por texto libre escrito a mano', () => {
    expect(detectComorbidities({ conditions: { hypercholesterolemia: true } }).hypercholesterolemia).toBe(true);
    for (const texto of ['tengo el colesterol alto', 'dislipemia mixta', 'hipercolesterolemia familiar', 'LDL alto']) {
      expect(detectComorbidities({ medicalConditions: texto }).hypercholesterolemia).toBe(true);
    }
    expect(detectComorbidities({}).hypercholesterolemia).toBe(false);
  });

  it('NO activa el gate de enfermedad cardiometabólica del cribado', () => {
    // Ese flag pone el riesgo en alto, bloquea intensidad alta y capa el RPE a 6. Un factor
    // de riesgo lipídico no es una enfermedad cardiovascular conocida: confundirlos limitaría
    // el entrenamiento sin motivo.
    const c = detectComorbidities({ conditions: { hypercholesterolemia: true } });
    expect(c.cardiometabolic).toBe(false);
  });

  it('NO filtra ningún ejercicio: no hay nada prohibido por tener el colesterol alto', () => {
    const ejercicios = [
      { id: 'box-jump', name: 'Salto al cajón' },
      { id: 'conventional-deadlift', name: 'Peso muerto convencional' },
      { id: 'crunch', name: 'Crunch abdominal' },
      { id: 'burpee', name: 'Burpee' },
    ];
    // filterRestrictedExercises devuelve { allowed, removed }.
    const conCondicion = filterRestrictedExercises(ejercicios, { conditions: { hypercholesterolemia: true } });
    expect(conCondicion.allowed).toHaveLength(ejercicios.length);
    // Contraste: una condición que SÍ restringe deja fuera el salto y el burpee.
    const conArtrosis = filterRestrictedExercises(ejercicios, { conditions: { osteoarthritis: true } });
    expect(conArtrosis.allowed.length).toBeLessThan(ejercicios.length);
  });

  it('cambia la CALIDAD de la dieta: tope de saturada y suelo de fibra', () => {
    const q = buildDietQualityTargets({ calories: 2400, comorbidities: { hypercholesterolemia: true } });
    expect(q).toBeTruthy();
    // 7% de 2400 kcal / 9 kcal por gramo ≈ 19 g.
    expect(q.maxSaturatedFatGrams).toBe(Math.round((2400 * 0.07) / 9));
    expect(q.minSolubleFiberGrams).toBeGreaterThan(0);
    expect(q.note).toMatch(/calidad/i);
  });

  it('sin la condición no se inventa ninguna guía de calidad', () => {
    expect(buildDietQualityTargets({ calories: 2400, comorbidities: {} })).toBeNull();
    expect(buildDietQualityTargets({ calories: 0, comorbidities: { hypercholesterolemia: true } })).toBeNull();
  });

  it('los MACROS los sigue mandando el objetivo, no la condición', () => {
    const sin = generateBlockPlan({ profile: base, startDate: '2026-07-29' });
    const con = generateBlockPlan({ profile: { ...base, conditions: { hypercholesterolemia: true } }, startDate: '2026-07-29' });
    const a = sin.days[0].nutritionTarget;
    const b = con.days[0].nutritionTarget;

    expect(b.proteinGrams).toBe(a.proteinGrams);
    expect(b.carbsGrams).toBe(a.carbsGrams);
    expect(b.fatGrams).toBe(a.fatGrams);
    // Lo único que cambia es la guía de calidad.
    expect(a.dietQuality).toBeNull();
    expect(b.dietQuality).toBeTruthy();
  });

  it('el plan empuja volumen aeróbico en vez de recortarlo', () => {
    const con = generateBlockPlan({ profile: { ...base, conditions: { hypercholesterolemia: true } }, startDate: '2026-07-29' });
    expect(Array.isArray(con.conditionGuidance)).toBe(true);
    expect(con.conditionGuidance[0].aerobicMinPerWeek).toBeGreaterThanOrEqual(150);
    expect(con.conditionGuidance[0].note).toMatch(/no hay ejercicio prohibido/i);
    // Sin la condición no aparece la guía.
    expect(generateBlockPlan({ profile: base, startDate: '2026-07-29' }).conditionGuidance).toBeNull();
  });
});
