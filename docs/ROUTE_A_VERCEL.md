# Ruta A: Deploy en Vercel + Backend en Firebase

Esta es la ruta seleccionada para Endogym.

## Arquitectura final

- **Hosting app web + API Next.js**: Vercel.
- **Persistencia y servicios backend**: Firebase Auth + Firestore + Storage.
- **IA de análisis de plato**: Gemini API (clave en variables de entorno de Vercel).

## Variables de entorno en Vercel

Configura estas variables en el proyecto `Endogym`:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_MODEL_PLATE`
- `GEMINI_MODEL_COACH`
- `GEMINI_FORCE_MOCK`
- `GEMINI_FALLBACK_TO_MOCK`
- `AUTH_DISABLED=false`
- `NEXT_PUBLIC_AUTH_DISABLED=false`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

> `FIREBASE_PRIVATE_KEY` debe mantenerse con saltos `\n`.

## Comandos de despliegue

```bash
vercel login
vercel link --project Endogym
vercel env add FIREBASE_PROJECT_ID production
vercel env add FIREBASE_CLIENT_EMAIL production
vercel env add FIREBASE_PRIVATE_KEY production
vercel env add FIREBASE_STORAGE_BUCKET production
vercel env add GEMINI_API_KEY production
vercel env add GEMINI_MODEL production
vercel env add GEMINI_MODEL_PLATE production
vercel env add GEMINI_MODEL_COACH production
vercel env add GEMINI_FORCE_MOCK production
vercel env add GEMINI_FALLBACK_TO_MOCK production
vercel env add AUTH_DISABLED production
vercel env add NEXT_PUBLIC_AUTH_DISABLED production
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production
vercel --prod
```

## Post deploy (checklist)

1. `GET /api/health` responde `ok: true`.
2. Flujo de login Firebase completo en frontend.
3. `POST /api/meals` persiste en Firestore.
4. `POST /api/analyze-plate` guarda imagen en Storage y crea registro de comida.
5. Verificar logs y trazas (`traceId`) en logs de Vercel.
