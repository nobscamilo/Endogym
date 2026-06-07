import { jsonResponse, errorResponse } from '../../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../../lib/auth.js';
import { withTrace, logError } from '../../../../lib/logger.js';
import { ensureFreshToken, getActivities, mapActivityToWorkout } from '../../../../services/stravaClient.js';
import { getStravaConnection, saveStravaConnection, createWorkout } from '../../../../lib/repositories/firestoreRepository.js';

export const maxDuration = 30;

// Importa las actividades recientes de Strava como workouts (idempotente por id de actividad).
export async function POST(request) {
  return withTrace('strava_sync', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    const conn = await getStravaConnection(user.uid).catch(() => null);
    if (!conn || !conn.refreshToken) return errorResponse('Strava no conectado.', 409);

    try {
      const { accessToken, refreshed } = await ensureFreshToken(conn);
      if (refreshed) await saveStravaConnection(user.uid, refreshed);

      // Importa desde el último sync (o últimos 30 días la primera vez).
      const lastEpoch = Number(conn.lastSyncEpoch) || Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
      const activities = await getActivities(accessToken, { afterEpoch: lastEpoch, perPage: 50 });

      let imported = 0;
      let withHr = 0;
      let maxStart = lastEpoch;
      for (const a of Array.isArray(activities) ? activities : []) {
        const payload = mapActivityToWorkout(a);
        await createWorkout(user.uid, payload).catch(() => null);
        imported += 1;
        if (payload.avgHeartRate) withHr += 1;
        const startEpoch = a.start_date ? Math.floor(new Date(a.start_date).getTime() / 1000) : 0;
        if (startEpoch > maxStart) maxStart = startEpoch;
      }

      await saveStravaConnection(user.uid, { lastSyncAt: new Date().toISOString(), lastSyncEpoch: maxStart });
      return jsonResponse({ ok: true, imported, withHeartRate: withHr });
    } catch (error) {
      logError('strava_sync_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo sincronizar con Strava.', 502);
    }
  });
}
