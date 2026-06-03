import { getAuthenticatedUser, AuthenticationError } from '../../../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../../../lib/http.js';
import { withTrace, logInfo } from '../../../../../lib/logger.js';
import { deleteStravaCredentials, upsertUserProfile } from '../../../../../lib/repositories/firestoreRepository.js';

export async function POST(request) {
  try {
    return await withTrace('strava_disconnect', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);

      await deleteStravaCredentials(user.uid);
      await upsertUserProfile(user.uid, {
        stravaConnected: false,
        stravaAthleteId: null,
      });
      logInfo('strava_disconnected_success', { traceId, userId: user.uid });

      return jsonResponse({ ok: true });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al desconectar con Strava.', 500);
  }
}
