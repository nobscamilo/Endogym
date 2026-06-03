# Deploy de Endogym en Vercel

## Estado verificado

Sonda pública repetida el **2 de junio de 2026**:

- deployment Production inspeccionado tras redespliegue manual: `dpl_FJ2jWbaV8Ktjy9G57aKMDaVB4t9r`, estado `Ready`;
- `https://endogym.vercel.app/` responde HTTP `200`;
- `https://endogym.vercel.app/api/health` responde HTTP `200`;
- `/api/meals` sin token responde `401`;
- `npm run e2e:production` pasó con Gemini live, Storage, rate limits y limpieza del usuario temporal.
- Vercel Pro no es viable por ahora; alertas y drains quedan fuera del despliegue actual.

Verificacion realizada el **31 de mayo de 2026**:

- proyecto Vercel `endogym` con Production `Ready`;
- `https://endogym.vercel.app/` responde HTTP `200` sin redirecciones;
- `https://endogym.vercel.app/api/health` responde HTTP `200` sin redirecciones;
- `/api/meals` sin token responde `401`;
- `/api/profile`, `/api/meals` y `/api/analyze-plate` se probaron con usuario temporal autenticado.

Auditoria posterior del **31 de mayo de 2026**:

- la API key publica Firebase sigue operativa;
- Firebase Auth autoriza `endogym.vercel.app` y Google OAuth devuelve URI de autenticacion;
- `FIREBASE_PRIVATE_KEY` fue corregida en Vercel y parsea correctamente;
- `/api/profile` y `/api/meals` autenticados responden `200`;
- `/api/analyze-plate` responde `201`, guarda foto y usa Gemini live sin fallback;
- `/api/weekly-plan` responde `201` y genera coaching Gemini live con `gemini-2.5-flash` sin fallback;
- el bucket privado `endogym-vtety8-plates-eu` tiene acceso uniforme y prevencion publica;
- las fotos `plates/` caducan a los 30 dias y soft delete esta deshabilitado;
- la key Gemini expuesta fue revocada y reemplazada por una key restringida a `generativelanguage.googleapis.com`;
- `firebasevertexai.googleapis.com` esta deshabilitado y `aiplatform.googleapis.com` no esta habilitado.

## Variables

Servidor:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_STORAGE_BUCKET
GOOGLE_AI_BACKEND=gemini
GEMINI_API_KEY
GEMINI_MODEL
GEMINI_MODEL_PLATE
GEMINI_MODEL_COACH
GEMINI_COACH_MAX_RETRIES=1
GEMINI_COACH_TIMEOUT_MS=10000
GEMINI_FORCE_MOCK=false
GEMINI_FALLBACK_TO_MOCK=true
PLATE_ANALYSIS_RATE_LIMIT_MAX=10
PLATE_ANALYSIS_RATE_LIMIT_WINDOW_SECONDS=600
WEEKLY_PLAN_RATE_LIMIT_MAX=4
WEEKLY_PLAN_RATE_LIMIT_WINDOW_SECONDS=3600
AUTH_DISABLED=false
```

Cliente:

```text
NEXT_PUBLIC_SITE_URL=https://endogym.vercel.app
NEXT_PUBLIC_APP_URL=https://endogym.vercel.app
NEXT_PUBLIC_AUTH_DISABLED=false
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

## Pendientes antes de usuarios reales

1. Completar revision legal humana de privacidad, consentimiento y disclaimer medico por mercado.
2. Mantener alternativa gratuita/manual de observabilidad mientras Vercel Pro no sea viable.
3. Sincronizar GitHub con el runtime manualmente desplegado: `main` local esta cinco commits por delante de `origin/main` y conserva cambios sin commit.

## Deploy

```bash
npx vercel login
npx vercel link --project endogym
npx vercel --prod
```

Un deploy manual desde CLI puede servir cambios del working tree mientras Vercel muestra el ultimo commit GitHub como metadato de `Source`. Usa `npx vercel inspect https://endogym.vercel.app` y las sondas HTTP para comprobar el runtime. Commit y push son pasos separados necesarios para sincronizar el repositorio con otros colaboradores.

## Checklist post-deploy

```bash
curl -i https://endogym.vercel.app/
curl -i https://endogym.vercel.app/api/health
curl -i https://endogym.vercel.app/api/meals
```

Esperado: `200`, `200`, `401`.

Confirma además en `/` y `/api/health`: CSP sin `unsafe-eval`, HSTS, `nosniff`, referrer policy, permissions policy, framing denegado y ausencia de `X-Powered-By`. Verificado en producción el 2 de junio de 2026.

Despues valida con ID token real:

```bash
curl -i https://endogym.vercel.app/api/meals \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN"
```

Confirma ademas:

- login frontend;
- dominio canonico `endogym.vercel.app` autorizado en Firebase Auth para Google OAuth;
- escritura y lectura Firestore;
- upload y borrado Storage;
- inferencia Gemini real sin fallback;
- coaching semanal Gemini live sin fallback;
- `traceId` en respuestas y logs;
- ausencia de secretos en logs.

Sonda automatizada:

```bash
npm run e2e:production
```

La sonda valida Google OAuth para el dominio canonico, crea un usuario temporal, valida Auth, Firestore, coaching semanal Gemini live, firma MIME, Storage, analisis de plato Gemini live y ambos rate limits, y elimina sus datos al terminar.

Bucket de fotos actual:

```text
endogym-vtety8-plates-eu
```

Es un bucket privado del mismo proyecto Firebase/GCP, usado desde Firebase Admin. No expongas URLs publicas ni dependas de acceso anonimo. Aplica [`../infra/storage-lifecycle.json`](../infra/storage-lifecycle.json): elimina fotos `plates/` al superar 30 dias.
