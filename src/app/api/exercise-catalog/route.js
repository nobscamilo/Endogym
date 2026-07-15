// GET /api/exercise-catalog
//
// Catálogo COMPACTO de ejercicios (id, nombre, categoría, implemento, tipo de carga, músculo
// principal) para el buscador del editor retroactivo ("Registrar otro día" → añadir ejercicio).
// Se pide bajo demanda (solo al abrir el editor) para no engordar /api/studio-data. El catálogo
// es estático por build, así que la respuesta es cacheable en el cliente durante la sesión.

import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import { getExerciseLibraryCatalog } from '../../../core/exerciseLibrary.js';

export async function GET(request) {
  return withTrace('exercise_catalog', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    try {
      const exercises = getExerciseLibraryCatalog()
        .filter((e) => e && e.id && e.name)
        .map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category || null,
          equip: e.equipment || null,
          loadType: e.loadType || null,
          muscle: (Array.isArray(e.primaryMuscles) && e.primaryMuscles[0]) || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
      return jsonResponse({ ok: true, exercises });
    } catch (error) {
      logError('exercise_catalog_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo cargar el catálogo de ejercicios.', 500);
    }
  });
}
