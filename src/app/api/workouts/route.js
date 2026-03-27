import { createWorkout, listWorkouts } from '../../../lib/repositories/firestoreRepository.js';
import { getAuthenticatedUser } from '../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { withTrace } from '../../../lib/logger.js';

export async function GET(request) {
  return withTrace('workouts_list', async ({ traceId }) => {
    try {
      const user = await getAuthenticatedUser(request);
      const { searchParams } = new URL(request.url);
      const limit = Number(searchParams.get('limit') ?? 20);
      const workouts = await listWorkouts(user.uid, Math.min(Math.max(limit, 1), 100));
      return jsonResponse({ traceId, workouts });
    } catch (error) {
      return errorResponse(error.message, 401);
    }
  });
}

export async function POST(request) {
  return withTrace('workouts_create', async ({ traceId }) => {
    try {
      const user = await getAuthenticatedUser(request);
      const payload = await request.json();

      if (!payload.title || !payload.mode || !payload.performedAt) {
        return errorResponse('Payload inválido. Requiere title, mode y performedAt.', 400);
      }

      const workout = await createWorkout(user.uid, payload);
      return jsonResponse({ traceId, workout }, 201);
    } catch (error) {
      return errorResponse(error.message, 401);
    }
  });
}
