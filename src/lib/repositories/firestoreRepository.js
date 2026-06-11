import { getAdminServices } from '../firebaseAdmin.js';

const PROFILE_DOC_ID = 'main';
const ACCOUNT_COLLECTIONS = ['profile', 'meals', 'workouts', 'metrics', 'weeklyPlans', 'rateLimits'];
const DEFAULT_EXPORT_LIMIT = 5000;

function sanitizeFood(food) {
  if (!food || typeof food !== 'object') return null;
  return {
    name: String(food.name || '').slice(0, 200),
    calories: Number.isFinite(Number(food.calories)) ? Number(food.calories) : 0,
    proteinGrams: Number.isFinite(Number(food.proteinGrams)) ? Number(food.proteinGrams) : 0,
    carbsGrams: Number.isFinite(Number(food.carbsGrams)) ? Number(food.carbsGrams) : 0,
    fatGrams: Number.isFinite(Number(food.fatGrams)) ? Number(food.fatGrams) : 0,
    portionGrams: Number.isFinite(Number(food.portionGrams)) ? Number(food.portionGrams) : null,
    glycemicIndex: Number.isFinite(Number(food.glycemicIndex)) ? Number(food.glycemicIndex) : null,
  };
}

function sanitizeTotals(totals) {
  if (!totals || typeof totals !== 'object') return {};
  return {
    calories: Number.isFinite(Number(totals.calories)) ? Number(totals.calories) : 0,
    proteinGrams: Number.isFinite(Number(totals.proteinGrams)) ? Number(totals.proteinGrams) : 0,
    carbsGrams: Number.isFinite(Number(totals.carbsGrams)) ? Number(totals.carbsGrams) : 0,
    fatGrams: Number.isFinite(Number(totals.fatGrams)) ? Number(totals.fatGrams) : 0,
    glycemicLoad: Number.isFinite(Number(totals.glycemicLoad)) ? Number(totals.glycemicLoad) : null,
    insulinIndex: Number.isFinite(Number(totals.insulinIndex)) ? Number(totals.insulinIndex) : null,
  };
}

export async function createMeal(userId, payload) {
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('meals').doc();

  const record = {
    id: ref.id,
    userId,
    foods: Array.isArray(payload.foods) ? payload.foods.map(sanitizeFood).filter(Boolean) : [],
    totals: sanitizeTotals(payload.totals),
    eatenAt: payload.eatenAt,
    source: ['manual', 'ai', 'barcode'].includes(payload.source) ? payload.source : 'manual',
    aiAnalysis: payload.aiAnalysis ?? null,
    adherence: payload.adherence ?? null,
    planId: typeof payload.planId === 'string' ? payload.planId.slice(0, 100) : null,
    createdAt: new Date().toISOString(),
  };

  await ref.set(record);
  return record;
}

