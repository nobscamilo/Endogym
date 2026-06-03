import { getAuthenticatedUser, AuthenticationError } from '../../../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../../../lib/http.js';
import { withTrace, logError, logInfo } from '../../../../../lib/logger.js';
import {
  getStravaCredentials,
  saveStravaCredentials,
  createWorkout,
  upsertUserProfile,
} from '../../../../../lib/repositories/firestoreRepository.js';

function mapSportType(type = '') {
  const t = String(type).toLowerCase();
  if (['run', 'trailrun'].includes(t)) return 'running';
  if (['ride', 'virtualride', 'gravelride', 'mountainbikeride'].includes(t)) return 'cycling';
  if (['weighttraining', 'workout'].includes(t)) return 'resistance';
  if (['yoga'].includes(t)) return 'yoga';
  if (['pilates'].includes(t)) return 'pilates';
  if (['walk', 'hike'].includes(t)) return 'aerobic';
  return 'mixed';
}

export async function POST(request) {
  try {
    return await withTrace('strava_sync', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);

      // 1. Obtener credenciales guardadas
      let credentials = await getStravaCredentials(user.uid);
      if (!credentials) {
        return errorResponse('No se ha conectado la cuenta de Strava.', 400);
      }

      const clientId = process.env.STRAVA_CLIENT_ID;
      const clientSecret = process.env.STRAVA_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return errorResponse('La integración de Strava no está configurada en el servidor.', 500);
      }

      // 2. Refrescar token de acceso si ha expirado (o está cerca de expirar en 5 minutos)
      const nowSeconds = Math.round(Date.now() / 1000);
      if (nowSeconds >= credentials.expiresAt - 300) {
        logInfo('strava_token_refreshing', { traceId, userId: user.uid });

        const refreshResponse = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: credentials.refreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (!refreshResponse.ok) {
          const errBody = await refreshResponse.text();
          logError('strava_token_refresh_failed', new Error(errBody), { traceId, userId: user.uid });
          return errorResponse('Las credenciales de Strava son inválidas o han sido revocadas. Vuelve a conectar.', 400);
        }

        const refreshData = await refreshResponse.json();
        credentials = {
          ...credentials,
          accessToken: refreshData.access_token,
          refreshToken: refreshData.refresh_token,
          expiresAt: refreshData.expires_at,
          updatedAt: new Date().toISOString(),
        };

        await saveStravaCredentials(user.uid, credentials);
        logInfo('strava_token_refreshed_success', { traceId, userId: user.uid });
      }

      // 3. Consultar las últimas actividades (últimos 14 días)
      const lookbackSeconds = 14 * 24 * 60 * 60; // 14 días
      const afterTime = nowSeconds - lookbackSeconds;
      const activitiesUrl = `https://www.strava.com/api/v3/athlete/activities?after=${afterTime}&per_page=50`;

      logInfo('strava_fetch_activities_start', { traceId, userId: user.uid });

      const activitiesResponse = await fetch(activitiesUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
        },
      });

      if (!activitiesResponse.ok) {
        const errBody = await activitiesResponse.text();
        logError('strava_fetch_activities_failed', new Error(errBody), { traceId, userId: user.uid });
        return errorResponse('Fallo al obtener actividades de Strava.', activitiesResponse.status);
      }

      const activities = await activitiesResponse.json();
      logInfo('strava_fetch_activities_success', { traceId, userId: user.uid, count: activities.length });

      // 4. Mapear y guardar actividades en Firestore
      const syncedWorkouts = [];
      for (const activity of activities) {
        const perceived = Number(activity.perceived_exertion);
        const sessionRpe = Number.isFinite(perceived)
          ? perceived
          : activity.suffer_score
            ? Math.min(10, Math.max(1, Math.round(activity.suffer_score / 15)))
            : null;

        const durationMinutes = Math.round((activity.moving_time || activity.elapsed_time || 0) / 60);

        const noteParts = [
          activity.description || '',
          activity.distance ? `Distancia: ${(activity.distance / 1000).toFixed(2)} km` : '',
          activity.total_elevation_gain ? `Elevación acumulada: ${activity.total_elevation_gain} m` : '',
          activity.average_heartrate ? `Frecuencia cardíaca media: ${Math.round(activity.average_heartrate)} ppm` : '',
          activity.max_heartrate ? `Frecuencia cardíaca máx: ${Math.round(activity.max_heartrate)} ppm` : '',
        ].filter(Boolean);

        const workoutPayload = {
          id: `strava-${activity.id}`,
          source: 'strava',
          title: activity.name || 'Actividad de Strava',
          mode: mapSportType(activity.sport_type || activity.type),
          performedAt: activity.start_date || new Date().toISOString(),
          durationMinutes: Math.max(1, durationMinutes),
          sessionRpe,
          completed: true,
          notes: noteParts.join('\n') || null,
          exercises: [],
        };

        const saved = await createWorkout(user.uid, workoutPayload);
        syncedWorkouts.push(saved);
      }

      await upsertUserProfile(user.uid, {
        stravaLastSyncAt: new Date().toISOString(),
      });

      logInfo('strava_sync_complete', { traceId, userId: user.uid, syncedCount: syncedWorkouts.length });

      return jsonResponse({
        ok: true,
        syncedCount: syncedWorkouts.length,
        workouts: syncedWorkouts.map((w) => ({ id: w.id, title: w.title, performedAt: w.performedAt })),
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    logError('strava_sync_unhandled_error', error);
    return errorResponse('Error interno al sincronizar con Strava.', 500);
  }
}
