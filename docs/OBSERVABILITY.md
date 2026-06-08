# Observabilidad operativa

Ultima actualizacion: **8 de junio de 2026**.

## Estado real

Endogym usa logs JSON estructurados en Vercel Runtime Logs. El proyecto Vercel esta en plan `hobby`; Vercel Pro no es viable por ahora. Se mantiene observabilidad manual con logs de runtime y sondas, sin Alerts Beta ni Drains.

## Eventos relevantes

| Evento | Significado | Accion |
|---|---|---|
| `operation_failed` | Una operacion HTTP lanzo error. | Revisar `operationName`, `traceId` y stack. |
| `operation_rejected` | Una operacion HTTP fue rechazada de forma esperada, por ejemplo auth ausente. | Vigilar abuso sin tratarlo como fallo operativo. |
| `gemini_call_failed` | Gemini fallo y puede haberse aplicado fallback. | Revisar status del proveedor y frecuencia. |
| `exercise_coach_failed` | El coach Gemini fallo y puede haberse aplicado heuristica. | Revisar `failureCode`, modelo sanitizado y timeout. |
| `plate_analysis_result` | Resultado de plato persistido. | Vigilar `fallbackApplied` y `storageSaved`. |
| `weekly_plan_coach_result` | Resultado de generacion semanal. | Vigilar `fallbackApplied` y `coachFailureCode`. |
| `plate_image_rejected` | La firma MIME o el Content-Type de una imagen no es valido. | Investigar picos por cliente defectuoso o abuso. |
| `rate_limit_exceeded` | Un usuario supero una ventana persistente. | Revisar `scope` (`plate-analysis`, `weekly-plan-generate`, `coach-chat`) antes de ajustar limites. |
| `weekly_plan_active_block_overlay` | Un bloque activo fue refrescado con overlay adaptativo sin regenerar el mesociclo. | Vigilar `rules` y `volumeFactor`; confirma que check-ins/FC se reflejan. |
| `weekly_plan_active_block_overlay_failed` | Fallo al persistir el overlay adaptativo del bloque activo. | La respuesta puede usar overlay en memoria, pero Studio futuro podría quedar stale. |
| `studio_nutrition_macro_retry` | El plan semanal IA tuvo drift de macros y se reintento una vez. | Vigilar frecuencia; si sube, ajustar prompt o umbrales. |
| `studio_nutrition_macro_invalid` | El plan completo mantuvo drift severo y no se guardo. | Revisar `severeDriftDays`, proveedor y calidad del prompt. |
| `coach_chat_failed` | El chat del coach no pudo responder tras llamar Gemini. | Revisar status del proveedor, payload y `traceId`. |
| `coach_chat_http_error` | Gemini respondio HTTP no OK para el chat. | Revisar status y detalle truncado. |

No registres imagenes, tokens, API keys ni datos nutricionales completos en logs.

## Clasificacion de rechazos

`withTrace()` separa rechazos esperados marcados por dominio de fallos operativos. `AuthenticationError` genera `operation_rejected` con status `401`; los errores inesperados conservan `operation_failed`. El cambio pasó tests locales y fue desplegado el 2 de junio de 2026; no se reconsultaron Runtime Logs filtrados porque el CLI rechazó combinar follow con filtros en esta sesión.

## Consultas utiles

```bash
npx vercel logs --environment production --since 1h --query 'operation_failed' --no-branch
npx vercel logs --environment production --since 1h --query 'operation_rejected' --no-branch
npx vercel logs --environment production --since 1h --query 'gemini_call_failed' --no-branch
npx vercel logs --environment production --since 1h --query 'plate_analysis_result' --no-branch
npx vercel logs --environment production --since 1h --query 'weekly_plan_coach_result' --no-branch
npx vercel logs --environment production --since 1h --query 'weekly_plan_active_block_overlay' --no-branch
npx vercel logs --environment production --since 1h --query 'rate_limit_exceeded' --no-branch
npx vercel logs --environment production --since 1h --query 'studio_nutrition_macro_retry' --no-branch
npx vercel logs --environment production --since 1h --query 'studio_nutrition_macro_invalid' --no-branch
npx vercel logs --environment production --since 1h --query 'coach_chat_failed' --no-branch
npx vercel logs --environment production --since 1h --status-code 500 --no-branch
```

## Umbrales propuestos

Cuando se habilite un canal de alertas:

| Señal | Umbral inicial |
|---|---|
| HTTP `5xx` | Cualquier pico sostenido durante 5 minutos. |
| `gemini_call_failed` | Mas de 3 eventos en 10 minutos. |
| `fallbackApplied=true` | Mas del 10% de analisis o planes en 15 minutos. |
| `storageSaved=false` | Cualquier evento en produccion. |
| `rate_limit_exceeded` | Mas de 5 eventos por usuario o pico global en 10 minutos. |
| `studio_nutrition_macro_invalid` | Cualquier pico repetido; un evento aislado puede ser variabilidad del proveedor. |

## Pendiente externo

Para entrega automatica por email, Slack o webhook hay dos rutas, no viables por ahora sin cambio de plan o proveedor:

1. Subir Vercel a Pro o Enterprise con Observability Plus y activar Alerts.
2. Subir Vercel a Pro o Enterprise y configurar un Drain hacia un proveedor externo.

Referencias oficiales:

- [Vercel Alerts](https://vercel.com/docs/alerts/)
- [Vercel Runtime Logs](https://vercel.com/docs/observability/runtime-logs/)
- [Vercel Drains](https://vercel.com/docs/drains/using-drains)
