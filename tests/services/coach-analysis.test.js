import { describe, expect, it } from 'vitest';
import {
  compareLoadsWithPlan,
  describeWorkout,
  buildHeuristicCoachReport,
  buildCoachAnalysisPrompt,
  sanitizeCoachReport,
  workoutsSignature,
  coachAnalysisContextSignature,
  isDoneWorkout,
  findComparableSessions,
  buildWorkoutAnalysisPrompt,
  buildHeuristicWorkoutAnalysis,
  sanitizeWorkoutAnalysis,
  epley1Rm,
  buildLiftProgression,
  describeLiftProgression,
  buildLiftSnapshot,
  buildRecommendationCompliance,
  buildRunGoalSignals,
  describeRunGoalSignals,
  sanitizePreviousRecommendationForPrompt,
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

  it('coachAnalysisContextSignature invalida al editar objetivo, datos del entreno o métricas', () => {
    const base = {
      profile: { goal: 'endurance', runRaceGoal: 'race_21k', raceDate: '2026-11-08' },
      plan: { phase: 'base', days: [] },
      workouts: [{ id: 'w1', performedAt: '2026-06-18T12:00:00Z', sessionRpe: 7 }],
      metrics: [{ takenAt: '2026-06-18T12:00:00Z', weightKg: 84 }],
      meals: [],
    };
    const sig = coachAnalysisContextSignature(base);
    expect(sig).toMatch(/^v2-/);
    expect(coachAnalysisContextSignature({ ...base, profile: { ...base.profile, raceDate: '2026-10-01' } })).not.toBe(sig);
    expect(coachAnalysisContextSignature({ ...base, workouts: [{ ...base.workouts[0], sessionRpe: 9 }] })).not.toBe(sig);
    expect(coachAnalysisContextSignature({ ...base, metrics: [{ ...base.metrics[0], weightKg: 82 }] })).not.toBe(sig);
    expect(coachAnalysisContextSignature({ ...base, workouts: [...base.workouts].reverse() })).toBe(sig);
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

  it('buildHeuristicCoachReport no imprime deriva +null ppm', () => {
    const rep = buildHeuristicCoachReport({
      profile: { goal: 'endurance' }, last: null, done: [], loadComparison: [], liftProgression: [],
      progressMemory: { cardio: { hrDriftBpm: null, recentAvgHr: 125, baselineAvgHr: 138 } },
      adaptiveTuning: { appliedRules: [] }, runGoalSignals: null,
    });
    expect(rep.history).not.toContain('null ppm');
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

  it('buildCoachAnalysisPrompt: prioriza la meta SMART y las señales deterministas de carrera', () => {
    const digest = {
      profile: { sex: 'male', age: 37, weightKg: 105, goal: 'endurance', trainingModality: 'hybrid_run_gym', runRaceGoal: 'race_21k', raceDate: '2026-11-08' },
      plan: { phaseLabel: 'Base aeróbica', weeksToRace: 21 },
      last: { source: 'strava', sportType: 'Run', performedAt: '2026-06-18T12:00:00.000Z', title: 'Rodaje', durationMinutes: 45, distanceKm: 7, avgHeartRate: 124 },
      done: [], loadComparison: [], liftProgression: [], progressMemory: { cardio: { hrDriftBpm: null } }, adaptiveTuning: { appliedRules: [] },
      goalProgressLine: 'Objetivo SMART: e1RM objetivo 140 kg para 2026-12-01. Actual: 120 kg. NO va en camino para su fecha.',
      runGoalSignals: {
        raceGoal: '21K', raceDate: '2026-11-08', hrMax: 182, hrMaxSource: 'edad/observada',
        z2Range: { min: 110, max: 127 },
        latestZone: { date: '2026-06-18', avgHr: 124, actualZone: 2, target: 'Z2', verdict: 'ok' },
        keySessionAdherence: { planned: 4, completed: 3, missed: 1, long: { planned: 2, completed: 1 }, quality: { planned: 2, completed: 2 } },
        prediction: { goal: '21K', time: '2:05:00', basedOn: { date: '2026-06-10', distanceKm: 10 } },
      },
      nutrition7d: null, recovery7d: null, previousRecommendation: null, recommendationCompliance: [],
    };
    const prompt = buildCoachAnalysisPrompt(digest);
    expect(prompt).toContain('ALINEACIÓN CON EL OBJETIVO');
    expect(prompt).toContain('NO va en camino');
    expect(prompt).toContain('21K');
    expect(prompt).toContain('Z2 110-127 ppm');
    expect(prompt).toContain('3/4 sesiones clave');
    expect(prompt).toContain('PROHIBIDO introducir cifras objetivo');
    expect(prompt).not.toContain('deriva +null ppm');
  });

  it('buildRunGoalSignals: calcula zonas, predicción y adherencia a tirada/calidad desde datos reales', () => {
    const signals = buildRunGoalSignals({
      profile: { goal: 'endurance', trainingModality: 'hybrid_run_gym', runRaceGoal: 'race_21k', raceDate: '2026-11-08', age: 37 },
      plan: { days: [
        { date: '2026-06-01', workout: { runPrescription: { runType: 'long' } } },
        { date: '2026-06-03', workout: { runPrescription: { runType: 'intervals' } } },
      ] },
      workouts: [
        { source: 'strava', sportType: 'Run', performedAt: '2026-06-01T12:00:00.000Z', durationMinutes: 60, distanceKm: 10, avgPaceSecPerKm: 360, avgHeartRate: 120, maxHeartRate: 181 },
        { source: 'strava', sportType: 'Run', performedAt: '2026-05-28T12:00:00.000Z', durationMinutes: 38, distanceKm: 6, avgPaceSecPerKm: 380, avgHeartRate: 130, maxHeartRate: 170 },
        { source: 'strava', sportType: 'Run', performedAt: '2026-05-24T12:00:00.000Z', durationMinutes: 40, distanceKm: 6, avgPaceSecPerKm: 400, avgHeartRate: 132, maxHeartRate: 172 },
        { source: 'strava', sportType: 'Run', performedAt: '2026-05-20T12:00:00.000Z', durationMinutes: 42, distanceKm: 6, avgPaceSecPerKm: 420, avgHeartRate: 135, maxHeartRate: 175 },
      ],
      now: new Date('2026-06-04T12:00:00.000Z'),
    });
    expect(signals.raceGoal).toBe('21K');
    expect(signals.z2Range).toEqual({ min: 110, max: 127 });
    expect(signals.latestZone).toMatchObject({ actualZone: 2, target: 'Z2', verdict: 'ok' });
    expect(signals.keySessionAdherence).toMatchObject({ planned: 2, completed: 1, missed: 1 });
    expect(signals.prediction).toMatchObject({ goal: '21K' });
    expect(describeRunGoalSignals(signals)).toContain('1/2 sesiones clave');
  });

  it('no perpetúa cifras inventadas de recomendaciones anteriores en el nuevo prompt', () => {
    expect(sanitizePreviousRecommendationForPrompt('Corre a 143 ppm y baja el press a 15 kg.')).not.toMatch(/143|15 kg/);
    const prompt = buildCoachAnalysisPrompt({
      profile: { goal: 'endurance', runRaceGoal: 'race_21k' }, plan: null, done: [], last: null,
      loadComparison: [], liftProgression: [], progressMemory: { cardio: {} }, adaptiveTuning: null,
      nutrition7d: null, recovery7d: null, runGoalSignals: null, goalProgressLine: null,
      previousRecommendation: { createdAt: '2026-06-18', adjustments: ['Mantén la zona aeróbica a 143 ppm.'] },
      recommendationCompliance: [],
    });
    expect(prompt).not.toContain('143');
    expect(prompt).toContain('cifra previa omitida');
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

  it('epley1Rm: kg×(1+reps/30); sin reps devuelve kg; null sin carga', () => {
    expect(epley1Rm(100, 5)).toBeCloseTo(116.7, 1);
    expect(epley1Rm(30, null)).toBe(30);
    expect(epley1Rm(0, 5)).toBeNull();
  });

  it('buildLiftProgression: detecta progresión y estancamiento por e1RM', () => {
    const w = (date, name, kg, reps) => ({
      source: 'manual', completed: true, performedAt: `${date}T12:00:00.000Z`,
      exercises: [{ name, weightKg: kg, reps }],
    });
    const lifts = buildLiftProgression([
      w('2026-06-01', 'Press militar', 30, 8), w('2026-06-04', 'Press militar', 30, 8), w('2026-06-08', 'Press militar', 30, 8),
      w('2026-06-01', 'Remo con barra', 30, 8), w('2026-06-08', 'Remo con barra', 32.5, 8),
    ]);
    const press = lifts.find((l) => l.name === 'Press militar');
    const remo = lifts.find((l) => l.name === 'Remo con barra');
    expect(press.trend).toBe('stalled');
    expect(remo.trend).toBe('progressing');
    // Los estancados van primero (accionables) y la descripción los marca.
    expect(lifts[0].name).toBe('Press militar');
    const desc = describeLiftProgression(lifts).join(' | ');
    expect(desc).toContain('ESTANCADO');
    expect(desc).toContain('PROGRESANDO');
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
      goalAlignment: 'alineado con la meta',
      adjustments: ['a', '', 'b', 'c', 'd', 'e', 'f'],
      warning: 'w',
    });
    expect(rep.lastSession).toBe('análisis');
    expect(rep.goalAlignment).toBe('alineado con la meta');
    expect(rep.adjustments).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(rep.warning).toBe('w');
  });

  it.each([
    ['endurance', { runGoalSignals: { raceGoal: '21K', keySessionAdherence: { planned: 2, completed: 1, missed: 1, long: { planned: 1, completed: 0 }, quality: { planned: 1, completed: 1 } } } }, /carrera|21K/i],
    ['strength', { goalProgressLine: 'Objetivo SMART: e1RM objetivo 140 kg. Actual: 120 kg.' }, /e1RM|objetivo SMART/i],
    ['weight_loss', { goalProgressLine: 'Objetivo SMART: Peso objetivo 80 kg. Actual: 84 kg.' }, /peso objetivo|objetivo SMART/i],
    ['glycemic_control', {}, /glucémic|comidas|síntomas/i],
  ])('fallback heurístico orienta los ajustes al objetivo %s', (goal, extra, expected) => {
    const rep = buildHeuristicCoachReport({
      profile: { goal }, last: null, done: [], loadComparison: [], liftProgression: [],
      progressMemory: { cardio: {} }, adaptiveTuning: { appliedRules: [] },
      nutrition7d: null, recovery7d: null, ...extra,
    });
    expect(rep.goalAlignment).toMatch(expected);
    expect(rep.adjustments.join(' ')).toMatch(expected);
    if (goal === 'endurance') expect(rep.adjustments.join(' ')).not.toContain('progresión normal de cargas');
  });
});

describe('FASE 2.2 — cierre del loop de recomendaciones', () => {
  const liftProgression = [
    { name: 'Sentadilla', trend: 'progressing', sessions: 4, points: [{ date: '2026-06-01', kg: 100, reps: 8, e1rm: 126.7 }, { date: '2026-06-10', kg: 105, reps: 8, e1rm: 133 }] },
    { name: 'Press banca', trend: 'stalled', sessions: 3, points: [{ date: '2026-06-10', kg: 80, reps: 6, e1rm: 96 }] },
  ];

  it('buildLiftSnapshot captura el último e1RM por ejercicio', () => {
    expect(buildLiftSnapshot(liftProgression)).toEqual({ Sentadilla: 133, 'Press banca': 96 });
  });

  it('buildRecommendationCompliance compara con el snapshot previo (mejoró/igual/bajó/sin registros)', () => {
    const prev = { liftSnapshot: { Sentadilla: 126.7, 'Press banca': 96, Remo: 70 } };
    const lines = buildRecommendationCompliance(prev, liftProgression);
    expect(lines.find((l) => l.startsWith('Sentadilla'))).toMatch(/MEJOR/);
    expect(lines.find((l) => l.startsWith('Press banca'))).toMatch(/igual/);
    expect(lines.find((l) => l.startsWith('Remo'))).toMatch(/sin registros/i);
  });

  it('sin recomendación previa: cumplimiento vacío y el prompt no lo menciona', () => {
    expect(buildRecommendationCompliance(null, liftProgression)).toEqual([]);
    const digest = {
      profile: null, plan: null, done: [], last: null, loadComparison: [],
      liftProgression: [], progressMemory: null, adaptiveTuning: null,
      nutrition7d: null, recovery7d: null, previousRecommendation: null, recommendationCompliance: [],
    };
    expect(buildCoachAnalysisPrompt(digest)).not.toContain('RECOMENDACIONES PREVIAS');
  });

  it('con recomendación previa: prompt y heurístico la mencionan con su cumplimiento', () => {
    const digest = {
      profile: null, plan: null, done: [], last: null, loadComparison: [],
      liftProgression, progressMemory: null, adaptiveTuning: null,
      nutrition7d: null, recovery7d: null,
      previousRecommendation: { adjustments: ['Sube sentadilla a 105 kg'], createdAt: '2026-06-04T10:00:00.000Z', liftSnapshot: { Sentadilla: 126.7 } },
      recommendationCompliance: ['Sentadilla: e1RM 126.7 → 133 kg (MEJORÓ)'],
    };
    const prompt = buildCoachAnalysisPrompt(digest);
    expect(prompt).toContain('RECOMENDACIONES PREVIAS DEL COACH (2026-06-04;');
    expect(prompt).toContain('Sube sentadilla a [cifra previa omitida]');
    expect(prompt).toContain('CUMPLIMIENTO');
    const heuristic = buildHeuristicCoachReport(digest);
    expect(heuristic.history).toContain('Desde la última recomendación');
  });
});
