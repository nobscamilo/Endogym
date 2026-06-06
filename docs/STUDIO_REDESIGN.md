# Rediseño "Endogym Studio" (rama `redesign/endogym-studio`)

Última actualización: **6 de junio de 2026**.

Implementación del diseño entregado por Claude Design (handoff bundle) — visión "data-driven cálido" (estilo Whoop/Oura oscuro con alma cálida). Se implementó **tal cual el diseño**, sin adaptarlo al dashboard anterior, en una rama separada para no perder la UI previa.

## Features funcionales (6 jun 2026)

- **Mapa muscular** (atlas Endogym recuperado) en Entreno → "Activación muscular": base `vector-muscles-base.png` + capas PNG recoloreadas por `drop-shadow` (primarios = `--accent`, secundarios = `--accent-2`). Mapeo ES/EN de músculos → capas en `screen-train.jsx` (`MUSCLE_LAYERS`).
- **Check-in de sesión** (Entreno → `CheckinCard`): completada (sí/no), RPE 1-10, fatiga, sueño y síntomas de alarma (dyspnea/jointPain/dizziness/tachycardia). POST a **`/api/workouts`** con `source:'daily_checkin'`. Alimenta el gate clínico del Coach IA. Requiere sesión.
- **Añadir/escanear alimento** (Nutrición → "Qué comer hoy" → `AddFood`): por código de barras (input → **`/api/products/barcode`**, OpenFoodFacts; + escaneo con cámara vía `BarcodeDetector` si el navegador lo soporta) o manual. POST a **`/api/meals`** y actualiza en vivo las kcal/macros consumidas. El iframe lleva `allow="camera"`.

- **Fase 3 — Plan nutricional con IA** (Nutrición → botón "Generar mi plan con IA"): genera con Gemini recetas del día (ingredientes/pasos/carga glucémica), lista de la compra por categorías y batch cooking, personalizado al perfil/objetivo/macros. Endpoint **`/api/studio-nutrition`** (POST, auth, JSON estructurado con `responseJsonSchema`). Sustituye los datos de muestra de Nutrición al pulsar el botón. Requiere sesión; coste/latencia de una llamada Gemini (~varios segundos).

> Estas features se editan en `public/studio/app/studio/{screen-train,screen-nutrition}.jsx` + `screens.css` y requieren **regenerar el bundle** (`npm run build:studio`, mantenedor) y commitearlo.

## Disponibilidad y swap (epic Endogym, por fases)

- **Fase 1 — Encuesta de disponibilidad (hecha):** en Perfil (`AvailabilitySurvey`): objetivo, equipo (→`trainingModality`), min/sesión (`preferredDurationMinutes`), días/semana (`daysPerWeek`), comidas/día, y cada cuántas semanas re-preguntar (`resurveyWeeks`). Endpoint **`/api/studio-availability`** (merge PARCIAL del perfil con `upsertUserProfile`, no resetea; marca `studioAvailability:true`). Al guardar, regenera el plan (`/api/weekly-plan`) y refresca datos. El planner honra `preferredDurationMinutes` **solo si `studioAvailability===true`** (no altera defaults ni tests).
  - **Objetivo, equipo y comidas re-ajustan el plan/macros de verdad** (el planner ya los usa).
  - **`daysPerWeek` se persiste pero el planner aún NO cambia la frecuencia** (las plantillas son de 7 días fijos). Honrarlo requiere tocar `MODALITY_TEMPLATES`/planner con tests — pendiente.
- **Fase 2 — Swap de ejercicios (pendiente):** el backend tiene `suggestExerciseAlternatives()` (lógica del coach: no repetir) y el plan acepta `exerciseSwapsByDate`/`sessionSwapsByDate`/`durationOverridesByDate` (PATCH). Falta exponer alternativas vía API y cablear la UI (botón "Cambiar" por ejercicio y por sesión). Nota: la lógica que APLICA las customizations al plan mostrado vivía en el cliente viejo; conviene un endpoint que aplique en servidor y devuelva la sesión.

## Marca Ignios (logo oficial)

