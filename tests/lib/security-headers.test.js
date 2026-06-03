import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config.mjs';

describe('Next.js security headers', () => {
  it('applies the global hardening headers', async () => {
    const definitions = await nextConfig.headers();
    const headers = Object.fromEntries(definitions[0].headers.map(({ key, value }) => [key, value]));

    expect(definitions[0].source).toBe('/(.*)');
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Permissions-Policy']).toContain('microphone=()');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
  });
});
