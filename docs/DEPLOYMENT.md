# Deploy en Vercel (proyecto: Endogym)

## Estado

Intenté desplegar desde este entorno el **27 de marzo de 2026**, pero falló por:

1. Token de Vercel inválido.
2. Error de conectividad saliente (`ENETUNREACH`) hacia la API de Vercel.

## Pasos para desplegar con nombre Endogym

1. Autenticar CLI:

```bash
vercel login
```

2. Vincular/crear proyecto con nombre **Endogym**:

```bash
vercel link --project Endogym
```

3. Configurar variables de entorno en Vercel:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_MODEL_PLATE`
- `GEMINI_MODEL_COACH`
- `GEMINI_FORCE_MOCK=false`
- `GEMINI_FALLBACK_TO_MOCK=true`
- `AUTH_DISABLED=false`
- `NEXT_PUBLIC_AUTH_DISABLED=false`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

4. Deploy preview:

```bash
vercel
```

5. Deploy producción:

```bash
vercel --prod
```

## Notas

- Evita `AUTH_DISABLED=true` en producción.
- Si usas servicio de cuenta Firebase, guarda `FIREBASE_PRIVATE_KEY` respetando saltos de línea (`\n`).
