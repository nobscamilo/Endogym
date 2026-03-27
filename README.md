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

Pasos recomendados:

```bash
vercel login
vercel link --project Endogym
vercel --prod
```

Guía completa en `docs/DEPLOYMENT.md`.
Endogym es una plataforma integral para **nutrición, control glucémico y entrenamiento** (gimnasio/casa), con capacidades de IA para analizar platos desde fotos y estimar:

- Macronutrientes y micronutrientes.
- Carga glucémica (GL) e índice glucémico (GI).
- Impacto insulínico estimado.
- Recomendaciones contextualizadas según objetivo y entrenamiento.

## Estado actual

Este repositorio incluye la **base funcional inicial**:

1. Motor de cálculo glucémico y nutricional (`src/core`).
2. Contratos de datos para usuarios, comidas, sesiones y planes (`src/domain`).
3. Adaptador base para análisis de platos con Gemini (`src/services`).
4. Roadmap y arquitectura de producto (`docs`).

## Estructura

- `docs/ARCHITECTURE.md`: arquitectura técnica objetivo (Firebase + Vercel + Gemini).
- `docs/ROADMAP.md`: plan de entrega por fases.
- `src/core/glucose.js`: funciones de GI/GL e impacto glucémico.
- `src/core/nutrition.js`: cálculo de macros, calorías y distribución.
- `src/domain/models.js`: modelos de dominio iniciales.
- `src/services/geminiPlateAnalyzer.js`: integración base con Gemini API.
- `scripts/smoke-test.mjs`: validación rápida de cálculos en local.

## Próximos pasos inmediatos

1. Conectar persistencia con Firebase (Auth + Firestore + Storage).
2. Exponer API HTTP para registro de comidas, rutinas y análisis de fotos.
3. Implementar dashboard inicial (web responsive en Vercel).
4. Activar observabilidad y trazas (errores IA + cálculos).

