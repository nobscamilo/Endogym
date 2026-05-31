# Observabilidad operativa

Ultima actualizacion: **31 de mayo de 2026**.

## Estado real

Endogym usa logs JSON estructurados en Vercel Runtime Logs. El proyecto Vercel esta en plan `hobby`: permite consultar logs, pero no activar Alerts Beta ni Log Drains. Segun la documentacion oficial de Vercel, las alertas automaticas requieren Pro o Enterprise con Observability Plus.

## Eventos relevantes

| Evento | Significado | Accion |
|---|---|---|
| `operation_failed` | Una operacion HTTP lanzo error. | Revisar `operationName`, `traceId` y stack. |
| `gemini_call_failed` | Gemini fallo y puede haberse aplicado fallback. | Revisar status del proveedor y frecuencia. |
| `exercise_coach_failed` | El coach Gemini fallo y puede haberse aplicado heuristica. | Revisar `failureCode`, modelo sanitizado y timeout. |
| `plate_analysis_result` | Resultado de plato persistido. | Vigilar `fallbackApplied` y `storageSaved`. |
| `weekly_plan_coach_result` | Resultado de generacion semanal. | Vigilar `fallbackApplied` y `coachFailureCode`. |
| `plate_image_rejected` | La firma MIME o el Content-Type de una imagen no es valido. | Investigar picos por cliente defectuoso o abuso. |
| `rate_limit_exceeded` | Un usuario supero una ventana persistente. | Investigar picos y ajustar limites solo con evidencia. |

No registres imagenes, tokens, API keys ni datos nutricionales completos en logs.

## Consultas utiles

```bash
npx vercel logs --environment production --since 1h --query 'operation_failed' --no-branch
npx vercel logs --environment production --since 1h --query 'gemini_call_failed' --no-branch
npx vercel logs --environment production --since 1h --query 'plate_analysis_result' --no-branch
npx vercel logs --environment production --since 1h --query 'weekly_plan_coach_result' --no-branch
npx vercel logs --environment production --since 1h --query 'rate_limit_exceeded' --no-branch
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

## Pendiente externo

Para entrega automatica por email, Slack o webhook hay dos rutas:

1. Subir Vercel a Pro o Enterprise con Observability Plus y activar Alerts.
2. Configurar un proveedor externo y un Log Drain cuando el plan lo permita.

Referencias oficiales:

- [Vercel Alerts](https://vercel.com/docs/alerts/)
- [Vercel Runtime Logs](https://vercel.com/docs/observability/runtime-logs/)
- [Vercel Log Drains](https://vercel.com/docs/observability/log-drains)
