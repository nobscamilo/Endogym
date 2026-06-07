import { withTrace, logError } from '../../../../lib/logger.js';
import { verifyState, exchangeCode } from '../../../../services/stravaClient.js';
import { saveStravaConnection } from '../../../../lib/repositories/firestoreRepository.js';

// Callback de OAuth de Strava: valida el state firmado, canjea el code por tokens y los guarda.
// Luego redirige a la app ("/?strava=..."). Es una navegación de página completa (no fetch).
export async function GET(request) {
  return withTrace('strava_callback', async ({ traceId }) => {
    const url = new URL(request.url);
    const back = (status) => Response.redirect(new URL(`/?strava=${status}`, url.origin).toString(), 302);

    const error = url.searchParams.get('error');
    if (error) return back('denied');

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const uid = verifyState(state);
    if (!code || !uid) return back('error');

    try {
      const redirectUri = `${url.origin}/api/strava/callback`;
      const t = await exchangeCode(code, redirectUri);
      await saveStravaConnection(uid, {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: t.expires_at,
        athleteId: t.athlete?.id ?? null,
        scope: 'read,activity:read',
        connectedAt: new Date().toISOString(),
      });
      return back('ok');
    } catch (e) {
      logError('strava_callback_failed', e, { traceId, userId: uid });
      return back('error');
    }
  });
}
