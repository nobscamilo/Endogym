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

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;

/**
 * L2-normaliza un vector. Necesario para gemini-embedding-001 cuando
 * outputDimensionality != 3072 (los vectores no vienen normalizados).
 */
export function l2Normalize(values) {
  let sumSq = 0;
  for (const x of values) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (!norm || !Number.isFinite(norm)) return values;
  return values.map((x) => x / norm);
}

/**
 * Genera embeddings para uno o varios textos usando la Gemini Developer API
 * (endpoint batchEmbedContents). Devuelve vectores L2-normalizados de 768 dims.
 *
 * @param {string[]} texts
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 * @returns {Promise<number[][]>}
 */
export async function requestGoogleEmbeddings({ texts, taskType = 'RETRIEVAL_DOCUMENT', traceId, timeoutMs = 30000 }) {
  resolveGoogleAiBackend();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada.');
  }
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const modelPath = `models/${normalizeGoogleAiModelName(EMBEDDING_MODEL)}`;
  const endpoint = `${GEMINI_BASE_URL}/${modelPath}:batchEmbedContents`;
  const requests = texts.map((text) => ({
    model: modelPath,
    content: { parts: [{ text: String(text || '').slice(0, 8000) }] },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  }));

  const normalizedTimeoutMs = Number.isFinite(Number(timeoutMs))
    ? Math.min(60000, Math.max(1000, Math.round(Number(timeoutMs))))
    : 30000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizedTimeoutMs);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(traceId ? { 'x-request-id': traceId } : {}),
        'x-goog-api-key': apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({ requests }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`batchEmbedContents HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const embeddings = Array.isArray(data.embeddings) ? data.embeddings : [];
  return embeddings.map((e) => l2Normalize(e.values || []));
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
