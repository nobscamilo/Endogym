import { describe, it, expect } from 'vitest';
import { buildPrePostNutrition } from '../../src/core/prePostNutrition.js';

const strengthDay = (dur = 60) => ({ sessionType: 'resistance', sessionFocus: 'upper', workout: { durationMinutes: dur } });
const easyRun = () => ({ sessionType: 'aerobic', sessionFocus: 'cardio_easy', workout: { durationMinutes: 30 } });

describe('prePostNutrition', () => {
  it('sesión exigente: prioriza carbohidrato antes y reposición después', () => {
    const r = buildPrePostNutrition({ day: strengthDay(60), profile: { weightKg: 80 } });
    expect(r.pre.items.join(' ')).toMatch(/carbohidrato/i);
    expect(r.post.items.join(' ')).toMatch(/Repón carbohidrato/i);
  });

  it('proteína post ~0.3 g/kg acotada a 20-40 g', () => {
    expect(buildPrePostNutrition({ day: strengthDay(), profile: { weightKg: 80 } }).post.items.join(' ')).toMatch(/~24 g/);
    expect(buildPrePostNutrition({ day: strengthDay(), profile: { weightKg: 50 } }).post.items.join(' ')).toMatch(/~20 g/); // suelo
    expect(buildPrePostNutrition({ day: strengthDay(), profile: { weightKg: 150 } }).post.items.join(' ')).toMatch(/~40 g/); // techo
  });

  it('sesión corta y suave: no hace falta comer antes', () => {
    const r = buildPrePostNutrition({ day: easyRun(), profile: { weightKg: 70 } });
    expect(r.pre.items.join(' ')).toMatch(/no necesitas comer antes/i);
  });

  it('diabetes: avisa de hipoglucemia antes y tardía después', () => {
    const r = buildPrePostNutrition({ day: strengthDay(), profile: { weightKg: 80, conditions: { diabetes: true } } });
    expect(r.pre.caution).toMatch(/hipoglucemia/i);
    expect(r.post.caution).toMatch(/hipoglucemia tardía/i);
  });

  it('hipertensión (sin diabetes): avisa de Valsalva/cafeína', () => {
    const r = buildPrePostNutrition({ day: strengthDay(), profile: { weightKg: 80, conditions: { hypertension: true } } });
    expect(r.pre.caution).toMatch(/Valsalva|cafeína/i);
  });

  it('devuelve null en días que no son de entreno', () => {
    expect(buildPrePostNutrition({ day: { sessionType: 'recovery', workout: {} }, profile: {} })).toBeNull();
  });
});
