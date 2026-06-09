import crypto from 'node:crypto';

export function createTraceId() {
  return crypto.randomUUID();
}

export function logInfo(message, context = {}) {
  console.info(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), ...context }));
}

// Alertas de errores a un webhook gratuito (Discord {content} / Slack {text}).
// Sin Vercel Pro no hay log drains; esto avisa en tiempo casi real. Inactivo si
// ALERT_WEBHOOK_URL no está configurada. Dedupe en memoria por mensaje (5 min) para
// no inundar el canal ante errores en ráfaga; best-effort (fire-and-forget).
const ALERT_DEDUPE_MS = 5 * 60 * 1000;
const lastAlertAt = new Map();

function sendErrorAlert(message, error, context) {
  try {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return;
    const now = Date.now();
    if (now - (lastAlertAt.get(message) || 0) < ALERT_DEDUPE_MS) return;
    lastAlertAt.set(message, now);
    const text = `⚠️ [endogym] ${message} — ${error?.message || 'sin detalle'}${context?.traceId ? ` (trace ${context.traceId})` : ''}`.slice(0, 1900);
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, text }),
    }).catch(() => {});
  } catch { /* nunca romper el logging por la alerta */ }
}

export function logError(message, error, context = {}) {
  console.error(
    JSON.stringify({
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      },
      ...context,
    })
  );
  sendErrorAlert(message, error, context);
}

export async function withTrace(operationName, handler, context = {}) {
  const traceId = context.traceId ?? createTraceId();
  const startedAt = Date.now();

  logInfo('operation_started', { traceId, operationName, ...context });

  try {
    const result = await handler({ traceId });
    logInfo('operation_finished', {
      traceId,
      operationName,
      durationMs: Date.now() - startedAt,
      ...context,
    });
    return result;
  } catch (error) {
    const failureContext = {
      traceId,
      operationName,
      durationMs: Date.now() - startedAt,
      ...context,
    };

    if (error?.expected === true) {
      logInfo('operation_rejected', {
        ...failureContext,
        rejection: {
          name: error?.name,
          message: error?.message,
          statusCode: error?.statusCode,
        },
      });
    } else {
      logError('operation_failed', error, failureContext);
    }
    throw error;
  }
}
