# Roadmap de Endogym

Ultima actualizacion: **16 de junio de 2026, mañana (#7 revisión del mesociclo + #8 onboarding mínimo + limpieza)**.

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
- [x] Ejecutar `npm test`: 103 tests.
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
- [x] Añadir rate limiting persistente al chat del coach (`coach-chat`, 20/h por defecto).
- [x] Automatizar E2E controlado contra produccion.
- [x] Añadir logs estructurados y runbook de observabilidad.
- [x] Guard de CI contra drift del bundle del Studio: `.github/workflows/studio-bundle-guard.yml` falla si un cambio toca `public/studio/app/studio/**` o `scripts/build-studio.mjs` sin regenerar/commitear `studio.bundle.js` en el mismo conjunto. No regenera bytes en CI (esbuild no es dependencia; salida minificada varía por versión) — solo detecta el olvido de rebuild documentado.
- [ ] Activar entrega automatica de alertas: bloqueado por plan Vercel `hobby`.
- [x] Aplicar retencion de fotos a 30 dias y deshabilitar soft delete.
- [ ] Completar revision legal humana de privacidad, consentimiento y disclaimer por mercado.
- [x] Bloquear vulnerabilidades moderadas en CI.
- [x] Rechazar identificadores Gemini invalidos y acotar timeout del coach antes del limite Vercel.
- [ ] Añadir E2E con emuladores para CI.
- [x] Añadir cabeceras HTTP de hardening: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y política de framing. Verificado localmente y en producción.
- [x] Separar rechazos esperados de autenticación de `operation_failed` mediante `operation_rejected`. Desplegado; Runtime Logs filtrados no se reconsultaron por limitación del CLI.
- [x] Añadir tests de `/api/workouts`, idempotencia diaria y adaptación derivada de check-ins.
- [x] Añadir tests del flujo `exercise.id` API/repositorio/planner para que `liftHistory` use IDs estables.
- [x] Añadir fallback legacy de cargas por nombre normalizado (`loadSource:'history_name'`).
- [x] Mantener bloque activo de 21 días estable con overlay adaptativo diario, sin regenerar el mesociclo.
- [x] Añadir tests de `structuredAdjustments` del Coach IA con guardarraíles.
- [x] Añadir validación per-day de macros en `studio-nutrition` con reintento y bloqueo de drift severo.
- [x] Invalidar cache nutricional por huella del plan de entrenamiento (`meta.planSignature`).
- [x] Retirar claims personales estáticos del Studio que parecían IA live sin consulta real.
- [x] Instalar Playwright y verificar Studio localmente con Chromium.
- [x] Evitar que el iframe del Studio caiga a datos demo en móvil cuando Firebase Auth interno tarda: puente de ID token same-origin padre→iframe verificado localmente y en producción.

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
- [x] Rediseñar cómo se muestran objetivos y equipo disponible en Perfil: separar resultado principal, modalidad/equipo y subobjetivo de carrera; sustituir `Mixto` visible por `Flexible`; mostrar microciclo/mesociclo/revisión/fecha clave. Implementado y verificado localmente el 11 jun 2026; desplegado el 12 jun 2026 con bundle `6ff6352714`.
- [x] Corregir calendario/horas de Nutrición: rail semanal y selección por `dateISO` local, `studio-data`/`studio-nutrition`/`studio-swap` usando fecha civil de app (`Europe/Madrid` por defecto). Desplegado el 12 jun 2026 con bundle `08bbcab4a0`.
- [x] Mejorar prescripción desde Perfil: añadir nivel de entrenamiento, modular volumen/series/descanso y seleccionar días prioritarios por FITT-VP cuando `daysPerWeek` recorta el microciclo. **Desplegado el 15 jun 2026** (commit `8b0b464`, deployment `endogym-56a9wwgy9…`).
- [x] Permitir cambiar grupo muscular en Entreno sin regenerar el bloque: `studio-swap` acepta `scope:'focus'`, reconstruye la sesión de hoy y bloquea repeticiones de familia muscular en días adyacentes. **Desplegado el 15 jun 2026** (commit `8b0b464`).
- [x] **Guardarraíl de volumen semanal por familia muscular** (gap de seguridad): bloquea swaps que saturen torso/pierna/full en la semana aunque no sean días adyacentes (`weeklyFocusOverloadReason` en `planner.js`, >60% de las sesiones de fuerza). **Desplegado el 15 jun 2026** (commit `a738ac0`, deployment `endogym-e27br2nrj…`, 252 tests).

## P2 - Prescripción de ejercicio: mejoras sugeridas pendientes

Decisiones de diseño tomadas con el usuario el 15 jun 2026 (anotadas en cada ítem).

- [x] **#1 Mostrar opciones de grupo muscular disponibles/bloqueadas antes de enviar el cambio** (UI). `studio-data` expone `todaySession.focusOptions` (vía `listSessionFocusChangeOptions`). `screen-train` pinta chips de grupo: el actual y los bloqueados quedan deshabilitados con candado 🔒 y una lista de motivos visibles (adyacencia/volumen semanal). **Desplegado** (commit `780ec52`, bundle `v=1c4ad57905`).
- [x] **#2 Reprograma validado por intercambio.** Cuando el grupo elegido está bloqueado por adyacencia con un día vecino de la misma familia, `proposeFocusReschedule` valida que intercambiar el foco (hoy = grupo elegido; vecino = foco actual de hoy) no rompe la recuperación con los OTROS vecinos ni deja sobrecarga semanal (el intercambio preserva `daysPerWeek` y el recuento de familias). `buildSessionFocusReschedule` reconstruye ambos días; `studio-swap` con `action:'reschedule'` los persiste. La matriz expone `canReschedule`/`rescheduleWith` y la UI ofrece "Reprogramar (intercambiar con …)" en los grupos bloqueados-pero-reprogramables. **Desplegado** (commit `437ab5d`, bundle `v=f41d4e0945`, +2 tests). Límite conocido: solo intercambia con un vecino directo; no mueve sesiones a días no contiguos ni reordena la tirada larga (eso sería un scheduler completo).
- [ ] **#3 Check-in rápido por grupo muscular antes de cambiar foco:** agujetas/dolor local (pierna, torso, hombro, lumbar) para modular volumen, evitar patrones dolorosos y no depender solo del calendario.
- [x] **#4 Inventario de equipo y preferencias.** `equipmentPreferences.js` clasifica el `equipment` (texto libre) a categorías y filtra el pool por material disponible + ejercicios excluidos, priorizando favoritos (relaja si vaciaría el pool). Cableado en `buildSessionExercises` y alternativas/swaps. Perfil: chips de "Material disponible" (vacío = sin restricción). `studio-availability` persiste `equipment`/`excludedExercises`/`favoriteExercises`; `studio-data` los expone. **Desplegado** (commit `ac1ae3e`, bundle `v=fc16703d0f`, +6 tests). Follow-up: UI para excluir/favorito desde el modal de detalle de ejercicio (el backend ya lo soporta).
- [x] **#5 Registrar ejecución por serie.** Modo detallado opcional por ejercicio (toca el icono de lista): kg·reps·**RIR** por set, con "Añadir serie". El **modo rápido** (1 valor/ejercicio) sigue por defecto y es el puente con el un-tap. Al guardar, la serie más pesada queda como serie principal (weightKg/reps) y el **RPE del ejercicio se deriva del RIR** (10−RIR) → alimenta DAPRE/e1RM. `sanitizeExercise` persiste `rir`+`setLogs`; `workout-history` y el historial de Perfil los muestran por set (y se arregló el peso corporal con `kg` null). **Desplegado** (commit `7e9e1cd`, bundle `v=ebbdbc99ff`, +1 test). Pendiente futuro: dolor/técnica por serie y usar el mejor e1RM por set (no solo el top por carga).
- [x] **#6 "Por qué de tu sesión".** Tarjeta en Entreno con explicación DETERMINISTA (volumen ajustado a nivel/duración, carga por DAPRE vs fase, selección por foco/comorbilidades/material), construida desde los datos reales del usuario y su propia prescripción (`buildSessionRationale` en `studio-data`). Disciplina anti-alucinación respetada: NO afirma claims científicos sin sustento; para la base con citas remite al coach (que sí hace RAG). **Desplegado** (commit pendiente abajo). Follow-up: adjuntar citas RAG reales del plan cuando estén disponibles.
- [x] **#7 Revisión del mesociclo desde datos reales.** `mesocycleReview.js` detecta señales deterministas (≥3 cambios de foco en el bloque, bloque ≥28 días, dolor articular o fatiga ≥8 repetidos en check-ins) y, si disparan, `studio-data` expone `mesocycleReview` con motivos. UI: tarjeta "Revisión del bloque" en la pestaña Semana de Entreno con botón para regenerar (confirm + rebuild). **Desplegado** (+4 tests).

## P2 - Registro de sesiones e historial (bugs reportados 15 jun 2026)

- [x] **Fusión de sesiones por día (fin del doble/triple conteo).** `src/core/sessionHistory.js`: check-in + manual + Strava del mismo día = 1 sesión (registro más rico). Cableado en conteo/adherencia, recientes e historial; incluye ejercicios sin peso. **Desplegado** (commit `f29d9ae`, deployment `endogym-dpe6m40ef…`, 257 tests).
- [x] **`studio-data` expone `todaySession.logged` + `loggedSummary`** para rehidratar Entreno. **Desplegado** (`f29d9ae`).
- [x] **(UI) Fusionar los 2 check-ins de Entreno en 1, el más completo** (Q4). `screen-train.jsx`: "¿Cómo fue tu sesión?" con completada + cargas/reps + RPE + fatiga + sueño + síntomas en un guardado; doble escritura idempotente (manual + daily_checkin) que la fusión por día colapsa. **Desplegado** (commit `531f7a7`, bundle `v=8688935aeb`).
- [x] **(UI) Mostrar la sesión ya registrada al volver a Entreno** (Q2 visible): consume `todaySession.logged`/`loggedSummary` → tarjeta "Sesión registrada" + "Editar registro". **Desplegado** (`531f7a7`).
- [x] **(UI) Etiquetas kg/reps explícitas por ejercicio.** **Desplegado** (`531f7a7`).
- [x] **#3 Check-in por grupo muscular antes de cambiar foco.** Pills de molestias (pierna/torso/hombro/lumbar) en la tarjeta de cambio de grupo → `studio-swap` acepta `soreAreas`; `buildSessionFocusChange` mapea zona→familia y, si la zona dolorida carga el grupo elegido, baja `volumeFactor` ~15% (menos series Y carga) y devuelve `soreNote` que la UI muestra. **Desplegado** (commit `483f889`, bundle `v=7bd8891e8f`, +2 tests). Mejora futura: evitar patrones específicos dolorosos (no solo bajar volumen).
- [x] Limpieza: `CheckinCard` sin uso retirada de `screen-train.jsx` (se conservan `Scale10` y `CHECKIN_SYMPTOMS`).

## P2 - Check-in diario seguro

- [x] Persistir síntomas como campos estructurados y conectarlos al gate clínico del siguiente plan.
- [x] No registrar valores desconocidos de RPE, fatiga o sueño como cero al omitir la encuesta.
- [x] Rehidratar check-ins persistidos por fecha y prevenir registros duplicados con upsert `daily-YYYY-MM-DD`.
- [x] Normalizar `performedAt` al mediodía UTC de la fecha seleccionada, permitir pasado/hoy local y bloquear futuro desde UI.
- [x] Sincronizar `origin/main` con los commits locales y los cambios manualmente desplegados. Al 11 jun, `main` está alineado con `origin/main`; quedan solo artefactos sin commit en `scratch/`.

## P2 - RAG: de léxico a semántico (implementado 6 jun 2026)

Mejora a búsqueda semántica respetando "no Vertex". Estado:

- [x] **Embeddings con Gemini Developer API** (`gemini-embedding-001`, 768 dims, L2-normalizados) — `requestGoogleEmbeddings()` en `googleGenAiTransport.js`.
- [x] Sub-chunking semántico: `scripts/embed_guidelines.mjs` troceó los 226 docs en **7.128 pasajes** (~800 tokens, con solape).
- [x] Generar y almacenar vectores en la colección `guideline_passages` (`FieldValue.vector()`). 7.128 subidos y verificados.
- [x] Reescribir el retriever a `findNearest` (COSINE) con **fallback automático** a keywords. Verificado end-to-end (degrada limpio sin índice).
- [x] Actualizar tests (camino vectorial + fallback).
- [x] **Crear el índice vectorial de Firestore**. Verificado el 10 jun: modo vector con 12 pasajes y ~20k caracteres de contexto.
- [x] Tras crear el índice: verificar modo vector en producción (`guidelines_vector_matches` / sonda real).
- [x] Correr `npm test` y `npm run build` en la Mac tras las fases recientes. Último estado documentado: `235` tests verdes y build OK.

## P3 - Producto

- [ ] **Animaciones SVG de calentamiento (sesión dedicada — idea aprobada por el usuario el 12 jun 2026).** Ejemplo de referencia ya creado y validado: `public/warmups/a-skip.svg` (figura animada CSS-en-SVG, paleta azul-magenta, respeta `prefers-reduced-motion`, ~3 KB). Plan acordado: (1) elegir 5-6 movimientos prioritarios del calentamiento dinámico (A-skip, skipping bajo, monster walk, puente de glúteo, gato-vaca, rotación torácica); (2) animarlos uno a uno CON revisión técnica del usuario (deportólogo) por patrón; (3) cablearlos como nivel intermedio de la cascada de fallback: vídeo verificado > animación SVG > SVG estático (`EXERCISE_VIDEO_MAP` / modal de detalle de ejercicio). Hacerlo en sesión limpia: cada animación es coreografía artesanal de keyframes (no plantilla) y consume muchos tokens.
- [ ] Mejorar correccion manual de alimentos y porciones.
- [ ] Calibrar confianza por tipo de plato.
- [ ] Ampliar historial y progresion.
- [ ] Mejorar recomendaciones pre/post entreno con limites clinicos claros.
- [ ] Diseñar reevaluación o clearance explícito para levantar el gate diario de síntomas sin depender solo de la ventana reciente.
- [ ] Revisar y completar la sección de perfil del usuario (queda onboarding/UX más guiado; la dosis de prescripción Perfil se reforzó el 15 jun 2026).
- [~] **#8 Onboarding corto de Perfil (versión mínima).** Aviso "Primeros pasos" al inicio de la encuesta cuando el perfil está incompleto (`user.profileComplete=false`): orienta a fijar objetivo + modalidad + días, marcando el resto como opcional. **Desplegado.** Pendiente (necesita decisión de diseño del usuario): flujo guiado multi-paso real con time-to-value corto.
- [ ] Activar entrega automatica de alertas: bloqueado por plan Vercel `hobby`.
- [ ] Completar revision legal humana de privacidad, consentimiento y disclaimer por mercado.
