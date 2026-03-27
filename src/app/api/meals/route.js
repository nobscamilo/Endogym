import { createMeal, listMeals } from '../../../lib/repositories/firestoreRepository.js';
import { getAuthenticatedUser } from '../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { withTrace } from '../../../lib/logger.js';

export async function GET(request) {
  return withTrace('meals_list', async ({ traceId }) => {
    try {
      const user = await getAuthenticatedUser(request);
      const { searchParams } = new URL(request.url);
      const limit = Number(searchParams.get('limit') ?? 20);
      const meals = await listMeals(user.uid, Math.min(Math.max(limit, 1), 100));
      return jsonResponse({ traceId, meals });
    } catch (error) {
      return errorResponse(error.message, 401);
    }
  });
}

export async function POST(request) {
  return withTrace('meals_create', async ({ traceId }) => {
    try {
      const user = await getAuthenticatedUser(request);
      const payload = await request.json();

      if (!Array.isArray(payload.foods) || !payload.eatenAt || !payload.totals) {
        return errorResponse('Payload inválido. Requiere foods[], eatenAt y totals.', 400);
      }

      const created = await createMeal(user.uid, payload);
      return jsonResponse({ traceId, meal: created }, 201);
    } catch (error) {
      return errorResponse(error.message, 401);
    }
  });
}
