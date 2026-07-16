// Por defecto NINGUNA respuesta JSON de la API es cacheable por navegadores, proxies o CDN.
// Casi todas las rutas devuelven datos por-usuario (perfil, plan, entrenos): un caché
// compartido que las guardara podría servir los datos de un usuario a otro. `private` prohíbe
// caché compartido; `no-store` prohíbe cualquier almacenamiento. Las rutas públicas
// (health/public-config) no pierden nada relevante por no cachearse en un MVP. Un caller
// puede sobrescribir pasando su propio `cache-control` en `headers`.
export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0, must-revalidate',
      ...headers,
    },
  });
}

export function errorResponse(message, status = 400, details = undefined, headers = {}) {
  return jsonResponse(
    {
      error: message,
      details,
    },
    status,
    headers
  );
}
