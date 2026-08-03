import { describe, expect, it } from 'vitest';
import { applyCoachAdjustments, findPlanDayByLabel } from '../../src/core/planner.js';

// Los `structuredAdjustments` del coach se APLICAN al plan de verdad. Un fallo aquí no produce
// un texto raro: produce un ajuste que se pierde en silencio, y el usuario cree que su bloque
// está personalizado cuando no se ha tocado.
//
// Bug encontrado el 2-ago-2026 con scripts/weekly_plan_evals.mjs: solo el 38% de los ajustes
// llegaban al plan. El emparejador de días miraba el NOMBRE del día antes que la FECHA, y en un
// bloque de 21 días cada día de la semana aparece tres veces.

const dia = (date, dayName, ejercicios) => ({
  date, dayName,
  workout: { title: 'Fuerza', exercises: ejercicios },
});
const ejercicio = (name, loadKg = 60, sets = 3) => ({
  name, prescription: { format: 'reps', loadKg, sets, reps: 8 },
});

const bloque = () => [
  dia('2026-08-04', 'Martes', [ejercicio('Sentadilla hack', 60)]),
  dia('2026-08-11', 'Martes', [ejercicio('Sentadilla goblet', 40)]),
  dia('2026-08-18', 'Martes', [ejercicio('Sentadilla isométrica en pared', 0)]),
];

describe('emparejado de días del plan', () => {
  it('la FECHA manda sobre el nombre del día cuando ambos aparecen', () => {
    const dias = bloque();
    // "Martes 2026-08-11" contiene "martes", que también casa con el 4 y el 18.
    expect(findPlanDayByLabel(dias, 'Martes 2026-08-11').date).toBe('2026-08-11');
    expect(findPlanDayByLabel(dias, 'Martes 2026-08-18').date).toBe('2026-08-18');
  });

  it('sin fecha se acepta el nombre del día, que es lo único disponible', () => {
    expect(findPlanDayByLabel(bloque(), 'Martes').date).toBe('2026-08-04');
  });

  it('una fecha que no está en el bloque no cae al primer día por parecido', () => {
    expect(findPlanDayByLabel(bloque(), 'Martes 2026-12-01')).toBeNull();
  });

  it('reconoce el día por el título exacto de la sesión', () => {
    expect(findPlanDayByLabel(bloque(), 'Fuerza')).toBeTruthy();
  });
});

describe('aplicación de ajustes del coach', () => {
  it('aplica el ajuste al día correcto del bloque, no al primero con ese nombre', () => {
    const dias = bloque();
    const aplicados = applyCoachAdjustments(dias, [
      { day: 'Martes 2026-08-11', exercise: 'Sentadilla goblet', loadPct: 1.1, setsDelta: 0 },
    ]);
    expect(aplicados).toBe(1);
    // 40 kg × 1.1 = 44 → redondeo a múltiplo de 2.5 = 45.
    expect(dias[1].workout.exercises[0].prescription.loadKg).toBe(45);
    // El resto del bloque queda intacto.
    expect(dias[0].workout.exercises[0].prescription.loadKg).toBe(60);
    expect(dias[0].workout.exercises[0].prescription.coachAdjusted).toBeUndefined();
  });

  it('respeta los guardarraíles aunque el modelo se pase de rango', () => {
    const dias = bloque();
    applyCoachAdjustments(dias, [
      { day: 'Martes 2026-08-04', exercise: 'Sentadilla hack', loadPct: 3, setsDelta: 5 },
    ]);
    const p = dias[0].workout.exercises[0].prescription;
    // Tope de +10% sobre 60 kg = 66 → 65 tras redondear a 2.5. Nunca el triple.
    expect(p.loadKg).toBeLessThanOrEqual(66);
    expect(p.sets).toBe(4); // +1 como máximo, no +5
  });

  it('no toca ejercicios por tiempo: no admiten carga ni series', () => {
    const dias = [dia('2026-08-04', 'Martes', [
      { name: 'Plancha', prescription: { format: 'time', durationMinutes: 1 } },
    ])];
    expect(applyCoachAdjustments(dias, [
      { day: 'Martes 2026-08-04', exercise: 'Plancha', loadPct: 1.1, setsDelta: 1 },
    ])).toBe(0);
  });

  it('un ejercicio que no existe en ese día no aplica nada', () => {
    const dias = bloque();
    expect(applyCoachAdjustments(dias, [
      { day: 'Martes 2026-08-04', exercise: 'Press banca', loadPct: 1.05, setsDelta: 0 },
    ])).toBe(0);
  });

  it('marca lo ajustado para que la UI pueda decir que el coach lo tocó', () => {
    const dias = bloque();
    applyCoachAdjustments(dias, [
      { day: 'Martes 2026-08-11', exercise: 'Sentadilla goblet', loadPct: 0.9, setsDelta: -1 },
    ]);
    const p = dias[1].workout.exercises[0].prescription;
    expect(p.coachAdjusted).toBe(true);
    expect(p.sets).toBe(2);
  });
});
