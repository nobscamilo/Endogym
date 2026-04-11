import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidad',
  description: 'Información sobre tratamiento de datos personales y derechos de privacidad en Endogym.',
  alternates: {
    canonical: '/legal/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <h1>Política de Privacidad</h1>
        <p className="legal-meta">Versión 2026-04-02</p>

        <section>
          <h2>1. Responsable del tratamiento</h2>
          <p>
            Endogym actúa como responsable de los datos personales tratados en la plataforma para prestar el servicio de
            entrenamiento y nutrición personalizada.
          </p>
        </section>

        <section>
          <h2>2. Datos que tratamos</h2>
          <p>
            Podemos tratar datos de identificación (email), datos de perfil físico (edad, peso, altura), datos de hábitos,
            entrenamiento y nutrición, y datos que tú subes voluntariamente.
          </p>
        </section>

        <section>
          <h2>3. Finalidades</h2>
          <p>
            Usamos los datos para autenticarte, generar planes adaptativos, medir adherencia, mejorar seguridad y ofrecer soporte
            técnico.
          </p>
        </section>

        <section>
          <h2>4. Base jurídica</h2>
          <p>
            El tratamiento se apoya en la ejecución del servicio solicitado y en tu consentimiento explícito para el tratamiento de
            datos de salud y actividad física.
          </p>
        </section>

        <section>
          <h2>5. Conservación</h2>
          <p>
            Conservamos los datos mientras la cuenta esté activa o mientras sea necesario para obligaciones legales, seguridad y
            trazabilidad.
          </p>
        </section>

        <section>
          <h2>6. Destinatarios y transferencias</h2>
          <p>
            Usamos proveedores técnicos de infraestructura y almacenamiento para operar el servicio. Cualquier transferencia
            internacional debe estar amparada por garantías adecuadas.
          </p>
        </section>

        <section>
          <h2>7. Derechos</h2>
          <p>
            Puedes ejercer derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad, así como retirar tu
            consentimiento cuando proceda.
          </p>
        </section>

        <section>
          <h2>8. Contacto de privacidad</h2>
          <p>
            Para solicitudes de privacidad y protección de datos, usa el canal oficial de soporte de Endogym y especifica en el
            asunto "Privacidad de datos".
          </p>
        </section>

        <p className="legal-actions">
          <Link href="/">Volver al inicio</Link>
        </p>
      </article>
    </main>
  );
}
