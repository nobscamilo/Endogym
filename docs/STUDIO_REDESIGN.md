# Rediseño "Ignios" (Studio) — rama `redesign/endogym-studio` (mergeada a `main`)

Última actualización: **8 de junio de 2026 — P1/P2 Coach IA + nutrición alineada + puente auth móvil**.

## Lanzamiento oficial

- **Studio es la app por defecto**: desde el 7 jun 2026, si hay sesión activa (o demo sin Firebase), `/` renderiza el Studio en iframe (`src/app/page.js`). `/studio` quedó como alias que redirige a `/` (`src/app/studio/page.js`). El dashboard legacy sigue accesible en `/dashboard` como fallback.
- **Marca Ignios solo de cara al usuario**: landing/login (`page.js`), `metadata` (`layout.js`) y `manifest.js` dicen "Ignios". **Infra intacta** (proyecto Firebase/GCP `endogym`, bucket, dominio `endogym.vercel.app`).
- **Días/semana**: el planner ahora honra `daysPerWeek` (convierte días sobrantes en descanso activo) y `preferredDurationMinutes`, **gated por `studioAvailability`** (test: `tests/core/studio-availability-planner.test.js`).
- **Pendiente de marca**: clearance legal de "Ignios" antes de registro/dominio propio. No renombrar infraestructura `endogym`.

Implementación del diseño entregado por Claude Design (handoff bundle) — visión "data-driven cálido" (estilo Whoop/Oura oscuro con alma cálida). Se implementó **tal cual el diseño**, sin adaptarlo al dashboard anterior, en una rama separada para no perder la UI previa.

## Features funcionales (6 jun 2026)

- **Mapa muscular** (atlas Endogym recuperado) en Entreno → "Activación muscular": base `vector-muscles-base.png` + capas PNG recoloreadas por `drop-shadow` (primarios = `--accent`, secundarios = `--accent-2`). Mapeo ES/EN de músculos → capas en `screen-train.jsx` (`MUSCLE_LAYERS`).
- **Check-in de sesión** (Entreno → `CheckinCard`): completada (sí/no), RPE 1-10, fatiga, sueño y síntomas de alarma (dyspnea/jointPain/dizziness/tachycardia). POST a **`/api/workouts`** con `source:'daily_checkin'`. Alimenta el gate clínico del Coach IA. Requiere sesión.
- **Añadir/escanear alimento** (Nutrición → "Qué comer hoy" → `AddFood`): por código de barras (input → **`/api/products/barcode`**, OpenFoodFacts; + escaneo con cámara vía `BarcodeDetector` si el navegador lo soporta) o manual. POST a **`/api/meals`** y actualiza en vivo las kcal/macros consumidas. El iframe lleva `allow="camera"`.

- **Plan nutricional semanal con IA** (Nutrición → botón "Generar mi plan con IA"): genera con Gemini 7 días (`days[]`), 4 comidas/día, lista de compra semanal y batch cooking, personalizado al perfil/objetivo/macros y al entrenamiento de cada día. Endpoint **`/api/studio-nutrition`** (`GET` cache semanal, `POST` regeneración, auth, JSON estructurado con `responseJsonSchema`, `maxDuration=60`). El servidor valida kcal/proteína por día, reintenta una vez ante drift y no guarda planes completos con drift severo. El cache lleva `meta.planSignature` y se invalida si cambia el plan de entrenamiento/fase/macros. Requiere sesión; coste/latencia de varias llamadas Gemini pequeñas en paralelo.

> Estas features se editan en `public/studio/app/studio/{screen-train,screen-nutrition}.jsx` + `screens.css` y requieren **regenerar el bundle** (`npm run build:studio`, mantenedor) y commitearlo.

## Disponibilidad y swap (epic Endogym, por fases)

- **Fase 1 — Encuesta de disponibilidad (hecha):** en Perfil (`AvailabilitySurvey`): objetivo, equipo (→`trainingModality`), min/sesión (`preferredDurationMinutes`), días/semana (`daysPerWeek`), comidas/día, y cada cuántas semanas re-preguntar (`resurveyWeeks`). Endpoint **`/api/studio-availability`** (merge PARCIAL del perfil con `upsertUserProfile`, no resetea; marca `studioAvailability:true`). Al guardar, regenera el plan (`/api/weekly-plan`) y refresca datos. El planner honra `preferredDurationMinutes` **solo si `studioAvailability===true`** (no altera defaults ni tests).
  - **Objetivo, equipo, tiempo, comidas y días/semana re-ajustan el plan/macros de verdad** (el planner ya los usa, gated por `studioAvailability`).
