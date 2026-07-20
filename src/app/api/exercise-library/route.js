// GET /api/exercise-library            → índice compacto (873 entradas) + base de medios.
// GET /api/exercise-library?id=<fedId> → ficha completa (pasos ES, músculos, fotos).
//
// Biblioteca NAVEGABLE (Fase 2 de guías visuales): contenido de consulta procedente de
// free-exercise-db (dominio público), traducido. NO es el catálogo prescribible: el planner
// no elige de aquí (eso es la Fase 3, con curación clínica por lotes).
import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import {
  EXERCISE_MEDIA_BASE,
  getExerciseLibraryEntry,
  listExerciseLibraryIndex,
} from '../../../services/exerciseLibraryStore.js';

export async function GET(request) {
  return withTrace('exercise_library', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    try {
      const id = new URL(request.url).searchParams.get('id');
      if (id) {
        const entry = await getExerciseLibraryEntry(id);
        if (!entry) return errorResponse('Ejercicio no encontrado.', 404);
        return jsonResponse({ ok: true, exercise: entry });
      }
      const exercises = await listExerciseLibraryIndex();
      // Contenido estático tras la ingesta: el cliente puede cachearlo durante la sesión.
      return jsonResponse({ ok: true, mediaBase: EXERCISE_MEDIA_BASE, exercises }, 200, {
        'cache-control': 'private, max-age=3600',
      });
    } catch (error) {
      logError('exercise_library_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo cargar la biblioteca de ejercicios.', 500);
    }
  });
}
