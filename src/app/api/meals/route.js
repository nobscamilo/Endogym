import { createMeal, listMeals } from '../../../lib/repositories/firestoreRepository.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { withTrace } from '../../../lib/logger.js';

function parseLimit(searchParams) {
  const rawLimit = searchParams.get('limit');
  if (rawLimit == null) {
    return 20;
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }

  return limit;
}

const MAX_FOODS_PER_MEAL = 50;

function isValidMealPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!Array.isArray(payload.foods) || payload.foods.length === 0) return false;
  if (payload.foods.length > MAX_FOODS_PER_MEAL) return false;
  if (!payload.eatenAt || typeof payload.eatenAt !== 'string') return false;
  if (Number.isNaN(new Date(payload.eatenAt).getTime())) return false;
  if (!payload.totals || typeof payload.totals !== 'object') return false;
  return true;
}

export async function GET(request) {
  try {
    return await withTrace('meals_list', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      const { searchParams } = new URL(request.url);
      const limit = parseLimit(searchParams);

      if (limit == null) {
        return errorResponse('Query param "limit" debe ser un entero entre 1 y 100.', 400);
      }

      const meals = await listMeals(user.uid, limit);
      return jsonResponse({ traceId, meals });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al listar comidas.', 500);
  }
}

export async function POST(request) {
  try {
    return await withTrace('meals_create', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);

      let payload;
      try {
        payload = await request.json();
      } catch {
        return errorResponse('JSON inválido en body.', 400);
      }

      if (!isValidMealPayload(payload)) {
        return errorResponse('Payload inválido. Requiere foods[], eatenAt y totals.', 400);
      }

      const created = await createMeal(user.uid, payload);
      return jsonResponse({ traceId, meal: created }, 201);
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al crear comida.', 500);
  }
}
