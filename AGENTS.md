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

- Vercel responde en `/` y `/api/health`; `/api/meals` sin token responde `401`. Producción fue redesplegada manualmente el 2 de junio de 2026 a `dpl_FJ2jWbaV8Ktjy9G57aKMDaVB4t9r`; vuelve a comprobarlo antes de afirmarlo en conversaciones futuras.
- Firebase Auth, la API key publica del cliente y Google OAuth para `endogym.vercel.app` se verificaron con sondas reales.
- Firebase Admin y Firestore funcionan localmente y en produccion.
- Las fotos de platos usan el bucket privado `endogym-vtety8-plates-eu`; upload y borrado fueron verificados.
- Gemini Developer API funciona en produccion con una key restringida. Los servicios Vertex estan deshabilitados: no los habilites.
- `POST /api/analyze-plate` fue verificado con Gemini live y conserva fallback heuristico observable para fallos futuros.
- `POST /api/weekly-plan` fue verificado con coaching Gemini live; usa `gemini-2.5-flash`, timeout acotado y fallback ACSM observable.
- Las fotos caducan a los 30 dias y el bucket no conserva soft delete.
- Las rutas IA aplican rate limiting persistente en Firestore.
- `npm run audit` devuelve `0` vulnerabilidades.
- El frontend tiene Firebase Client Auth implementado; `x-dev-user-id` solo pertenece al modo local explicito.
- Las estimaciones nutricionales, glucemicas e insulinicas no son diagnostico medico.
- El menú lateral es tipo hamburguesa desplegable (verificado localmente y en producción).
- El atlas anatómico usa `gymbro-front-crop.png` (vista frontal) y `gymbro-back-crop.png` (vista posterior); colores primarios azul-magenta intenso (#7c3aed / #a855f7) y secundarios azul-magenta tenue. Vistas corregidas y posicionamiento ajustado.
- La biblioteca muestra tarjetas colapsables por categoría con modal de detalle por ejercicio (verificado localmente y en producción).
- La landing retiró claims no sustentados, reemplazó imágenes remotas por assets propios y añadió recuperación de contraseña. Se verificó localmente y en producción con Playwright.
- El check-in diario persiste síntomas estructurados, usa upsert idempotente `daily-YYYY-MM-DD`, rehidrata estado por fecha y bloquea alta intensidad ante síntomas de alarma. La encuesta omitida conserva RPE, fatiga y sueño como `null`.
- El mapa de vídeos conserva solo las 14 asociaciones verificadas por YouTube oEmbed el 2 de junio; el resto usa fallback SVG local.
- Las cabeceras HTTP defensivas están activas en producción. La separación de rechazos auth esperados en logs está desplegada; no se reconsultaron Runtime Logs filtrados por limitación del CLI.
- `main` local está cinco commits por delante de `origin/main` y conserva cambios sin commit desplegados manualmente; sincroniza GitHub antes de tratar el runtime como reproducible desde el repositorio remoto.

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
- Estado al 6 jun 2026: `guidelines`=226 docs (fallback); `guideline_passages`=7.128 pasajes con vector. Índice vectorial: **pendiente de crear por el usuario**.

## Rediseño Studio (rama `redesign/endogym-studio`)

Existe un rediseño completo "data-driven cálido" en la ruta **`/studio`**, montado como bundle estático en `public/studio/app/` dentro de un iframe (`src/app/studio/page.js`). NO toca el dashboard anterior. Coach IA cableado a Gemini real vía `/api/coach-chat`; auth del iframe vía `/api/public-config`; datos reales (perfil) vía `/api/studio-data` con fusión sobre datos de muestra. `next.config.mjs` aplica CSP relajada SOLO a `/studio*` (Babel-in-browser necesita `unsafe-eval`). Detalle completo y pendientes en `docs/STUDIO_REDESIGN.md`.

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
