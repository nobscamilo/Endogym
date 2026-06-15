# API HTTP

## Convenciones

- Local: `http://localhost:3000`.
- Produccion publica: `https://endogym.vercel.app`.
- Auth produccion: `Authorization: Bearer <firebase-id-token>`.
- Desarrollo local: `x-dev-user-id` solo si `AUTH_DISABLED=true`.
- Las respuestas relevantes incluyen `traceId`.

## Endpoints

| Metodo | Ruta | Uso |
|---|---|---|
| `GET` | `/api/health` | Health check sin Firebase. |
| `GET`, `POST` | `/api/meals` | Listar y registrar comidas. |
| `GET`, `POST` | `/api/workouts` | Listar y registrar entrenamientos. |
| `GET`, `POST` | `/api/metrics` | Listar y registrar metricas. |
| `GET`, `PUT` | `/api/profile` | Consultar y actualizar perfil. |
| `GET`, `POST`, `PATCH` | `/api/weekly-plan` | Consultar, generar y personalizar planes. |
| `POST` | `/api/analyze-plate` | Analizar foto y persistir comida. |
| `GET` | `/api/studio-data` | Datos reales normalizados para Ignios Studio. |
| `POST` | `/api/coach-chat` | Preguntar al Coach IA con contexto real del usuario. |
| `GET`, `POST` | `/api/coach-analysis` | Consultar o generar el análisis del coach de los entrenos realizados (Progreso). |
| `GET` | `/api/workout-history` | Historial paginado de entrenos hechos (cursor `before`, análisis cacheado inline). |
| `POST` | `/api/workout-analysis` | Analizar UNA sesión del historial (caché permanente por workout). |
| `GET`, `POST` | `/api/studio-nutrition` | Consultar o generar el plan semanal de comidas del Studio. |
| `POST` | `/api/studio-availability` | Guardar encuesta de disponibilidad y regenerar plan. |
| `POST` | `/api/studio-swap` | Cambiar ejercicios, ampliar sesión o cambiar foco muscular en el plan guardado. |
| `GET` | `/api/backup` | Export de Firestore a GCS (solo Vercel Cron con `CRON_SECRET`). |
| `GET` | `/api/products/barcode?code=...` | Consultar Open Food Facts. |
| `GET` | `/api/account/export` | Exportar datos JSON. |
| `DELETE` | `/api/account/delete` | Eliminar datos y cuenta. |

## Analisis de plato

Payload:

```json
{
  "imageBase64": "data:image/jpeg;base64,...",
  "eatenAt": "2026-05-31T12:30:00.000Z",
  "context": { "dish": "Arroz con pollo y ensalada" }
}
```

Estado actual: la ruta esta verificada end-to-end en produccion. Guarda la foto en `endogym-vtety8-plates-eu`, obtiene inferencia Gemini real y persiste la comida. Conserva fallback heuristico observable si Storage o Gemini fallan en el futuro.

Formatos aceptados: JPEG, PNG y WEBP. La API verifica la firma binaria y rechaza bytes disfrazados con un `Content-Type` incorrecto antes de guardar o invocar Gemini.

## Rate limiting

Las operaciones IA costosas usan ventanas persistentes por usuario en Firestore:

| Ruta | Limite por defecto |
|---|---|
| `POST /api/analyze-plate` | 10 solicitudes cada 600 segundos. |
| `POST /api/weekly-plan` | 4 solicitudes cada 3600 segundos. |
| `POST /api/coach-chat` | 20 solicitudes cada 3600 segundos. |
| `POST /api/coach-analysis` | 6 solicitudes cada 3600 segundos. |
| `POST /api/studio-nutrition` | 12 solicitudes cada 3600 segundos (generación semanal y `swapMeal`). |

Al superar el limite responden HTTP `429`, cabecera `Retry-After` y `details.retryAfterSeconds`.

## Coaching semanal

`POST /api/weekly-plan` genera la base del plan y solicita recomendaciones estructuradas a Gemini Developer API. Produccion usa `gemini-2.5-flash` estable, con latencia acotada y fallback ACSM observable. La sonda de produccion exige `coachSource=gemini` y `fallbackApplied=false`.

El coach puede devolver `structuredAdjustments` opcionales. El servidor solo aplica cambios acotados a ejercicios de fuerza existentes en el plan: `loadPct` queda limitado a `0.90..1.10`, `setsDelta` a `-1..1`, y los ejercicios inventados o sin match de día/nombre se ignoran. La progresion por historial depende de `exercises[].id` en los entrenos registrados; ese ID se conserva al persistir `/api/workouts`.

Si ya hay un bloque activo de 21 días y no se envía `rebuild:true`, `POST /api/weekly-plan` no crea un plan nuevo. Devuelve `stable:true`, mantiene el mesociclo y refresca `adaptiveOverlay` con `progressMemory`/`adaptiveTuning` recientes. Ese overlay permite que fatiga, FC o check-ins se vean en Studio sin romper la estabilidad del bloque.

