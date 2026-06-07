import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import {
  getUserProfile,
  getLatestWeeklyPlan,
  listMealsSince,
  listMetricsSince,
  listWorkoutsSince,
} from '../../../lib/repositories/firestoreRepository.js';

// Datos reales para el rediseño Studio (fase 2). Devuelve overrides que el bundle
// estático fusiona sobre window.STUDIO (datos de muestra) ANTES de renderizar.
// Cada sección es defensiva: si faltan datos válidos, se omite y se conserva la muestra.
//
// REAL: perfil, sesión de hoy (con vídeos reales de YouTube), semana, biblioteca,
//       macros objetivo/consumidas, progreso (peso + sesiones).
// MUESTRA (no hay equivalente en backend aún): recetas de comidas, lista de compra,
//       batch cooking, curva glucémica, strain/recovery/volumen muscular/PRs.

const HUES = [55, 232, 18, 300, 162, 78, 200, 120];

function todayStrUTC() {
  return new Date().toISOString().slice(0, 10);
}

function initialsFrom(name, last) {
  const a = (name || '').trim()[0] || '';
  const b = (last || '').trim()[0] || '';
  return (a + b).toUpperCase() || a.toUpperCase() || 'U';
}

const GOAL_LABELS = { weight_loss: 'Pérdida de peso', recomposition: 'Recomposición', hypertrophy: 'Hipertrofia', strength: 'Fuerza', endurance: 'Resistencia', glycemic_control: 'Control glucémico' };
const MODALITY_LABELS = { full_gym: 'Gimnasio', home: 'Casa', trx: 'TRX', mixed: 'Mixto', hybrid_run_gym: 'Correr + Gym', running: 'Carrera', cycling: 'Ciclismo', yoga: 'Yoga', pilates: 'Pilates' };

function mapUser(profile, authUser) {
  // IMPORTANTE: nunca devolvemos null ni dejamos el nombre sin asignar; si lo hiciéramos, el
  // bundle conservaría el usuario de MUESTRA ("Marta García"). Derivamos un nombre real del
  // perfil, del displayName de Google o del email; en último caso, un genérico neutro.
  const p = profile || {};
  const au = authUser || {};
  const emailLocal = String(au.email || '').split('@')[0] || '';
  const prettyEmail = emailLocal ? emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1) : '';
  const name = p.firstName || p.name || p.displayName || au.name || prettyEmail || 'Atleta';
  const last = p.lastName || p.surname || '';
  const goal = p.goal || '';
  const modality = p.trainingModality || p.trainingMode || '';
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out = {};
  out.name = name;                       // SIEMPRE (evita heredar el nombre de muestra)
  out.last = last;                       // siempre (evita heredar el apellido de muestra)
  out.initials = initialsFrom(name, last);
  if (goal) { out.goalRaw = goal; out.goal = goal; out.goalShort = GOAL_LABELS[goal] || goal; }
  if (modality) { out.modalityRaw = modality; out.modality = MODALITY_LABELS[modality] || modality; }
  // Para prefijar el formulario de Perfil:
  if (num(p.age) !== undefined) out.age = num(p.age);
  if (num(p.weightKg) !== undefined) out.weightKg = num(p.weightKg);
  if (num(p.heightCm) !== undefined) out.heightCm = num(p.heightCm);
  if (p.sex) out.sex = p.sex;
  if (num(p.mealsPerDay) !== undefined) out.mealsPerDay = num(p.mealsPerDay);
  if (num(p.preferredDurationMinutes) !== undefined) out.sessionMinutes = num(p.preferredDurationMinutes);
  if (num(p.daysPerWeek) !== undefined) out.daysPerWeek = num(p.daysPerWeek);
  return out;
}

function rpeAvg(rpe) {
  if (rpe == null) return null;
  if (typeof rpe === 'number') return rpe;
  if (typeof rpe === 'object') {
    const a = Number(rpe.min); const b = Number(rpe.max);
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    if (Number.isFinite(a)) return a;
    if (Number.isFinite(b)) return b;
  }
  return null;
}

function rpeLabel(rpe) {
  const v = rpeAvg(rpe);
  if (v == null) return 'Moderada';
  if (v < 5) return 'Suave';
  if (v < 7) return 'Moderada';
  if (v < 8.5) return 'Moderada-alta';
  return 'Alta';
}

function schemeOf(p) {
  if (!p) return '';
  if (p.format === 'reps') {
    const sets = p.sets ?? null;
    const reps = p.reps ?? null;
    if (sets && reps) return `${sets} × ${reps}`;
    if (reps) return `${reps} reps`;
    if (sets) return `${sets} series`;
    return '';
  }
  if (p.durationMinutes) return `${p.sets ? p.sets + ' × ' : ''}${p.durationMinutes} min`;
  return p.sets ? `${p.sets} series` : '';
}

