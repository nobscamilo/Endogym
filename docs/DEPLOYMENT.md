# Deploy de Endogym en Vercel

## RAG semántico: crear el índice vectorial de Firestore (acción requerida, 6 jun 2026)

El RAG semántico (`findNearest` sobre `guideline_passages`) requiere un índice vectorial que **no** puede crear el service-account del repo (sin permiso `indexAdmin`). Créalo una vez con `gcloud` autenticado como un usuario con rol Owner/Editor o `roles/datastore.indexAdmin`:

```bash
gcloud firestore indexes composite create \
  --project=endogym-vtety8 \
  --collection-group=guideline_passages \
  --query-scope=COLLECTION \
  --field-config=vector-config='{"dimension":"768","flat": "{}"}',field-path=embedding
```
(Formato exacto sugerido por el propio Firestore en el error `FAILED_PRECONDITION`.)

- Tarda unos minutos en construirse sobre 7.128 pasajes.
- Mientras no exista, `findNearest` falla y el retriever degrada automáticamente a búsqueda por keywords (sin romper producción).
- Verificación tras crearlo: en Runtime Logs debe aparecer `guidelines_vector_matches` (modo vector) en vez de `guidelines_vector_fallback_keywords` al generar un plan.
- Para re-generar embeddings de libros nuevos: `node --env-file=.env.local scripts/embed_guidelines.mjs` (resumable).

## Estado verificado

Deploy manual más reciente del **8 de junio de 2026**:

- `npx vercel --prod --yes` creó `dpl_DhMpiLwCJtBgJEYfDGMDqVWY1sSg`, estado `Ready`, URL `https://endogym-hody8p1xq-juan-camilo-sarmientos-projects.vercel.app`.
- La CLI quedó esperando en `Running Checks`; el deployment estaba `Ready` pero `endogym.vercel.app` seguía apuntando al deployment anterior. Se promovió manualmente con:

```bash
npx vercel alias set https://endogym-hody8p1xq-juan-camilo-sarmientos-projects.vercel.app endogym.vercel.app
```

- `https://endogym.vercel.app/studio/app/index.html?verify=b3fd227a1c` sirve `studio.bundle.js?v=b3fd227a1c`.
- Verificado: `/` -> `200`, `/api/health` -> `200`, `/api/meals` sin token -> `401`.
- Playwright contra producción: el puente same-origin padre→iframe entrega token (`IGNIOS_AUTH_TOKEN`) y el Studio móvil usa `Authorization` en `/api/studio-data`; sin token, el asset directo conserva demo y puede mostrar `Empuje · Fuerza`.
- No se ejecutó `npm run e2e:production` para este deploy.

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
COACH_CHAT_RATE_LIMIT_MAX=20
COACH_CHAT_RATE_LIMIT_WINDOW_SECONDS=3600
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
- chat del coach autenticado con rate limit persistente;
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
