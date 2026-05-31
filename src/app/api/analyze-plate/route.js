import crypto from 'node:crypto';
import { analyzePlateWithGemini } from '../../../services/geminiPlateAnalyzer.js';
import { callGeminiPlateModel, isGeminiConfigured, resolveGeminiPlateModel } from '../../../services/geminiClient.js';
import { sanitizeGoogleAiModelNameForLog } from '../../../services/googleGenAiTransport.js';
import { evaluateMealAdherence } from '../../../core/adherence.js';
import { createMeal, getLatestWeeklyPlan, getUserProfile } from '../../../lib/repositories/firestoreRepository.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { getAdminServices } from '../../../lib/firebaseAdmin.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { logError, logInfo, withTrace } from '../../../lib/logger.js';
import { enforceUserRateLimit, getRateLimitHeaders, RATE_LIMIT_SCOPES } from '../../../lib/rateLimit.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function normalizeImageContentType(contentType) {
  const normalized = String(contentType || '').trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function normalizeBase64Image(imageBase64) {
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
    return null;
  }

  const trimmed = imageBase64.trim();
  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (dataUrlMatch) {
    return {
      declaredContentType: normalizeImageContentType(dataUrlMatch[1]),
      rawBase64: dataUrlMatch[2],
    };
  }

  return {
    declaredContentType: null,
    rawBase64: trimmed,
  };
}

function decodeBase64ToBuffer(rawBase64) {
  try {
    const normalized = String(rawBase64 || '').replace(/\s+/g, '');
    if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
      return null;
    }

    const buffer = Buffer.from(normalized, 'base64');
    if (!buffer.length) return null;
    return buffer;
  } catch {
    return null;
  }
}

function detectImageContentType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

function getFileExtension(contentType) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

