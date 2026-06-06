# Roadmap de Endogym

Ultima actualizacion: **2 de junio de 2026 (auditoría local y pública)**.

## P0 - Recuperacion y seguridad inmediata

- [x] Resolver marcadores de conflicto en 22 archivos.
- [x] Consolidar documentacion y memoria operativa.
- [x] Añadir rechazo automatico de conflictos en CI.
- [x] Corregir `FIREBASE_PRIVATE_KEY` de Vercel y redesplegar.
- [x] Revocar cualquier API key Gemini expuesta y configurar una nueva key restringida.
- [x] Auditar tokens Vercel y revocar cinco sesiones web listadas.
- [x] Eliminar variables Vercel Flags no utilizadas.
- [x] Provisionar bucket privado `endogym-vtety8-plates-eu`.
- [x] Deshabilitar servicios Vertex no utilizados.

## P1 - Estabilizacion verificable

- [x] Ejecutar `npm install`.
- [x] Ejecutar `npm run smoke`.
- [x] Ejecutar `npm test`: 74 tests.
- [x] Ejecutar `npm run build`.
- [x] Actualizar Next a `16.2.6` y eliminar vulnerabilidades altas.
- [x] Verificar Vercel `/` y `/api/health`.
- [x] Verificar Firebase Auth y Firestore end-to-end.
- [x] Verificar fallback desplegado de `/api/analyze-plate`.
- [x] Rotar Gemini y verificar inferencia real sin fallback.
- [x] Provisionar Storage y verificar upload/borrado.
- [x] Corregir URL canonica Vercel y redesplegar.
- [x] Autorizar `endogym.vercel.app` en Firebase Auth y verificar Google OAuth.
- [x] Corregir `GEMINI_MODEL_COACH` y verificar coaching semanal Gemini live sin fallback.
- [x] Resolver las 10 vulnerabilidades moderadas transitivas; `npm run audit`: 0.

## P2 - Hardening

- [x] Validar MIME por magic bytes.
- [x] Añadir rate limiting persistente.
- [x] Automatizar E2E controlado contra produccion.
- [x] Añadir logs estructurados y runbook de observabilidad.
- [ ] Activar entrega automatica de alertas: bloqueado por plan Vercel `hobby`.
- [x] Aplicar retencion de fotos a 30 dias y deshabilitar soft delete.
- [ ] Completar revision legal humana de privacidad, consentimiento y disclaimer por mercado.
- [x] Bloquear vulnerabilidades moderadas en CI.
- [x] Rechazar identificadores Gemini invalidos y acotar timeout del coach antes del limite Vercel.
- [ ] Añadir E2E con emuladores para CI.
- [x] Añadir cabeceras HTTP de hardening: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y política de framing. Verificado localmente y en producción.
- [x] Separar rechazos esperados de autenticación de `operation_failed` mediante `operation_rejected`. Desplegado; Runtime Logs filtrados no se reconsultaron por limitación del CLI.
- [x] Añadir tests de `/api/workouts`, idempotencia diaria y adaptación derivada de check-ins.

## P2 - UI / Experiencia de usuario

- [x] Resolver duplicado del mapa muscular; mostrarlo solo en la columna derecha del tab "Hoy".
- [x] Implementar modelos anatómicos clínicos 3D `gymbro-front-crop.png` / `gymbro-back-crop.png`.
- [x] Corregir asignación de vistas frontal y posterior (imagen frontal mostraba la espalda y viceversa).
- [x] Ajustar posicionamiento de superposiciones musculares a la geometría real de las imágenes.
- [x] Aplicar colores azul-magenta intenso para músculos primarios y azul-magenta tenue para secundarios.
- [x] Convertir menú lateral a hamburguesa desplegable para maximizar el área de contenido.
- [x] Aplicar diseño "Entrenamiento del día" de Stitch al tab "Hoy" con mapa muscular en columna derecha.
- [x] Traducir dashboard a lenguaje de usuario final: eliminar jargón técnico (RPE, readiness, gate, etc.).
- [x] Rediseñar Biblioteca hacia tarjetas colapsables por categoría + modal de detalle por ejercicio.
- [x] Verificar localmente todo el rediseño UI (`npm run smoke`, `npm test`, `npm run build`).
- [x] Redesplegar a producción y verificar atlas, menú y biblioteca en Vercel.
- [x] Sustituir claims no sustentados de la landing por mensajes verificables. Verificado con Playwright local y producción.
- [x] Retirar los 37 IDs de YouTube no resolubles; conservar 14 embeds verificados y fallback SVG para el resto.
- [x] Sustituir imágenes remotas `lh3.googleusercontent.com/aida-public` por assets versionados propios.
- [x] Añadir recuperación de contraseña Firebase y favicon propio.

## P2 - Check-in diario seguro

- [x] Persistir síntomas como campos estructurados y conectarlos al gate clínico del siguiente plan.
- [x] No registrar valores desconocidos de RPE, fatiga o sueño como cero al omitir la encuesta.
- [x] Rehidratar check-ins persistidos por fecha y prevenir registros duplicados con upsert `daily-YYYY-MM-DD`.
- [x] Normalizar `performedAt` al mediodía UTC de la fecha seleccionada, permitir pasado/hoy local y bloquear futuro desde UI.
- [ ] Sincronizar `origin/main` con los cinco commits locales y los cambios manualmente desplegados.

## P2 - RAG: de léxico a semántico (implementado 6 jun 2026)

Mejora a búsqueda semántica respetando "no Vertex". Estado:

- [x] **Embeddings con Gemini Developer API** (`gemini-embedding-001`, 768 dims, L2-normalizados) — `requestGoogleEmbeddings()` en `googleGenAiTransport.js`.
- [x] Sub-chunking semántico: `scripts/embed_guidelines.mjs` troceó los 226 docs en **7.128 pasajes** (~800 tokens, con solape).
- [x] Generar y almacenar vectores en la colección `guideline_passages` (`FieldValue.vector()`). 7.128 subidos y verificados.
- [x] Reescribir el retriever a `findNearest` (COSINE) con **fallback automático** a keywords. Verificado end-to-end (degrada limpio sin índice).
- [x] Actualizar tests (camino vectorial + fallback).
- [ ] **Crear el índice vectorial de Firestore** (acción del usuario; el SA del repo no tiene `indexAdmin`). Comando en `docs/DEPLOYMENT.md`. Hasta entonces el RAG opera en modo keywords.
- [ ] Tras crear el índice: verificar modo vector en producción (`npm run e2e:production` / Runtime Logs `guidelines_vector_matches`).
- [ ] Correr `npm test` y `npm run build` en la Mac (vitest no corre en el sandbox Linux).

## P3 - Producto

- [ ] Mejorar correccion manual de alimentos y porciones.
- [ ] Calibrar confianza por tipo de plato.
- [ ] Ampliar historial y progresion.
- [ ] Mejorar recomendaciones pre/post entreno con limites clinicos claros.
- [ ] Diseñar reevaluación o clearance explícito para levantar el gate diario de síntomas sin depender solo de la ventana reciente.
- [ ] Revisar y completar la sección de perfil del usuario.
- [ ] Activar entrega automatica de alertas: bloqueado por plan Vercel `hobby`.
- [ ] Completar revision legal humana de privacidad, consentimiento y disclaimer por mercado.
