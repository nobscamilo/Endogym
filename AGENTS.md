# AGENTS.md - Guia para agentes que trabajen en Endogym

## Proposito

> **Marca (3 de junio de 2026):** nuevo nombre interno **"Ignios"** (sustituye a "Endogym" en comunicación interna). Cambio NO global: falta logo; código, dominio `endogym.vercel.app`, buckets y proyectos Firebase/GCP siguen como "endogym". No renombres infraestructura ni hagas find-replace masivo sin orden explícita del usuario. Marca verificada solo a nivel web (sin conflicto activo; pendiente clearance formal USPTO/EUIPO). Fallback: "Emberfit".

Endogym es un MVP en construccion para nutricion, seguimiento glucemico y entrenamiento. Antes de modificar codigo, lee:

1. `README.md`
2. `docs/PROJECT_STATUS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/API.md`
5. `docs/DEPLOYMENT.md`
6. `docs/SECURITY.md`
7. `docs/OBSERVABILITY.md`
8. `docs/ROADMAP.md`

## Regla de verdad

Distingue siempre entre:

- implementado en codigo;
- verificado localmente;
- verificado end-to-end con servicios reales;
- bloqueado por configuracion externa.

Actualiza los `.md` afectados al finalizar cambios. Evita reescribir documentos sin motivo: genera ruido y aumenta el riesgo de conflictos.

## Estado confirmado el 2 de junio de 2026

