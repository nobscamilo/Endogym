import { buildExerciseCoachPrompt } from './exerciseCoachPrompt.js';
import { isGoogleAiConfigured, requestGoogleGenerateContent, resolveGoogleAiBackend } from './googleGenAiTransport.js';
const RETRIABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MAX_ERROR_SNIPPET = 500;

const COACH_SCHEMA = {
  type: 'object',
  required: ['coachSummary', 'acsmJustification', 'prescriptionAdjustments', 'riskFlags', 'medicalDisclaimer'],
  properties: {
    coachSummary: { type: 'string' },
    acsmJustification: { type: 'string' },
    prescriptionAdjustments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['day', 'adjustment', 'rationale', 'evidence'],
        properties: {
          day: { type: 'string' },
          adjustment: { type: 'string' },
          rationale: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    riskFlags: {
      type: 'array',
      items: { type: 'string' },
    },
    medicalDisclaimer: { type: 'string' },
  },
};

export class GeminiCoachError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'GeminiCoachError';
    this.code = details.code || 'GEMINI_COACH_ERROR';
    this.statusCode = Number.isInteger(details.statusCode) ? details.statusCode : null;
    this.attempt = Number.isInteger(details.attempt) ? details.attempt : null;
    this.maxAttempts = Number.isInteger(details.maxAttempts) ? details.maxAttempts : null;
    this.model = details.model || null;
    this.details = details.details || null;
    this.cause = details.cause;
  }
}

function toPositiveInteger(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFence(text) {
  return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '');
}

function tryParseJson(rawText) {
  const sanitizedText = stripCodeFence(rawText);

  try {
    return JSON.parse(sanitizedText);
  } catch {}

  const firstBrace = sanitizedText.indexOf('{');
  const lastBrace = sanitizedText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    const candidate = sanitizedText.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}

    const repaired = candidate
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');

    return JSON.parse(repaired);
  }

  throw new Error('No se encontró JSON válido en la respuesta del modelo.');
}

function extractJsonFromResponse(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (typeof part?.text !== 'string' || !part.text.trim()) continue;
      try {
        return tryParseJson(part.text);
      } catch {}
    }
  }

  throw new Error('La respuesta de Gemini no incluyó JSON parseable en candidates[].content.parts[].text.');
}

function extractReadableErrorBody(rawText, statusCode) {
  if (typeof rawText !== 'string' || !rawText.trim()) return `status=${statusCode}`;
  try {
    const parsed = JSON.parse(rawText);
    const message = parsed?.error?.message || parsed?.message;
    if (typeof message === 'string' && message.trim()) {
      return `${message.trim().slice(0, MAX_ERROR_SNIPPET)} (status=${statusCode})`;
    }
  } catch {}
  return rawText.trim().slice(0, MAX_ERROR_SNIPPET);
}

function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Respuesta vacía del modelo.');
  }
  return tryParseJson(text);
}

function sanitizeCoachPayload(payload) {
  return {
    coachSummary:
      typeof payload?.coachSummary === 'string' && payload.coachSummary.trim()
        ? payload.coachSummary.trim()
        : 'Sin resumen disponible.',
    acsmJustification:
      typeof payload?.acsmJustification === 'string' && payload.acsmJustification.trim()
        ? payload.acsmJustification.trim()
        : 'Sin justificación ACSM explícita.',
    prescriptionAdjustments: Array.isArray(payload?.prescriptionAdjustments)
      ? payload.prescriptionAdjustments
        .filter(
          (item) =>
            typeof item?.day === 'string'
            && typeof item?.adjustment === 'string'
            && typeof item?.rationale === 'string'
            && typeof item?.evidence === 'string'
        )
        .map((item) => ({
          day: item.day.trim(),
          adjustment: item.adjustment.trim(),
          rationale: item.rationale.trim(),
          evidence: item.evidence.trim(),
        }))
      : [],
    riskFlags: Array.isArray(payload?.riskFlags)
      ? payload.riskFlags.filter((flag) => typeof flag === 'string' && flag.trim()).map((flag) => flag.trim())
      : [],
    medicalDisclaimer:
      typeof payload?.medicalDisclaimer === 'string' && payload.medicalDisclaimer.trim()
        ? payload.medicalDisclaimer.trim()
        : 'Este contenido no reemplaza valoración médica individual.',
  };
}

