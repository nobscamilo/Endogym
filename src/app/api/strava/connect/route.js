import { jsonResponse, errorResponse } from '../../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../../lib/auth.js';
import { withTrace } from '../../../../lib/logger.js';
import { isStravaConfigured, signState, buildAuthorizeUrl } from '../../../../services/stravaClient.js';

// Devuelve la URL de autorización de Strava para el usuario autenticado. El frontend la abre
// en la ventana superior; Strava redirige luego a /api/strava/callback.
export async function GET(request) {
  return withTrace('strava_connect', async () => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }
    if (!isStravaConfigured()) return errorResponse('Strava no está configurado en el servidor.', 503);

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/strava/callback`;
    const url = buildAuthorizeUrl({ state: signState(user.uid), redirectUri });
    return jsonResponse({ ok: true, url });
  });
}
