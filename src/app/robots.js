import { getPublicSiteUrl } from '../lib/siteUrl.js';

export default function robots() {
  const siteUrl = getPublicSiteUrl();
  const host = new URL(siteUrl).host;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host,
  };
}