async function uploadPlateImage({ userId, imageBuffer, contentType, traceId }) {
  const { storage } = await getAdminServices();
  const bucket = storage.bucket();
  const extension = getFileExtension(contentType);
  const filePath = `plates/${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const file = bucket.file(filePath);

  await file.save(imageBuffer, {
    contentType,
    metadata: {
      metadata: { traceId },
    },
  });

  return filePath;
}

async function tryUploadPlateImage(args) {
  try {
    return {
      storagePath: await uploadPlateImage(args),
      storageWarning: null,
    };
  } catch (error) {
    return {
      storagePath: null,
      storageWarning: `No se pudo guardar la foto del plato: ${error.message}`,
    };
  }
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

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  return [];
}

function buildPromptContext({ payloadContext = {}, profile, todayPlanTarget }) {
  const preferences = profile?.nutritionPreferences || {};
  const legalConsents = profile?.legalConsents || {};

  return {
    ...payloadContext,
    goal: profile?.goal || null,
    metabolicProfile: profile?.metabolicProfile || null,
    activityLevel: profile?.activityLevel || null,
    trainingModality: profile?.trainingModality || null,
    dietaryPattern: preferences.dietaryPattern || null,
    allergies: normalizeStringArray(preferences.allergies),
    intolerances: normalizeStringArray(preferences.intolerances),
    dislikedFoods: normalizeStringArray(preferences.dislikedFoods),
    hasHealthDataConsent: Boolean(legalConsents.dataProcessingAccepted),
    todayNutritionTarget: todayPlanTarget,
  };
}

export async function POST(request) {
  try {
    return await withTrace('plate_analysis', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      const rateLimit = await enforceUserRateLimit({
        userId: user.uid,
        scope: RATE_LIMIT_SCOPES.PLATE_ANALYSIS,
      });
      const rateLimitHeaders = getRateLimitHeaders(rateLimit);

      if (!rateLimit.allowed) {
        logInfo('rate_limit_exceeded', {
          traceId,
          userId: user.uid,
          scope: RATE_LIMIT_SCOPES.PLATE_ANALYSIS,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
        return errorResponse(
          'Demasiados análisis de plato. Espera antes de volver a intentarlo.',
          429,
          { retryAfterSeconds: rateLimit.retryAfterSeconds },
          rateLimitHeaders
        );
      }

      let payload;

      try {
        payload = await request.json();
      } catch {
        return errorResponse('JSON inválido en body.', 400);
      }

      const image = normalizeBase64Image(payload.imageBase64);

      if (!image) {
        return errorResponse('Falta imageBase64 en el payload.', 400);
      }

      const imageBuffer = decodeBase64ToBuffer(image.rawBase64);
      if (!imageBuffer) {
        return errorResponse('imageBase64 inválido.', 400);
      }

      if (imageBuffer.length > MAX_IMAGE_BYTES) {
        return errorResponse('La imagen supera el límite de 5MB.', 413);
      }

      const contentType = detectImageContentType(imageBuffer);
      if (!contentType) {
        logInfo('plate_image_rejected', {
          traceId,
          userId: user.uid,
          reason: 'unsupported_signature',
        });
        return errorResponse('Formato de imagen no soportado. Usa JPEG, PNG o WEBP.', 400);
      }

      if (image.declaredContentType && !SUPPORTED_IMAGE_TYPES.has(image.declaredContentType)) {
        logInfo('plate_image_rejected', {
          traceId,
          userId: user.uid,
          reason: 'unsupported_content_type',
        });
        return errorResponse('Content-Type de imagen no soportado. Usa JPEG, PNG o WEBP.', 400);
      }

      if (image.declaredContentType && image.declaredContentType !== contentType) {
        logInfo('plate_image_rejected', {
          traceId,
          userId: user.uid,
          reason: 'content_type_mismatch',
        });
        return errorResponse('El Content-Type declarado no coincide con la firma real de la imagen.', 400);
      }

      const [weeklyPlan, profile] = await Promise.all([getLatestWeeklyPlan(user.uid), getUserProfile(user.uid)]);
      const todayPlanTarget = weeklyPlan?.days?.find((day) => day.date === new Date().toISOString().slice(0, 10))?.nutritionTarget ?? null;
      const promptContext = buildPromptContext({
        payloadContext: payload.context,
        profile,
        todayPlanTarget,
      });

      const { storagePath, storageWarning } = await tryUploadPlateImage({
        userId: user.uid,
        imageBuffer,
        contentType,
        traceId,
      });

      const forceMock = parseBoolean(process.env.GEMINI_FORCE_MOCK, false);
      const fallbackEnabled = parseBoolean(process.env.GEMINI_FALLBACK_TO_MOCK, true);
      let modelSource = 'mock';
      let fallbackReason = null;
      let modelResolved = null;
      const modelRequested = sanitizeGoogleAiModelNameForLog(resolveGeminiPlateModel());

      const callModel = async ({ imageBase64, promptContext: modelPromptContext }) => {
        if (forceMock || !isGeminiConfigured()) {
          fallbackReason = forceMock
            ? 'GEMINI_FORCE_MOCK activo. Se omitió Gemini y se aplicó estimación heurística.'
            : 'Gemini no está configurado. Se aplicó estimación heurística.';
          return callGeminiMock({ promptContext: modelPromptContext });
        }

        try {
          const modelOutput = await callGeminiPlateModel({
            imageBase64,
            contentType,
            promptContext: modelPromptContext,
            nutritionTargets: todayPlanTarget,
            traceId,
          });
          modelSource = 'gemini';
          modelResolved = sanitizeGoogleAiModelNameForLog(modelOutput?.diagnostics?.modelResolved ?? modelRequested);
          return modelOutput;
        } catch (error) {
          logError('gemini_call_failed', error, { traceId, userId: user.uid });
          if (!fallbackEnabled) {
            throw new Error('Falló la inferencia del modelo Gemini y el fallback está desactivado.');
          }
          fallbackReason = 'Gemini falló durante el análisis del plato. Se aplicó fallback heurístico.';
          return callGeminiMock({ promptContext });
        }
      };

      const analysis = await analyzePlateWithGemini({
        imageBase64: image.rawBase64,
        promptContext,
        callModel,
      });

      const eatenAt = payload.eatenAt ?? new Date().toISOString();
      const adherence = evaluateMealAdherence({
        mealTotals: analysis.totals,
        weeklyPlan,
        eatenAt,
      });

      const mealRecord = await createMeal(user.uid, {
        foods: analysis.foods,
        totals: analysis.totals,
        eatenAt,
        source: 'ai',
        planId: weeklyPlan?.id ?? null,
        adherence,
        aiAnalysis: {
          modelSource,
          confidence: analysis.confidence,
          notes: analysis.notes,
          fallbackApplied: Boolean(fallbackReason),
          storageWarning,
        },
      });

      logInfo('plate_analysis_result', {
        traceId,
        userId: user.uid,
        mealId: mealRecord.id,
        modelSource,
        modelRequested,
        modelResolved,
        fallbackApplied: Boolean(fallbackReason),
        storageSaved: Boolean(storagePath),
        storageWarning: Boolean(storageWarning),
      });

      return jsonResponse(
        {
          traceId,
          storagePath,
          model: {
            source: modelSource,
            mode: modelSource === 'gemini' ? 'live' : fallbackReason ? 'fallback' : 'heuristic',
            configured: isGeminiConfigured(),
            fallbackApplied: Boolean(fallbackReason),
            requestedModel: modelRequested,
            modelResolved,
            fallbackReason,
          },
          analysis,
          adherence,
          planRef: weeklyPlan ? { id: weeklyPlan.id, startDate: weeklyPlan.startDate, endDate: weeklyPlan.endDate } : null,
          meal: mealRecord,
          warning: [fallbackReason, storageWarning].filter(Boolean).join(' · ') || null,
        },
        201,
        rateLimitHeaders
      );
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno durante el análisis del plato.', 500);
  }
}
