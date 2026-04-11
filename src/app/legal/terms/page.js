import Link from 'next/link';

export const metadata = {
  title: 'Términos y Condiciones',
  description: 'Condiciones de uso, responsabilidad y límites del servicio Endogym.',
  alternates: {
    canonical: '/legal/terms',
  },
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <h1>Términos y Condiciones de Uso</h1>
        <p className="legal-meta">Versión 2026-04-02</p>

        <section>
          <h2>1. Objeto del servicio</h2>
          <p>
            Endogym ofrece herramientas digitales para planificación de entrenamiento, nutrición y seguimiento de métricas.
            El contenido tiene carácter informativo y educativo.
          </p>
        </section>

        <section>
          <h2>2. Uso permitido</h2>
          <p>
            Te comprometes a proporcionar datos veraces y a usar la plataforma de forma responsable. Está prohibido usar la app
            para fines ilícitos, suplantación de identidad o extracción masiva no autorizada de datos.
          </p>
        </section>

        <section>
          <h2>3. Limitación médica</h2>
          <p>
            Endogym no sustituye diagnóstico ni tratamiento médico. Si presentas síntomas, enfermedad activa o riesgo
            cardiometabólico, debes consultar con un profesional sanitario antes de seguir cualquier recomendación.
          </p>
        </section>

        <section>
          <h2>4. Cuenta y seguridad</h2>
          <p>
            Eres responsable de custodiar tus credenciales de acceso. Debes notificarnos cualquier uso no autorizado de tu
            cuenta.
          </p>
        </section>

        <section>
          <h2>5. Propiedad intelectual</h2>
          <p>
            El software, diseño, textos y lógica de Endogym están protegidos por normativa de propiedad intelectual. No se
            permite su reproducción o distribución sin autorización expresa.
          </p>
        </section>

        <section>
          <h2>6. Cambios y suspensión</h2>
          <p>
            Podemos actualizar funcionalidades, términos o limitar temporalmente el servicio por mantenimiento, seguridad o
            cumplimiento normativo.
          </p>
        </section>

        <section>
          <h2>7. Jurisdicción aplicable</h2>
          <p>
            Estos términos se interpretan conforme a normativa aplicable en la Unión Europea y España, sin perjuicio de derechos
            imperativos de consumidores de otras jurisdicciones.
          </p>
        </section>

        <p className="legal-actions">
          <Link href="/">Volver al inicio</Link>
        </p>
      </article>
    </main>
  );
}
