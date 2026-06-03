import { getAuthenticatedUser, AuthenticationError } from '../../../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../../../lib/http.js';
import { withTrace, logError, logInfo } from '../../../../../lib/logger.js';
import { saveStravaCredentials, upsertUserProfile } from '../../../../../lib/repositories/firestoreRepository.js';

export async function POST(request) {
  try {
    return await withTrace('strava_connect', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);

      let payload = {};
      try {
        payload = await request.json();
      } catch {
        return errorResponse('Cuerpo de solicitud inválido.', 400);
      }

      const { code } = payload;
      if (!code) {
        return errorResponse('El parámetro "code" es obligatorio.', 400);
      }

      const clientId = process.env.STRAVA_CLIENT_ID;
      const clientSecret = process.env.STRAVA_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return errorResponse('La integración de Strava no está configurada en el servidor.', 500);
      }

      logInfo('strava_token_exchange_start', { traceId, userId: user.uid });

      const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logError('strava_token_exchange_failed', new Error(errorBody), { traceId, userId: user.uid });
        return errorResponse('Fallo al intercambiar token con Strava.', response.status);
      }

      const data = await response.json();
      const credentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at, // timestamp en segundos (epoch)
        athleteId: String(data.athlete?.id || ''),
      };

      await saveStravaCredentials(user.uid, credentials);
      await upsertUserProfile(user.uid, {
        stravaConnected: true,
        stravaAthleteId: credentials.athleteId,
        stravaLastSyncAt: new Date().toISOString()
      });

      logInfo('strava_connected_success', { traceId, userId: user.uid, athleteId: credentials.athleteId });

      return jsonResponse({ ok: true, athleteId: credentials.athleteId });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    logError('strava_connect_unhandled', error);
    return errorResponse('Error interno al conectar con Strava.', 500);
  }
}