function validateCoachPayload(payload) {
  if (!payload.coachSummary || !payload.acsmJustification) {
    throw new Error('La respuesta del coach no incluyó resumen/justificación.');
  }

  if (!Array.isArray(payload.prescriptionAdjustments) || payload.prescriptionAdjustments.length === 0) {
    throw new Error('La respuesta del coach no incluyó ajustes accionables.');
  }
}

export function isGeminiConfigured() {
  return isGoogleAiConfigured();
}

export function resolveGeminiCoachModel() {
  if (process.env.GEMINI_MODEL_COACH || process.env.GEMINI_MODEL) {
    return process.env.GEMINI_MODEL_COACH || process.env.GEMINI_MODEL;
  }

  return 'gemini-3.1-pro-preview';
}

export async function callGeminiExerciseCoach({ profile, weeklyPlan, traceId }) {
  if (!isGeminiConfigured()) {
    throw new GeminiCoachError('No existe configuración de Google AI ni Vertex AI.', {
      code: 'GEMINI_COACH_NOT_CONFIGURED',
    });
  }

  const model = resolveGeminiCoachModel();
  const prompt = buildExerciseCoachPrompt({ profile, weeklyPlan });
  const maxRetries = toPositiveInteger(process.env.GEMINI_COACH_MAX_RETRIES, 2, 0, 5);
  const retryBaseMs = toPositiveInteger(process.env.GEMINI_COACH_RETRY_BASE_MS, 350, 100, 5_000);
  const maxAttempts = maxRetries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { backend, response } = await requestGoogleGenerateContent({
        model,
        traceId,
        parts: [{ text: prompt }],
        generationConfig: {
          temperature: 0.2,
          topK: 32,
          topP: 0.9,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseJsonSchema: COACH_SCHEMA,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const retriable = RETRIABLE_STATUS.has(response.status);
        const error = new GeminiCoachError(
          `Gemini exercise coach error: ${extractReadableErrorBody(errorBody, response.status)}`,
          {
            code: retriable ? 'GEMINI_COACH_HTTP_RETRIABLE' : 'GEMINI_COACH_HTTP_ERROR',
            statusCode: response.status,
            attempt,
            maxAttempts,
            model,
            details: { errorBody: errorBody.slice(0, MAX_ERROR_SNIPPET) },
          }
        );

        if (retriable && attempt < maxAttempts) {
          lastError = error;
          await wait(retryBaseMs * 2 ** (attempt - 1));
          continue;
        }

        throw error;
      }

      const data = await response.json();
      let parsed;
      try {
        const textPart = data?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === 'string')?.text;
        if (typeof textPart === 'string' && textPart.trim()) {
          parsed = extractJson(textPart);
        } else {
          parsed = extractJsonFromResponse(data);
        }
      } catch (error) {
        throw new GeminiCoachError(`No se pudo parsear respuesta del coach: ${error.message}`, {
          code: 'GEMINI_COACH_PARSE_ERROR',
          attempt,
          maxAttempts,
          model,
          cause: error,
        });
      }

      const sanitized = sanitizeCoachPayload(parsed);
      validateCoachPayload(sanitized);

      return {
        ...sanitized,
        diagnostics: {
          backend,
          modelRequested: model,
          modelResolved: typeof data?.modelVersion === 'string' ? data.modelVersion : model,
          attempts: attempt,
          candidateCount: Array.isArray(data?.candidates) ? data.candidates.length : 0,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const normalizedError = error instanceof GeminiCoachError
        ? error
        : new GeminiCoachError(`Fallo en llamada a coach IA: ${error?.message || 'error desconocido'}`, {
          code: 'GEMINI_COACH_RUNTIME_ERROR',
          attempt,
          maxAttempts,
          model,
          cause: error,
        });

      const retriableByCode =
        normalizedError.code === 'GEMINI_COACH_HTTP_RETRIABLE'
        || normalizedError.code === 'GEMINI_COACH_PARSE_ERROR'
        || normalizedError.code === 'GEMINI_COACH_RUNTIME_ERROR';

      if (attempt < maxAttempts && retriableByCode) {
        lastError = normalizedError;
        await wait(retryBaseMs * 2 ** (attempt - 1));
        continue;
      }

      throw normalizedError;
    }
  }

  throw lastError ?? new GeminiCoachError('No se pudo obtener respuesta del coach IA.', {
    code: 'GEMINI_COACH_UNKNOWN',
    model,
  });
}