export async function listMeals(userId, limit = 20) {
  const { db } = await getAdminServices();
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('meals')
    .orderBy('eatenAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

export async function listMealsSince(userId, sinceIso, limit = 200) {
  const { db } = await getAdminServices();
  let query = db
    .collection('users')
    .doc(userId)
    .collection('meals')
    .orderBy('eatenAt', 'desc');

  if (sinceIso) {
    query = query.where('eatenAt', '>=', sinceIso);
  }

  const snapshot = await query.limit(limit).get();
  return snapshot.docs.map((doc) => doc.data());
}

function sanitizeExercise(exercise) {
  if (!exercise || typeof exercise !== 'object') return null;
  return {
    id: typeof exercise.id === 'string' && exercise.id.trim()
      ? exercise.id.trim().slice(0, 120)
      : null,
    name: String(exercise.name || '').slice(0, 200),
    sets: Number.isFinite(Number(exercise.sets)) ? Number(exercise.sets) : null,
    reps: Number.isFinite(Number(exercise.reps)) ? Number(exercise.reps) : null,
    weightKg: Number.isFinite(Number(exercise.weightKg)) ? Number(exercise.weightKg) : null,
    durationSeconds: Number.isFinite(Number(exercise.durationSeconds)) ? Number(exercise.durationSeconds) : null,
    rpe: Number.isFinite(Number(exercise.rpe)) ? Number(exercise.rpe) : null,
    completed: typeof exercise.completed === 'boolean' ? exercise.completed : true,
    notes: typeof exercise.notes === 'string' ? exercise.notes.slice(0, 500) : null,
  };
}

const DAILY_CHECKIN_SYMPTOM_KEYS = ['dyspnea', 'jointPain', 'dizziness', 'tachycardia'];

function safeNumber(value) {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function sanitizeDailyCheckinSymptoms(symptoms) {
  if (!symptoms || typeof symptoms !== 'object') return null;
  return Object.fromEntries(
    DAILY_CHECKIN_SYMPTOM_KEYS.map((key) => [key, symptoms[key] === true])
  );
}

function buildWorkoutRecord({ ref, userId, payload, createdAt, updatedAt }) {
  const source = ['daily_checkin', 'strava'].includes(payload.source) ? payload.source : 'manual';
  const symptoms = source === 'daily_checkin' ? sanitizeDailyCheckinSymptoms(payload.symptoms) : null;

  return {
    id: ref.id,
    userId,
    source,
    dailyCheckinDate: source === 'daily_checkin' ? payload.dailyCheckinDate : null,
    checkinSkipped: source === 'daily_checkin' ? payload.checkinSkipped === true : false,
    symptoms,
    hasAlarmSymptoms: symptoms ? Object.values(symptoms).some(Boolean) : false,
    mode: String(payload.mode || '').slice(0, 50),
    title: String(payload.title || '').slice(0, 200),
    durationMinutes: safeNumber(payload.durationMinutes),
    exercises: Array.isArray(payload.exercises) ? payload.exercises.map(sanitizeExercise).filter(Boolean) : [],
    performedAt: payload.performedAt,
    sessionRpe: safeNumber(payload.sessionRpe),
    fatigue: safeNumber(payload.fatigue),
    mood: safeNumber(payload.mood),
    sleepHours: safeNumber(payload.sleepHours),
    completed: payload.completed ?? true,
    notes: typeof payload.notes === 'string' ? payload.notes.slice(0, 2000) : null,
    planId: typeof payload.planId === 'string' ? payload.planId.slice(0, 100) : null,
    // Datos de dispositivos (Strava): FC del entreno, distancia y ritmo.
    distanceKm: safeNumber(payload.distanceKm),
    avgHeartRate: safeNumber(payload.avgHeartRate),
    maxHeartRate: safeNumber(payload.maxHeartRate),
    avgPaceSecPerKm: safeNumber(payload.avgPaceSecPerKm),
    sportType: typeof payload.sportType === 'string' ? payload.sportType.slice(0, 40) : null,
    stravaActivityId: payload.stravaId != null ? String(payload.stravaId).slice(0, 40) : null,
    createdAt,
    updatedAt,
  };
}

export async function createWorkout(userId, payload) {
  const { db } = await getAdminServices();
  const workouts = db.collection('users').doc(userId).collection('workouts');
  const isDailyCheckin = payload.source === 'daily_checkin';
  let ref;
  if (isDailyCheckin) {
    ref = workouts.doc(`daily-${payload.dailyCheckinDate}`);
  } else if (payload.source === 'strava' && payload.stravaId != null) {
    ref = workouts.doc(`strava-${payload.stravaId}`); // idempotente por actividad
  } else if (payload.id) {
    ref = workouts.doc(payload.id);
  } else {
    ref = workouts.doc();
  }
  const now = new Date().toISOString();

  if (isDailyCheckin) {
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists ? snapshot.data() : null;
      const record = buildWorkoutRecord({
        ref,
        userId,
        payload,
        createdAt: current?.createdAt || now,
        updatedAt: now,
      });

      transaction.set(ref, record, { merge: true });
      return record;
    });
  }

  const record = buildWorkoutRecord({
    ref,
    userId,
    payload,
    createdAt: now,
    updatedAt: now,
  });

  await ref.set(record);
  return record;
}

export async function listWorkouts(userId, limit = 20, { before = null } = {}) {
  const { db } = await getAdminServices();
  let query = db
    .collection('users')
    .doc(userId)
    .collection('workouts')
    .orderBy('performedAt', 'desc');

  // Cursor de paginación para el historial: entrenos estrictamente anteriores a `before`.
  if (before) {
    query = query.where('performedAt', '<', before);
  }

  const snapshot = await query.limit(limit).get();
  // doc.id como id autoritativo: los registros nuevos ya guardan `id`, los legacy no.
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

export async function listWorkoutsSince(userId, sinceIso, limit = 200) {
  const { db } = await getAdminServices();
  let query = db
    .collection('users')
    .doc(userId)
    .collection('workouts')
    .orderBy('performedAt', 'desc');

  if (sinceIso) {
    query = query.where('performedAt', '>=', sinceIso);
  }

  const snapshot = await query.limit(limit).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

// FASE 1.3 — Último entreno HECHO sin ventana temporal (para detectar inactividad
// aunque el parón supere el lookback de las consultas acotadas). Mira los últimos 15
// registros: suficiente para saltar check-ins "no entrené" y workouts incompletos.
export async function getLastDoneWorkoutAt(userId) {
  const { db } = await getAdminServices();
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('workouts')
    .orderBy('performedAt', 'desc')
    .limit(15)
    .get();
  for (const doc of snapshot.docs) {
    const w = doc.data();
    const done = w.source === 'daily_checkin' ? w.completed === true : w.completed !== false;
    if (done && w.performedAt) return w.performedAt;
  }
  return null;
}

function sanitizeWorkoutId(workoutId) {
  const id = String(workoutId || '').trim();
  return id && id.length <= 80 && !id.includes('/') ? id : null;
}

export async function getWorkoutById(userId, workoutId) {
  const id = sanitizeWorkoutId(workoutId);
  if (!id) return null;
  const { db } = await getAdminServices();
  const snapshot = await db.collection('users').doc(userId).collection('workouts').doc(id).get();
  if (!snapshot.exists) return null;
  return { ...snapshot.data(), id: snapshot.id };
}

// --- Análisis del coach por sesión (caché permanente: una sesión pasada es inmutable) ---
export async function saveWorkoutAnalysis(userId, workoutId, analysis) {
  const id = sanitizeWorkoutId(workoutId);
  if (!id || !analysis || typeof analysis !== 'object') return null;
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('workoutAnalyses').doc(id);
  const record = { ...analysis, workoutId: id, updatedAt: new Date().toISOString() };
  await ref.set(record);
  return record;
}

export async function getWorkoutAnalysis(userId, workoutId) {
  const id = sanitizeWorkoutId(workoutId);
  if (!id) return null;
  const { db } = await getAdminServices();
  const snapshot = await db.collection('users').doc(userId).collection('workoutAnalyses').doc(id).get();
  if (!snapshot.exists) return null;
  return snapshot.data() || null;
}

// Análisis cacheados de un conjunto de sesiones (para servir el historial con el análisis inline).
export async function getWorkoutAnalysesByIds(userId, workoutIds) {
  const ids = (Array.isArray(workoutIds) ? workoutIds : []).map(sanitizeWorkoutId).filter(Boolean);
  if (!ids.length) return {};
  const { db } = await getAdminServices();
  const col = db.collection('users').doc(userId).collection('workoutAnalyses');
  const snapshots = await db.getAll(...ids.map((id) => col.doc(id)));
  const out = {};
  for (const snap of snapshots) {
    if (snap.exists) out[snap.id] = snap.data();
  }
  return out;
}

// --- Integración Strava: tokens y estado de conexión (doc aparte del perfil) ---
export async function saveStravaConnection(userId, data) {
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('integrations').doc('strava');
  await ref.set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
  return data;
}

export async function getStravaConnection(userId) {
  const { db } = await getAdminServices();
  const snap = await db.collection('users').doc(userId).collection('integrations').doc('strava').get();
  return snap.exists ? snap.data() : null;
}

// Busca al usuario dueño de una cuenta de Strava (para el webhook). Aísla por atleta: solo
// devuelve el uid cuyo token corresponde a ese athleteId.
export async function getUserByStravaAthlete(athleteId) {
  const { db } = await getAdminServices();
  const snap = await db.collectionGroup('integrations')
    .where('athleteId', '==', Number(athleteId))
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const uid = doc.ref.parent.parent ? doc.ref.parent.parent.id : null;
  return uid ? { uid, connection: doc.data() } : null;
}

export async function createMetricLog(userId, payload) {
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('metrics').doc();

  const record = {
    id: ref.id,
    userId,
    takenAt: payload.takenAt,
    weightKg: payload.weightKg ?? null,
    waistCm: payload.waistCm ?? null,
    fastingGlucoseMgDl: payload.fastingGlucoseMgDl ?? null,
    notes: payload.notes ?? null,
    createdAt: new Date().toISOString(),
  };

  await ref.set(record);
  return record;
}

export async function listMetrics(userId, limit = 30) {
  const { db } = await getAdminServices();
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('metrics')
    .orderBy('takenAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

export async function listMetricsSince(userId, sinceIso, limit = 200) {
  const { db } = await getAdminServices();
  let query = db
    .collection('users')
    .doc(userId)
    .collection('metrics')
    .orderBy('takenAt', 'desc');

  if (sinceIso) {
    query = query.where('takenAt', '>=', sinceIso);
  }

  const snapshot = await query.limit(limit).get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function getUserProfile(userId) {
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('profile').doc(PROFILE_DOC_ID);
  const snapshot = await ref.get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function upsertUserProfile(userId, payload) {
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('profile').doc(PROFILE_DOC_ID);
  const now = new Date().toISOString();

  const record = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() : null;

    const merged = {
      ...(current || {}),
      ...payload,
      id: PROFILE_DOC_ID,
      userId,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };

    transaction.set(ref, merged, { merge: true });
    return merged;
  });

  return record;
}

export async function createWeeklyPlan(userId, payload) {
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('weeklyPlans').doc();
  const now = new Date().toISOString();

  const record = {
    id: ref.id,
    userId,
    ...payload,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(record);
  return record;
}

export async function listWeeklyPlans(userId, limit = 4) {
  const { db } = await getAdminServices();
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('weeklyPlans')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

export async function getLatestWeeklyPlan(userId) {
  const plans = await listWeeklyPlans(userId, 1);
  return plans[0] ?? null;
}

export async function updateWeeklyPlanAdaptiveOverlay(userId, planId, overlayPatch) {
  if (!planId || typeof planId !== 'string' || planId.includes('/')) {
    return null;
  }

  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('weeklyPlans').doc(planId);
  const now = new Date().toISOString();

  const record = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;

    const current = snapshot.data() || {};
    const patch = {
      adaptiveTuning: overlayPatch?.adaptiveTuning || null,
      progressMemory: overlayPatch?.progressMemory || null,
      adaptiveOverlay: overlayPatch?.adaptiveOverlay || null,
      updatedAt: now,
    };
    if (Array.isArray(overlayPatch?.days)) {
      patch.days = overlayPatch.days;
    }

    const merged = { ...current, ...patch };
    transaction.set(ref, patch, { merge: true });
    return merged;
  });

  return record;
}

// --- Plan SEMANAL de comidas del Studio (cacheado por semana para no regenerar en cada visita) ---
function sanitizeWeekKey(weekKey) {
  const k = String(weekKey || '').slice(0, 20);
  // Solo permitimos AAAA-MM-DD (lunes de la semana) para usarlo como id de documento.
  return /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : null;
}

export async function saveStudioNutritionPlan(userId, weekKey, plan) {
  const key = sanitizeWeekKey(weekKey);
  if (!key || !plan || typeof plan !== 'object') return null;
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('studioNutrition').doc(key);
  const record = {
    weekKey: key,
    nutrition: plan,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(record);
  return record;
}

export async function getStudioNutritionPlan(userId, weekKey) {
  const key = sanitizeWeekKey(weekKey);
  if (!key) return null;
  const { db } = await getAdminServices();
  const snapshot = await db.collection('users').doc(userId).collection('studioNutrition').doc(key).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  return data.nutrition && Array.isArray(data.nutrition.days) ? data.nutrition : null;
}

// --- Análisis del coach (informe post-entreno cacheado; se invalida por firma de entrenos) ---
export async function saveCoachAnalysis(userId, report) {
  if (!report || typeof report !== 'object') return null;
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('coachReports').doc('latest');
  const record = { ...report, updatedAt: new Date().toISOString() };
  await ref.set(record);
  return record;
}

export async function getCoachAnalysis(userId) {
  const { db } = await getAdminServices();
  const snapshot = await db.collection('users').doc(userId).collection('coachReports').doc('latest').get();
  if (!snapshot.exists) return null;
  return snapshot.data() || null;
}

export async function updateWeeklyPlanCustomizations(userId, planId, customizations) {
  if (!planId || typeof planId !== 'string' || planId.includes('/')) {
    return null;
  }

  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('weeklyPlans').doc(planId);
  const now = new Date().toISOString();

  const record = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      return null;
    }

    const current = snapshot.data() || {};
    const merged = {
      ...current,
      customizations: {
        ...(current.customizations || {}),
        ...(customizations || {}),
        updatedAt: now,
      },
      updatedAt: now,
    };

    transaction.set(ref, merged, { merge: true });
    return merged;
  });

  return record;
}

async function deleteCollectionInChunks(collectionRef, chunkSize = 200) {
  const { db } = await getAdminServices();
  let deleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(chunkSize).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < chunkSize) break;
  }

  return deleted;
}

async function deleteUserStorageFiles(userId) {
  const { storage } = await getAdminServices();
  const bucket = storage.bucket();
  const prefix = `plates/${userId}/`;

  try {
    const [files] = await bucket.getFiles({ prefix });
    if (!files.length) return 0;

    let deleted = 0;
    for (const file of files) {
      try {
        await file.delete();
        deleted += 1;
      } catch (error) {
        // Ignore already deleted files and continue cleanup.
        if (error?.code !== 404) {
          throw error;
        }
      }
    }

    return deleted;
  } catch (error) {
    // If the bucket is not configured or reachable, surface the error to caller.
    throw error;
  }
}

export async function exportUserAccountData(userId, options = {}) {
  const { db } = await getAdminServices();
  const userRef = db.collection('users').doc(userId);
  const maxDocsPerCollection = Number.isInteger(options.maxDocsPerCollection)
    ? Math.min(Math.max(options.maxDocsPerCollection, 1), 20000)
    : DEFAULT_EXPORT_LIMIT;

  const [profile, meals, workouts, metrics, weeklyPlans] = await Promise.all([
    getUserProfile(userId),
    userRef.collection('meals').limit(maxDocsPerCollection).get(),
    userRef.collection('workouts').limit(maxDocsPerCollection).get(),
    userRef.collection('metrics').limit(maxDocsPerCollection).get(),
    userRef.collection('weeklyPlans').limit(maxDocsPerCollection).get(),
  ]);

  return {
    profile: profile ?? null,
    meals: meals.docs.map((doc) => doc.data()),
    workouts: workouts.docs.map((doc) => doc.data()),
    metrics: metrics.docs.map((doc) => doc.data()),
    weeklyPlans: weeklyPlans.docs.map((doc) => doc.data()),
    meta: {
      maxDocsPerCollection,
      truncatedCollections: [
        meals.size >= maxDocsPerCollection ? 'meals' : null,
        workouts.size >= maxDocsPerCollection ? 'workouts' : null,
        metrics.size >= maxDocsPerCollection ? 'metrics' : null,
        weeklyPlans.size >= maxDocsPerCollection ? 'weeklyPlans' : null,
      ].filter(Boolean),
    },
  };
}

export async function deleteUserAccountData(userId) {
  const { db } = await getAdminServices();
  const userRef = db.collection('users').doc(userId);

  const deletedCollections = {};
  for (const collectionName of ACCOUNT_COLLECTIONS) {
    const count = await deleteCollectionInChunks(userRef.collection(collectionName));
    deletedCollections[collectionName] = count;
  }

  await userRef.delete();

  let deletedStorageFiles = 0;
  let storageCleanupError = null;
  try {
    deletedStorageFiles = await deleteUserStorageFiles(userId);
  } catch (error) {
    storageCleanupError = error?.message || 'No se pudieron eliminar archivos del bucket.';
  }

  return {
    deletedCollections,
    deletedStorageFiles,
    storageCleanupError,
  };
}

export async function saveStravaCredentials(userId, credentials) {
  if (!userId) throw new Error('userId es obligatorio para guardar credenciales de Strava.');
  const { db } = await getAdminServices();
  const ref = db
    .collection('users')
    .doc(userId)
    .collection('integrations')
    .doc('strava');

  await ref.set({
    accessToken: String(credentials.accessToken || ''),
    refreshToken: String(credentials.refreshToken || ''),
    expiresAt: Number(credentials.expiresAt) || 0,
    athleteId: String(credentials.athleteId || ''),
    updatedAt: new Date().toISOString(),
  });
}

export async function getStravaCredentials(userId) {
  if (!userId) return null;
  const { db } = await getAdminServices();
  const ref = db
    .collection('users')
    .doc(userId)
    .collection('integrations')
    .doc('strava');

  const snapshot = await ref.get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function deleteStravaCredentials(userId) {
  if (!userId) return;
  const { db } = await getAdminServices();
  const ref = db
    .collection('users')
    .doc(userId)
    .collection('integrations')
    .doc('strava');

  await ref.delete();
}
