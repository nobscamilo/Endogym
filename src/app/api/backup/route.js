import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { withTrace, logError, logInfo } from '../../../lib/logger.js';
import { getAdminServices } from '../../../lib/firebaseAdmin.js';

// Backup programado de Firestore → bucket GCS (gs://endogym-vtety8-backups-eu, lifecycle 90 días).
// Lo invoca Vercel Cron (ver vercel.json); Vercel añade automáticamente
// `Authorization: Bearer ${CRON_SECRET}` cuando la env var CRON_SECRET existe.
// El export es una operación asíncrona del lado de Google: aquí solo se lanza.
// El service-account del Admin SDK tiene roles/datastore.importExportAdmin + objectAdmin del bucket.

const BACKUP_BUCKET = process.env.BACKUP_BUCKET || 'endogym-vtety8-backups-eu';

export async function GET(request) {
  return withTrace('firestore_backup', async ({ traceId }) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return errorResponse('Backup no configurado (falta CRON_SECRET).', 503);
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) return errorResponse('No autorizado.', 401);

    try {
      // Garantiza la inicialización del Admin SDK y toma su credencial para OAuth.
      await getAdminServices();
      const { getApps } = await import('firebase-admin/app');
      const app = getApps()[0];
      const token = await app.options.credential.getAccessToken();
      const projectId = process.env.FIREBASE_PROJECT_ID;

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputUriPrefix = `gs://${BACKUP_BUCKET}/auto/${stamp}`;
      const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ outputUriPrefix }),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`exportDocuments HTTP ${res.status}: ${detail.slice(0, 300)}`);
      }
      const op = await res.json();
      logInfo('firestore_backup_started', { traceId, outputUriPrefix, operation: op?.name || null });
      return jsonResponse({ ok: true, outputUriPrefix, operation: op?.name || null });
    } catch (error) {
      // logError dispara también la alerta por webhook (ALERT_WEBHOOK_URL) si está configurada.
      logError('firestore_backup_failed', error, { traceId });
      return errorResponse('No se pudo lanzar el backup.', 502);
    }
  });
}
