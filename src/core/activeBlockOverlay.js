function todayKey(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function validDate(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function round2(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
}

export function isActiveBlockPlan(plan, today = todayKey()) {
  const day = typeof today === 'string' ? today : todayKey(today);
  return Boolean(
    plan
      && plan.isBlock
      && typeof plan.blockEndDate === 'string'
      && plan.blockEndDate >= day
      && Array.isArray(plan.days)
      && plan.days.length >= 14
  );
}

export function buildActiveBlockAdaptiveOverlay({
  plan,
  adaptiveTuning,
  progressMemory,
  now = new Date(),
}) {
  const date = validDate(now);
  const today = todayKey(date);
  if (!isActiveBlockPlan(plan, today)) {
    return { plan, overlay: null };
  }

  const rules = Array.isArray(adaptiveTuning?.appliedRules)
    ? adaptiveTuning.appliedRules.slice(0, 5).map((rule) => ({
      id: rule.id || null,
      reason: rule.reason || null,
      evidence: rule.evidence || null,
      effect: rule.effect || null,
    }))
    : [];

  const overlay = {
    version: 1,
    mode: 'active_block_daily_overlay',
    source: 'latest_progress_memory',
    updatedAt: date.toISOString(),
    today,
    summary: adaptiveTuning?.summary || null,
    volumeFactor: round2(adaptiveTuning?.workout?.volumeFactor),
    rpeShift: round2(adaptiveTuning?.workout?.rpeShift),
    maxRpeCap: round2(adaptiveTuning?.workout?.maxRpeCap),
    readinessScore: Number.isFinite(Number(progressMemory?.readinessScore))
      ? Number(progressMemory.readinessScore)
      : null,
    readinessGate: progressMemory?.clinicalSignals?.readinessGate || null,
    rules,
  };

  const days = plan.days.map((day) => {
    if (day.date !== today) return day;
    return {
      ...day,
      adaptiveOverlay: {
        ...overlay,
        scope: 'today',
      },
      workout: day.workout
        ? {
          ...day.workout,
          adaptiveOverlay: {
            summary: overlay.summary,
            volumeFactor: overlay.volumeFactor,
            rpeShift: overlay.rpeShift,
            maxRpeCap: overlay.maxRpeCap,
          },
        }
        : day.workout,
    };
  });

  return {
    plan: {
      ...plan,
      days,
      adaptiveTuning,
      progressMemory,
      adaptiveOverlay: overlay,
      updatedAt: overlay.updatedAt,
    },
    overlay,
  };
}
