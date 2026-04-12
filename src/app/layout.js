import './styles.css';
import { Space_Grotesk, Plus_Jakarta_Sans } from 'next/font/google';
import { getPublicSiteUrl } from '../lib/siteUrl.js';

const brandFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
});

const bodyFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  title: {
    default: 'Endogym | Nutrición y entrenamiento con IA',
    template: '%s | Endogym',
  },
  description:
    'Endogym integra planificación de entrenamiento, nutrición personalizada y seguimiento de progreso con IA adaptativa.',
  applicationName: 'Endogym',
  manifest: '/manifest.webmanifest',
  category: 'health',
  alternates: {
    canonical: '/',
  },
  keywords: [
    'nutrición',
    'entrenamiento',
    'gimnasio',
    'plan alimentario',
    'plan semanal de ejercicios',
    'seguimiento metabólico',
    'fitness',
    'ia nutricional',
  ],
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: '/',
    siteName: 'Endogym',
    title: 'Endogym | Nutrición y entrenamiento con IA',
    description:
      'Planifica tu entrenamiento y nutrición con una app que adapta cargas, dieta y adherencia con IA.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Endogym | Nutrición y entrenamiento con IA',
    description:
      'Entrenamiento, nutrición y seguimiento clínico-deportivo en una sola plataforma con IA adaptativa.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${brandFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
