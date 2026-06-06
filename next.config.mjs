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

// CSP para el rediseño Studio (/studio*). El bundle está PRE-COMPILADO (esbuild, React de
// producción y Firebase empaquetados), así que NO necesita 'unsafe-eval' ni scripts de CDN.
// Solo se relaja respecto a la global: framing del mismo origen (SAMEORIGIN, para el iframe),
// fuentes de Google (style/font) e imágenes de miniaturas de YouTube. script-src es 'self'.
const studioContentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline' es necesario para los scripts inline de hidratación de Next.js en la
  // página /studio (igual que la CSP global). El bundle del iframe es externo y no usa eval.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://i.ytimg.com",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.firebaseio.com wss://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const studioSecurityHeaders = [
  { key: 'Content-Security-Policy', value: studioContentSecurityPolicy },
  // Evita servir un bundle/HTML viejo en caché tras un deploy: revalidar siempre.
  { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
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