- Vercel responde en `/` y `/api/health`; `/api/meals` sin token responde `401`. Producción fue redesplegada manualmente el 8 de junio de 2026 a `dpl_DhMpiLwCJtBgJEYfDGMDqVWY1sSg`; el alias `endogym.vercel.app` tuvo que reasignarse manualmente al deployment nuevo. Vuelve a comprobarlo antes de afirmarlo en conversaciones futuras.
- Firebase Auth, la API key publica del cliente y Google OAuth para `endogym.vercel.app` se verificaron con sondas reales.
- Firebase Admin y Firestore funcionan localmente y en produccion.
- Las fotos de platos usan el bucket privado `endogym-vtety8-plates-eu`; upload y borrado fueron verificados.
- Gemini Developer API funciona en produccion con una key restringida. Los servicios Vertex estan deshabilitados: no los habilites.
- `POST /api/analyze-plate` fue verificado con Gemini live y conserva fallback heuristico observable para fallos futuros.
- `POST /api/weekly-plan` fue verificado con coaching Gemini live; usa `gemini-2.5-flash`, timeout acotado y fallback ACSM observable.
- Las fotos caducan a los 30 dias y el bucket no conserva soft delete.
- Las rutas IA aplican rate limiting persistente en Firestore.
- `POST /api/coach-chat` aplica rate limiting persistente en Firestore (`coach-chat`, 20 preguntas/h por defecto) y devuelve cabeceras de rate limit.
- Los entrenos manuales conservan `exercise.id` en Firestore; el flujo API/repositorio/planner está cubierto por tests para que `liftHistory` pueda progresar cargas por ID estable. Los registros legacy sin ID tienen fallback por nombre normalizado (`loadSource:'history_name'`), menos fiable que el ID.
- Los bloques activos de 21 días no se regeneran automáticamente, pero `weekly-plan` y `studio-data` recalculan un **overlay adaptativo diario** (`adaptiveOverlay`) desde datos recientes para que fatiga/FC/check-in se reflejen sin romper el mesociclo.
- `POST /api/studio-nutrition` valida drift de kcal/proteína por día, reintenta una vez ante desvíos y rechaza planes completos con drift severo antes de guardarlos. El cache semanal lleva `meta.planSignature`; `GET` devuelve `stale:true`/`empty:true` si el entreno/macros/fase ya no coinciden.
- El Studio no debe mostrar claims personales estáticos como si fueran IA live: los banners usan datos reales (`coachAdjust`) o copia contextual honesta.
- `npm run audit` devuelve `0` vulnerabilidades.
- El frontend tiene Firebase Client Auth implementado; `x-dev-user-id` solo pertenece al modo local explicito.
- La raíz `/` pasa el Firebase ID token al iframe del Studio por `postMessage` de mismo origen (`IGNIOS_AUTH_TOKEN`/`IGNIOS_TOKEN_REQUEST`) para evitar que móvil/iframe caiga al dataset demo por carrera de restauración de sesión. No pasar tokens por URL.
- Las estimaciones nutricionales, glucemicas e insulinicas no son diagnostico medico.
- El menú lateral es tipo hamburguesa desplegable (verificado localmente y en producción).
- El atlas anatómico usa `gymbro-front-crop.png` (vista frontal) y `gymbro-back-crop.png` (vista posterior); colores primarios azul-magenta intenso (#7c3aed / #a855f7) y secundarios azul-magenta tenue. Vistas corregidas y posicionamiento ajustado.
- La biblioteca muestra tarjetas colapsables por categoría con modal de detalle por ejercicio (verificado localmente y en producción).
- La landing retiró claims no sustentados, reemplazó imágenes remotas por assets propios y añadió recuperación de contraseña. Se verificó localmente y en producción con Playwright.
- El check-in diario persiste síntomas estructurados, usa upsert idempotente `daily-YYYY-MM-DD`, rehidrata estado por fecha y bloquea alta intensidad ante síntomas de alarma. La encuesta omitida conserva RPE, fatiga y sueño como `null`.
- El mapa de vídeos conserva solo las 14 asociaciones verificadas por YouTube oEmbed el 2 de junio; el resto usa fallback SVG local.
- Las cabeceras HTTP defensivas están activas en producción. La separación de rechazos auth esperados en logs está desplegada; no se reconsultaron Runtime Logs filtrados por limitación del CLI.
- `main` local está cinco commits por delante de `origin/main` y conserva cambios sin commit desplegados manualmente; sincroniza GitHub antes de tratar el runtime como reproducible desde el repositorio remoto.
- **Análisis del coach (9 jun 2026):** `GET/POST /api/coach-analysis` genera/cachea un informe del coach sobre los entrenos realizados (lógica en `src/services/coachAnalysis.js`, informe en `users/{uid}/coachReports/latest` con firma de invalidación, rate limit `coach-analysis` 6/h, fallback heurístico observable). Progreso muestra "Análisis del coach" y el historial (`recentWorkouts` en `studio-data`).
- **Historial + análisis por sesión (9 jun 2026, tarde):** `GET /api/workout-history` (paginado por cursor `before`, análisis inline) y `POST /api/workout-analysis { workoutId }` (análisis de UNA sesión, caché permanente en `users/{uid}/workoutAnalyses/{workoutId}`, hits de caché sin rate limit). UI en Progreso: "Historial de entrenos" expandible con "Cargar más" y "Analizar esta sesión". Bundle `355c009f1a`. Verificado con sonda real + 114 tests en sandbox; `npm run build` pendiente en la Mac.
- **Cuentas saneadas (10 jun 2026):** la única cuenta del usuario es `juancamilo.sarmiento@gmail.com` (uid `58aIC…`). La icloud y los árboles huérfanos fueron eliminados (check-in del 9 jun migrado a gmail antes de borrar). Auth y Firestore están alineados: 5 cuentas reales + `dev-user`. Solo hay una conexión Strava.
- **El sandbox Linux ya ejecuta vitest** (verificado 9 jun: 23 archivos/110 tests); `npm run build` (Next) sigue fallando ahí por EPERM en `.next/` → ejecutar en la Mac.

## Arquitectura acordada

Usa **Ruta A**:

- Vercel ejecuta app y Route Handlers.
- Firebase Authentication gestiona identidad.
- Firestore conserva datos.
- El bucket privado `endogym-vtety8-plates-eu` conserva fotos mediante Firebase Admin.
- Google AI debe usar exclusivamente Gemini Developer API mediante adaptadores inyectables.

No migres a Firebase Hosting o App Hosting sin decision explicita del usuario.
No habilites Vertex AI.

## Seguridad obligatoria

- Nunca agregues secretos, tokens, API keys ni `.env` reales al repositorio.
- Usa `.env.example` solo como plantilla.
- `AUTH_DISABLED=true` es exclusivamente local.
- Si aparece un secreto en chat, logs o commits, recomienda revocarlo y rotarlo.
- Revisa `docs/SECURITY.md` antes de tocar auth, uploads o IA.

## Reglas de implementacion

- Mantiene Route Handlers en `src/app/api/**/route.js`.
- Centraliza Firebase Admin en `src/lib/firebaseAdmin.js`.
- Centraliza Firestore en `src/lib/repositories/firestoreRepository.js`.
- Usa `withTrace()` para operaciones HTTP nuevas.
- Valida inputs antes de persistir o llamar proveedores.
- Conserva fallbacks explicitos y observables.
- Conserva el upsert diario determinista `daily-YYYY-MM-DD`; no vuelvas a guardar subjetivos desconocidos como cero.
- Para cambios visibles de UI, toma screenshot si el entorno lo permita (usa el MCP de Chrome DevTools).
- Al modificar `DashboardPage.js` o `styles.css`, ejecuta `npm run build` localmente antes de considerar el cambio listo.
- Los componentes de atlas anatómico residen en `src/components/MuscleMapFigure.js`; las imágenes en `public/anatomy/`. No reemplaces los modelos 3D sin actualización explícita de coordenadas de superposición.

## RAG de directrices médicas (cómo añadir libros)

El Coach IA inyecta contexto desde la colección Firestore `guidelines`. Pipeline para añadir un libro nuevo:

1. Copia el PDF a `docs/guidelines/` (o una subcarpeta; el parser camina recursivamente). Los PDFs no se suben a Vercel (`.vercelignore`).
2. `python3 scripts/parse_pdf_improved.py` — detecta PDFs sin JSON, los trocea (chunks de 8 páginas) y extrae keywords a `docs/guidelines-json/`.
3. `node --env-file=.env.local scripts/upload_guidelines.js` — sube cada JSON a `guidelines` (set por `id`, idempotente).

El retriever (`src/services/guidelinesRetriever.js`) tiene **dos modos**:
- **Principal — semántico (embeddings):** embebe una consulta en lenguaje natural y recupera pasajes con `findNearest` (COSINE) sobre la colección **`guideline_passages`** (7.128 pasajes, vectores `gemini-embedding-001` de 768 dims). Requiere el índice vectorial de Firestore.
- **Fallback — léxico (keywords):** scoring por keywords sobre `guidelines` (libros completos). Se activa solo si no hay `GEMINI_API_KEY`, si el embedding falla, o si `findNearest` falla (índice ausente) o no devuelve nada.

Para añadir embeddings de un libro nuevo (tras los pasos 1–3): `node --env-file=.env.local scripts/embed_guidelines.mjs` (resumable, sube a `guideline_passages`). El índice vectorial ya existente cubre los nuevos pasajes automáticamente.

Reglas importantes:
- El **vocabulario de keywords (fallback) es fuente de verdad** y vive en `scripts/parse_pdf_improved.py` (`ENGLISH_KEYWORDS` + `SPANISH_PORTUGUESE_MAP`); debe mantenerse **alineado** con `scripts/chunk_ocr_json.py`, `deriveKeywords()` y `NUTRITION_TERMS` en `guidelinesRetriever.js`. Si añades un término en uno, añádelo en todos.
- Si cambias el vocabulario, recomputa con `python3 scripts/rekey_guidelines.py` (lee el texto ya guardado, no necesita PDFs) y vuelve a subir con `upload_guidelines.js`.
- **Embeddings:** modelo `gemini-embedding-001`, 768 dims, L2-normalizados (obligatorio normalizar porque dim≠3072). Función `requestGoogleEmbeddings()` en `googleGenAiTransport.js`. No habilitar Vertex.
- El **índice vectorial** se crea con `gcloud` (ver `docs/DEPLOYMENT.md`); el service-account del repo no tiene permiso para crearlo.
- Estado al 10 jun 2026: `guidelines`=226 docs (fallback); `guideline_passages`=7.128 pasajes con vector. **Índice vectorial CREADO y verificado** (sonda real: `mode:'vector'`, 12 pasajes, ~20k chars). `coach-chat` también inyecta RAG desde el 10 jun (presupuesto 7k chars, timeout 4 s, fallback a vacío).

## Ignios Studio (LANZADO — app por defecto)

El rediseño "Ignios" (data-driven cálido) es la **UI por defecto y oficial en la raíz "/"** (desde 7 jun 2026): si hay sesión activa (o demo sin Firebase), `src/app/page.js` **renderiza el Studio en iframe en "/"** (antes redirigía a `/studio`); sin sesión muestra landing + login. **`/studio` quedó como alias que redirige a "/"** (`src/app/studio/page.js`). El dashboard legacy sigue en `/dashboard` como fallback. Marca **Ignios solo de cara al usuario** (landing/metadata/manifest); infra sigue "endogym" (NO renombrar).

Studio = bundle React **pre-compilado** con esbuild (`scripts/build-studio.mjs` → `public/studio/app/studio.bundle.js`, artefacto commiteado; esbuild NO es dependencia, ver `docs/STUDIO_REDESIGN.md`). El bundle se sirve como asset estático en `/studio/app/index.html` (lo embebe el iframe de "/"). Endpoints propios: `/api/studio-data` (datos reales: perfil, hoy, semana, biblioteca, macros, glucemia, progreso y overlay adaptativo del bloque activo), `/api/coach-chat` (coach IA con perfil real y rate limit persistente), `/api/studio-nutrition` (**plan semanal de comidas con Gemini: 7 días `days[]` + compra semanal + batch; `maxDuration=60`; validación per-day de macros antes de guardar; cache invalidado por `planSignature`**), `/api/analyze-plate` (foto del plato → macros/glucemia, registra la comida), `/api/studio-availability` (encuesta), `/api/studio-swap` (cambiar ejercicios), `/api/public-config`. CSP estricta global + relajada scoped a `/studio*` (assets del iframe) en `next.config.mjs`. **Tras editar `public/studio/app/studio/*` o `scripts/build-studio.mjs` hay que regenerar el bundle (`npm run build:studio`) y commitearlo.** Detalle en `docs/STUDIO_REDESIGN.md`.

## Verificacion minima

```bash
npm install
npm run check:conflicts
npm run audit
npm run smoke
npm test
npm run build
```

Cuando cambie configuracion externa, ejecuta ademas el checklist de `docs/DEPLOYMENT.md`.
