// Cliente de la API de Strava (OAuth + lectura de actividades) para importar entrenos con
// frecuencia cardiaca. Requiere STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET (crear una "API
// Application" gratuita en https://www.strava.com/settings/api). El "state" de OAuth se firma
// con HMAC para atar el callback al usuario autenticado sin almacenar nada temporal.

import crypto from 'node:crypto';
import { estimateSessionRpeFromHr } from '../core/running.js';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API = 'https://www.strava.com/api/v3';

export function isStravaConfigured() {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

function stateSecret() {
  return process.env.STRAVA_STATE_SECRET || process.env.STRAVA_CLIENT_SECRET || 'ignios-strava';
}

export function signState(uid, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${uid}.${exp}`;
  const sig = crypto.createHmac('sha256', stateSecret()).update(payload).digest('hex').slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  const payload = `${uid}.${exp}`;
  const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest('hex').slice(0, 32);
  if (sig !== expected) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return uid;
}

export function buildAuthorizeUrl({ state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: String(process.env.STRAVA_CLIENT_ID || ''),
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read',
    state,
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`Strava token HTTP ${res.status}`);
  return res.json();
}

export async function exchangeCode(code, redirectUri) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
}

export async function refreshAccessToken(refreshToken) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

// Devuelve un access token válido, refrescando si está caducado. Retorna { accessToken, updated }.
export async function ensureFreshToken(connection) {
  const now = Math.floor(Date.now() / 1000);
  if (connection?.accessToken && Number(connection.expiresAt) - 60 > now) {
    return { accessToken: connection.accessToken, refreshed: null };
  }
  if (!connection?.refreshToken) throw new Error('Sin refresh token de Strava.');
  const t = await refreshAccessToken(connection.refreshToken);
  return {
    accessToken: t.access_token,
    refreshed: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at },
  };
}

export async function getActivities(accessToken, { afterEpoch, perPage = 30, page = null } = {}) {
  const params = new URLSearchParams({ per_page: String(perPage) });
  if (afterEpoch) params.set('after', String(afterEpoch));
  // Sin `page`, Strava devuelve siempre la primera: paginar sin esto repite el mismo lote.
  if (Number.isFinite(Number(page)) && Number(page) > 0) params.set('page', String(Math.round(Number(page))));
  const res = await fetch(`${STRAVA_API}/athlete/activities?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Strava activities HTTP ${res.status}`);
  return res.json();
}

// Tipos de sesión que Strava permite etiquetar en una carrera. Saber que una actividad fue
// una CARRERA de verdad (no un rodaje) cambia cómo debe leerse su esfuerzo y su ritmo.
const RUN_WORKOUT_TYPES = { 0: 'default', 1: 'race', 2: 'long_run', 3: 'workout' };

/**
 * Mapea una actividad de Strava a un payload de workout de Ignios.
 *
 * `hrMax` es opcional: si se pasa, se calcula además un RPE ESTIMADO por frecuencia
 * cardiaca. Se guarda en `sessionRpeEstimated`, nunca en `sessionRpe`, porque ese campo
 * está reservado al esfuerzo que la persona REPORTA en el check-in. Mezclarlos convertiría
 * una estimación poblacional en un dato personal declarado.
 */
export function mapActivityToWorkout(a, { hrMax = null } = {}) {
  const distanceKm = a.distance ? Math.round((a.distance / 1000) * 100) / 100 : null;
  const movingMin = a.moving_time ? Math.round(a.moving_time / 60) : null;
  const avgPaceSecPerKm = (a.distance && a.moving_time && a.distance > 0)
    ? Math.round(a.moving_time / (a.distance / 1000))
    : null;
  const avgHeartRate = Number.isFinite(a.average_heartrate) ? Math.round(a.average_heartrate) : null;
  // `perceived_exertion` es RPE REPORTADO por la persona en Strava (0-10). Si existe, vale
  // tanto como el del check-in: es su percepción, no una estimación nuestra.
  const reportedRpe = Number.isFinite(a.perceived_exertion) ? Math.round(a.perceived_exertion * 10) / 10 : null;
  const estimatedRpe = estimateSessionRpeFromHr({ avgHeartRate, hrMax });

  return {
    source: 'strava',
    stravaId: a.id,
    title: a.name || a.sport_type || 'Actividad',
    sportType: a.sport_type || a.type || 'Workout',
    performedAt: a.start_date || new Date().toISOString(),
    durationMinutes: movingMin,
    distanceKm,
    avgHeartRate,
    maxHeartRate: Number.isFinite(a.max_heartrate) ? Math.round(a.max_heartrate) : null,
    avgPaceSecPerKm,
    // Relative Effort de Strava (carga de la sesión por FC, su equivalente a TRIMP). Viene
    // en la lista de actividades, sin llamada extra, y es el mejor dato de CARGA que da la API.
    relativeEffort: Number.isFinite(a.suffer_score) ? Math.round(a.suffer_score) : null,
    elevationGainM: Number.isFinite(a.total_elevation_gain) ? Math.round(a.total_elevation_gain) : null,
    stravaWorkoutType: RUN_WORKOUT_TYPES[a.workout_type] || null,
    // Esfuerzo: el reportado manda; el estimado va aparte y se etiqueta como tal.
    sessionRpe: reportedRpe,
    sessionRpeEstimated: reportedRpe == null ? estimatedRpe : null,
    rpeSource: reportedRpe != null ? 'strava_reported' : (estimatedRpe != null ? 'hr_estimate' : null),
    completed: true,
  };
}
