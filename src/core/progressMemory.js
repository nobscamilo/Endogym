import { GoalType } from '../domain/models.js';

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function normalizeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function trendPerWeek(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const sorted = points
    .map((point) => ({ ...point, date: normalizeDate(point.date) }))
    .filter((point) => point.date && point.value != null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = (last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 0) return null;
  return Number(((last.value - first.value) / (days / 7)).toFixed(2));
}

export function normalizeAdaptiveThresholds(input = {}) {
  return {
    highFatigue: clamp(toNumber(input.highFatigue, 7), 4, 9),
    highSessionRpe: clamp(toNumber(input.highSessionRpe, 8.2), 6.5, 9.5),
    lowCompletionRate: clamp(toNumber(input.lowCompletionRate, 0.6), 0.3, 0.9),
    lowAdherencePercent: clamp(toNumber(input.lowAdherencePercent, 60), 40, 85),
    highReadiness: clamp(toNumber(input.highReadiness, 78), 60, 95),
  };
}

export function buildProgressMemory({ workouts = [], meals = [], metrics = [], lookbackDays = 21, now = new Date() }) {
  const nowDate = normalizeDate(now) || new Date();
  const since = new Date(nowDate);
  since.setUTCDate(since.getUTCDate() - Math.max(3, Number(lookbackDays) || 21));

  const recentWorkouts = workouts.filter((workout) => {
    const date = normalizeDate(workout.performedAt || workout.createdAt);
    return date && date >= since && date <= nowDate;
  });

  const recentMeals = meals.filter((meal) => {
    const date = normalizeDate(meal.eatenAt || meal.createdAt);
    return date && date >= since && date <= nowDate;
  });
  const recentMetrics = metrics.filter((entry) => {
    const date = normalizeDate(entry.takenAt || entry.createdAt || entry.date);
    return date && date >= since && date <= nowDate;
  });

  const sessionRpes = recentWorkouts
    .map((workout) => toNumber(workout.sessionRpe))
    .filter((value) => value != null);
  const fatigueScores = recentWorkouts
    .map((workout) => toNumber(workout.fatigue))
    .filter((value) => value != null);
  const sleepHours = recentWorkouts
    .map((workout) => toNumber(workout.sleepHours))
    .filter((value) => value != null);
  const completedFlags = recentWorkouts.map((workout) => (workout.completed === false ? 0 : 1));

  const adherenceScores = recentMeals
    .map((meal) => toNumber(meal?.adherence?.scorePercent))
    .filter((value) => value != null);

  const completionRate = completedFlags.length ? completedFlags.reduce((acc, value) => acc + value, 0) / completedFlags.length : null;
  const avgSessionRpe = average(sessionRpes);
  const avgFatigue = average(fatigueScores);
  const avgSleepHours = average(sleepHours);
  const avgNutritionAdherence = average(adherenceScores);

  const weightSeries = recentMetrics
    .map((entry) => ({ date: entry.takenAt || entry.createdAt || entry.date, value: toNumber(entry.weightKg) }))
    .filter((entry) => entry.value != null);
  const waistSeries = recentMetrics
    .map((entry) => ({ date: entry.takenAt || entry.createdAt || entry.date, value: toNumber(entry.waistCm) }))
    .filter((entry) => entry.value != null);
  const fastingGlucoseSeries = recentMetrics
    .map((entry) => ({ date: entry.takenAt || entry.createdAt || entry.date, value: toNumber(entry.fastingGlucoseMgDl) }))
    .filter((entry) => entry.value != null);

  const completionComponent = (completionRate ?? 0.6) * 30;
  const adherenceComponent = ((avgNutritionAdherence ?? 65) / 100) * 30;
  const fatigueComponent = ((10 - clamp(avgFatigue ?? 5.5, 0, 10)) / 10) * 25;
  const rpeComponent = ((10 - clamp(avgSessionRpe ?? 6.5, 3, 10)) / 7) * 15;
  const readinessScore = Math.round(clamp(completionComponent + adherenceComponent + fatigueComponent + rpeComponent, 0, 100));

  const readinessState = readinessScore >= 78 ? 'high' : readinessScore >= 58 ? 'moderate' : 'low';
  const fatigueState = (avgFatigue ?? 0) >= 7 ? 'high' : (avgFatigue ?? 0) >= 5 ? 'moderate' : 'low';
  const adherenceState =
    avgNutritionAdherence == null ? 'unknown' : avgNutritionAdherence >= 80 ? 'high' : avgNutritionAdherence >= 60 ? 'moderate' : 'low';

  return {
    lookbackDays: Math.max(3, Number(lookbackDays) || 21),
    since: since.toISOString(),
    until: nowDate.toISOString(),
    samples: {
      workouts: recentWorkouts.length,
      meals: recentMeals.length,
      adherenceMeals: adherenceScores.length,
      metrics: recentMetrics.length,
    },
    metrics: {
      completionRate: completionRate == null ? null : Number(completionRate.toFixed(2)),
      avgSessionRpe: avgSessionRpe == null ? null : Number(avgSessionRpe.toFixed(2)),
      avgFatigue: avgFatigue == null ? null : Number(avgFatigue.toFixed(2)),
      avgSleepHours: avgSleepHours == null ? null : Number(avgSleepHours.toFixed(2)),
      avgNutritionAdherence: avgNutritionAdherence == null ? null : Number(avgNutritionAdherence.toFixed(2)),
      avgWeightKg: average(weightSeries.map((point) => point.value)),
      avgWaistCm: average(waistSeries.map((point) => point.value)),
      avgFastingGlucoseMgDl: average(fastingGlucoseSeries.map((point) => point.value)),
    },
    trends: {
      weightKgPerWeek: trendPerWeek(weightSeries),
      waistCmPerWeek: trendPerWeek(waistSeries),
      fastingGlucoseMgDlPerWeek: trendPerWeek(fastingGlucoseSeries),
    },
    readinessScore,
    readinessState,
    fatigueState,
    adherenceState,
  };
}

function createRule(id, reason, evidence, effect) {
  return { id, reason, evidence, effect };
}

export function buildAdaptiveTuning({ profile, progressMemory, screening }) {
  const goal = profile?.goal || GoalType.RECOMPOSITION;
  const thresholds = normalizeAdaptiveThresholds(profile?.adaptiveThresholds);
  const metrics = progressMemory?.metrics || {};
  const trends = progressMemory?.trends || {};
  const completionRate = metrics.completionRate ?? 0.6;
  const avgFatigue = metrics.avgFatigue ?? 5.5;
  const avgRpe = metrics.avgSessionRpe ?? 6.5;
  const adherence = metrics.avgNutritionAdherence ?? 65;
  const avgGlucose = metrics.avgFastingGlucoseMgDl ?? null;
  const weightTrend = trends.weightKgPerWeek ?? null;
  const waistTrend = trends.waistCmPerWeek ?? null;
  const workoutSamples = progressMemory?.samples?.workouts ?? 0;
  const adherenceSamples = progressMemory?.samples?.adherenceMeals ?? 0;
  const metricSamples = progressMemory?.samples?.metrics ?? 0;

  let volumeFactor = 1;
  let rpeShift = 0;
  let calorieDelta = 0;
  let carbsFactor = 1;
  let fatFactor = 1;
  let proteinFactor = 1;
  const appliedRules = [];

  if (screening?.readinessGate === 'stop') {
    volumeFactor *= 0.75;
    rpeShift -= 3;
    calorieDelta += 120;
    appliedRules.push(
      createRule(
        'SCREENING_STOP',
        'Riesgo alto en cribado preparticipación.',
        `gate=${screening.readinessGate}, flags=${(screening.flags || []).join('; ') || 'n/d'}`,
        'Bloqueo de alta intensidad, deload y aumento calórico de seguridad.'
      )
    );
  } else if (screening?.highIntensityAllowed === false) {
    volumeFactor *= 0.88;
    rpeShift -= 1;
    calorieDelta += 60;
    appliedRules.push(
      createRule(
        'SCREENING_CAUTION',
        'Cribado sugiere progresión conservadora.',
        `maxRpe=${screening.maxAllowedSessionRpe}, clearance=${screening.clearanceStatus}`,
        'Capado parcial de intensidad y recorte moderado de volumen.'
      )
    );
  }

  if (avgFatigue >= thresholds.highFatigue || avgRpe >= thresholds.highSessionRpe) {
    volumeFactor *= 0.85;
    rpeShift -= 1;
    calorieDelta += goal === GoalType.WEIGHT_LOSS ? 80 : 120;
    appliedRules.push(
      createRule(
        'HIGH_FATIGUE',
        'Fatiga o carga interna elevada.',
        `fatigue=${avgFatigue.toFixed(1)}, avgRpe=${avgRpe.toFixed(1)}, thresholds=${JSON.stringify({
          highFatigue: thresholds.highFatigue,
          highSessionRpe: thresholds.highSessionRpe,
        })}`,
        'Deload adicional y soporte de recuperación.'
      )
    );
  }

  if (workoutSamples >= 3 && completionRate < thresholds.lowCompletionRate) {
    volumeFactor *= 0.9;
    rpeShift -= 1;
    calorieDelta += goal === GoalType.WEIGHT_LOSS ? 100 : 60;
    appliedRules.push(
      createRule(
        'LOW_COMPLETION',
        'Baja ejecución de sesiones planificadas.',
        `completionRate=${Math.round(completionRate * 100)}%, threshold=${Math.round(thresholds.lowCompletionRate * 100)}%, samples=${workoutSamples}`,
        'Reducir fricción: menos volumen/intensidad y ajuste nutricional de adherencia.'
      )
    );
  }

  if (adherenceSamples >= 5 && adherence < thresholds.lowAdherencePercent) {
    if (goal === GoalType.WEIGHT_LOSS || goal === GoalType.RECOMPOSITION || goal === GoalType.GLYCEMIC_CONTROL) {
      calorieDelta += 100;
      carbsFactor += 0.05;
      fatFactor -= 0.04;
    } else {
      calorieDelta += 50;
    }
    appliedRules.push(
      createRule(
        'LOW_NUTRITION_ADHERENCE',
        'Adherencia nutricional baja sostenida.',
        `avgAdherence=${adherence.toFixed(1)}%, threshold=${thresholds.lowAdherencePercent}%, samples=${adherenceSamples}`,
        'Relajar objetivo energético para aumentar continuidad.'
      )
    );
  }

  if (goal === GoalType.WEIGHT_LOSS && metricSamples >= 2 && adherence >= 75 && weightTrend != null) {
    if (weightTrend > -0.1) {
      calorieDelta -= 120;
      appliedRules.push(
        createRule(
          'WEIGHT_TREND_STALLED',
          'Pérdida de peso estancada con adherencia adecuada.',
          `weightTrendKgPerWeek=${weightTrend}, adherence=${adherence.toFixed(1)}%`,
          'Ajuste de déficit energético para reactivar progreso.'
        )
      );
    } else if (weightTrend < -1.0) {
      calorieDelta += 150;
      carbsFactor += 0.05;
      appliedRules.push(
        createRule(
          'WEIGHT_TREND_TOO_FAST',
          'Pérdida de peso acelerada con riesgo de fatiga excesiva.',
          `weightTrendKgPerWeek=${weightTrend}`,
          'Subir calorías para proteger recuperación y masa magra.'
        )
      );
    }
  }

  if ((goal === GoalType.GLYCEMIC_CONTROL || goal === GoalType.WEIGHT_LOSS) && avgGlucose != null && avgGlucose >= 110) {
    carbsFactor -= 0.08;
    fatFactor += 0.05;
    calorieDelta -= goal === GoalType.WEIGHT_LOSS ? 40 : 0;
    appliedRules.push(
      createRule(
        'GLUCOSE_CONTROL',
        'Glucosa en ayunas media por encima de objetivo.',
        `avgFastingGlucoseMgDl=${avgGlucose.toFixed(1)}`,
        'Ajuste de carbohidratos y distribución energética.'
      )
    );
  }

  if (waistTrend != null && waistTrend > 0.2 && adherence >= 70) {
    calorieDelta -= 70;
    appliedRules.push(
      createRule(
        'WAIST_TREND_UP',
        'Perímetro de cintura en ascenso pese a adherencia moderada/alta.',
        `waistTrendCmPerWeek=${waistTrend}`,
        'Leve ajuste energético y priorización de actividad aeróbica.'
      )
    );
  }

  if (
    progressMemory?.readinessScore >= thresholds.highReadiness
    && completionRate >= 0.8
    && avgFatigue <= 5
    && adherence >= 75
  ) {
    volumeFactor *= 1.08;
    rpeShift += 1;

    if (goal === GoalType.HYPERTROPHY || goal === GoalType.STRENGTH || goal === GoalType.ENDURANCE) {
      calorieDelta += 120;
    } else if (goal === GoalType.WEIGHT_LOSS) {
      calorieDelta -= 70;
      proteinFactor += 0.04;
      carbsFactor -= 0.03;
    }

    appliedRules.push(
      createRule(
        'HIGH_READINESS',
        'Alta preparación global y buena adherencia.',
        `readiness=${progressMemory.readinessScore}, completion=${Math.round(completionRate * 100)}%, fatigue=${avgFatigue.toFixed(1)}`,
        'Progresión de carga y ajuste nutricional orientado a objetivo.'
      )
    );
  }

  volumeFactor = Number(clamp(volumeFactor, 0.7, 1.15).toFixed(2));
  rpeShift = clamp(rpeShift, -3, 1);
  const maxRpeCap = clamp(toNumber(screening?.maxAllowedSessionRpe, 9), 4, 9);

  const summary = [
    `Readiness ${progressMemory?.readinessScore ?? 'n/d'}/100 (${progressMemory?.readinessState || 'n/d'})`,
    `vol x${volumeFactor}`,
    `RPE shift ${rpeShift >= 0 ? '+' : ''}${rpeShift}`,
    `delta kcal ${calorieDelta >= 0 ? '+' : ''}${calorieDelta}`,
    weightTrend != null ? `peso ${weightTrend >= 0 ? '+' : ''}${weightTrend}kg/sem` : null,
    avgGlucose != null ? `glu ${Math.round(avgGlucose)}mg/dL` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    summary,
    workout: {
      volumeFactor,
      rpeShift,
      maxRpeCap,
      highIntensityBlocked: screening?.highIntensityAllowed === false,
    },
    nutrition: {
      calorieDelta,
      carbsFactor: Number(clamp(carbsFactor, 0.85, 1.15).toFixed(2)),
      fatFactor: Number(clamp(fatFactor, 0.85, 1.2).toFixed(2)),
      proteinFactor: Number(clamp(proteinFactor, 0.9, 1.2).toFixed(2)),
    },
    appliedRules,
  };
}
