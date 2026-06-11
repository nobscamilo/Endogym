// FASE 1 (1.1 + 1.2) — Digests deterministas de nutrición y recuperación.
//
// Reglas: 100% cálculo sobre datos reales de Firestore (meals, workouts/check-ins,
// plan.days[].nutritionTarget). Si no hay datos, se devuelve null y la sección se
// OMITE del contexto (nunca rellenar con ceros — cuidado con Number(null) === 0).
// Lo consumen buildUserContext (coach-chat) y buildCoachAnalysisDigest (análisis).

function posNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dateKey(iso) {
  const s = String(iso || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function round0(n) { return n == null ? null : Math.round(n); }

function avg(values) {
  const v = values.filter((x) => x != null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * 1.1 — Digest nutricional de los últimos `days` días.
 * Agrupa las comidas registradas por día (eatenAt), suma kcal/proteína/carbohidratos
 * reales y las compara con el target de ESE día del plan (carb cycling: el target
 * varía por día). Si un día no tiene target en el plan, solo aporta al promedio real.
 * Devuelve null si ningún día tiene registros.
 */
export function buildNutritionDigest({ meals = [], plan = null, days = 7, now = new Date() } = {}) {
  const nowDate = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const since = new Date(nowDate);
  since.setUTCDate(since.getUTCDate() - Math.max(1, Number(days) || 7));
  const sinceKey = since.toISOString().slice(0, 10);
  const nowKey = nowDate.toISOString().slice(0, 10);

  const byDay = new Map();
  for (const meal of Array.isArray(meals) ? meals : []) {
    const key = dateKey(meal?.eatenAt || meal?.createdAt);
    if (!key || key < sinceKey || key > nowKey) continue;
    const t = meal?.totals || {};
    if (!byDay.has(key)) byDay.set(key, { calories: 0, proteinGrams: 0, carbsGrams: 0, mealsCount: 0 });
    const d = byDay.get(key);
    d.calories += posNum(t.calories) || 0;
    d.proteinGrams += posNum(t.proteinGrams) || 0;
    d.carbsGrams += posNum(t.carbsGrams) || 0;
    d.mealsCount += 1;
  }
  // Días con registro REAL (al menos una comida con kcal > 0).
  const loggedDays = [...byDay.entries()].filter(([, d]) => d.calories > 0);
  if (!loggedDays.length) return null;

  const targetsByDate = new Map();
  for (const day of Array.isArray(plan?.days) ? plan.days : []) {
    const key = dateKey(day?.date);
    const t = day?.nutritionTarget;
    if (key && t && posNum(t.calories)) {
      targetsByDate.set(key, {
        calories: posNum(t.calories),
        proteinGrams: posNum(t.proteinGrams),
        carbsGrams: posNum(t.carbsGrams),
      });
    }
  }

  const real = {
    calories: round0(avg(loggedDays.map(([, d]) => d.calories))),
    proteinGrams: round0(avg(loggedDays.map(([, d]) => d.proteinGrams))),
    carbsGrams: round0(avg(loggedDays.map(([, d]) => d.carbsGrams))),
  };

  // Target promedio SOLO de los días registrados que tienen target en el plan.
  const matched = loggedDays.filter(([key]) => targetsByDate.has(key));
  let target = null;
  let deltaPct = null;
  if (matched.length) {
    target = {
      calories: round0(avg(matched.map(([key]) => targetsByDate.get(key).calories))),
      proteinGrams: round0(avg(matched.map(([key]) => targetsByDate.get(key).proteinGrams))),
      carbsGrams: round0(avg(matched.map(([key]) => targetsByDate.get(key).carbsGrams))),
    };
    const pct = (r, t) => (posNum(r) != null && posNum(t) != null ? Math.round(((r - t) / t) * 100) : null);
    // Para el delta comparamos el promedio real de ESOS días con su target.
    const realMatched = {
      calories: avg(matched.map(([, d]) => d.calories)),
      proteinGrams: avg(matched.map(([, d]) => d.proteinGrams)),
      carbsGrams: avg(matched.map(([, d]) => d.carbsGrams)),
    };
    deltaPct = {
      calories: pct(realMatched.calories, target.calories),
      proteinGrams: pct(realMatched.proteinGrams, target.proteinGrams),
      carbsGrams: pct(realMatched.carbsGrams, target.carbsGrams),
    };
  }

  return {
    windowDays: Math.max(1, Number(days) || 7),
    daysWithLogs: loggedDays.length,
    loggedPct: Math.round((loggedDays.length / Math.max(1, Number(days) || 7)) * 100),
    real,
    target,
    deltaPct,
  };
}

export function describeNutritionDigest(d) {
  if (!d) return null;
  const parts = [
    `Nutrición últimos ${d.windowDays} días: registró ${d.daysWithLogs}/${d.windowDays} días (${d.loggedPct}%).`,
    `Promedio real en días registrados: ${d.real.calories} kcal, ${d.real.proteinGrams ?? '?'} g proteína, ${d.real.carbsGrams ?? '?'} g carbohidratos.`,
  ];
  if (d.target && d.deltaPct) {
    const f = (v) => (v == null ? 's/d' : `${v >= 0 ? '+' : ''}${v}%`);
    parts.push(`Vs objetivo diario del plan: kcal ${f(d.deltaPct.calories)}, proteína ${f(d.deltaPct.proteinGrams)}, carbohidratos ${f(d.deltaPct.carbsGrams)} (objetivo medio ${d.target.calories} kcal/${d.target.proteinGrams ?? '?'} g prot).`);
  }
  if (d.loggedPct < 50) {
    parts.push('OJO: pocos días registrados; el promedio puede no representar su ingesta real.');
  }
  return parts.join(' ');
}

/**
 * 1.2 — Tendencia de recuperación desde los check-ins (sueño, fatiga).
 * Media de sueño y fatiga de los últimos `days` días (registros subjetivos:
 * check-ins no omitidos y sesiones con subjetivos) y tendencia de fatiga vs la
 * ventana anterior (days..2*days). Devuelve null si no hay datos recientes.
 */
export function buildRecoveryTrend({ workouts = [], days = 7, now = new Date() } = {}) {
  const nowDate = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const cut = (d) => {
    const x = new Date(nowDate);
    x.setUTCDate(x.getUTCDate() - d);
    return x.toISOString().slice(0, 10);
  };
  const winDays = Math.max(1, Number(days) || 7);
  const recentSince = cut(winDays);
  const prevSince = cut(winDays * 2);
  const nowKey = nowDate.toISOString().slice(0, 10);

  const subjective = (Array.isArray(workouts) ? workouts : [])
    .filter((w) => w && w.checkinSkipped !== true)
    .map((w) => ({
      key: dateKey(w.performedAt || w.createdAt),
      sleep: posNum(w.sleepHours),
      fatigue: w.fatigue == null || w.fatigue === '' ? null : Number(w.fatigue),
    }))
    .filter((x) => x.key && (x.sleep != null || (x.fatigue != null && Number.isFinite(x.fatigue))));

  const recent = subjective.filter((x) => x.key > recentSince && x.key <= nowKey);
  const prev = subjective.filter((x) => x.key > prevSince && x.key <= recentSince);
  if (!recent.length) return null;

  const avgSleep = avg(recent.map((x) => x.sleep));
  const avgFatigue = avg(recent.map((x) => x.fatigue).filter((v) => v != null && Number.isFinite(v)));
  const prevFatigue = avg(prev.map((x) => x.fatigue).filter((v) => v != null && Number.isFinite(v)));

  let fatigueTrend = null;
  if (avgFatigue != null && prevFatigue != null) {
    const diff = avgFatigue - prevFatigue;
    fatigueTrend = diff >= 0.8 ? 'subiendo' : diff <= -0.8 ? 'bajando' : 'estable';
  }

  if (avgSleep == null && avgFatigue == null) return null;
  return {
    windowDays: winDays,
    samples: recent.length,
    avgSleepHours: avgSleep == null ? null : Math.round(avgSleep * 10) / 10,
    avgFatigue: avgFatigue == null ? null : Math.round(avgFatigue * 10) / 10,
    prevAvgFatigue: prevFatigue == null ? null : Math.round(prevFatigue * 10) / 10,
    fatigueTrend,
  };
}

export function describeRecoveryTrend(r) {
  if (!r) return null;
  const parts = [`Recuperación últimos ${r.windowDays} días (${r.samples} registros):`];
  if (r.avgSleepHours != null) parts.push(`sueño medio ${r.avgSleepHours} h/noche${r.avgSleepHours < 6.5 ? ' (BAJO: prioriza dormir más antes de subir carga)' : ''}.`);
  if (r.avgFatigue != null) {
    parts.push(`fatiga media ${r.avgFatigue}/10${r.fatigueTrend ? ` y ${r.fatigueTrend} vs la semana anterior${r.prevAvgFatigue != null ? ` (antes ${r.prevAvgFatigue}/10)` : ''}` : ''}.`);
  }
  return parts.join(' ');
}
