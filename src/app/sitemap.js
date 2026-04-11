import { getPublicSiteUrl } from '../lib/siteUrl.js';

export default function sitemap() {
  const siteUrl = getPublicSiteUrl();
  const now = new Date();
  const legalLastModified = new Date('2025-06-01');

  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/legal/terms`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${siteUrl}/legal/privacy`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${siteUrl}/legal/data-protection`,
      lastModified: legalLastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