## Coach chat Studio

Payload:

```json
{
  "message": "¿Subo peso en la sesión de hoy?"
}
```

`POST /api/coach-chat` requiere auth y valida mensajes no vacíos de hasta 4000 caracteres. El cliente debe enviar `{ "message": "..." }`; el campo legacy `{ "prompt": "..." }` se acepta solo por compatibilidad y se trata íntegramente como mensaje de usuario, nunca como system prompt. Antes de consumir rate limit o llamar Gemini, la ruta evalúa red flags deterministas y responde texto fijo de seguridad si detecta síntomas de alarma. En el flujo normal consume el rate limit `coach-chat` y llama Gemini con contexto real de perfil, plan, fase, carrera y entrenos recientes cuando existen. Responde:

```json
{
  "text": "Respuesta del coach..."
}
```

Si se supera el limite devuelve `429`, `Retry-After`, cabeceras `ratelimit-*` y `details.retryAfterSeconds`.

## Análisis del coach (Progreso)

- `GET /api/coach-analysis` devuelve el informe guardado (`users/{uid}/coachReports/latest`) con `stale:true` si hay entrenos nuevos desde la última generación (firma de entrenos de 28 días), o `{ "empty": true }` si no hay informe.
- `POST /api/coach-analysis` construye un digest REAL (entrenos manuales + Strava + check-ins de 28 días, comparación de cargas reales vs prescritas, señal de FC y reglas adaptativas del planner) y pide a Gemini un informe JSON (`lastSession`, `history`, `adjustments[]`, `warning`). Si Gemini falla, genera un informe heurístico observable desde las mismas señales (`source:'heuristic'`); el front lo etiqueta honestamente como "Resumen automático (sin IA)". Consume el rate limit `coach-analysis` y guarda el informe con la firma para invalidación.
- La lógica vive en `src/services/coachAnalysis.js` (testeada en `tests/services/coach-analysis.test.js`).

## Cambio de una comida (swapMeal)

`POST /api/studio-nutrition` con `{ "swapMeal": { "day": "Jue", "slot": "Cena", "request": "más ligera" } }` regenera SOLO esa comida con Gemini (esquema `MEAL_ITEM_SCHEMA`), instruida para cubrir las kcal/proteína restantes del día, reemplaza el slot en el plan guardado de la semana y lo persiste. Responde `{ ok, day, slot, meal, nutrition }`. Sin plan guardado responde `404`. La generación semanal y el swap comparten el rate limit `studio-nutrition` (antes esta ruta NO tenía rate limit).

## Backup de Firestore y alertas

- `GET /api/backup` (Vercel Cron, lunes 03:00 UTC — ver `vercel.json` `crons`): lanza `exportDocuments` de Firestore a `gs://endogym-vtety8-backups-eu/auto/<timestamp>` con el token OAuth del Admin SDK (roles `datastore.importExportAdmin` + `objectAdmin` del bucket). Protegido por `CRON_SECRET` (Vercel lo envía como `Authorization: Bearer`). El bucket tiene lifecycle de borrado a 90 días.
- **Alertas de errores:** `logError()` envía además un aviso a `ALERT_WEBHOOK_URL` (Discord `{content}` / Slack `{text}`) con dedupe de 5 min por mensaje. Si la env var no existe, no hace nada.

## Historial de entrenos y análisis por sesión

- `GET /api/workout-history?limit=15&before=<ISO>` devuelve `{ items, hasMore, nextBefore }`: entrenos HECHOS (app + check-ins completados + Strava) en orden descendente, con `workoutId`, métricas de display y el análisis del coach cacheado inline (`analysis`, `analysisSource`) si existe. El cursor `before` filtra `performedAt < before`.
- `POST /api/workout-analysis` con `{ "workoutId": "..." }` analiza UNA sesión: la compara con sesiones previas comparables (mismo título normalizado, o mismo tipo carrera/fuerza), con las cargas del plan vigente (aproximación honesta para sesiones antiguas) y con el check-in cercano. **Caché permanente** en `users/{uid}/workoutAnalyses/{workoutId}` (las sesiones pasadas son inmutables): los hits de caché responden `cached:true` y NO consumen rate limit; la generación comparte el scope `coach-analysis` (6/h). Fallback heurístico observable (`source:'heuristic'`).
- `GET /api/workouts` acepta ahora cursor `before` además de `limit`, y `listWorkouts`/`listWorkoutsSince` devuelven `id` (doc.id) también para registros legacy.

## Nutrición Studio

