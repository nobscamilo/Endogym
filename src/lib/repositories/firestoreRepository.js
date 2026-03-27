import { getAdminServices } from '../firebaseAdmin.js';

export async function createMeal(userId, payload) {
  const { db } = getAdminServices();
  const ref = db.collection('users').doc(userId).collection('meals').doc();

  const record = {
    id: ref.id,
    userId,
    foods: payload.foods,
    totals: payload.totals,
    eatenAt: payload.eatenAt,
    source: payload.source ?? 'manual',
    createdAt: new Date().toISOString(),
  };

  await ref.set(record);
  return record;
}

export async function listMeals(userId, limit = 20) {
  const { db } = getAdminServices();
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('meals')
    .orderBy('eatenAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

export async function createWorkout(userId, payload) {
  const { db } = getAdminServices();
  const ref = db.collection('users').doc(userId).collection('workouts').doc();

  const record = {
    id: ref.id,
    userId,
    mode: payload.mode,
    title: payload.title,
    durationMinutes: payload.durationMinutes,
    exercises: payload.exercises ?? [],
    performedAt: payload.performedAt,
    createdAt: new Date().toISOString(),
  };

  await ref.set(record);
  return record;
}

export async function listWorkouts(userId, limit = 20) {
  const { db } = getAdminServices();
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('workouts')
    .orderBy('performedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data());
}
