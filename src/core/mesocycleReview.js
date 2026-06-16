// #7 — Revisión del mesociclo desde datos reales. En vez de acumular parches sobre el bloque
// de 21 días, detecta señales deterministas de que conviene REGENERARLO y se las muestra al
// usuario con motivos concretos. Nada de IA: solo cuenta hechos del plan y de los check-ins.

function daysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return null;
  const a = new Date(`${String(fromKey).slice(0, 10)}T00:00:00.000Z`).getTime();
  const b = new Date(`${String(toKey).slice(0, 10)}T00:00:00.000Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / (24 * 3600 * 1000));
}

export function buildMesocycleReview({ plan, workouts = [], today = null } = {}) {
  if (!plan || !Array.isArray(plan.days) || !plan.days.length) return null;
  const days = plan.days;
  const reasons = [];

  // 1) Parches de foco: sesiones cuyo grupo se cambió/reprogramó manualmente.
  const focusChanges = days.filter((d) => d?.workout?.focusChangeApplied === true).length;
  if (focusChanges >= 3) {
    reasons.push(`Ajustaste el grupo muscular en ${focusChanges} sesiones de este bloque; acumula demasiados parches.`);
  }

  // 2) Edad del bloque: un mesociclo típico dura ~21-28 días.
  const startKey = plan.blockStartDate || days[0]?.date || plan.startDate || null;
  const blockAge = today ? daysBetween(startKey, today) : null;
  if (blockAge != null && blockAge >= 28) {
    reasons.push(`Tu bloque lleva ${blockAge} días activo; toca revisarlo y regenerarlo.`);
  }

  // 3/4) Molestias y fatiga repetidas en los check-ins del bloque.
  const checkins = (Array.isArray(workouts) ? workouts : []).filter((w) => {
    if (w?.source !== 'daily_checkin') return false;
    if (!startKey) return true;
    const k = String(w.performedAt || '').slice(0, 10);
    return k >= String(startKey).slice(0, 10);
  });
  const jointPain = checkins.filter((w) => w?.symptoms?.jointPain === true).length;
  if (jointPain >= 3) {
    reasons.push(`Reportaste dolor articular en ${jointPain} check-ins; conviene revisar la selección y las cargas.`);
  }
  const highFatigue = checkins.filter((w) => Number(w?.fatigue) >= 8).length;
  if (highFatigue >= 3) {
    reasons.push(`Fatiga alta (≥8/10) en ${highFatigue} check-ins; el bloque puede estar pidiéndote demasiado.`);
  }

  if (!reasons.length) return { status: 'ok', suggestRegen: false, reasons: [], blockAge, focusChanges };

  return {
    status: 'review',
    suggestRegen: true,
    reasons,
    blockAge,
    focusChanges,
  };
}
