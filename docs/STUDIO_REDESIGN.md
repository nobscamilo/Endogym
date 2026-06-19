# Rediseño "Ignios" (Studio) — rama `redesign/endogym-studio` (mergeada a `main`)

Última actualización: **19 de junio de 2026, noche-2 — Análisis del coach orientado a objetivos, local**.

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
- **Objetivos SMART y prescripción data-driven (11 jun):** Perfil guarda `profile.goalTarget` (peso objetivo o e1RM + fecha) y Progreso muestra "Tu objetivo" con meta, valor actual, tendencia y predicción. La fuerza progresa con DAPRE por reps/RPE reales; calentamiento/vuelta a la calma y selección de ejercicios respetan comorbilidades.
- **Perfil por jerarquía (11 jun, noche-4):** la encuesta de Perfil separa objetivo principal, meta medible, modalidad/equipo, subobjetivo de carrera y datos personales. La opción visible `Mixto` se sustituyó por **Flexible** (valor interno `mixed` intacto). El resumen del bloque enseña microciclo, mesociclo/bloque de 21 días, revisión y fecha clave para hacer visible la periodización real.
- **Nutrición por calendario local (12 jun):** el rail de días se sincroniza con la semana civil del navegador y selecciona hoy por `dateISO`; el backend usa `Europe/Madrid` por defecto para "hoy", límites de comidas y `weekKey` del plan nutricional. Esto evita que pasada medianoche en España se siga mostrando el día UTC anterior o un índice obsoleto del cache.
- **Prescripción desde Perfil (15 jun, desplegada):** Perfil añade `trainingExperience` (Base/Intermedio/Avanzado). El backend lo persiste y lo usa para modular volumen/series/descanso. Si `daysPerWeek` recorta el microciclo, el planner conserva sesiones prioritarias por objetivo/modalidad (p. ej. tirada larga + calidad + fuerza para `Correr + gym` con carrera) en lugar de guardar los primeros días del calendario.
- **Cambio de grupo muscular (15–19 jun, desplegado):** Entreno muestra "Grupo muscular" en cualquier día con sesión. En fuerza/mixto reconstruye el foco; en cardio/carrera/recuperación convierte el día a fuerza con aviso clínico. `POST /api/studio-swap` mantiene guardarraíles de adyacencia y volumen semanal; la reprogramación por intercambio sigue limitada a días de fuerza/mixto reales.
- **Consonancia del coach con el objetivo (19 jun, local):** la tarjeta “Análisis del coach” muestra un bloque `goalAlignment`; el servidor aporta SMART/meta/tendencia/fecha y señales deterministas de carrera. Informes legacy se marcan stale mediante firma de contexto `v2`. Bundle local `29b865f9b9`, pendiente de deploy.

> Estas features se editan en `public/studio/app/studio/{screen-train,screen-nutrition}.jsx` + `screens.css` y requieren **regenerar el bundle** (`npm run build:studio`, mantenedor) y commitearlo.

## Disponibilidad y swap (epic Endogym, por fases)

- **Fase 1 — Encuesta de disponibilidad (hecha):** en Perfil (`AvailabilitySurvey`): objetivo, equipo (→`trainingModality`), min/sesión (`preferredDurationMinutes`), días/semana (`daysPerWeek`), comidas/día, y cada cuántas semanas re-preguntar (`resurveyWeeks`). Endpoint **`/api/studio-availability`** (merge PARCIAL del perfil con `upsertUserProfile`, no resetea; marca `studioAvailability:true`). Al guardar, regenera el plan (`/api/weekly-plan`) y refresca datos. El planner honra `preferredDurationMinutes` **solo si `studioAvailability===true`** (no altera defaults ni tests).
  - **Objetivo, equipo, tiempo, comidas y días/semana re-ajustan el plan/macros de verdad** (el planner ya los usa, gated por `studioAvailability`).
- **Fase 2 — Swap de ejercicios y foco muscular (hecho):** endpoint **`/api/studio-swap`** (POST) cambia un ejercicio (`scope:'one'` + `exerciseId`) o toda la sesión de hoy (`scope:'all'`) con alternativas de `suggestExerciseAlternatives()` y **lógica no-repeat** (evita ejercicios de otros días del plan). `reason`: `variety` | `time` (recorta nº de ejercicios) | `equipment`. También acepta `scope:'focus'` + `sessionFocus` (`upper`/`push`/`pull`/`lower`/`full_body`) para cambiar el grupo muscular de fuerza/mixto sin regenerar el bloque; el servidor bloquea conflictos con días adyacentes. Aplica en servidor (persiste el plan) y el cliente refresca `/api/studio-data`. UI en Entreno: botón "Cambiar" por ejercicio (necesita `id`, ya expuesto en `studio-data`), "Cambiar sesión" con selector de motivo y control "Grupo muscular".
  - **Honor de `daysPerWeek` (hecho):** el planner convierte los días de entreno sobrantes en descanso activo cuando `daysPerWeek` es menor (gated por `studioAvailability`).
  - **Mejoras posteriores ya cerradas:** matriz previa de opciones disponibles/bloqueadas, intercambio con sesión vecina cuando es válido, check-in de molestias por zona, inventario/equipamiento y favoritos/excluidos, registro por serie, explicación determinista y fuentes RAG. Consulta `docs/ROADMAP.md` para el estado detallado.

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

