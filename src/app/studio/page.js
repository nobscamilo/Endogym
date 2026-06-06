'use client';

// Ignios Studio — bundle compilado aislado servido en iframe.
// Gating "fail-open": renderiza el Studio de inmediato (nunca se cuelga) y comprueba la
// sesión en segundo plano; si Firebase está configurado y se confirma que NO hay usuario,
// redirige a "/" (login). En demo o si la comprobación tarda/falla, se queda en el Studio
// (el coach y los datos reales caen a su fallback sin sesión).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseClient, isFirebaseClientConfigured } from '../../lib/firebaseClient.js';

export default function StudioPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isFirebaseClientConfigured()) return undefined;
    let client;
    try { client = getFirebaseClient(); } catch (e) { client = null; }
    if (!client || !client.auth) return undefined;
    const unsub = onAuthStateChanged(client.auth, (user) => {
      if (!user) router.replace('/'); // sin sesión → al login
    });
    return () => { if (unsub) unsub(); };
  }, [router]);

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
