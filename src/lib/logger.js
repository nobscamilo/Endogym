import crypto from 'node:crypto';

export function createTraceId() {
  return crypto.randomUUID();
}

export function logInfo(message, context = {}) {
  console.info(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString(), ...context }));
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
    logError('operation_failed', error, {
      traceId,
      operationName,
      durationMs: Date.now() - startedAt,
      ...context,
    });
    throw error;
  }
}