- **Fase 2 — Swap de ejercicios (hecho):** endpoint **`/api/studio-swap`** (POST) cambia un ejercicio (`scope:'one'` + `exerciseId`) o toda la sesión de hoy (`scope:'all'`) con alternativas de `suggestExerciseAlternatives()` y **lógica no-repeat** (evita ejercicios de otros días del plan). `reason`: `variety` | `time` (recorta nº de ejercicios) | `equipment`. Aplica en servidor (persiste el plan) y el cliente refresca `/api/studio-data`. UI en Entreno: botón "Cambiar" por ejercicio (necesita `id`, ya expuesto en `studio-data`) y "Cambiar sesión" con selector de motivo.
  - **Honor de `daysPerWeek` (hecho):** el planner convierte los días de entreno sobrantes en descanso activo cuando `daysPerWeek` es menor (gated por `studioAvailability`).

## Marca Ignios (logo oficial)

El logo oficial es la **llama de Ignios** (de *ignis*; hereda el color de acento de la app vía `var(--accent)`/`var(--accent-2)`). Implementado en el componente `Logo` de `public/studio/app/studio/icons.jsx`. Favicon del Studio en `public/studio/app/favicon.svg` (llama ámbar fija). La **hoja de marca** oficial (lockups, escalas, acentos en claro/oscuro) está como página autónoma en **`/studio/marca.html`**.

Pendiente de marca: aplicar el logo/favicon Ignios también al dashboard legacy y a `src/app/icon.svg` (hoy siguen con la marca Endogym). No renombrar recursos de infraestructura sin decisión explícita.

## Cómo verlo

1. `npm run dev`
2. Abrir **`/`** con sesión activa (o demo sin Firebase). **`/studio`** redirige a `/`. El dashboard anterior sigue intacto en `/dashboard`. La hoja de marca está en **`/studio/marca.html`**.

## Arquitectura de la implementación

El diseño es un SPA React. Para máxima fidelidad y aislamiento total del resto de la app, se monta como **bundle servido en un iframe**. **Está PRE-COMPILADO** (producción):

- `public/studio/app/studio/*` — código fuente del diseño (CSS, JSX, data.js). El JSX es la **fuente de verdad**; aquí se editan/añaden features.
- `public/studio/app/studio.bundle.js` — **artefacto compilado y COMMITEADO** (React de producción + Firebase modular + el JSX + la integración backend: coach `window.claude.complete`, token Firebase, fusión de datos reales). Sin Babel-in-browser, sin `unsafe-eval`, sin CDNs. La app **NO** necesita esbuild para `npm install` ni `npm run build`; el bundle ya viene compilado en el repo y se despliega tal cual.
- `scripts/build-studio.mjs` + `npm run build:studio` — **herramienta solo de mantenedor** para regenerar el bundle con esbuild. `esbuild` **NO** es dependencia del proyecto (su binario es nativo por plataforma y `node_modules` se comparte entre macOS y el sandbox Linux, lo que rompería). Para regenerar en tu máquina: `npm i -D esbuild` temporal (no lo dejes en el lockfile compartido), `npm run build:studio`, luego desinstálalo.
- `public/studio/app/index.html` — carga solo `studio.bundle.js` (+ Google Fonts + favicon llama).
- `src/app/page.js` — monta el iframe de `/studio/app/index.html` en `/` cuando hay sesión.
- `src/app/studio/page.js` — alias legacy `/studio` que redirige a `/`.

> Tras editar cualquier archivo fuente en `public/studio/app/studio/`, hay que **regenerar y commitear** `studio.bundle.js` (lo hace el mantenedor con esbuild). Mientras no se regenere, el iframe sigue sirviendo el bundle anterior.

### Integraciones con el backend real