El logo oficial es la **llama de Ignios** (de *ignis*; hereda el color de acento de la app vía `var(--accent)`/`var(--accent-2)`). Implementado en el componente `Logo` de `public/studio/app/studio/icons.jsx`. Favicon del Studio en `public/studio/app/favicon.svg` (llama ámbar fija). La **hoja de marca** oficial (lockups, escalas, acentos en claro/oscuro) está como página autónoma en **`/studio/marca.html`**.

Pendiente (fase C, cuando Studio sea la UI por defecto): aplicar el logo/favicon Ignios también al dashboard/landing legacy y a `src/app/icon.svg` (hoy siguen con la marca Endogym).

## Cómo verlo

1. `npm run dev`
2. Abrir **`/studio`** (el dashboard anterior sigue intacto en `/dashboard`). La hoja de marca en **`/studio/marca.html`**.

## Arquitectura de la implementación

El diseño es un SPA React. Para máxima fidelidad y aislamiento total del resto de la app, se monta como **bundle servido en un iframe**. **Está PRE-COMPILADO** (producción):

- `public/studio/app/studio/*` — código fuente del diseño (CSS, JSX, data.js). El JSX es la **fuente de verdad**; aquí se editan/añaden features.
- `public/studio/app/studio.bundle.js` — **artefacto compilado y COMMITEADO** (React de producción + Firebase modular + el JSX + la integración backend: coach `window.claude.complete`, token Firebase, fusión de datos reales). Sin Babel-in-browser, sin `unsafe-eval`, sin CDNs. La app **NO** necesita esbuild para `npm install` ni `npm run build`; el bundle ya viene compilado en el repo y se despliega tal cual.
- `scripts/build-studio.mjs` + `npm run build:studio` — **herramienta solo de mantenedor** para regenerar el bundle con esbuild. `esbuild` **NO** es dependencia del proyecto (su binario es nativo por plataforma y `node_modules` se comparte entre macOS y el sandbox Linux, lo que rompería). Para regenerar en tu máquina: `npm i -D esbuild` temporal (no lo dejes en el lockfile compartido), `npm run build:studio`, luego desinstálalo.
- `public/studio/app/index.html` — carga solo `studio.bundle.js` (+ Google Fonts + favicon llama).
- `src/app/studio/page.js` — ruta Next `/studio`: iframe a pantalla completa de `/studio/app/index.html`. Aislamiento CSS/JS total respecto a la app.

> Tras editar cualquier archivo fuente en `public/studio/app/studio/`, hay que **regenerar y commitear** `studio.bundle.js` (lo hace el mantenedor con esbuild). Mientras no se regenere, el iframe sigue sirviendo el bundle anterior.

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

  **Glucemia y Progreso reales (6 jun, de-sample):** carga glucémica e índice insulínico del día desde las comidas registradas; en Progreso: peso, sesiones, adherencia, **strain** (RPE de check-ins), **recovery** (proxy sueño/fatiga del último check-in), **volumen por grupo** (del plan) y **PRs** (entrenos con carga). Todo con **estados vacíos honestos** cuando no hay datos. La **curva continua** de glucosa muestra una nota (necesita CGM). Recetas/compra/batch se generan con IA (botón).

  **Sigue en MUESTRA** solo en modo demo (sin login): los datos de ejemplo de `data.js`. Con sesión, el contenido es real o vacío.

## Seguridad (CSP)

Tras la productización, la CSP de `/studio*` es **estricta**: `script-src 'self'` (sin `unsafe-eval`, sin CDNs). Lo único que se relaja respecto a la global es: `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` (para el iframe del mismo origen), Google Fonts en `style-src`/`font-src`, y miniaturas de YouTube en `img-src`. **El resto de la app conserva la CSP estricta global** (la regla global excluye `/studio` y `/studio/*` con un negative-lookahead para no duplicar la cabecera). Cubierto por `tests/lib/security-headers.test.js`.

## Verificación

- `node --check` OK en las 3 rutas API nuevas y en `next.config.mjs`; imports verificados.
- **`npm run build` NO se pudo correr en el sandbox** (Turbopack + artefactos de sincronización del Mac que inyectan carpetas `" 2"` en `.next`). Correr `npm run build` y revisar `/studio` en el navegador **en la Mac**.
- Verificación visual recomendada: `npm run dev` → `/studio` → probar tema claro/oscuro, móvil/ordenador (barra demo superior), reproductor de vídeo, panel Tweaks y "Pregúntale al coach" (logueado).
