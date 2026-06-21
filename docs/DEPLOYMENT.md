# Deploy de Endogym en Vercel

## RAG semántico: índice vectorial de Firestore

Estado al **10 de junio de 2026**: el índice vectorial de `guideline_passages` fue **creado y verificado**. Sonda real: `mode:'vector'`, 12 pasajes y ~20k caracteres de contexto recuperado. El service-account del repo sigue sin permiso `indexAdmin`, así que si el índice se borra o se recrea otro proyecto, hazlo con `gcloud` autenticado como un usuario con rol Owner/Editor o `roles/datastore.indexAdmin`:

```bash
gcloud firestore indexes composite create \
  --project=endogym-vtety8 \
  --collection-group=guideline_passages \
  --query-scope=COLLECTION \
  --field-config=vector-config='{"dimension":"768","flat": "{}"}',field-path=embedding
```
(Formato exacto sugerido por el propio Firestore en el error `FAILED_PRECONDITION`.)

- Tarda unos minutos en construirse sobre 7.128 pasajes.
- Si no existe, `findNearest` falla y el retriever degrada automáticamente a búsqueda por keywords (sin romper producción).
- Verificación: en Runtime Logs debe aparecer `guidelines_vector_matches` (modo vector) en vez de `guidelines_vector_fallback_keywords` al generar un plan.
- Para re-generar embeddings de libros nuevos: `node --env-file=.env.local scripts/embed_guidelines.mjs` (resumable).

## Estado verificado

Último estado local y de producción confirmado: **20 de junio de 2026**.

- Working tree validado: contrato demo/autenticado estricto, perfil obligatorio sin supuestos, planes vencidos sin reciclaje, coach-analysis orientado a objetivos y vídeos contextuales sin feed simulado. `46` archivos / `339` tests, audit 0, smoke/check:conflicts y build OK.
- Producción: `dpl_FpbL91Ukd97dy9aT73iAwX8rh52h`, estado `Ready`, URL `https://endogym-9d6ey3oz8-juan-camilo-sarmientos-projects.vercel.app`, bundle `bb2659ac92`.
- `endogym.vercel.app` se reasignó manualmente al deployment nuevo porque `vercel deploy --prod` volvió a quedar esperando en `Running Checks` después de crear correctamente el artefacto.
- Sondas: `/` `200`, `/api/health` `200`, `/api/meals` sin token `401`, `POST /api/coach-chat` sin token `401`, index/bundle `200`; el bundle contiene “Abrir en YouTube” y no contiene el feed ficticio.
- Playwright producción abrió “Sigue aprendiendo” y el iframe real de YouTube sin errores de consola. Runtime logs filtrados del deployment: sin errores encontrados.
- El deployment salió del working tree de `main` en HEAD `a7b7482`; esos cambios siguen sin commit/push y producción no es reproducible desde `origin/main`.

Para una futura sonda autenticada integral, verifica además:

- cuenta nueva: `/api/profile` no persiste valores personales por defecto;
- encuesta incompleta: `studio-availability` `400` y `weekly-plan` `409` con `missingFields`;
- sesión autenticada sin datos: ningún texto, entreno, métrica, comida o curva del demo;
- bloque vencido: `planStatus:'stale'`, sin sesión reciclada ni swap sobre el primer día;
- onboarding móvil y desktop: todos los campos requeridos parten vacíos y el plan solo se crea tras completarlos.

Deploy relevante del **19 de junio de 2026**:

- Commit `8e46bd1` (`main` alineado con `origin/main`) → deployment `dpl_yiR1GVoJnYZVdo4njGxy7yqbNwVF`, estado `Ready`.
- Bundle `studio.bundle.js?v=097b1b9fba`.
- Sondas públicas: `/` `200`, `/api/health` `200`, `/api/meals` sin token `401`, bundle `200`.
- `npm test`: 42 archivos / 296 tests verdes. No se reejecutó `npm run e2e:production` en esta auditoría.

Deploy manual relevante del **12 de junio de 2026**:

- `npx vercel --prod --yes` creó `dpl_AGJGm6iWwmRP3YLrd8N9pgk8HoQq`, estado `Ready`, URL `https://endogym-a96u5x4jk-juan-camilo-sarmientos-projects.vercel.app`.
- La CLI volvió a quedarse en `Running Checks`; el alias canónico no apareció en `inspect`, así que se asignó manualmente:

```bash
npx vercel alias set https://endogym-a96u5x4jk-juan-camilo-sarmientos-projects.vercel.app endogym.vercel.app
```

- `https://endogym.vercel.app/studio/app/index.html?verify=08bbcab4a0` sirve `studio.bundle.js?v=08bbcab4a0`; el bundle responde `200`.
- Verificado: `/` -> `200`, `/api/health` -> `200`, `/api/meals` sin token -> `401`, `POST /api/coach-chat` sin token -> `401`; cabeceras defensivas presentes.
- Playwright producción contra el asset del Studio: Nutrición muestra `Vie 12` activo el 12 de junio (ya no `Lun 8`) y el hero usa etiqueta contextual (`Próxima comida`/`Plan del ...`) en vez de `Toca ahora` por defecto.
- Logs Vercel del deployment (`--no-follow --since 1h --level error --limit 20`): sin errores encontrados.
- `.vercelignore` excluye `scratch/`, `.playwright-cli/` y `output/` para no subir capturas/logs locales.
- No se ejecutó `npm run e2e:production` para este deploy porque el cambio fue de UI/fecha y las sondas públicas cubrieron el runtime básico.

Deploy manual relevante anterior del **12 de junio de 2026**:

- `npx vercel --prod --yes` creó `dpl_EXhggnVun7yJjDP4pLjAxFKJqR7S`, estado `Ready`, URL `https://endogym-8npkwk39l-juan-camilo-sarmientos-projects.vercel.app`.
- La CLI volvió a quedarse en `Running Checks`; el alias canónico no apareció en `inspect`, así que se asignó manualmente:

```bash
npx vercel alias set https://endogym-8npkwk39l-juan-camilo-sarmientos-projects.vercel.app endogym.vercel.app
```

- `https://endogym.vercel.app/studio/app/index.html?verify=6ff6352714` sirve `studio.bundle.js?v=6ff6352714`; el bundle responde `200` y contiene `Flexible`, `Microciclo`, `Mesociclo` y `__createPortal`.
- Verificado: `/` -> `200`, `/api/health` -> `200`, `/api/meals` sin token -> `401`, `POST /api/coach-chat` sin token -> `401`; cabeceras defensivas presentes.
- `.vercelignore` excluye `scratch/` y `.playwright-cli/` para no subir capturas/logs locales.
- No se ejecutó `npm run e2e:production` para este deploy porque el cambio fue de UI/bundle y las sondas públicas cubrieron el runtime básico.

Deploy manual relevante del **8 de junio de 2026**:

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
COACH_ANALYSIS_RATE_LIMIT_MAX=6
COACH_ANALYSIS_RATE_LIMIT_WINDOW_SECONDS=3600
STUDIO_NUTRITION_RATE_LIMIT_MAX=12
STUDIO_NUTRITION_RATE_LIMIT_WINDOW_SECONDS=3600
CRON_SECRET
BACKUP_BUCKET=endogym-vtety8-backups-eu
ALERT_WEBHOOK_URL
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_STATE_SECRET
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
2. Configurar `ALERT_WEBHOOK_URL` en Vercel si se quiere entrega automática gratuita de errores a Discord/Slack; hasta entonces las alertas están inertes.
3. Mantener alternativa gratuita/manual de observabilidad mientras Vercel Pro no sea viable.

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
