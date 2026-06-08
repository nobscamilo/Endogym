import { getAdminServices } from './firebaseAdmin.js';

export const RATE_LIMIT_SCOPES = Object.freeze({
  PLATE_ANALYSIS: 'plate-analysis',
  WEEKLY_PLAN_GENERATE: 'weekly-plan-generate',
  COACH_CHAT: 'coach-chat',
});

const DEFAULT_CONFIG = Object.freeze({
  [RATE_LIMIT_SCOPES.PLATE_ANALYSIS]: {
    maxRequests: 10,
    windowSeconds: 10 * 60,
    maxEnv: 'PLATE_ANALYSIS_RATE_LIMIT_MAX',
    windowEnv: 'PLATE_ANALYSIS_RATE_LIMIT_WINDOW_SECONDS',
  },
  [RATE_LIMIT_SCOPES.WEEKLY_PLAN_GENERATE]: {
    maxRequests: 4,
    windowSeconds: 60 * 60,
    maxEnv: 'WEEKLY_PLAN_RATE_LIMIT_MAX',
    windowEnv: 'WEEKLY_PLAN_RATE_LIMIT_WINDOW_SECONDS',
  },
  [RATE_LIMIT_SCOPES.COACH_CHAT]: {
    maxRequests: 20,
    windowSeconds: 60 * 60,
    maxEnv: 'COACH_CHAT_RATE_LIMIT_MAX',
    windowEnv: 'COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS',
  },
});

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export function resolveRateLimitConfig(scope) {
  const defaults = DEFAULT_CONFIG[scope];
  if (!defaults) {
    throw new Error(`Rate limit scope no soportado: ${scope}`);
  }

  return {
    maxRequests: toPositiveInteger(process.env[defaults.maxEnv], defaults.maxRequests),
    windowSeconds: toPositiveInteger(process.env[defaults.windowEnv], defaults.windowSeconds),
  };
}

export function getRateLimitHeaders(result) {
  const headers = {
    'ratelimit-limit': String(result.limit),
    'ratelimit-remaining': String(result.remaining),
    'ratelimit-reset': String(result.retryAfterSeconds),
  };

  if (!result.allowed) {
    headers['retry-after'] = String(result.retryAfterSeconds);
  }

  return headers;
}

export async function enforceUserRateLimit({ userId, scope, now = new Date() }) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Falta userId para aplicar rate limit.');
  }

  const { maxRequests, windowSeconds } = resolveRateLimitConfig(scope);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error('Fecha inválida para aplicar rate limit.');
  }

  const { db } = await getAdminServices();
  const ref = db.collection('users').doc(userId).collection('rateLimits').doc(scope);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() : null;
    const windowMs = windowSeconds * 1000;
    const currentStartedAtMs = Number(current?.windowStartedAtMs);
    const hasActiveWindow = Number.isFinite(currentStartedAtMs)
      && currentStartedAtMs <= nowMs
      && nowMs - currentStartedAtMs < windowMs;
    const windowStartedAtMs = hasActiveWindow ? currentStartedAtMs : nowMs;
    const previousCount = hasActiveWindow && Number.isInteger(current?.count) ? current.count : 0;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStartedAtMs + windowMs - nowMs) / 1000));

    if (previousCount >= maxRequests) {
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    const count = previousCount + 1;
    transaction.set(ref, {
      scope,
      count,
      windowStartedAtMs,
      windowStartedAt: new Date(windowStartedAtMs).toISOString(),
      expiresAt: new Date(windowStartedAtMs + windowMs).toISOString(),
      updatedAt: now.toISOString(),
    });

    return {
      allowed: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - count),
      retryAfterSeconds,
    };
  });
}
