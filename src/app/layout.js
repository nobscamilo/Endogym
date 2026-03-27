import './globals.css';

export const metadata = {
  title: 'Endogym Dashboard',
  description: 'Nutrición + glucemia + entrenamiento con IA',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
