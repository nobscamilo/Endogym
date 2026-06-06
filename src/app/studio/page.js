'use client';

// Endogym Studio — rediseño "data-driven cálido" (handoff de Claude Design).
// Se sirve como bundle estático aislado (public/studio/app/index.html) dentro de un
// iframe a pantalla completa para garantizar fidelidad pixel-perfect y evitar
// conflictos de CSS/JS con el resto de la app. El dashboard anterior sigue intacto.

export default function StudioPage() {
  return (
    <iframe
      src="/studio/app/index.html"
      title="Endogym Studio"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 'none',
        margin: 0,
        padding: 0,
        background: '#1a1714',
        zIndex: 50,
      }}
    />
  );
}
