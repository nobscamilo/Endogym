# Ruta A: Vercel + Firebase

## Decision

Endogym despliega Next.js y sus Route Handlers en Vercel. Firebase aporta Auth, Firestore y Storage. Google AI aporta inferencia cuando sus credenciales son validas.

## Responsabilidades

| Servicio | Responsabilidad | Estado 31 mayo 2026 |
|---|---|---|
| GitHub | Codigo y CI | Operativo |
| Vercel | Web y APIs | Production `Ready` |
| Firebase Auth cliente | Identidad | Verificado |
| Firebase Admin | Credenciales servidor | Local y produccion verificados |
| Firestore | Persistencia | Local y produccion verificados |
| Firebase Storage / Cloud Storage | Fotos | Bucket privado `endogym-vtety8-plates-eu`; upload, borrado y caducidad a 30 dias verificados |
| Gemini Developer API | Analisis y coach | Key restringida en Vercel; plato y coaching semanal live verificados con `gemini-2.5-flash` |

## Regla operativa

No habilites `AUTH_DISABLED=true` en produccion. Usa exclusivamente Gemini Developer API: Vertex AI esta deshabilitado por decision de arquitectura. Repite las sondas reales despues de cambiar credenciales o bucket.

Las operaciones IA costosas tienen rate limiting persistente en Firestore. Consulta [`API.md`](API.md) y [`OBSERVABILITY.md`](OBSERVABILITY.md).

El cierre del 2 de junio de 2026 añadió cabeceras HTTP defensivas globales y clasificación `operation_rejected` para rechazos auth esperados. Fue desplegado manualmente a Vercel en `dpl_FJ2jWbaV8Ktjy9G57aKMDaVB4t9r` y pasó sondas públicas.

## URL canonica

Configura:

```text
NEXT_PUBLIC_SITE_URL=https://endogym.vercel.app
NEXT_PUBLIC_APP_URL=https://endogym.vercel.app
```

## Procedimiento

Consulta [`docs/DEPLOYMENT.md`](DEPLOYMENT.md).
