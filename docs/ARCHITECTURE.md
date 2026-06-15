# Arquitectura de Endogym

## Objetivo

Construir una app full-stack para nutricion, seguimiento glucemico, entrenamiento adaptativo y analisis educativo de platos asistido por IA.

## Ruta A

| Servicio | Responsabilidad |
|---|---|
| Vercel | Web Next.js y runtime de Route Handlers. |
| Firebase Authentication | Identidad e ID tokens. |
| Firestore | Perfil, comidas, metricas, rutinas y planes. |
| Firebase Storage / Cloud Storage | Fotos de platos en bucket privado `endogym-vtety8-plates-eu`. |
| Gemini Developer API | Analisis y coaching. Vertex AI esta deshabilitado. |
| GitHub | Versionado y CI, no runtime. |

## Mapa del repositorio

| Ruta | Responsabilidad |
|---|---|
| `src/app/page.js` | Landing/login y montaje de Ignios Studio en `/` cuando hay sesión. |
| `src/app/studio/page.js` | Alias legacy que redirige a `/`. |
| `src/app/dashboard/page.js` | Entrada al dashboard legacy. |
| `src/components/DashboardPage.js` | UI principal: tab Hoy, Biblioteca, Nutrición, Perfil y menú hamburguesa. |
| `src/components/MuscleMapFigure.js` | Componente de atlas anatómico 3D con superposiciones CSS de grupos musculares. |
| `public/studio/app/studio/*` | Fuente del Studio React pre-compilado. |
| `public/studio/app/studio.bundle.js` | Bundle Studio compilado y commiteado. |
| `src/app/api/**/route.js` | APIs Next.js. |
| `src/lib/auth.js` | Validacion de ID token y bypass local explicito. |
| `src/lib/firebaseAdmin.js` | Inicializacion Firebase Admin. |
| `src/lib/repositories/firestoreRepository.js` | Persistencia y borrado/exportacion de cuenta. |
| `src/lib/rateLimit.js` | Ventanas persistentes por usuario para operaciones costosas. |
| `src/lib/appTime.js` | Fecha civil de la app (`Europe/Madrid` por defecto), límites locales y `weekKey` nutricional. |
| `src/services/googleGenAiTransport.js` | Transporte exclusivo Gemini Developer API. |
| `src/services/geminiClient.js` | Analisis multimodal estructurado. |
| `src/services/exerciseCoachClient.js` | Coach estructurado con reintentos. |
| `src/core/**` | Calculos y reglas de negocio sin efectos externos. |
| `src/app/styles.css` | Hoja de estilos global: diseño premium, variables CSS, componentes y atlas anatómico. |
| `public/anatomy/` | Imágenes clínicas 3D del atlas: `gymbro-front-crop.png`, `gymbro-back-crop.png`. |

## Colecciones Firestore

```text
users/{userId}/profile/main
users/{userId}/meals/{mealId}
users/{userId}/workouts/{workoutId}
users/{userId}/metrics/{metricId}
users/{userId}/weeklyPlans/{planId}
users/{userId}/studioNutrition/{weekKey}
users/{userId}/rateLimits/{scope}
```

## Flujo de autenticacion

1. El frontend usa Firebase Client Auth.
2. El cliente obtiene un Firebase ID token.
3. Cuando `/` monta Ignios Studio en iframe, la página padre entrega ese token al iframe por `postMessage` de mismo origen (`IGNIOS_AUTH_TOKEN`/`IGNIOS_TOKEN_REQUEST`) para evitar carreras de restauración de sesión en móvil.
4. La API recibe `Authorization: Bearer <token>`.
5. `src/lib/auth.js` valida el token con Firebase Admin.
6. `AUTH_DISABLED=true` solo habilita bypass en desarrollo local.

## Flujo de plato

1. Cliente envia base64 a `POST /api/analyze-plate`.
2. API consume una ventana persistente de rate limit por usuario.
3. API valida base64, limite de 5 MB y firma binaria JPEG, PNG o WEBP.
4. Intenta guardar la foto en Storage.
5. Intenta inferencia Gemini Developer API estructurada.
6. Si Storage o Gemini fallan, registra warning y usa fallback cuando esta habilitado.
7. Calcula carga glucemica e indice insulinico educativo.
8. Persiste la comida y su trazabilidad.

## Flujo de coaching semanal

1. `POST /api/weekly-plan` genera la base determinista del plan.
2. La API consume una ventana persistente de rate limit por usuario.
3. El coach usa Gemini Developer API con `gemini-2.5-flash` estable.
4. El transporte rechaza identificadores que no sigan el formato `gemini-*`.
5. El coach usa `thinkingBudget=0`, timeout de 10 segundos por intento y un reintento.
6. Si Gemini devuelve `structuredAdjustments`, el servidor aplica solo ajustes acotados a ejercicios de fuerza existentes.
7. Si Gemini falla o agota presupuesto, la API persiste fallback heuristico ACSM observable sin exceder el timeout Vercel.