function loadOf(p) {
  if (!p) return 'Selecciona';
  if (Number.isFinite(Number(p.loadKg)) && Number(p.loadKg) > 0) return `${p.loadKg} kg`;
  if (p.format !== 'reps') return 'Tiempo';
  return 'Selecciona';
}

function shortWeekday(dayName, dateStr) {
  if (typeof dayName === 'string' && dayName.trim()) {
    const s = dayName.trim();
    return s.charAt(0).toUpperCase() + s.slice(1, 3);
  }
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getUTCDay()];
  } catch { return ''; }
}

function dayNumber(dateStr) {
  const n = parseInt(String(dateStr).slice(8, 10), 10);
  return Number.isFinite(n) ? n : null;
}

function mapTodaySession(plan, today) {
  const days = plan?.days;
  if (!Array.isArray(days) || !days.length) return null;
  const day = days.find((d) => d.date === today && d.isTrainingDay)
    || days.find((d) => d.isTrainingDay) || days[0];
  if (!day) return null;
  const ex = Array.isArray(day.workout?.exercises) ? day.workout.exercises : [];
  const list = ex.map((e, i) => {
    const item = {
      id: e.id || null,
      name: e.name || 'Ejercicio',
      scheme: schemeOf(e.prescription),
      load: loadOf(e.prescription),
      tag: e.category || 'Ejercicio',
      muscle: (Array.isArray(e.primaryMuscles) && e.primaryMuscles[0]) || e.category || '',
      hue: HUES[i % HUES.length],
      done: false,
    };
    if (e.videoEmbedId) item.yt = e.videoEmbedId;
    if (Array.isArray(e.cues) && e.cues.length) item.cues = e.cues.slice(0, 3);
    return item;
  });
  if (!list.length) return null;
  const prim = [...new Set(ex.flatMap((e) => e.primaryMuscles || []))].slice(0, 3);
  const sec = [...new Set(ex.flatMap((e) => e.secondaryMuscles || []))].slice(0, 3);
  const out = {
    title: day.workout?.title || 'Sesión de hoy',
    focus: day.sessionFocus || day.workout?.sessionFocus || '',
    durationMin: day.workout?.durationMinutes || null,
    intensity: rpeLabel(day.workout?.intensityRpe),
    list,
  };
  if (prim.length) out.primaryMuscles = prim;
  if (sec.length) out.secondaryMuscles = sec;
  const mapSteps = (arr) => (Array.isArray(arr) ? arr : []).map((w) => (
    typeof w === 'string' ? { step: w } : { step: w.step || '', min: w.durationMinutes ?? null, details: w.details || '' }
  )).filter((w) => w.step);
  const warmup = mapSteps(day.workout?.warmup);
  const cooldown = mapSteps(day.workout?.cooldown);
  if (warmup.length) out.warmup = warmup;
  if (cooldown.length) out.cooldown = cooldown;
  return out;
}

function mapWeek(plan, today) {
  const days = plan?.days;
  if (!Array.isArray(days) || !days.length) return null;
  const week = days.map((d) => {
    const training = d.isTrainingDay;
    const v = rpeAvg(d.workout?.intensityRpe);
    const load = training ? Math.min(1, Math.max(0.4, (v || 7) / 10)) : 0.15;
    const row = {
      day: shortWeekday(d.dayName, d.date),
      date: dayNumber(d.date),
      focus: d.workout?.title || d.sessionFocus || '',
      tag: d.sessionFocus || '',
      load: Number(load.toFixed(2)),
    };
    if (d.date === today) row.today = true;
    if (!training) row.rest = true;
    return row;
  });
  return week.length ? week : null;
}

function mapLibrary(plan) {
  const days = plan?.days;
  if (!Array.isArray(days)) return null;
  const seen = new Set();
  const lib = [];
  for (const d of days) {
    for (const e of (d.workout?.exercises || [])) {
      if (!e?.name || seen.has(e.name)) continue;
      seen.add(e.name);
      const item = {
        name: e.name,
        muscle: (Array.isArray(e.primaryMuscles) && e.primaryMuscles[0]) || e.category || '',
        level: e.difficulty || 'Base',
        equip: e.equipment || '—',
        len: '',
        hue: HUES[lib.length % HUES.length],
      };
      if (e.videoEmbedId) item.yt = e.videoEmbedId;
      lib.push(item);
      if (lib.length >= 12) break;
    }
    if (lib.length >= 12) break;
  }
  return lib.length ? lib : null;
}

