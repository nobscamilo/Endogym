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
| `GET`, `POST` | `/api/studio-nutrition` | Consultar o generar el plan semanal de comidas del Studio. |
| `POST` | `/api/studio-availability` | Guardar encuesta de disponibilidad y regenerar plan. |
| `POST` | `/api/studio-swap` | Cambiar ejercicios o ampliar sesión en el plan guardado. |
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

Al superar el limite responden HTTP `429`, cabecera `Retry-After` y `details.retryAfterSeconds`.

## Coaching semanal

`POST /api/weekly-plan` genera la base del plan y solicita recomendaciones estructuradas a Gemini Developer API. Produccion usa `gemini-2.5-flash` estable, con latencia acotada y fallback ACSM observable. La sonda de produccion exige `coachSource=gemini` y `fallbackApplied=false`.

El coach puede devolver `structuredAdjustments` opcionales. El servidor solo aplica cambios acotados a ejercicios de fuerza existentes en el plan: `loadPct` queda limitado a `0.90..1.10`, `setsDelta` a `-1..1`, y los ejercicios inventados o sin match de día/nombre se ignoran. La progresion por historial depende de `exercises[].id` en los entrenos registrados; ese ID se conserva al persistir `/api/workouts`.

Si ya hay un bloque activo de 21 días y no se envía `rebuild:true`, `POST /api/weekly-plan` no crea un plan nuevo. Devuelve `stable:true`, mantiene el mesociclo y refresca `adaptiveOverlay` con `progressMemory`/`adaptiveTuning` recientes. Ese overlay permite que fatiga, FC o check-ins se vean en Studio sin romper la estabilidad del bloque.

## Coach chat Studio

Payload:

```json
{
  "prompt": "¿Subo peso en la sesión de hoy?"
}
```

`POST /api/coach-chat` requiere auth, valida prompts no vacíos de hasta 4000 caracteres, consume el rate limit `coach-chat` y llama Gemini con contexto real de perfil, plan, fase, carrera y entrenos recientes cuando existen. Responde:

```json
{
  "text": "Respuesta del coach..."
}
```

Si se supera el limite devuelve `429`, `Retry-After`, cabeceras `ratelimit-*` y `details.retryAfterSeconds`.

## Nutrición Studio

- `GET /api/studio-nutrition` devuelve el plan semanal guardado de la semana actual (`cached:true`) o `{ "empty": true }`.
- `POST /api/studio-nutrition` genera con Gemini 7 días (`days[]`), compra semanal y batch cooking. La ruta tiene `maxDuration=60`.
- Antes de guardar un plan completo, el servidor calcula `macroCheck` por día: kcal reales, proteína real, objetivos, ratios, días fuera de rango y drift severo.
- Si hay drift diario o proteína global baja, reintenta una vez y conserva el mejor resultado. Si un plan completo conserva drift severo, responde `502` y no guarda.
- Los planes guardados incluyen `nutrition.meta.planSignature`. Si el plan de entrenamiento actual ya no coincide con esa huella, `GET` responde `{ "empty": true, "stale": true, "reason": "training_plan_changed" }`; el frontend lo trata como cache ausente y regenera.

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
