import crypto from 'node:crypto';
import { analyzePlateWithGemini } from '../../../services/geminiPlateAnalyzer.js';
import { createMeal } from '../../../lib/repositories/firestoreRepository.js';
import { getAuthenticatedUser } from '../../../lib/auth.js';
import { getAdminServices } from '../../../lib/firebaseAdmin.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { withTrace } from '../../../lib/logger.js';

async function uploadPlateImage({ userId, imageBase64, traceId }) {
  const { storage } = getAdminServices();
  const bucket = storage.bucket();
  const filePath = `plates/${userId}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  const file = bucket.file(filePath);

  await file.save(Buffer.from(imageBase64, 'base64'), {
    contentType: 'image/jpeg',
    metadata: {
      metadata: { traceId },
    },
  });

  return filePath;
}

async function callGeminiMock({ promptContext }) {
  const dish = promptContext?.dish || 'Plato detectado';
  return {
    confidence: 0.74,
    notes: ['Estimación inicial; ajustar porciones manualmente.'],
    foods: [
      {
        name: dish,
        calories: 520,
        proteinGrams: 33,
        carbsGrams: 48,
        fatGrams: 21,
        availableCarbsGrams: 40,
        glycemicIndex: 52,
        processedLevel: 1,
      },
    ],
  };
}

export async function POST(request) {
  return withTrace('plate_analysis', async ({ traceId }) => {
    try {
      const user = await getAuthenticatedUser(request);
      const payload = await request.json();
      const imageBase64 = payload.imageBase64;

      if (!imageBase64) {
        return errorResponse('Falta imageBase64 en el payload.', 400);
      }

      const storagePath = await uploadPlateImage({ userId: user.uid, imageBase64, traceId });

      const analysis = await analyzePlateWithGemini({
        imageBase64,
        promptContext: payload.context,
        callModel: callGeminiMock,
      });

      const mealRecord = await createMeal(user.uid, {
        foods: analysis.foods,
        totals: analysis.totals,
        eatenAt: payload.eatenAt ?? new Date().toISOString(),
        source: 'ai',
      });

      return jsonResponse(
        {
          traceId,
          storagePath,
          analysis,
          meal: mealRecord,
          warning:
            'Actualmente se usa un mock de Gemini. Conecta GEMINI_API_KEY y un cliente real para producción.',
        },
        201
      );
    } catch (error) {
      return errorResponse(error.message, 500);
    }
  });
}