- **Coach IA ("Pregúntale al coach" + guía contextual):** el bundle define `window.claude.complete` → `POST /api/coach-chat` (`src/app/api/coach-chat/route.js`), que usa el transporte Gemini existente (`gemini-2.5-flash`). Requiere auth y aplica rate limit persistente `coach-chat` (20/h por defecto) antes de llamar al proveedor. Si no hay sesión o falla, `coach.jsx` usa respuesta de respaldo honesta. El banner estático ya no se presenta como IA live ni inventa métricas personales; la IA live es el modal de preguntas.
- **Auth del iframe:** `GET /api/public-config` devuelve la config pública de Firebase; el shim inicializa Firebase web y lee la sesión existente del mismo origen para obtener el ID token. Además, desde el 8 jun 2026 la raíz `/` entrega el token al iframe por `postMessage` same-origin (`IGNIOS_AUTH_TOKEN`) y el iframe lo solicita con `IGNIOS_TOKEN_REQUEST`. Esto evita que Safari/móvil caiga al dataset demo si la restauración interna de Firebase Auth llega tarde. No pasar tokens por URL.
- **Datos reales (fase 2 implementada):** `GET /api/studio-data` mapea datos reales del backend a la forma `window.STUDIO` y el cargador del bundle los fusiona sobre la muestra ANTES de renderizar (cada sección es defensiva: si faltan datos válidos, se conserva la muestra). Si hay bloque activo, recalcula un overlay adaptativo en lectura para que el Studio muestre fatiga/FC/check-in recientes sin regenerar el mesociclo. Si no hay sesión, todo queda en muestra.

  **Ya REAL** (desde Firestore del usuario):
  - `user` — perfil (nombre, iniciales, objetivo, modalidad).
  - `todaySession` — sesión de hoy del último plan: título, foco, duración, intensidad (RPE→etiqueta), músculos primarios/secundarios, y la lista de ejercicios con esquema (series×reps), carga, cues y **vídeo real de YouTube** (`videoEmbedId` de `EXERCISE_VIDEO_MAP`).
  - `week` — los 7 días del plan (foco, carga relativa, hoy, descanso).
  - `library` — biblioteca derivada de los ejercicios del plan, con vídeos reales.
  - `macroTargets` / `macroEaten` — objetivo nutricional del plan y suma de comidas logueadas hoy.
  - `progress` — serie de peso (métricas), peso actual y deltas, sesiones hechas/planificadas.
  - `coachAdjust` — reglas adaptativas reales del plan; la UI muestra estas reglas o un estado vacío, no claims fijos.

  **Glucemia y Progreso reales (6 jun, de-sample):** carga glucémica e índice insulínico del día desde las comidas registradas; en Progreso: peso, sesiones, adherencia, **strain** (RPE de check-ins), **recovery** (proxy sueño/fatiga del último check-in), **volumen por grupo** (del plan) y **PRs** (entrenos con carga). Todo con **estados vacíos honestos** cuando no hay datos. La **curva continua** de glucosa muestra una nota (necesita CGM). Recetas/compra/batch se generan con IA (botón).

  **Sigue en MUESTRA** solo en modo demo (sin login): los datos de ejemplo de `data.js`. Con sesión, el contenido es real o vacío.

## Seguridad (CSP)

Tras la productización, la CSP de `/studio*` es **estricta**: `script-src 'self'` (sin `unsafe-eval`, sin CDNs). Lo único que se relaja respecto a la global es: `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` (para el iframe del mismo origen), Google Fonts en `style-src`/`font-src`, y miniaturas de YouTube en `img-src`. **El resto de la app conserva la CSP estricta global** (la regla global excluye `/studio` y `/studio/*` con un negative-lookahead para no duplicar la cabecera). Cubierto por `tests/lib/security-headers.test.js`.

## Verificación

Verificación local del 8 jun 2026:

- `npm run build:studio` OK; bundle cache-bust `b3fd227a1c`.
- `npm run check:conflicts`, `npm run audit`, `npm run smoke`, `npm test` (22 archivos, 103 tests) y `npm run build` OK.
- `npm run dev` + HTTP local: `/`, `/studio/app/index.html` y `/studio/app/studio.bundle.js` responden `200`.
- Comprobado en fuente/bundle: eliminadas cadenas antiguas `IA · ahora` y `Marta García`; fuente usa `Guía contextual`.
- Playwright instalado (`playwright` devDependency; Chromium descargado con `npx playwright install chromium`).
- Verificación visual local con Playwright:
  - `/` muestra landing/login al estar `.env.local` con `AUTH_DISABLED=false`.
  - `/studio/app/index.html` renderiza Studio demo completo sin `pageerror`.
  - Entreno → Semana muestra `Ajustes del coach`, no muestra `Miércoles más suave` ni `+1 serie el viernes`, y muestra el estado vacío honesto.
  - En padre same-origin simulado, viewport móvil y desktop: el iframe recibió token por `postMessage`, `/api/studio-data` fue llamado con `Authorization`, y la sesión real interceptada sustituyó el demo `Empuje · Fuerza`.

Verificación producción del 8 jun 2026:

- Deploy `dpl_DhMpiLwCJtBgJEYfDGMDqVWY1sSg`; alias `endogym.vercel.app` reasignado manualmente.
- `https://endogym.vercel.app/studio/app/index.html?verify=b3fd227a1c` sirve `studio.bundle.js?v=b3fd227a1c`.
- Playwright móvil contra assets de producción: puente padre→iframe OK (`Authorization: Bearer prod-token-parent` en `/api/studio-data`), sin `pageerror`, sin mostrar el demo de torso cuando hay token.

Para cambios visuales futuros: revisar `/` logueado en desktop/móvil, tema claro/oscuro, modal "Pregúntale al coach", Entreno → ajustes del coach y Nutrición → generación/cache semanal.