function mapMacroTargets(plan, today) {
  const days = plan?.days;
  const dayTarget = Array.isArray(days)
    ? (days.find((d) => d.date === today) || days[0])?.nutritionTarget
    : null;
  const t = dayTarget || plan?.baseTarget;
  if (!t) return null;
  const kcal = Number(t.targetCalories ?? t.calories);
  if (!Number.isFinite(kcal)) return null;
  return {
    kcal: Math.round(kcal),
    protein: Math.round(Number(t.proteinGrams) || 0),
    carbs: Math.round(Number(t.carbsGrams) || 0),
    fat: Math.round(Number(t.fatGrams) || 0),
  };
}

function mapMacroEaten(meals) {
  if (!Array.isArray(meals) || !meals.length) return null;
  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const m of meals) {
    const t = m.totals || {};
    sum.kcal += Number(t.calories) || 0;
    sum.protein += Number(t.proteinGrams) || 0;
    sum.carbs += Number(t.carbsGrams) || 0;
    sum.fat += Number(t.fatGrams) || 0;
  }
  return {
    kcal: Math.round(sum.kcal),
    protein: Math.round(sum.protein),
    carbs: Math.round(sum.carbs),
    fat: Math.round(sum.fat),
  };
}

// Glucemia real desde las comidas logueadas de hoy (no hay sensor continuo → sin curva).
function mapGlycemic(meals) {
  if (!Array.isArray(meals) || !meals.length) return null;
  let load = 0; let iiSum = 0; let iiN = 0; let has = false;
  for (const m of meals) {
    const t = m.totals || {};
    if (Number.isFinite(Number(t.glycemicLoad))) { load += Number(t.glycemicLoad); has = true; }
    if (Number.isFinite(Number(t.insulinIndex))) { iiSum += Number(t.insulinIndex); iiN += 1; }
  }
  if (!has) return null;
  const dayLoad = Math.round(load);
  const dayClass = dayLoad < 25 ? 'good' : dayLoad < 50 ? 'mid' : 'high';
  return {
    dayLoad,
    dayClass,
    insulinIndex: iiN ? Math.round(iiSum / iiN) : null,
    note: 'Carga glucémica estimada a partir de tus comidas registradas hoy.',
    points: null, // sin sensor de glucosa continua
  };
}

const MUSCLE_GROUPS = [
  ['Pecho', ['pecho', 'pectoral', 'chest']],
  ['Espalda', ['espalda', 'dorsal', 'lat', 'lumbar', 'trapecio', 'back', 'romboide']],
  ['Pierna', ['cuadricep', 'quad', 'isquio', 'femoral', 'hamstring', 'gluteo', 'glute', 'pierna', 'gemelo', 'pantorrilla', 'aductor']],
  ['Hombro', ['hombro', 'deltoid', 'shoulder']],
  ['Brazo', ['biceps', 'triceps', 'brazo', 'antebrazo', 'forearm']],
  ['Core', ['core', 'abs', 'abdomen', 'oblicuo', 'oblique']],
];
function groupOf(muscle) {
  const n = String(muscle || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [g, terms] of MUSCLE_GROUPS) if (terms.some((t) => n.includes(t))) return g;
  return null;
}

