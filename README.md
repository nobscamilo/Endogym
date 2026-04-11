# Endogym

Endogym es una plataforma integral para **nutrición, control glucémico y entrenamiento** (gimnasio/casa), con IA para analizar platos desde fotos y estimar macros, GL e impacto insulínico.

## Estado actual

La base ahora incluye:

1. Persistencia en Firebase (Auth + Firestore + Storage) mediante `firebase-admin`.
2. API HTTP para comidas, rutinas y análisis de platos.
3. Dashboard multi-vista (inicio, plan diario, plan completo y plan nutricional).
4. Observabilidad con trazas (`traceId`) y logs estructurados.

## Estructura

- `src/app/page.js`: dashboard web con auth, tabs por vista, calendario semanal, plan diario y plan nutricional.
- `src/app/api/*`: endpoints HTTP (`/health`, `/meals`, `/workouts`, `/metrics`, `/profile`, `/weekly-plan`, `/analyze-plate`).
- `src/lib/firebaseAdmin.js`: acceso centralizado a Auth/Firestore/Storage.
- `src/lib/logger.js`: trazas + logging estructurado.
- `src/core/*`: motor de cálculo nutricional, glucémico, planificación, cribado y adaptación automática.

## Endpoints principales

- `GET /api/health`
- `GET|POST /api/meals`
- `GET|POST /api/workouts`
- `GET|POST /api/metrics`
- `GET|PUT /api/profile`
- `GET|POST /api/weekly-plan`
- `POST /api/analyze-plate`

`POST /api/analyze-plate`:

- Intenta guardar imagen en Firebase Storage, pero no bloquea el análisis si falla el almacenamiento.
- Intenta inferencia real con Google AI (`GEMINI_API_KEY`) o Vertex AI/GCP (`GOOGLE_AI_BACKEND=vertex`).
- Aplica fallback controlado a modo mock si falla el modelo (según flags).
- Calcula adherencia del plato contra el plan semanal activo.

`POST /api/weekly-plan`:

- Genera rutina semanal personalizada por objetivo y modalidad (`full_gym`, `home`, `yoga`, `trx`, `running`, etc.).
- Incluye prescripción FITT basada en ACSM Guidelines (12th edition) y actualización de resistencia 2026.
- Ejecuta cribado preparticipación (ACSM), memoria de progreso reciente y ajuste automático de carga/nutrición.
- Añade bloque de coaching IA (Gemini) con fallback heurístico seguro y trazabilidad clínica de reglas.
- Incluye biblioteca amplia de ejercicios por modalidad (técnica, carga/reps/tiempo, calentamiento/enfriamiento y video/link YouTube).
- Genera plan nutricional semanal explícito y filtra alimentos por alergias, intolerancias y no preferidos.

## Variables de entorno

Consulta `.env.example` y configura:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (fallback global, por defecto `gemini-3-flash-preview`)
- `GEMINI_MODEL_PLATE` (opcional, modelo específico para análisis multimodal de plato)
- `GEMINI_MODEL_COACH` (opcional, modelo específico para coach de entrenamiento; recomendado `gemini-3.1-pro-preview` tanto en Gemini API como en Vertex AI según la documentación actual)
- `GOOGLE_AI_BACKEND` (`gemini|vertex`)
- `VERTEX_AI_PROJECT_ID` (opcional si usas Vertex AI)
- `VERTEX_AI_LOCATION` (opcional, por defecto `global`)
- `GOOGLE_CLIENT_EMAIL` (opcional si usas Vertex AI)
- `GOOGLE_PRIVATE_KEY` (opcional si usas Vertex AI)
- `GEMINI_FORCE_MOCK` (`true|false`)
- `GEMINI_FALLBACK_TO_MOCK` (`true|false`)
- `NEXT_PUBLIC_AUTH_DISABLED` (`true|false`)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Para desarrollo local sin token de Firebase Auth puedes usar `AUTH_DISABLED=true`.

Si quieres login real en frontend, define variables `NEXT_PUBLIC_FIREBASE_*` y usa `NEXT_PUBLIC_AUTH_DISABLED=false`.

## Seguridad clínica

La app entrega recomendaciones educativas y **no reemplaza** valoración médica individual ni diagnóstico endocrinológico.

## Ejecutar

```bash
npm install
npm run dev
```

Smoke test de motor de cálculo:

```bash
npm run smoke
```

Tests de integración API:

```bash
npm test
```


## Deploy en Vercel

Se añadió `vercel.json` con configuración base para Next.js y API routes.

## Ruta seleccionada

Se eligió **Ruta A**: Vercel para app/API Next.js + Firebase para Auth/Firestore/Storage.

Pasos recomendados:

```bash
vercel login
vercel link --project Endogym
vercel --prod
```

Guía completa en `docs/DEPLOYMENT.md`.


Detalle operativo de la Ruta A en `docs/ROUTE_A_VERCEL.md`.
