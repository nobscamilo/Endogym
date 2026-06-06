# Rediseño "Endogym Studio" (rama `redesign/endogym-studio`)

Última actualización: **6 de junio de 2026**.

Implementación del diseño entregado por Claude Design (handoff bundle) — visión "data-driven cálido" (estilo Whoop/Oura oscuro con alma cálida). Se implementó **tal cual el diseño**, sin adaptarlo al dashboard anterior, en una rama separada para no perder la UI previa.

## Cómo verlo

1. `npm run dev`
2. Abrir **`/studio`** (el dashboard anterior sigue intacto en `/dashboard`).

## Arquitectura de la implementación

El diseño es un SPA React 18 + Babel-in-browser (prototipo). Para máxima fidelidad y aislamiento total del resto de la app, se monta como **bundle estático servido en un iframe**:

- `public/studio/app/` — bundle del diseño tal cual (CSS, JSX, data.js, assets). Entry: `public/studio/app/index.html` (añade Google Fonts: Bricolage Grotesque + Manrope + Space Mono, y el shim de integración).
- `src/app/studio/page.js` — ruta Next `/studio`: iframe a pantalla completa de `/studio/app/index.html`. Aislamiento CSS/JS total respecto a la app.

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

El bundle usa Babel-in-browser (requiere `'unsafe-eval'`) + React/Babel desde CDN (unpkg) + Firebase web (gstatic). Por eso `next.config.mjs` aplica una **CSP relajada SOLO a `/studio*`** (con `X-Frame-Options: SAMEORIGIN` para permitir el iframe del mismo origen). **El resto de la app conserva la CSP estricta global** (la regla global excluye `/studio` con un negative-lookahead para no duplicar la cabecera CSP).

> Hardening recomendado para producción: pre-compilar el bundle (eliminar Babel-in-browser y los CDNs, empaquetar React localmente) para poder retirar `'unsafe-eval'` y las fuentes CDN de la CSP de `/studio`. Eso equivale a portar el prototipo a componentes Next nativos.

## Verificación

- `node --check` OK en las 3 rutas API nuevas y en `next.config.mjs`; imports verificados.
- **`npm run build` NO se pudo correr en el sandbox** (Turbopack + artefactos de sincronización del Mac que inyectan carpetas `" 2"` en `.next`). Correr `npm run build` y revisar `/studio` en el navegador **en la Mac**.
- Verificación visual recomendada: `npm run dev` → `/studio` → probar tema claro/oscuro, móvil/ordenador (barra demo superior), reproductor de vídeo, panel Tweaks y "Pregúntale al coach" (logueado).
