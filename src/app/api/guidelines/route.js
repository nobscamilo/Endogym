import { getAdminServices } from '../../../lib/firebaseAdmin.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { withTrace } from '../../../lib/logger.js';

export async function GET(request) {
  try {
    return await withTrace('guideline_get', async ({ traceId }) => {
      // 1. Authenticate user
      await getAuthenticatedUser(request);

      // 2. Extract guideline ID
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');

      if (!id || typeof id !== 'string') {
        return errorResponse('Query param "id" es requerido.', 400);
      }

      // 3. Query Firestore
      const { db } = await getAdminServices();
      const docSnapshot = await db.collection('guidelines').doc(id).get();

      if (!docSnapshot.exists) {
        return errorResponse('Guía clínica no encontrada.', 404);
      }

      const data = docSnapshot.data();
      return jsonResponse({
        traceId,
        guideline: {
          id: docSnapshot.id,
          fileName: data.source?.fileName || 'Documento sin nombre',
          pages: data.pages || [],
        },
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    console.error('[guidelines GET] Unhandled error:', error?.message);
    return errorResponse('Error interno al obtener guía clínica.', 500);
  }
}