### Bloque activo y overlay adaptativo

- `weekly-plan` conserva el bloque de 21 dias mientras esté activo y no haya `rebuild:true`.
- En ese caso recalcula `progressMemory`/`adaptiveTuning` con datos recientes y guarda un `adaptiveOverlay` en el plan activo, sin crear un plan nuevo.
- `studio-data` calcula el mismo overlay en lectura para que el Studio muestre ajustes recientes aunque el usuario no haya pulsado regenerar.
- El overlay es metadata de ajuste; no reescribe el mesociclo ni compone deloads acumulativos sobre las prescripciones base.
- Si Perfil define `daysPerWeek`, el planner no conserva simplemente los primeros días: selecciona días por prioridad FITT-VP según objetivo/modalidad. En `hybrid_run_gym` con carrera específica conserva tirada larga, calidad y fuerza; en `full_gym` con pocos días preserva balance torso/pierna.
- Perfil puede guardar `trainingExperience` (`novice`/`intermediate`/`advanced`); la prescripción de fuerza lo usa para ajustar volumen efectivo, series y descansos sin depender de IA.
- `studio-swap` puede cambiar el foco muscular de la sesión de hoy (`scope:'focus'`) sin regenerar el bloque. La lógica vive en `planner.js` (`buildSessionFocusChange`/`listSessionFocusChangeOptions`) y bloquea conflictos con días adyacentes antes de persistir el plan.

## Flujo Coach chat Studio

1. `POST /api/coach-chat` requiere Firebase ID token.
2. La ruta acepta `{ message }`; `{ prompt }` queda como legacy y se trata como mensaje de usuario, nunca como system.
3. Valida tamaño y evalúa red flags deterministas antes del rate limit; si hay síntoma de alarma responde texto fijo sin Gemini.
4. En el flujo normal consume el scope persistente `coach-chat`.
5. Construye contexto de perfil, plan, fase, carrera, digest nutricional/recuperación, memoria acotada y entrenos recientes.
6. Llama Gemini Developer API y devuelve texto; si el limite se supera responde `429` antes de llamar al proveedor.

## Flujo nutricion Studio

1. `GET /api/studio-nutrition` consulta el plan semanal cacheado en `studioNutrition/{weekKey}`; `weekKey` es el lunes de la fecha civil de la app (`Europe/Madrid` por defecto), no el lunes UTC.
2. `POST /api/studio-nutrition` genera 7 dias en trozos paralelos con Gemini.
3. La ruta calcula drift de kcal/proteina por dia antes de guardar.
4. Si hay drift reintenta una vez; si persiste drift severo en un plan completo, responde `502` y no guarda.
5. El cache incluye `meta.planSignature`, calculado desde plan, sesiones, fase, carrera y objetivos nutricionales. Si cambia, `GET` responde `stale:true` y el cliente regenera.
6. `GET /api/studio-data` agrupa comidas de "hoy" con límites UTC derivados de la fecha local de la app; evita desfases tras medianoche en España.

## Flujo de check-in diario

1. La UI envia la sesión completada o no realizada a `POST /api/workouts`.
2. La UI normaliza `performedAt` al mediodía UTC de la fecha seleccionada y bloquea fechas futuras locales.
3. Firestore usa upsert determinista `daily-YYYY-MM-DD`, persiste completitud, subjetivos opcionales, síntomas booleanos y `checkinSkipped`.
4. La UI rehidrata los check-ins persistidos con `GET /api/workouts`.
5. El siguiente `POST /api/weekly-plan` agrega entrenamientos recientes mediante `buildProgressMemory()`.
6. Si hay síntomas de alarma recientes, `buildAdaptiveTuning()` bloquea alta intensidad, limita RPE y deja trazabilidad clínica para el coach heurístico.

## Retencion de fotos

- `infra/storage-lifecycle.json` elimina objetos `plates/` cuando superan 30 dias.
- El bucket tiene soft delete deshabilitado para que el borrado de cuenta no conserve copias recuperables.
- La eliminacion de cuenta borra tambien `rateLimits`.

## Observabilidad

- `withTrace()` genera `traceId`.
- Los logs JSON registran inicio, fin, duracion y errores. Rechazos auth esperados usan `operation_rejected`, no `operation_failed`.
- `plate_analysis_result`, `weekly_plan_coach_result`, `weekly_plan_active_block_overlay`, `plate_image_rejected`, `rate_limit_exceeded`, `studio_nutrition_macro_retry` y `studio_nutrition_macro_invalid` permiten vigilar degradacion, coste y abuso.
- Evita incluir imagenes, tokens o datos sensibles en logs.
- Consulta [`OBSERVABILITY.md`](OBSERVABILITY.md).

## Principios

- Explicabilidad antes que claims clinicos.
- Humano en el loop para corregir estimaciones.
- Probar antes de afirmar.
- Degradacion observable ante fallos externos.