function mapProgress(metrics, workouts, plan) {
  const out = {};
  const wlist = Array.isArray(workouts) ? workouts : [];

  // Peso (métricas)
  const weights = (Array.isArray(metrics) ? metrics : [])
    .filter((m) => Number.isFinite(Number(m.weightKg)) && m.performedAt)
    .sort((a, b) => String(a.performedAt).localeCompare(String(b.performedAt)))
    .map((m) => Number(m.weightKg));
  if (weights.length >= 2) {
    const series = weights.slice(-7);
    out.weightSeries = series;
    out.weightNow = series[series.length - 1];
    out.weightDelta6w = Number((series[series.length - 1] - series[0]).toFixed(1));
    out.weightDeltaWk = Number((series[series.length - 1] - series[Math.max(0, series.length - 2)]).toFixed(1));
  } else {
    out.weightSeries = weights.length === 1 ? weights : [];
    out.weightNow = weights.length === 1 ? weights[0] : null;
    out.weightDelta6w = null;
    out.weightDeltaWk = null;
  }

  // Sesiones / adherencia / volumen (plan + entrenos)
  const planDays = Array.isArray(plan?.days) ? plan.days : [];
  const sessionsPlan = planDays.filter((d) => d.isTrainingDay).length;
  if (sessionsPlan) out.sessionsPlan = sessionsPlan;
  const done = wlist.filter((w) => w.completed !== false && w.source !== 'daily_checkin' || (w.source === 'daily_checkin' && w.completed === true)).length;
  out.sessionsDone = done;
  if (sessionsPlan) out.adherence = Math.min(100, Math.round((done / sessionsPlan) * 100));
  const planVolMin = planDays.reduce((a, d) => a + (d.isTrainingDay ? Number(d.workout?.durationMinutes) || 0 : 0), 0);
  if (planVolMin) out.volumeWk = Number((planVolMin / 60).toFixed(1));

  // Strain (últimos 7 días) desde check-ins/entrenos: RPE del día (0-10).
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const strain = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const w = wlist.find((x) => String(x.performedAt || '').slice(0, 10) === key);
    strain.push(w && Number.isFinite(Number(w.sessionRpe)) ? Number(w.sessionRpe) : 0);
  }
  out.strain = strain.some((v) => v > 0) ? strain : [];

  // Recovery (proxy del último check-in con sueño/fatiga)
  const lastCheckin = wlist
    .filter((w) => w.source === 'daily_checkin' && (Number.isFinite(Number(w.sleepHours)) || Number.isFinite(Number(w.fatigue))))
    .sort((a, b) => String(b.performedAt).localeCompare(String(a.performedAt)))[0];
  if (lastCheckin) {
    const sleep = Number(lastCheckin.sleepHours);
    const fatigue = Number(lastCheckin.fatigue);
    let rec = 50;
    if (Number.isFinite(sleep)) rec = (Math.min(8, sleep) / 8) * 55;
    if (Number.isFinite(fatigue)) rec += (10 - fatigue) * 4.5;
    out.recovery = Math.max(0, Math.min(100, Math.round(rec)));
  } else {
    out.recovery = null;
  }

  // Volumen por grupo muscular (desde los ejercicios del plan)
  const counts = {};
  planDays.forEach((d) => (d.workout?.exercises || []).forEach((e) => {
    (e.primaryMuscles || [e.category]).forEach((m) => { const g = groupOf(m); if (g) counts[g] = (counts[g] || 0) + 1; });
  }));
  const maxC = Math.max(0, ...Object.values(counts));
  out.muscleVolume = maxC > 0 ? MUSCLE_GROUPS.map(([g]) => ({ m: g, v: Number(((counts[g] || 0) / maxC).toFixed(2)) })) : [];

  // PRs (récords) desde entrenos manuales con ejercicios y carga.
  const prByLift = {};
  wlist.forEach((w) => (w.exercises || []).forEach((e) => {
    const kg = Number(e.weightKg);
    if (e.name && Number.isFinite(kg) && kg > 0) {
      if (!prByLift[e.name] || kg > prByLift[e.name]) prByLift[e.name] = kg;
    }
  }));
  out.pr = Object.entries(prByLift).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([lift, kg]) => ({ lift, val: `${kg} kg`, delta: '' }));

  return Object.keys(out).length ? out : null;
}

export async function GET(request) {
  return withTrace('studio_data', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return errorResponse('Autenticación requerida.', 401);
      }
      throw error;
    }

    try {
      const today = todayStrUTC();
      const startOfTodayIso = `${today}T00:00:00.000Z`;
      const since6wIso = new Date(Date.now() - 42 * 24 * 3600 * 1000).toISOString();
      const since60dIso = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();

      const [profile, latestPlan, todayMeals, metrics, workouts] = await Promise.all([
        getUserProfile(user.uid),
        getLatestWeeklyPlan(user.uid).catch(() => null),
        listMealsSince(user.uid, startOfTodayIso, 50).catch(() => []),
        listMetricsSince(user.uid, since6wIso, 200).catch(() => []),
        listWorkoutsSince(user.uid, since60dIso, 200).catch(() => []),
      ]);

      const overrides = {};
      const setIf = (key, val) => { if (val != null) overrides[key] = val; };

      setIf('user', mapUser(profile, user));
      setIf('todaySession', mapTodaySession(latestPlan, today));
      setIf('week', mapWeek(latestPlan, today));
      setIf('library', mapLibrary(latestPlan));
      setIf('macroTargets', mapMacroTargets(latestPlan, today));
      setIf('macroEaten', mapMacroEaten(todayMeals));
      setIf('glycemic', mapGlycemic(todayMeals));
      setIf('progress', mapProgress(metrics, workouts, latestPlan));

      return jsonResponse({ ok: true, overrides });
    } catch (error) {
      logError('studio_data_failed', error, { traceId, userId: user.uid });
      return jsonResponse({ ok: false, overrides: {} });
    }
  });
}
