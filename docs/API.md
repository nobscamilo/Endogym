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

Al superar el limite responden HTTP `429`, cabecera `Retry-After` y `details.retryAfterSeconds`.

## Coaching semanal

`POST /api/weekly-plan` genera la base del plan y solicita recomendaciones estructuradas a Gemini Developer API. Produccion usa `gemini-2.5-flash` estable, con latencia acotada y fallback ACSM observable. La sonda de produccion exige `coachSource=gemini` y `fallbackApplied=false`.

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
