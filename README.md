# Endogym

Endogym es una plataforma integral para **nutrición, control glucémico y entrenamiento** (gimnasio/casa), con IA para analizar platos desde fotos y estimar macros, GL e impacto insulínico.

## Estado actual

La base ahora incluye:

1. Persistencia en Firebase (Auth + Firestore + Storage) mediante `firebase-admin`.
2. API HTTP para comidas, rutinas y análisis de platos.
3. Dashboard inicial responsive (Next.js App Router).
4. Observabilidad con trazas (`traceId`) y logs estructurados.

## Estructura

- `src/app/page.js`: dashboard web inicial con acciones demo.
- `src/app/api/*`: endpoints HTTP (`/health`, `/meals`, `/workouts`, `/analyze-plate`).
- `src/lib/firebaseAdmin.js`: acceso centralizado a Auth/Firestore/Storage.
- `src/lib/logger.js`: trazas + logging estructurado.
- `src/core/*`: motor de cálculo nutricional y glucémico.

## Endpoints principales

- `GET /api/health`
- `GET|POST /api/meals`
- `GET|POST /api/workouts`
- `POST /api/analyze-plate`

> Nota: `POST /api/analyze-plate` guarda la imagen en Storage y hoy utiliza un mock de Gemini para la salida estructurada.

## Variables de entorno

Consulta `.env.example` y configura:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `GEMINI_API_KEY`

Para desarrollo local sin token de Firebase Auth puedes usar `AUTH_DISABLED=true`.

## Ejecutar

```bash
npm install
npm run dev
```

Smoke test de motor de cálculo:

```bash
npm run smoke
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
