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
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/weekly-plan`
- `POST /api/weekly-plan`
- `POST /api/analyze-plate`

## Flujo de análisis de plato

1. Usuario sube foto del plato.
2. API valida autenticación.
3. Imagen se guarda en Firebase Storage.
4. Adaptador Gemini obtiene alimentos y porciones estimadas (con fallback robusto).
5. Motor nutricional/glucémico calcula métricas finales.
6. Se calcula adherencia del plato contra plan semanal activo.
7. Resultado se persiste como comida en Firestore.

## Flujo de prescripción semanal (IA + ACSM)

1. Usuario define objetivo (pérdida de peso, resistencia, hipertrofia, fuerza, etc.) y modalidad (gym, casa, yoga, TRX, etc.).
2. Motor de planificación genera rutina base + objetivos nutricionales diarios.
3. Se añade bloque FITT alineado a ACSM (12th edition) + actualización de resistencia 2026.
4. Se intenta ajuste de coaching con Gemini (perfil endocrino-deportológico).
5. Si falla la IA, se mantiene fallback heurístico y se persiste igualmente.

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
