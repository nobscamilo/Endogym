# Arquitectura inicial de Endogym

## Objetivo
Construir una app full-stack para nutrición + glucemia + entrenamiento + IA de análisis de platos.

## Stack implementado

- **Frontend**: Next.js (App Router) desplegable en Vercel.
- **Backend/API**: Next.js Route Handlers.
- **Base de datos**: Firestore.
- **Archivos**: Firebase Storage.
- **Auth**: Firebase Authentication (validación ID token en API).
- **IA**: Adaptador Gemini (mock actual + contrato listo para cliente real).

## Endpoints HTTP iniciales

- `GET /api/health`
- `GET /api/meals`
- `POST /api/meals`
- `GET /api/workouts`
- `POST /api/workouts`
- `POST /api/analyze-plate`

## Flujo de análisis de plato

1. Usuario sube foto del plato.
2. API valida autenticación.
3. Imagen se guarda en Firebase Storage.
4. Adaptador Gemini obtiene alimentos y porciones estimadas.
5. Motor nutricional/glucémico calcula métricas finales.
6. Resultado se persiste como comida en Firestore.

## Observabilidad

- Todos los endpoints usan `withTrace()` con `traceId`.
- Logs estructurados JSON con inicio/fin/error y `durationMs`.
- Errores de cálculos/IA se registran con stack y contexto.

## Principios

- **Explícito > implícito**: cálculos explicables al usuario.
- **Humano en el loop**: usuario puede corregir alimentos/porciones detectadas.
- **Seguridad primero**: no hacer recomendaciones médicas diagnósticas.
- **Escalabilidad modular**: servicios desacoplados por dominio.


## Decisión de despliegue

Se adopta **Ruta A**: Vercel (Next.js web + API) y Firebase como backend gestionado (Auth, Firestore, Storage).
