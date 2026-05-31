const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL_NAME_PATTERN = /^gemini-[a-z0-9][a-z0-9._-]*$/i;

export function resolveGoogleAiBackend() {
  const explicit = String(process.env.GOOGLE_AI_BACKEND || process.env.GENAI_BACKEND || '')
    .trim()
    .toLowerCase();

  if (explicit && !['gemini', 'gemini_api', 'developer'].includes(explicit)) {
    throw new Error(`Backend Google AI no permitido: ${explicit}. Usa Gemini Developer API.`);
  }

  return 'gemini';
}

export function isGoogleAiConfigured() {
  resolveGoogleAiBackend();
  return Boolean(process.env.GEMINI_API_KEY);
}

export function isValidGoogleAiModelName(model) {
  return typeof model === 'string' && GEMINI_MODEL_NAME_PATTERN.test(model.trim());
}

export function sanitizeGoogleAiModelNameForLog(model) {
  return isValidGoogleAiModelName(model) ? model.trim() : '<invalid-model>';
}

function normalizeGoogleAiModelName(model) {
  if (!isValidGoogleAiModelName(model)) {
    throw new Error('Nombre de modelo Gemini invalido. Usa un identificador gemini-*.');
  }

  return model.trim();
}

function buildGeminiEndpoint(model) {
  return `${GEMINI_BASE_URL}/models/${normalizeGoogleAiModelName(model)}:generateContent`;
}

export async function requestGoogleGenerateContent({
  model,
  generationConfig,
  parts,
  traceId,
  timeoutMs = 30000,
}) {
  const backend = resolveGoogleAiBackend();
  if (!model) {
    throw new Error('Falta model para generateContent.');
  }

  const endpoint = buildGeminiEndpoint(model);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada.');
  }

  const headers = {
    'content-type': 'application/json',
    ...(traceId ? { 'x-request-id': traceId } : {}),
    'x-goog-api-key': apiKey,
  };

  const normalizedTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.min(30000, Math.max(1000, Math.round(Number(timeoutMs))))
    : 30000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs);
  let response;
  
  const normalizedConfig = { ...generationConfig };
  if (normalizedConfig.responseJsonSchema && !normalizedConfig.responseSchema) {
    normalizedConfig.responseSchema = normalizedConfig.responseJsonSchema;
    delete normalizedConfig.responseJsonSchema;
  }

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig: normalizedConfig,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  return {
    backend,
    endpoint,
    response,
  };
}
