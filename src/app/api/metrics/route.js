import { createMetricLog, listMetrics } from '../../../lib/repositories/firestoreRepository.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { withTrace } from '../../../lib/logger.js';

function parseLimit(searchParams) {
  const raw = searchParams.get('limit');
  if (raw == null) return 30;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return null;
  return limit;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isValidPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!payload.takenAt || typeof payload.takenAt !== 'string') return false;
  const hasAtLeastOneMetric =
    toNumber(payload.weightKg) != null
    || toNumber(payload.waistCm) != null
    || toNumber(payload.fastingGlucoseMgDl) != null;
  return hasAtLeastOneMetric;
}

export async function GET(request) {
  try {
    return await withTrace('metrics_list', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      const { searchParams } = new URL(request.url);
      const limit = parseLimit(searchParams);

      if (limit == null) {
        return errorResponse('Query param "limit" debe ser un entero entre 1 y 200.', 400);
      }

      const metrics = await listMetrics(user.uid, limit);
      return jsonResponse({ traceId, metrics }, 200);
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al listar métricas.', 500);
  }
}

export async function POST(request) {
  try {
    return await withTrace('metrics_create', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      let payload;

      try {
        payload = await request.json();
      } catch {
        return errorResponse('JSON inválido en body.', 400);
      }

      if (!isValidPayload(payload)) {
        return errorResponse('Payload inválido. Requiere takenAt y al menos una métrica válida.', 400);
      }

      const created = await createMetricLog(user.uid, {
        takenAt: payload.takenAt,
        weightKg: toNumber(payload.weightKg),
        waistCm: toNumber(payload.waistCm),
        fastingGlucoseMgDl: toNumber(payload.fastingGlucoseMgDl),
        notes: typeof payload.notes === 'string' ? payload.notes.trim() : null,
      });

      return jsonResponse({ traceId, metric: created }, 201);
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al registrar métricas.', 500);
  }
}
