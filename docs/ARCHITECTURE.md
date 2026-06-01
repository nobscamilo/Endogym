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
| `src/app/page.js` | Login y registro Firebase Client Auth. |
| `src/app/dashboard/page.js` | Entrada al dashboard. |
| `src/components/DashboardPage.js` | UI principal: tab Hoy, Biblioteca, Nutrición, Perfil y menú hamburguesa. |
| `src/components/MuscleMapFigure.js` | Componente de atlas anatómico 3D con superposiciones CSS de grupos musculares. |
| `src/app/api/**/route.js` | APIs Next.js. |
| `src/lib/auth.js` | Validacion de ID token y bypass local explicito. |
| `src/lib/firebaseAdmin.js` | Inicializacion Firebase Admin. |
| `src/lib/repositories/firestoreRepository.js` | Persistencia y borrado/exportacion de cuenta. |
| `src/lib/rateLimit.js` | Ventanas persistentes por usuario para operaciones costosas. |
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
users/{userId}/rateLimits/{scope}
```

## Flujo de autenticacion

1. El frontend usa Firebase Client Auth.
2. El cliente obtiene un Firebase ID token.
3. La API recibe `Authorization: Bearer <token>`.
4. `src/lib/auth.js` valida el token con Firebase Admin.
5. `AUTH_DISABLED=true` solo habilita bypass en desarrollo local.

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
2. El coach usa Gemini Developer API con `gemini-2.5-flash` estable.
3. El transporte rechaza identificadores que no sigan el formato `gemini-*`.
4. El coach usa `thinkingBudget=0`, timeout de 10 segundos por intento y un reintento.
5. Si Gemini falla o agota presupuesto, la API persiste fallback heuristico ACSM observable sin exceder el timeout Vercel.

## Retencion de fotos

- `infra/storage-lifecycle.json` elimina objetos `plates/` cuando superan 30 dias.
- El bucket tiene soft delete deshabilitado para que el borrado de cuenta no conserve copias recuperables.
- La eliminacion de cuenta borra tambien `rateLimits`.

## Observabilidad

- `withTrace()` genera `traceId`.
- Los logs JSON registran inicio, fin, duracion y errores.
- `plate_analysis_result`, `weekly_plan_coach_result`, `plate_image_rejected` y `rate_limit_exceeded` permiten vigilar degradacion y abuso.
- Evita incluir imagenes, tokens o datos sensibles en logs.
- Consulta [`OBSERVABILITY.md`](OBSERVABILITY.md).

## Principios

- Explicabilidad antes que claims clinicos.
- Humano en el loop para corregir estimaciones.
- Probar antes de afirmar.
- Degradacion observable ante fallos externos.
