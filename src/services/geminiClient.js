import { buildPlateAnalysisPrompt } from './platePrompt.js';
import { isGoogleAiConfigured, requestGoogleGenerateContent } from './googleGenAiTransport.js';

const PLATE_SCHEMA = {
  type: 'object',
  required: ['foods', 'confidence', 'notes'],
  properties: {
    foods: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'name',
          'calories',
          'proteinGrams',
          'carbsGrams',
          'fatGrams',
          'availableCarbsGrams',
          'glycemicIndex',
          'processedLevel',
        ],
        properties: {
          name: { type: 'string' },
          calories: { type: 'number' },
          proteinGrams: { type: 'number' },
          carbsGrams: { type: 'number' },
          fatGrams: { type: 'number' },
          availableCarbsGrams: { type: 'number' },
          glycemicIndex: { type: 'number' },
          processedLevel: { type: 'number' },
        },
      },
    },
    confidence: { type: 'number' },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Respuesta vacía del modelo.');
  }

  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '');
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('No se encontró JSON válido en la respuesta del modelo.');
  }

  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}

function sanitizeModelPayload(payload) {
  const foodsInput = Array.isArray(payload?.foods) ? payload.foods : [];
  const foods = foodsInput
    .map((food, index) => {
      const name = typeof food?.name === 'string' && food.name.trim() ? food.name.trim() : `Alimento ${index + 1}`;
      const calories = Math.max(0, Math.round(toFiniteNumber(food?.calories)));
      const proteinGrams = Math.max(0, toFiniteNumber(food?.proteinGrams));
      const carbsGrams = Math.max(0, toFiniteNumber(food?.carbsGrams));
      const fatGrams = Math.max(0, toFiniteNumber(food?.fatGrams));
      const availableCarbsGrams = Math.max(0, toFiniteNumber(food?.availableCarbsGrams, carbsGrams));
      const glycemicIndex = clamp(Math.round(toFiniteNumber(food?.glycemicIndex)), 0, 100);
      const processedLevel = clamp(Math.round(toFiniteNumber(food?.processedLevel, 1)), 0, 4);

      return {
        name,
        calories,
        proteinGrams,
        carbsGrams,
        fatGrams,
        availableCarbsGrams,
        glycemicIndex,
        processedLevel,
      };
    })
    .filter((food) => food.name && food.calories + food.proteinGrams + food.carbsGrams + food.fatGrams > 0);

  if (!foods.length) {
    throw new Error('El modelo no devolvió alimentos útiles.');
  }

  const confidence = clamp(toFiniteNumber(payload?.confidence, 0.5), 0, 1);
  const notes = Array.isArray(payload?.notes)
    ? payload.notes.filter((note) => typeof note === 'string' && note.trim()).map((note) => note.trim())
    : [];

  return {
    foods,
    confidence,
    notes,
  };
}

export function isGeminiConfigured() {
  return isGoogleAiConfigured();
}

export function resolveGeminiPlateModel() {
  return process.env.GEMINI_MODEL_PLATE || process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
}

export async function callGeminiPlateModel({
  imageBase64,
  contentType = 'image/jpeg',
  promptContext = {},
  nutritionTargets = null,
  traceId,
}) {
  const model = resolveGeminiPlateModel();
  const prompt = buildPlateAnalysisPrompt({ promptContext, nutritionTargets });

  const { backend, response } = await requestGoogleGenerateContent({
    model,
    traceId,
    parts: [
      { text: prompt },
      {
        inlineData: {
          mimeType: contentType,
          data: imageBase64,
        },
      },
    ],
    generationConfig: {
      temperature: 0.2,
      topK: 32,
      topP: 0.9,
      responseMimeType: 'application/json',
      responseJsonSchema: PLATE_SCHEMA,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google AI API error (${response.status}): ${errorBody.slice(0, 400)}`);
  }

  const data = await response.json();
  const textPart = data?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === 'string')?.text;
  const parsed = extractJson(textPart);
  const sanitized = sanitizeModelPayload(parsed);

  return {
    ...sanitized,
    diagnostics: {
      backend,
      modelRequested: model,
      modelResolved: typeof data?.modelVersion === 'string' ? data.modelVersion : model,
      candidateCount: Array.isArray(data?.candidates) ? data.candidates.length : 0,
      generatedAt: new Date().toISOString(),
    },
  };
}
