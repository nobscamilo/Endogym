export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function errorResponse(message, status = 400, details = undefined) {
  return jsonResponse(
    {
      error: message,
      details,
    },
    status
  );
}
