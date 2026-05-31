import fs from 'node:fs/promises';

import { getAdminServices } from '../src/lib/firebaseAdmin.js';
import { RATE_LIMIT_SCOPES } from '../src/lib/rateLimit.js';
import { deleteUserAccountData } from '../src/lib/repositories/firestoreRepository.js';

const baseUrl = String(process.env.E2E_BASE_URL || 'https://endogym.vercel.app').replace(/\/+$/, '');
const imageUrl = process.env.E2E_PLATE_IMAGE_URL
  || 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.633.400.jpg';
const requireGeminiLive = String(process.env.E2E_REQUIRE_GEMINI_LIVE || 'true').toLowerCase() === 'true';
const uid = `e2e-${Date.now()}`;
const email = `${uid}@example.invalid`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  return { response, body };
}

async function readPlateImage() {
  if (process.env.E2E_PLATE_IMAGE_PATH) {
    return fs.readFile(process.env.E2E_PLATE_IMAGE_PATH);
  }

  const response = await fetch(imageUrl);
  assert(response.ok, `No se pudo descargar imagen E2E: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function getIdToken(auth) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  assert(apiKey, 'Falta NEXT_PUBLIC_FIREBASE_API_KEY para la sonda E2E.');

  const customToken = await auth.createCustomToken(uid);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  assert(response.ok, `Intercambio Firebase custom token falló: HTTP ${response.status}`);
  return (await response.json()).idToken;
}

async function verifyGoogleOAuthDomain() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  assert(apiKey, 'Falta NEXT_PUBLIC_FIREBASE_API_KEY para validar Google OAuth.');

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ continueUri: baseUrl, providerId: 'google.com' }),
    }
  );
  const body = await response.json();

  assert(
    response.ok,
    `Firebase Google OAuth no autorizo ${baseUrl}: HTTP ${response.status} ${body?.error?.message || ''}`.trim()
  );
  assert(body?.providerId === 'google.com', 'Firebase Google OAuth no devolvio el proveedor esperado.');
  assert(body?.authUri, 'Firebase Google OAuth no devolvio URI de autenticacion.');
}

async function expectRateLimit(path, options) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = await request(path, options);
    if (result.response.status === 429) {
      assert(result.response.headers.get('retry-after'), `${path} no incluyó Retry-After.`);
      return attempt;
    }
  }

  throw new Error(`${path} no aplicó rate limit en 30 intentos.`);
}

const { auth, db } = await getAdminServices();
let created = false;

try {
  await verifyGoogleOAuthDomain();

  const [root, health, unauthMeals] = await Promise.all([
    request('/'),
    request('/api/health'),
    request('/api/meals'),
  ]);
  assert(root.response.status === 200, `GET / devolvió ${root.response.status}`);
  assert(health.response.status === 200, `GET /api/health devolvió ${health.response.status}`);
  assert(unauthMeals.response.status === 401, `GET /api/meals sin token devolvió ${unauthMeals.response.status}`);

  await auth.createUser({ uid, email });
  created = true;
  const idToken = await getIdToken(auth);
  const headers = { authorization: `Bearer ${idToken}` };

  const [profile, meals] = await Promise.all([
    request('/api/profile', { headers }),
    request('/api/meals?limit=1', { headers }),
  ]);
  assert(profile.response.status === 200, `GET /api/profile devolvió ${profile.response.status}`);
  assert(meals.response.status === 200, `GET /api/meals autenticado devolvió ${meals.response.status}`);

  const weeklyRateLimitAttempt = await expectRateLimit('/api/weekly-plan', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: '{}',
  });
  await db.collection('users').doc(uid).collection('rateLimits').doc(RATE_LIMIT_SCOPES.WEEKLY_PLAN_GENERATE).delete();

  const savedProfile = await request('/api/profile', {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      displayName: 'E2E Coach',
      goal: 'weight_loss',
      trainingMode: 'gym',
      trainingModality: 'full_gym',
      metabolicProfile: 'none',
      activityLevel: 'moderate',
      sex: 'male',
      age: 30,
      weightKg: 75,
      heightCm: 175,
      mealsPerDay: 4,
      onboardingCompleted: true,
      preparticipation: {
        knownCardiometabolicDisease: false,
        exerciseSymptoms: false,
        currentlyActive: true,
        medicalClearance: false,
        contraindications: false,
        desiredIntensity: 'moderate',
      },
    }),
  });
  assert(savedProfile.response.status === 200, `PUT /api/profile devolvió ${savedProfile.response.status}`);

  const weeklyPlan = await request('/api/weekly-plan', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: '{}',
  });
  assert(weeklyPlan.response.status === 201, `POST /api/weekly-plan devolvió ${weeklyPlan.response.status}`);

  if (requireGeminiLive) {
    assert(weeklyPlan.body?.plan?.coachSource === 'gemini', 'POST /api/weekly-plan no usó Gemini live.');
    assert(weeklyPlan.body?.plan?.coachMeta?.fallbackApplied === false, 'POST /api/weekly-plan aplicó fallback.');
  }

  const invalidImage = await request('/api/analyze-plate', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      imageBase64: `data:image/jpeg;base64,${Buffer.from('not-an-image').toString('base64')}`,
    }),
  });
  assert(invalidImage.response.status === 400, `Firma de imagen falsa devolvió ${invalidImage.response.status}`);

  const plateImage = await readPlateImage();
  const plate = await request('/api/analyze-plate', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      imageBase64: `data:image/jpeg;base64,${plateImage.toString('base64')}`,
      context: { dish: 'Producto alimentario en envase' },
      eatenAt: new Date().toISOString(),
    }),
  });
  assert(plate.response.status === 201, `POST /api/analyze-plate devolvió ${plate.response.status}`);
  assert(plate.body?.traceId, 'POST /api/analyze-plate no devolvió traceId.');
  assert(plate.body?.storagePath, 'POST /api/analyze-plate no guardó foto.');

  if (requireGeminiLive) {
    assert(plate.body?.model?.source === 'gemini', 'POST /api/analyze-plate no usó Gemini live.');
    assert(plate.body?.model?.fallbackApplied === false, 'POST /api/analyze-plate aplicó fallback.');
  }

  const plateRateLimitAttempt = await expectRateLimit('/api/analyze-plate', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      imageBase64: `data:image/jpeg;base64,${Buffer.from('not-an-image').toString('base64')}`,
    }),
  });
  console.log(`e2e_base_url=${baseUrl}`);
  console.log('google_oauth_domain_status=200');
  console.log('root_status=200');
  console.log('health_status=200');
  console.log('meals_unauth_status=401');
  console.log('profile_status=200');
  console.log('meals_auth_status=200');
  console.log('plate_status=201');
  console.log(`plate_model_source=${plate.body?.model?.source || '<missing>'}`);
  console.log(`plate_model_mode=${plate.body?.model?.mode || '<missing>'}`);
  console.log(`plate_storage_saved=${Boolean(plate.body?.storagePath)}`);
  console.log(`weekly_coach_source=${weeklyPlan.body?.plan?.coachSource || '<missing>'}`);
  console.log(`weekly_coach_model=${weeklyPlan.body?.plan?.coachMeta?.modelResolved || '<missing>'}`);
  console.log(`weekly_coach_fallback=${Boolean(weeklyPlan.body?.plan?.coachMeta?.fallbackApplied)}`);
  console.log(`plate_rate_limit_rejected_at_attempt=${plateRateLimitAttempt}`);
  console.log(`weekly_rate_limit_rejected_at_attempt=${weeklyRateLimitAttempt}`);
} finally {
  try {
    const purge = await deleteUserAccountData(uid);
    console.log(`cleanup_storage_files=${purge.deletedStorageFiles}`);
  } catch (error) {
    console.log(`cleanup_data_error=${error.message}`);
  }

  if (created) {
    try {
      await auth.deleteUser(uid);
      console.log('cleanup_auth_user=true');
    } catch (error) {
      console.log(`cleanup_auth_error=${error.message}`);
    }
  }
}
