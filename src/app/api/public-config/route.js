import { jsonResponse } from '../../../lib/http.js';

// Devuelve la configuración PÚBLICA de Firebase Web (valores NEXT_PUBLIC_*, ya
// expuestos al navegador en el cliente normal). La usa el bundle estático de
// /studio para inicializar Firebase Auth y leer la sesión existente del mismo
// origen, y así poder llamar a endpoints autenticados (p. ej. /api/coach-chat).
export function GET() {
  return jsonResponse({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || null,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || null,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || null,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || null,
  });
}
