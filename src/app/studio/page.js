'use client';

// La app oficial vive ahora en la raíz "/". Esta ruta /studio se mantiene solo como alias
// de compatibilidad (enlaces y marcadores antiguos) y redirige a "/", donde se renderiza el
// Studio si hay sesión, o el login en caso contrario.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StudioRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return null;
}
