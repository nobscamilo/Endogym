import Link from 'next/link';

export const metadata = {
  title: 'Protección de Datos',
  description: 'Compromisos de GDPR/LOPDGDD y medidas de seguridad para datos de salud y rendimiento en Endogym.',
  alternates: {
    canonical: '/legal/data-protection',
  },
};

export default function DataProtectionPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <h1>Protección de Datos (GDPR / LOPDGDD)</h1>
        <p className="legal-meta">Versión 2026-04-02</p>

        <section>
          <h2>1. Principios aplicados</h2>
          <p>
            Endogym aplica minimización de datos, limitación de finalidad, control de acceso y trazabilidad de operaciones sobre
            información sensible de salud y rendimiento.
          </p>
        </section>

        <section>
          <h2>2. Consentimiento explícito</h2>
          <p>
            El alta exige aceptación expresa de términos, privacidad y tratamiento de datos de salud para personalización del
            servicio.
          </p>
        </section>

        <section>
          <h2>3. Seguridad</h2>
          <p>
            Se usan autenticación, control de permisos y almacenamiento segregado por usuario. Debes proteger tus credenciales y
            cerrar sesión en dispositivos compartidos.
          </p>
        </section>

        <section>
          <h2>4. Solicitudes de derechos</h2>
          <p>
            Para solicitar acceso, corrección o borrado de datos, contacta soporte indicando el derecho a ejercer y el correo de la
            cuenta.
          </p>
        </section>

        <section>
          <h2>5. Notificación de incidentes</h2>
          <p>
            Ante incidentes de seguridad con impacto en datos personales, Endogym activará protocolo de análisis, contención y
            notificación conforme a normativa aplicable.
          </p>
        </section>

        <p className="legal-actions">
          <Link href="/">Volver al inicio</Link>
        </p>
      </article>
    </main>
  );
}
