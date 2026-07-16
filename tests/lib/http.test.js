import { describe, expect, it } from 'vitest';

import { jsonResponse, errorResponse } from '../../src/lib/http.js';

describe('http helpers cache safety', () => {
  it('marks every JSON response as private and non-storable by default', () => {
    const res = jsonResponse({ ok: true });
    // Un caché compartido (CDN/proxy) NUNCA debe poder guardar y reservir datos por-usuario.
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('applies the same no-store guard to error responses', () => {
    const res = errorResponse('nope', 401);
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate');
  });

  it('lets a caller override cache-control explicitly when a route is safe to cache', () => {
    const res = jsonResponse({ ok: true }, 200, { 'cache-control': 'public, max-age=60' });
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });
});
