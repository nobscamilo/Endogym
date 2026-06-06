'use client';

// Endogym/Ignios Studio — rediseño servido como bundle compilado aislado en un iframe.
// Gating: si Firebase está configurado y no hay sesión, redirige a "/" (donde está el login).
// En modo demo (sin Firebase configurado) se muestra con datos de ejemplo.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseClient, isFirebaseClientConfigured } from '../../lib/firebaseClient.js';

export default function StudioPage() {
  const router = useRouter();
  const [state, setState] = useState('checking'); // checking | ok | redirecting

  useEffect(() => {
    if (!isFirebaseClientConfigured()) { setState('ok'); return undefined; }
    const client = getFirebaseClient();
    if (!client) { setState('ok'); return undefined; }
    const unsub = onAuthStateChanged(client.auth, (user) => {
      if (user) setState('ok');
      else { setState('redirecting'); router.replace('/'); }
    });
    return () => { if (unsub) unsub(); };
  }, [router]);

  if (state !== 'ok') {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#1a1714', color: '#e8843f', fontFamily: 'system-ui, sans-serif', zIndex: 50 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Ignios Studio</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: 6 }}>
            {state === 'redirecting' ? 'Inicia sesión para continuar…' : 'Cargando…'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src="/studio/app/index.html"
      title="Ignios Studio"
      allow="camera; fullscreen"
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