- `GET /api/studio-nutrition` devuelve el plan semanal guardado de la semana actual (`cached:true`) o `{ "empty": true }`. La semana se calcula con la fecha civil de la app (`Europe/Madrid` por defecto), no con UTC.
- `POST /api/studio-nutrition` genera con Gemini 7 días (`days[]`), compra semanal y batch cooking. La ruta tiene `maxDuration=60`.
- Antes de guardar un plan completo, el servidor calcula `macroCheck` por día: kcal reales, proteína real, objetivos, ratios, días fuera de rango y drift severo.
- Si hay drift diario o proteína global baja, reintenta una vez y conserva el mejor resultado. Si un plan completo conserva drift severo, responde `502` y no guarda.
- Los planes guardados incluyen `nutrition.meta.planSignature`. Si el plan de entrenamiento actual ya no coincide con esa huella, `GET` responde `{ "empty": true, "stale": true, "reason": "training_plan_changed" }`; el frontend lo trata como cache ausente y regenera.
- `GET /api/studio-data` suma `macroEaten` y glucemia de "hoy" usando límites UTC de la fecha local de la app. A las 00:21 en Madrid ya cuenta como el nuevo día aunque UTC aún sea el día anterior.

## Disponibilidad Studio

`POST /api/studio-availability` hace merge parcial del perfil. Además de objetivo, modalidad, minutos, días/semana, comidas, carrera, salud estructurada y reentrada, acepta:

```json
{
  "trainingExperience": "novice | intermediate | advanced"
}
```

Ese campo se rehidrata por `GET /api/studio-data` y afecta la prescripción determinista de fuerza: volumen/series/descanso se ajustan por nivel. Cuando `daysPerWeek` reduce una plantilla, el planner conserva sesiones prioritarias por objetivo/modalidad en lugar de quedarse con los primeros días del calendario.

## Cambios de sesión en Studio

`POST /api/studio-swap` requiere Firebase ID token y opera sobre la sesión de entrenamiento de la fecha civil de la app.

- Ejercicio individual: `{ "scope": "one", "exerciseId": "gym-bench-press", "reason": "variety" }`.
- Sesión completa por variedad/tiempo/equipo: `{ "scope": "all", "reason": "time" }`, `{ "reason": "more_time", "targetMinutes": 75 }`.
- Grupo muscular de hoy: `{ "scope": "focus", "sessionFocus": "upper" }`, donde `sessionFocus` puede ser `upper`, `push`, `pull`, `lower` o `full_body`.

El cambio de grupo solo aplica a sesiones `resistance`/`mixed`. El servidor reconstruye ejercicios, calentamiento y enfriamiento con la prescripción determinista vigente, conserva fase/interferencia del bloque y rechaza (`409`) focos que choquen con la sesión anterior o siguiente para evitar repetir familias musculares en días consecutivos.

## Check-in diario de entrenamiento

La UI registra el check-in mediante `POST /api/workouts` con `source=daily_checkin`:

```json
{
  "title": "Torso A",
  "mode": "full_gym",
  "source": "daily_checkin",
  "dailyCheckinDate": "2026-06-02",
  "checkinSkipped": false,
  "symptoms": {
    "dyspnea": false,
    "jointPain": false,
    "dizziness": false,
    "tachycardia": false
  },
  "performedAt": "2026-06-02T12:00:00.000Z",
  "sessionRpe": 6,
  "fatigue": 4,
  "sleepHours": 7,
  "completed": true
}
```

- Firestore usa el documento determinista `daily-YYYY-MM-DD`; repetir un check-in del mismo día actualiza el registro en lugar de duplicarlo.
- La UI rehidrata los check-ins persistidos y no permite seleccionar fechas futuras para registrar.
- La API valida fecha y payload. Tolera como máximo el día UTC siguiente para no rechazar el `hoy` legítimo de zonas horarias adelantadas.
- Al omitir encuesta, `completed=false`, `checkinSkipped=true` y los subjetivos deben omitirse o enviarse como `null`; no se aceptan ceros inventados.
- Los síntomas se guardan como booleanos y alimentan `buildProgressMemory()`. Una señal de alarma muestra advertencia inmediata y bloquea alta intensidad en el siguiente plan.

Los entrenos manuales pueden incluir cargas por ejercicio. Conserva `exercises[].id` cuando el ejercicio viene del catálogo/plan; `weekly-plan` usa ese ID estable para enlazar `liftHistory` y progresar cargas. Para entrenos antiguos sin ID, existe fallback por nombre normalizado y la prescripción queda marcada como `loadSource:"history_name"`:

```json
{
  "title": "Torso A",
  "source": "manual",
  "performedAt": "2026-06-08T18:00:00.000Z",
  "exercises": [
    { "id": "gym-bench-press", "name": "Press banca", "sets": 3, "reps": 8, "weightKg": 70 }
  ]
}
```

## Codigos esperados

- `400`: payload o query invalida.
- `401`: autenticacion ausente o invalida.
- `403`: autorizacion o reautenticacion insuficiente.
- `404`: recurso inexistente.
- `409`: precondicion de dominio ausente.
- `413`: imagen mayor de 5 MB.
- `429`: rate limit persistente superado.
- `500`: fallo interno.
- `502`, `504`: proveedor externo no disponible o timeout.

## Pendientes

- Versionar API antes de exponer clientes externos.
- Versionar limites antes de exponer clientes externos.
- Versionar el contrato de check-in antes de exponer clientes externos.
