const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

// CSP relajada SOLO para el rediseño Studio (/studio*): es un bundle estático con
// Babel-in-browser (requiere 'unsafe-eval') + React/Babel desde CDN + Firebase web,
// y se muestra en un iframe del mismo origen (requiere SAMEORIGIN, no DENY).
// El resto de la app conserva la CSP estricta global.
// NOTA de hardening: para producción, pre-compilar el bundle y eliminar Babel/unsafe-eval.
const studioContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://i.ytimg.com",
  "media-src 'self' blob:",
  "connect-src 'self' https://unpkg.com https://www.gstatic.com https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const studioSecurityHeaders = [
  { key: 'Content-Security-Policy', value: studioContentSecurityPolicy },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    'firebase-admin',
    '@google-cloud/firestore',
    '@google-cloud/storage',
    'google-auth-library',
    'google-gax',
    'gaxios',
    'teeny-request',
    'protobufjs',
    'node-forge',
  ],
  async headers() {
    return [
      // Studio: CSP relajada + framing same-origin (debe ir antes y excluirse del global).
      {
        source: '/studio',
        headers: studioSecurityHeaders,
      },
      {
        source: '/studio/:path*',
        headers: studioSecurityHeaders,
      },
      // Resto de la app: CSP estricta. Se excluye /studio y /studio/* (no /studious) para
      // no duplicar la cabecera CSP en esas rutas.
      {
        source: '/((?!studio$|studio/).*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
