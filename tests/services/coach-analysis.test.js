import { describe, expect, it } from 'vitest';
import {
  compareLoadsWithPlan,
  describeWorkout,
  buildHeuristicCoachReport,
  buildCoachAnalysisPrompt,
  sanitizeCoachReport,
  workoutsSignature,
  isDoneWorkout,
  findComparableSessions,
  buildWorkoutAnalysisPrompt,
  buildHeuristicWorkoutAnalysis,
  sanitizeWorkoutAnalysis,
} from '../../src/services/coachAnalysis.js';

describe('coachAnalysis service', () => {
  it('isDoneWorkout: check-ins solo cuentan si completed===true; el resto salvo completed===false', () => {
    expect(isDoneWorkout({ source: 'daily_checkin', completed: true })).toBe(true);
    expect(isDoneWorkout({ source: 'daily_checkin', completed: false })).toBe(false);
    expect(isDoneWorkout({ source: 'manual' })).toBe(true);
    expect(isDoneWorkout({ source: 'strava', completed: false })).toBe(false);
    expect(isDoneWorkout(null)).toBe(false);
  });

  it('workoutsSignature: estable ante reordenación, cambia al añadir un entreno', () => {
    const a = { source: 'manual', performedAt: '2026-06-08T12:00:00.000Z', title: 'Torso A' };
    const b = { source: 'strava', stravaActivityId: 1, performedAt: '2026-06-07T10:00:00.000Z', title: 'Run' };
    const s1 = workoutsSignature([a, b]);
    const s2 = workoutsSignature([b, a]);
    expect(s1).toBe(s2);
    const s3 = workoutsSignature([a, b, { source: 'manual', performedAt: '2026-06-09T12:00:00.000Z', title: 'Pierna' }]);
    expect(s3).not.toBe(s1);
  });

  it('describeWorkout: no imprime null/0 falsos (Number(null)===0)', () => {
    const txt = describeWorkout({
      source: 'manual', performedAt: '2026-06-08T12:00:00.000Z', title: 'Torso A',
      durationMinutes: null, distanceKm: null, avgHeartRate: null, sessionRpe: null,
      exercises: [{ name: 'Press militar', weightKg: 30, sets: 3 }],
    });
    expect(txt).toContain('Torso A');
    expect(txt).toContain('Press militar 30 kg ×3');
    expect(txt).not.toContain('null');
    expect(txt).not.toContain('0 min');
  });

  it('compareLoadsWithPlan: empareja por id y por nombre y calcula el desvío', () => {
    const lastStrength = { exercises: [
      { id: 'ex-1', name: 'Press banca', weightKg: 72.5 },
      { name: 'Remo con barra', weightKg: 30 },
      { name: 'Sin prescripción', weightKg: 50 },
    ] };
    const plan = { days: [{ workout: { exercises: [
      { id: 'ex-1', name: 'Press banca', prescription: { loadKg: 70 } },
      { name: 'Remo con barra', prescription: { loadKg: 30 } },
    ] } }] };
    const out = compareLoadsWithPlan(lastStrength, plan);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('72.5 kg vs 70 kg');
    expect(out[0]).toContain('+4%');
    expect(out[1]).toContain('+0%');
  });

  it('buildHeuristicCoachReport: usa reglas adaptativas reales como ajustes', () => {
    const digest = {
      last: { source: 'strava', performedAt: '2026-06-08T18:00:00.000Z', title: 'Pesas', durationMinutes: 72, avgHeartRate: 108 },
      done: [{}, {}, {}],
      loadComparison: [],
      progressMemory: { cardio: { hrDriftBpm: 7, recentAvgHr: 155, baselineAvgHr: 148 } },
      adaptiveTuning: { appliedRules: [{ id: 'HR_DRIFT_ELEVATED', reason: 'FC media elevada', effect: 'volumen ×0.9' }] },
    };
    const rep = buildHeuristicCoachReport(digest);
    expect(rep.lastSession).toContain('Pesas');
    expect(rep.history).toContain('3 sesiones');
    expect(rep.history).toContain('+7 ppm');
    expect(rep.adjustments[0]).toContain('FC media elevada');
  });

  it('buildCoachAnalysisPrompt: incluye último entreno, comparación de cargas y reglas', () => {
    const digest = {
      profile: { sex: 'male', age: 37, weightKg: 106, goal: 'weight_loss', trainingModality: 'hybrid_run_gym', runRaceGoal: 'race_21k' },
      plan: { phaseLabel: 'Base aeróbica', weeksToRace: 22 },
      last: { source: 'manual', performedAt: '2026-06-08T12:00:00.000Z', title: 'Torso A' },
      done: [{ source: 'manual', performedAt: '2026-06-08T12:00:00.000Z', title: 'Torso A' }],
      loadComparison: ['Press militar: hizo 30 kg vs 30 kg prescritos (+0%)'],
      progressMemory: { cardio: {} },
      adaptiveTuning: { appliedRules: [] },
    };
    const prompt = buildCoachAnalysisPrompt(digest);
    expect(prompt).toContain('ÚLTIMO ENTRENO');
    expect(prompt).toContain('Press militar');
    expect(prompt).toContain('Base aeróbica');
    expect(prompt).toContain('no aplicó ajustes adaptativos');
    expect(prompt).toContain('PROHIBIDO inventar');
  });

  it('findComparableSessions: prioriza mismo título, solo anteriores, y cae a mismo tipo', () => {
    const target = { id: 'w3', title: 'Torso A', performedAt: '2026-06-08T12:00:00.000Z', exercises: [{ name: 'Press', weightKg: 30 }] };
    const all = [
      target,
      { id: 'w1', title: 'Torso A', performedAt: '2026-06-01T12:00:00.000Z' },
      { id: 'w2', title: 'Pierna A', performedAt: '2026-06-02T12:00:00.000Z' },
      { id: 'w4', title: 'Torso A', performedAt: '2026-06-09T12:00:00.000Z' }, // posterior: excluida
      { id: 'w5', title: 'Run', sportType: 'Run', performedAt: '2026-06-03T12:00:00.000Z' },
    ];
    const out = findComparableSessions(target, all);
    expect(out.map((w) => w.id)).toEqual(['w1']);
    // Carrera sin título igual → cae a "mismo tipo" (runs previos)
    const run = { id: 'r2', title: 'Carrera de noche', sportType: 'Run', source: 'strava', performedAt: '2026-06-07T12:00:00.000Z' };
    const out2 = findComparableSessions(run, [run, { id: 'r1', title: 'Rodaje', sportType: 'Run', source: 'strava', performedAt: '2026-06-01T12:00:00.000Z' }]);
    expect(out2.map((w) => w.id)).toEqual(['r1']);
  });

  it('buildWorkoutAnalysisPrompt: incluye sesión, comparables y check-in', () => {
    const prompt = buildWorkoutAnalysisPrompt({
      profile: { sex: 'male', age: 37, weightKg: 106, goal: 'weight_loss' },
      workout: { id: 'w1', title: 'Torso A', performedAt: '2026-06-08T12:00:00.000Z', exercises: [{ name: 'Press militar', weightKg: 30, sets: 3 }] },
      comparables: [{ title: 'Torso A', performedAt: '2026-06-01T12:00:00.000Z', sessionRpe: 4 }],
      checkin: { id: 'daily-2026-06-08', sessionRpe: 6, fatigue: 4, sleepHours: 7 },
      loadComparison: ['Press militar: hizo 30 kg vs 30 kg prescritos (+0%)'],
    });
    expect(prompt).toContain('SESIÓN A ANALIZAR');
    expect(prompt).toContain('SESIONES PREVIAS COMPARABLES');
    expect(prompt).toContain('RPE 6/10');
    expect(prompt).toContain('PROHIBIDO inventar');
  });

  it('buildHeuristicWorkoutAnalysis: pide RPE si falta y marca primera sesión sin comparables', () => {
    const out = buildHeuristicWorkoutAnalysis({
      workout: { title: 'Pierna A', performedAt: '2026-06-02T12:00:00.000Z', sessionRpe: null, source: 'manual' },
      comparables: [],
      loadComparison: [],
    });
    expect(out.session).toContain('Pierna A');
    expect(out.tips.join(' ')).toContain('RPE');
    expect(out.tips.join(' ')).toContain('Primera sesión');
  });

  it('sanitizeWorkoutAnalysis: exige session y tips; recorta el resto', () => {
    expect(sanitizeWorkoutAnalysis(null)).toBeNull();
    expect(sanitizeWorkoutAnalysis({ session: 'x', tips: [] })).toBeNull();
    const out = sanitizeWorkoutAnalysis({ session: ' s ', progression: 'p', tips: ['a', '', 'b', 'c', 'd', 'e'], warning: 'w' });
    expect(out.session).toBe('s');
    expect(out.tips).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sanitizeCoachReport: recorta, filtra y rechaza informes sin contenido mínimo', () => {
    expect(sanitizeCoachReport(null)).toBeNull();
    expect(sanitizeCoachReport({ lastSession: '', adjustments: [] })).toBeNull();
    expect(sanitizeCoachReport({ lastSession: 'ok', adjustments: [] })).toBeNull();
    const rep = sanitizeCoachReport({
      lastSession: '  análisis  ',
      history: 'h',
      adjustments: ['a', '', 'b', 'c', 'd', 'e', 'f'],
      warning: 'w',
    });
    expect(rep.lastSession).toBe('análisis');
    expect(rep.adjustments).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(rep.warning).toBe('w');
  });
});
