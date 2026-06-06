import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config.mjs';

function headersFor(definition) {
  return Object.fromEntries(definition.headers.map(({ key, value }) => [key, value]));
}

describe('Next.js security headers', () => {
  it('applies the global hardening headers to non-studio routes', async () => {
    const definitions = await nextConfig.headers();
    // La regla global estricta es la que deniega framing por completo.
    const global = definitions.find((d) => headersFor(d)['X-Frame-Options'] === 'DENY');
    expect(global).toBeTruthy();
    // Debe excluir /studio (CSP scoped aparte) pero cubrir el resto.
    expect(global.source).toContain('studio');

    const headers = headersFor(global);
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-eval'");
    expect(headers['Permissions-Policy']).toContain('microphone=()');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('applies a relaxed, same-origin-framable CSP to /studio routes', async () => {
    const definitions = await nextConfig.headers();
    const studio = definitions.find((d) => d.source === '/studio' || d.source === '/studio/:path*');
    expect(studio).toBeTruthy();

    const headers = headersFor(studio);
    // El bundle Studio usa Babel-in-browser (necesita unsafe-eval) y se muestra en iframe propio.
    expect(headers['Content-Security-Policy']).toContain("'unsafe-eval'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'self'");
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    // Conserva el resto del hardening.
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Strict-Transport-Security']).toContain('max-age=63072000');
  });
});
