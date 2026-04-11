import { exportUserAccountData } from '../../../../lib/repositories/firestoreRepository.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../../lib/auth.js';
import { errorResponse } from '../../../../lib/http.js';
import { withTrace } from '../../../../lib/logger.js';

function sanitizeUserIdForFilename(value) {
  return String(value || 'user').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function GET(request) {
  try {
    return await withTrace('account_export', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      const exportData = await exportUserAccountData(user.uid);
      const exportedAt = new Date().toISOString();
      const safeUserId = sanitizeUserIdForFilename(user.uid);
      const safeDate = exportedAt.slice(0, 10);
      const filename = `endogym-export-${safeUserId}-${safeDate}.json`;

      const payload = {
        traceId,
        exportedAt,
        userId: user.uid,
        exportData,
      };

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
        },
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al exportar datos de la cuenta.', 500);
  }
}