- **Coach IA ("Pregúntale al coach" + guía contextual):** el bundle define `window.claude.complete` → `POST /api/coach-chat` (`src/app/api/coach-chat/route.js`) enviando `{ message }`. El servidor mantiene la persona única en `coachPersona.js`, evalúa red flags deterministas antes de Gemini/rate limit y usa el transporte Gemini existente (`gemini-2.5-flash`) en el flujo normal. Requiere auth y aplica rate limit persistente `coach-chat` (20/h por defecto). Si no hay sesión o falla, `coach.jsx` usa respuesta de respaldo honesta. El banner estático ya no se presenta como IA live ni inventa métricas personales; la IA live es el modal de preguntas. En móvil, el modal se monta por portal en `document.body`, bloquea el scroll de fondo y mantiene el input dentro del viewport.
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

Verificación local adicional del 11 jun 2026, noche-4:

- `npm run build:studio` OK; bundle cache-bust `6ff6352714`.
- `npm run check:conflicts`, `npm run audit` (0 vulnerabilidades), `npm run smoke`, `npm test` (33 archivos, 232 tests) y `npm run build` OK.
- Playwright móvil 390x844 contra `/studio/app/index.html`: Perfil muestra objetivo/modalidad como tarjetas y `Flexible` en lugar de `Mixto`; el modal del coach cubre la app, no muestra la tabbar y el input queda dentro del viewport (`bottom=831` de `844`).

Verificación producción del 12 jun 2026:

- Deploy `dpl_EXhggnVun7yJjDP4pLjAxFKJqR7S`, alias manual `endogym.vercel.app` → `https://endogym-8npkwk39l-juan-camilo-sarmientos-projects.vercel.app`.
- `https://endogym.vercel.app/studio/app/index.html?verify=6ff6352714` sirve `studio.bundle.js?v=6ff6352714`; el bundle responde `200` y contiene `Flexible`, `Microciclo`, `Mesociclo` y `__createPortal`.
- Sondas públicas: `/` `200`, `/api/health` `200`, `/api/meals` sin token `401`, `POST /api/coach-chat` sin token `401`.

Verificación local y producción adicional del 12 jun 2026, madrugada-2:

- `npm run build:studio` OK; bundle cache-bust `08bbcab4a0`.
- `npm run check:conflicts`, `npm run audit` (0 vulnerabilidades), `npm run smoke`, `npm test` (34 archivos, 235 tests) y `npm run build` OK.
- Playwright local contra `/studio/app/index.html`: Nutrición muestra `Vie 12` activo y no conserva `Lun 8` al abrir la pantalla.
- Deploy `dpl_AGJGm6iWwmRP3YLrd8N9pgk8HoQq`, alias manual `endogym.vercel.app` → `https://endogym-a96u5x4jk-juan-camilo-sarmientos-projects.vercel.app`.
- `https://endogym.vercel.app/studio/app/index.html?verify=08bbcab4a0` sirve `studio.bundle.js?v=08bbcab4a0`; Playwright producción muestra `Vie 12` activo en Nutrición.

Verificación local adicional del 15 jun 2026:

- `npm run build:studio` OK; bundle cache-bust `a0e5d9dc07`.
- `npm run check:conflicts`, `npm run audit` (0 vulnerabilidades), `npm run smoke`, `npm test` (36 archivos, 251 tests) y `npm run build` OK.
- Playwright local contra `/studio/app/index.html`: Perfil desktop/móvil muestra el bloque "Nivel actual" sin overflow y Entreno desktop/móvil muestra el control "Grupo muscular" sin overflow.

Verificación local y producción adicional del 19 jun 2026:

- `npm test`: 42 archivos / 296 tests verdes.
- Commit `8e46bd1`, deployment `dpl_yiR1GVoJnYZVdo4njGxy7yqbNwVF` `Ready`, bundle `097b1b9fba`.
- Sondas: `/` `200`, `/api/health` `200`, `/api/meals` sin token `401`, bundle `200`.

Verificación local adicional del 19 jun 2026, noche-2:

- `npm run build:studio` → bundle `29b865f9b9`.
- `check:conflicts`, audit (0), smoke, 43 archivos / 308 tests y `npm run build` OK.
- Studio local: Progreso renderiza sin errores de consola; el contenido autenticado nuevo queda cubierto por tests de ruta/contrato y por presencia en el bundle.
