import { deleteUserAccountData } from '../../../../lib/repositories/firestoreRepository.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../../lib/auth.js';
import { getAdminServices } from '../../../../lib/firebaseAdmin.js';
import { errorResponse, jsonResponse } from '../../../../lib/http.js';
import { withTrace } from '../../../../lib/logger.js';

const REQUIRED_CONFIRM_TEXT = 'ELIMINAR MI CUENTA';

export async function DELETE(request) {
  try {
    return await withTrace('account_delete', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      let payload = {};

      try {
        payload = await request.json();
      } catch {
        payload = {};
      }

      const confirmText = String(payload.confirmText || '').trim();
      if (confirmText !== REQUIRED_CONFIRM_TEXT) {
        return errorResponse('Confirmación inválida. Revisa el texto de confirmación requerido.', 400);
      }

      const recentAuth = request.headers.get('x-recent-auth-token');
      if (!user.dev && !recentAuth) {
        return errorResponse('Debes re-autenticarte antes de eliminar tu cuenta.', 403);
      }

      const purge = await deleteUserAccountData(user.uid);
      let authDeleted = false;

      if (!user.dev) {
        const { auth } = await getAdminServices();
        try {
          await auth.deleteUser(user.uid);
          authDeleted = true;
        } catch (error) {
          if (error?.code === 'auth/user-not-found') {
            authDeleted = true;
          } else {
            throw error;
          }
        }
      }

      return jsonResponse({
        traceId,
        deleted: true,
        authDeleted,
        purge,
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al eliminar la cuenta.', 500);
  }
}
