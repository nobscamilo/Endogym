import crypto from 'node:crypto';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_REFRESH_BUFFER_MS = 60_000;

let vertexTokenCache = {
  accessToken: null,
  expiresAt: 0,
};

function base64UrlEncode(input) {
  const source = typeof input === 'string' ? Buffer.from(input) : input;
  return source
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getGooglePrivateKey() {
  const key = process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;
  if (!key) return null;
  return key.replace(/\\n/g, '\n');
}

function getGoogleClientEmail() {
  return process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || null;
}

export function resolveGoogleAiBackend() {
  const explicit = String(process.env.GOOGLE_AI_BACKEND || process.env.GENAI_BACKEND || '')
    .trim()
    .toLowerCase();

  if (explicit === 'vertex') return 'vertex';
  if (explicit === 'gemini' || explicit === 'gemini_api' || explicit === 'developer') return 'gemini';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (isVertexConfigured()) return 'vertex';
  return 'gemini';
}

export function resolveVertexProjectId() {
  return (
    process.env.VERTEX_AI_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT
    || process.env.FIREBASE_PROJECT_ID
    || null
  );
}

export function resolveVertexLocation() {
  return process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'global';
}

export function isVertexConfigured() {
  return Boolean(resolveVertexProjectId() && resolveVertexLocation() && getGoogleClientEmail() && getGooglePrivateKey());
}

export function isGoogleAiConfigured() {
  const backend = resolveGoogleAiBackend();
  return backend === 'vertex' ? isVertexConfigured() : Boolean(process.env.GEMINI_API_KEY);
}

function buildGeminiEndpoint(model) {
  return `${GEMINI_BASE_URL}/models/${model}:generateContent`;
}

function buildVertexEndpoint(model) {
  const projectId = resolveVertexProjectId();
  const location = resolveVertexLocation();
  if (!projectId || !location) {
    throw new Error('Vertex AI no está configurado. Revisa proyecto y ubicación.');
  }

  const host = location === 'global'
    ? 'https://aiplatform.googleapis.com'
    : `https://${location}-aiplatform.googleapis.com`;

  return `${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

function createServiceAccountAssertion() {
  const clientEmail = getGoogleClientEmail();
  const privateKey = getGooglePrivateKey();
  if (!clientEmail || !privateKey) {
    throw new Error('Faltan GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY o credenciales equivalentes para Vertex AI.');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    iss: clientEmail,
    scope: GOOGLE_CLOUD_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: issuedAt + 3600,
    iat: issuedAt,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).end().sign(privateKey);
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

async function getVertexAccessToken() {
  const now = Date.now();
  if (vertexTokenCache.accessToken && vertexTokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS > now) {
    return vertexTokenCache.accessToken;
  }

  const assertion = createServiceAccountAssertion();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo obtener access token para Vertex AI (${response.status}): ${body.slice(0, 320)}`);
  }

  const payload = await response.json();
  const expiresInSeconds = Number(payload.expires_in) || 3600;
  vertexTokenCache = {
    accessToken: payload.access_token,
    expiresAt: now + expiresInSeconds * 1000,
  };

  return vertexTokenCache.accessToken;
}

export async function requestGoogleGenerateContent({
  model,
  generationConfig,
  parts,
  traceId,
}) {
  const backend = resolveGoogleAiBackend();
  if (!model) {
    throw new Error('Falta model para generateContent.');
  }

  const endpoint = backend === 'vertex' ? buildVertexEndpoint(model) : buildGeminiEndpoint(model);
  const headers = {
    'content-type': 'application/json',
    ...(traceId ? { 'x-request-id': traceId } : {}),
  };

  if (backend === 'vertex') {
    headers.authorization = `Bearer ${await getVertexAccessToken()}`;
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no está configurada.');
    }
    headers['x-goog-api-key'] = apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
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
        generationConfig,
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
