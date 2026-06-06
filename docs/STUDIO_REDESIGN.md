# Rediseño "Endogym Studio" (rama `redesign/endogym-studio`)

Última actualización: **6 de junio de 2026**.

Implementación del diseño entregado por Claude Design (handoff bundle) — visión "data-driven cálido" (estilo Whoop/Oura oscuro con alma cálida). Se implementó **tal cual el diseño**, sin adaptarlo al dashboard anterior, en una rama separada para no perder la UI previa.

## Marca Ignios (logo oficial)

El logo oficial es la **llama de Ignios** (de *ignis*; hereda el color de acento de la app vía `var(--accent)`/`var(--accent-2)`). Implementado en el componente `Logo` de `public/studio/app/studio/icons.jsx`. Favicon del Studio en `public/studio/app/favicon.svg` (llama ámbar fija). La **hoja de marca** oficial (lockups, escalas, acentos en claro/oscuro) está como página autónoma en **`/studio/marca.html`**.

Pendiente (fase C, cuando Studio sea la UI por defecto): aplicar el logo/favicon Ignios también al dashboard/landing legacy y a `src/app/icon.svg` (hoy siguen con la marca Endogym).

## Cómo verlo

1. `npm run dev`
2. Abrir **`/studio`** (el dashboard anterior sigue intacto en `/dashboard`). La hoja de marca en **`/studio/marca.html`**.

## Arquitectura de la implementación

El diseño es un SPA React. Para máxima fidelidad y aislamiento total del resto de la app, se monta como **bundle servido en un iframe**. **Está PRE-COMPILADO** (producción):

- `public/studio/app/studio/*` — código fuente del diseño (CSS, JSX, data.js). El JSX es la **fuente de verdad**; aquí se editan/añaden features.
- `scripts/build-studio.mjs` — compila ese JSX + **React de producción + Firebase (modular)** a un único `public/studio/app/studio.bundle.js` con **esbuild**. Sin Babel-in-browser, sin `unsafe-eval`, sin CDNs. Incluye la integración con el backend (coach `window.claude.complete`, token Firebase, fusión de datos reales). Se ejecuta en `npm run prebuild` (antes de cada `npm run build`) y manualmente con `npm run build:studio`.
- `public/studio/app/index.html` — carga solo `studio.bundle.js` (+ Google Fonts + favicon llama).
- `src/app/studio/page.js` — ruta Next `/studio`: iframe a pantalla completa de `/studio/app/index.html`. Aislamiento CSS/JS total respecto a la app.

> Tras editar cualquier archivo en `public/studio/app/studio/`, regenera el bundle con `npm run build:studio` (o `npm run build`, que lo hace en `prebuild`).

### Integraciones con el backend real

- **Coach IA ("Pregúntale al coach" + banner contextual):** el bundle define `window.claude.complete` → `POST /api/coach-chat` (`src/app/api/coach-chat/route.js`), que usa el transporte Gemini existente (`gemini-2.5-flash`). Requiere auth; si no hay sesión o falla, `coach.jsx` usa su respuesta de respaldo. **Funciona en vivo cuando el usuario está logueado en el mismo origen.**
- **Auth del iframe:** `GET /api/public-config` devuelve la config pública de Firebase; el shim inicializa Firebase web y lee la sesión existente del mismo origen para obtener el ID token.
- **Datos reales (fase 2 implementada):** `GET /api/studio-data` mapea datos reales del backend a la forma `window.STUDIO` y el cargador del bundle los fusiona sobre la muestra ANTES de renderizar (cada sección es defensiva: si faltan datos válidos, se conserva la muestra). Si no hay sesión, todo queda en muestra.

  **Ya REAL** (desde Firestore del usuario):
  - `user` — perfil (nombre, iniciales, objetivo, modalidad).
  - `todaySession` — sesión de hoy del último plan: título, foco, duración, intensidad (RPE→etiqueta), músculos primarios/secundarios, y la lista de ejercicios con esquema (series×reps), carga, cues y **vídeo real de YouTube** (`videoEmbedId` de `EXERCISE_VIDEO_MAP`).
  - `week` — los 7 días del plan (foco, carga relativa, hoy, descanso).
  - `library` — biblioteca derivada de los ejercicios del plan, con vídeos reales.
  - `macroTargets` / `macroEaten` — objetivo nutricional del plan y suma de comidas logueadas hoy.
  - `progress` — serie de peso (métricas), peso actual y deltas, sesiones hechas/planificadas.

  **Sigue en MUESTRA** (no existe equivalente en backend todavía): recetas de comidas (ingredientes/pasos), lista de compra, batch cooking, curva glucémica del día, y en progreso: strain/recovery/volumen muscular/PRs.

## Seguridad (CSP)

Tras la productización, la CSP de `/studio*` es **estricta**: `script-src 'self'` (sin `unsafe-eval`, sin CDNs). Lo único que se relaja respecto a la global es: `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` (para el iframe del mismo origen), Google Fonts en `style-src`/`font-src`, y miniaturas de YouTube en `img-src`. **El resto de la app conserva la CSP estricta global** (la regla global excluye `/studio` y `/studio/*` con un negative-lookahead para no duplicar la cabecera). Cubierto por `tests/lib/security-headers.test.js`.

## Verificación

- `node --check` OK en las 3 rutas API nuevas y en `next.config.mjs`; imports verificados.
- **`npm run build` NO se pudo correr en el sandbox** (Turbopack + artefactos de sincronización del Mac que inyectan carpetas `" 2"` en `.next`). Correr `npm run build` y revisar `/studio` en el navegador **en la Mac**.
- Verificación visual recomendada: `npm run dev` → `/studio` → probar tema claro/oscuro, móvil/ordenador (barra demo superior), reproductor de vídeo, panel Tweaks y "Pregúntale al coach" (logueado).
