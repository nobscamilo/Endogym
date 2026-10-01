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

export function buildMesocycleReview({ plan, workouts = [], today = null, profile = null } = {}) {
  if (!plan || !Array.isArray(plan.days) || !plan.days.length) return null;
  const days = plan.days;
  const reasons = [];

  // 1) Parches de foco: sesiones cuyo grupo se cambió/reprogramó manualmente.
  const focusChanges = days.filter((d) => d?.workout?.focusChangeApplied === true).length;
  if (focusChanges >= 3) {
    reasons.push(`Ajustaste el grupo muscular en ${focusChanges} sesiones de este bloque; acumula demasiados parches.`);
  }

  // 2) Fin del bloque (auditoría #11): antes saltaba a los 28 días, pero el bloque dura 21: la
  // revisión llegaba con el bloque ya terminado. Ahora salta en los 2 últimos días del bloque.
  const startKey = plan.blockStartDate || days[0]?.date || plan.startDate || null;
  const endKey = plan.blockEndDate || plan.endDate || null;
  const blockAge = today ? daysBetween(startKey, today) : null;
  const daysLeft = today && endKey ? daysBetween(today, endKey) : null;
  if (daysLeft != null && daysLeft <= 1) {
    reasons.push(daysLeft < 0
      ? `Tu bloque terminó el ${endKey}; revisa tu disponibilidad y genera el siguiente.`
      : `Tu bloque termina el ${endKey}; revisa tu disponibilidad y genera el siguiente.`);
  }
  // 2b) Cada cuántas semanas quiere que le volvamos a preguntar (antes se guardaba y no se usaba).
  const every = Number(profile?.resurveyWeeks);
  const lastSurvey = profile?.lastSurveyAt ? String(profile.lastSurveyAt).slice(0, 10) : null;
  if (Number.isFinite(every) && every > 0 && lastSurvey && today) {
    const since = daysBetween(lastSurvey, today);
    if (since != null && since >= every * 7) {
      reasons.push(`Hace ${since} días que no revisas tu disponibilidad (pediste cada ${every} semanas).`);
    }
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

  if (!reasons.length) return { status: 'ok', suggestRegen: false, reasons: [], blockAge, daysLeft, focusChanges };

  return {
    status: 'review',
    suggestRegen: true,
    reasons,
    blockAge,
    daysLeft,
    focusChanges,
  };
}
