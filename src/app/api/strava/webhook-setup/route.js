import { jsonResponse, errorResponse } from '../../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../../lib/auth.js';
import { withTrace, logError } from '../../../../lib/logger.js';
import { isStravaConfigured } from '../../../../services/stravaClient.js';

// Registra (una sola vez) la suscripción push de Strava apuntando a /api/strava/webhook.
// Requiere sesión. Strava validará el callback con un GET hub.challenge en el momento.
export async function POST(request) {
  return withTrace('strava_webhook_setup', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }
    if (!isStravaConfigured()) return errorResponse('Strava no está configurado en el servidor.', 503);

    const origin = new URL(request.url).origin;
    const callbackUrl = `${origin}/api/strava/webhook`;
    const verifyTok = process.env.STRAVA_VERIFY_TOKEN || process.env.STRAVA_STATE_SECRET || 'ignios-strava';

    try {
      const formBody = new URLSearchParams({
        client_id: String(process.env.STRAVA_CLIENT_ID || ''),
        client_secret: String(process.env.STRAVA_CLIENT_SECRET || ''),
        callback_url: callbackUrl,
        verify_token: verifyTok,
      });
      const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Strava devuelve error si ya existe una suscripción (solo se permite una por app).
        logError('strava_webhook_setup_http', new Error(`HTTP ${res.status}`), { traceId, userId: user.uid, detail: JSON.stringify(data).slice(0, 300) });
        return jsonResponse({ ok: false, status: res.status, detail: data, callbackUrl }, 200);
      }
      return jsonResponse({ ok: true, subscriptionId: data.id ?? null, callbackUrl });
    } catch (error) {
      logError('strava_webhook_setup_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo crear la suscripción del webhook.', 502);
    }
  });
}
