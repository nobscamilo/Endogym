import { describe, expect, it } from 'vitest';
import {
  assessDietPattern, assessDietPreferences, dietRulesForMenuPrompt, healthDietConstraints, dietContextForCoach,
} from '../../src/core/dietSuitability.js';
import { preparticipationFromProfile, evaluatePreparticipationScreening } from '../../src/core/screening.js';
import { normalizeNutritionPreferencesInput } from '../../src/core/nutritionPlanner.js';
import { generateWeeklyPlan } from '../../src/core/planner.js';

const base = { goal: 'weight_loss', age: 40, weightKg: 90, heightCm: 178, sex: 'male', activityLevel: 'light', mealsPerDay: 4, trainingModality: 'full_gym' };

describe('dietSuitability — idoneidad por perfil', () => {
  it('sin condiciones: mediterránea sugerida, keto con precaución', () => {
    const a = assessDietPreferences(base);
    expect(a.suggested.pattern).toBe('mediterranean');
    expect(assessDietPattern('keto', base).level).toBe('caution');
    expect(assessDietPattern('omnivore', base).level).toBe('suitable');
  });

  it('diabetes: keto con precaución (no prohibida: consenso ADA) y avisos de medicación', () => {
    const p = { ...base, conditions: { diabetes: true } };
    const k = assessDietPattern('keto', p);
    expect(k.level).toBe('caution');
    expect(k.risks.join(' ')).toMatch(/iSGLT2/);
    expect(k.risks.join(' ')).toMatch(/hipoglucemia/);
  });

  it('cardiovascular, colesterol, renal o embarazo: keto no aconsejada', () => {
    for (const conditions of [{ cardiovascular: true }, { hypercholesterolemia: true }, { kidneyDisease: true }, { pregnant: true }]) {
      expect(assessDietPattern('keto', { ...base, conditions }).level).toBe('not_advised');
    }
  });

  it('objetivo de carrera: keto avisa del rendimiento en calidad', () => {
    const k = assessDietPattern('keto', { ...base, runRaceGoal: 'race_10k' });
    expect(k.risks.join(' ')).toMatch(/rendimiento/);
  });

  it('paleo con colesterol → precaución; vegana siempre avisa de B12', () => {
    expect(assessDietPattern('paleo', { ...base, conditions: { hypercholesterolemia: true } }).level).toBe('caution');
    expect(assessDietPattern('vegan', base).risks.join(' ')).toMatch(/B12/);
  });

  it('consenso: IG bajo es preferencia sin enfermedad y obligatorio con diabetes/prediabetes', () => {
    const pref = assessDietPreferences({ ...base, nutritionPreferences: { lowGlycemic: true } });
    expect(pref.lowGlycemic).toBe(true);
    expect(pref.lowGlycemicLockedByHealth).toBe(false);
    const ir = assessDietPreferences({ ...base, metabolicProfile: 'insulin_resistance', nutritionPreferences: { lowGlycemic: false } });
    expect(ir.lowGlycemic).toBe(true);
    expect(ir.lowGlycemicLockedByHealth).toBe(true);
  });

  it('la confirmación de riesgos vale para el patrón Y el nivel; si empeora el nivel, se vuelve a pedir', () => {
    const ack = { pattern: 'keto', level: 'caution', at: '2026-09-30T10:00:00.000Z' };
    expect(assessDietPreferences({ ...base, nutritionPreferences: { dietaryPattern: 'keto', riskAcknowledgement: ack } }).acknowledged).toBe(true);
    const worse = assessDietPreferences({ ...base, conditions: { cardiovascular: true }, nutritionPreferences: { dietaryPattern: 'keto', riskAcknowledgement: ack } });
    expect(worse.requiresAck).toBe(true);
    expect(worse.acknowledged).toBe(false);
  });

  it('reglas del menú: keto con HTA no pide reponer sal; IG bajo sin enfermedad se marca como preferencia', () => {
    const r = dietRulesForMenuPrompt({ ...base, conditions: { hypertension: true }, nutritionPreferences: { dietaryPattern: 'keto' } });
    expect(r).toMatch(/≤50 g/);
    expect(r).not.toMatch(/Repón sodio/);
    expect(r).toMatch(/Sal <5 g/);
    const g = dietRulesForMenuPrompt({ ...base, nutritionPreferences: { dietaryPattern: 'mediterranean', lowGlycemic: true } });
    expect(g).toMatch(/preferencia del usuario/);
  });

  it('restricciones de salud: lípidos y sodio con enfermedad cardiovascular', () => {
    const keys = healthDietConstraints({ ...base, conditions: { cardiovascular: true } }).constraints.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['lipids', 'sodium']));
  });

  it('contexto del coach incluye elegida, sugerida y la regla de respetar la decisión', () => {
    const t = dietContextForCoach({ ...base, nutritionPreferences: { dietaryPattern: 'keto' } });
    expect(t).toMatch(/Cetogénica/);
    expect(t).toMatch(/Mediterránea/);
    expect(t).toMatch(/respeta su decisión/);
  });
});

describe('normalización de preferencias', () => {
  it('acepta los patrones nuevos y lowGlycemic; descarta patrones desconocidos', () => {
    expect(normalizeNutritionPreferencesInput({ dietaryPattern: 'paleo', lowGlycemic: true })).toMatchObject({ dietaryPattern: 'paleo', lowGlycemic: true });
    expect(normalizeNutritionPreferencesInput({ dietaryPattern: 'carnivora' }).dietaryPattern).toBe('omnivore');
  });
});

describe('cribado ACSM desde el perfil', () => {
  it('diabetes marcada en Salud → enfermedad cardiometabólica conocida → sin alta intensidad', () => {
    const s = evaluatePreparticipationScreening(preparticipationFromProfile({ conditions: { diabetes: true }, preparticipation: {} }));
    expect(s.highIntensityAllowed).toBe(false);
    expect(s.maxAllowedSessionRpe).toBe(6);
  });
  it('resistencia a la insulina e HTA NO son enfermedad conocida (factores de riesgo)', () => {
    const p = preparticipationFromProfile({ metabolicProfile: 'insulin_resistance', conditions: { hypertension: true } });
    expect(p.knownCardiometabolicDisease).not.toBe(true);
  });
});

describe('planner — macros keto y resumen de dieta en el plan', () => {
  it('keto deja los HC ≤50 g manteniendo las kcal del día', () => {
    const omni = generateWeeklyPlan({ profile: { ...base }, startDate: '2026-10-05' });
    const keto = generateWeeklyPlan({ profile: { ...base, nutritionPreferences: { dietaryPattern: 'keto' } }, startDate: '2026-10-05' });
    keto.days.forEach((d, i) => {
      expect(d.nutritionTarget.carbsGrams).toBeLessThanOrEqual(50);
      expect(Math.abs(d.nutritionTarget.calories - omni.days[i].nutritionTarget.calories)).toBeLessThanOrEqual(10);
    });
    expect(keto.diet).toMatchObject({ pattern: 'keto', level: 'caution', suggested: 'mediterranean' });
  });
});
