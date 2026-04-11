import { getPublicSiteUrl } from '../lib/siteUrl.js';

export default function manifest() {
  const siteUrl = getPublicSiteUrl();

  return {
    name: 'Endogym',
    short_name: 'Endogym',
    description: 'Planificación de nutrición y entrenamiento con IA adaptativa.',
    start_url: '/',
    display: 'standalone',
    background_color: '#eef2f6',
    theme_color: '#0b63f6',
    lang: 'es-ES',
    scope: '/',
    id: `${siteUrl}/`,
    icons: [
      {
        src: '/brand/endogym-logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
