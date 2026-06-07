import { logError, logInfo } from '../../../../lib/logger.js';
import { ensureFreshToken, mapActivityToWorkout } from '../../../../services/stravaClient.js';
import { getUserByStravaAthlete, saveStravaConnection, createWorkout } from '../../../../lib/repositories/firestoreRepository.js';

function verifyToken() {
  return process.env.STRAVA_VERIFY_TOKEN || process.env.STRAVA_STATE_SECRET || 'ignios-strava';
}

// Validación de la suscripción del webhook (Strava hace un GET con hub.challenge).
export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === verifyToken() && challenge) {
    return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('forbidden', { status: 403 });
}

// Eventos de Strava: al crear/actualizar una actividad, importamos esa actividad para el
// usuario dueño de esa cuenta (aislado por athleteId). Respondemos 200 siempre y rápido.
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return new Response('ok', { status: 200 }); }

  try {
    if (body && body.object_type === 'activity' && (body.aspect_type === 'create' || body.aspect_type === 'update')) {
      const found = await getUserByStravaAthlete(body.owner_id);
      if (found && found.connection) {
        const { accessToken, refreshed } = await ensureFreshToken(found.connection);
        if (refreshed) await saveStravaConnection(found.uid, refreshed);
        const r = await fetch(`https://www.strava.com/api/v3/activities/${body.object_id}`, {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) {
          const a = await r.json();
          await createWorkout(found.uid, mapActivityToWorkout(a));
          logInfo('strava_webhook_import', { userId: found.uid, activityId: body.object_id });
        }
      }
    }
  } catch (e) {
    logError('strava_webhook_failed', e, {});
  }
  return new Response('ok', { status: 200 });
}
