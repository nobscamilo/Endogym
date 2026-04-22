import { getAdminServices } from '../firebaseAdmin.js';

const PROFILE_DOC_ID = 'main';
const ACCOUNT_COLLECTIONS = ['profile', 'meals', 'workouts', 'metrics', 'weeklyPlans'];
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

export async function createWorkout(userId, payload) {
  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('workouts').doc();

  const safeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  const record = {
    id: ref.id,
    userId,
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
    createdAt: new Date().toISOString(),
  };

  await ref.set(record);
  return record;
}

export async function listWorkouts(userId, limit = 20) {
  const { db } = await getAdminServices();
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('workouts')
    .orderBy('performedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data());
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
  return snapshot.docs.map((doc) => doc.data());
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
