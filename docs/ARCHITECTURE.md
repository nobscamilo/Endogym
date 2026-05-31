# Arquitectura de Endogym

## Objetivo
Construir una aplicación web y API full-stack de alto rendimiento e impacto visual para **nutrición, control glucémico y entrenamiento** (gimnasio/casa), con un motor de IA que analiza fotos de platos y un Coach IA científico para adaptar rutinas semanales basado en evidencia clínica y las directrices de la ACSM (American College of Sports Medicine, 12.ª edición).

---

## Stack Tecnológico

- **Frontend**: Next.js (App Router, React 19) con un diseño UI/UX premium responsivo, animaciones dinámicas, modo oscuro y visualizaciones avanzadas.
- **Backend/API**: Next.js Route Handlers (API HTTP unificada).
- **Base de Datos**: Cloud Firestore de Firebase (persistencia de planes, perfiles, entrenamientos, comidas y progreso).
- **Archivos/Multimedia**: Firebase Storage (almacenamiento seguro de imágenes de platos de comida).
- **Autenticación**: Firebase Authentication (validación segura de ID tokens tanto en cliente como en servidor).
- **Modelos de IA**: Google AI (Gemini API) o Vertex AI (GCP) integrado nativamente mediante `src/services/geminiPlateAnalyzer.js` y el Coach IA en `src/core/weeklyPlan.js`.
- **Trazabilidad y Observabilidad**: Sistema de logging estructurado (`src/lib/logger.js`) con IDs de traza (`traceId`) y duraciones de ejecución para todos los endpoints.

---

## Estructura de Directorios

- `src/app/`: Estructura del App Router de Next.js.
  - `src/app/page.js`: Dashboard principal premium interactivo con tabs de inicio, plan de hoy (con Coach IA de sesión y panel muscular interactivo), plan de la semana y plan de nutrición.
  - `src/app/layout.js`: Envoltura global con tipografías premium y estilos de layout.
  - `src/app/styles.css`: Estilos Vanilla CSS premium (glassmorphism, animaciones micro, gradientes, dark mode).
  - `src/app/api/`: Endpoints HTTP públicos e internos de la aplicación.
    - `/health`: Estado de salud de la aplicación.
    - `/meals`: Creación y consulta de comidas.
    - `/workouts`: Registro y consulta de entrenamientos del día.
    - `/metrics`: Métricas de peso, glucemia, fatiga y adherencia.
    - `/profile`: Perfil del usuario con preferencias de entrenamiento y salud (endocrino/metabólico).
    - `/weekly-plan`: Generación del plan semanal dinámico (IA + ACSM + buckets de fitness).
    - `/analyze-plate`: Análisis multimodal de fotos de platos.
- `src/core/`: Motor científico y reglas de negocio.
  - `nutrition.js`: Cálculo de macronutrientes, micronutrientes y estimaciones calóricas.
  - `glucose.js`: Clasificación de índice glucémico (IG), carga glucémica (CG) e impacto insulínico estimado.
  - `weeklyPlan.js`: Generador de planes FITT basado en las guías ACSM (12ª edición), memoria de fatiga y buckets de fitness científicos.
  - `screening.js`: Cribado preparticipación para seguridad cardíaca y metabólica.
- `src/services/`: Integración con servicios externos.
  - `geminiPlateAnalyzer.js`: Análisis multimodal de imágenes de alimentos con fallback estructurado heurístico.
- `src/lib/`: Utilidades comunes.
  - `firebaseAdmin.js`: Acceso centralizado seguro a Auth, Firestore y Storage mediante variables de entorno del servidor.
  - `logger.js`: Logger estructurado con soporte de trazas (`traceId`).

---

## Flujos de Trabajo Clave

### 1. Análisis Multimodal de Platos (Foto -> Nutrientes -> Glucemia)
1. El usuario toma una foto de su comida y la sube en el frontend.
2. La imagen se envía a `/api/analyze-plate`, donde se guarda de forma asíncrona en Firebase Storage.
3. Se invoca a Gemini (o Vertex AI) con un prompt estructurado optimizado para estimar:
   - Ingredientes y porciones en gramos.
   - Carga Glucémica (CG) total e Impacto Insulínico estimado.
   - Distribución de Macronutrientes (Proteínas, Grasas, Carbohidratos) y Calorías.
4. Si la IA falla (limite de cuotas, error de red o de API Key), se activa un **fallback heurístico controlado** basado en reglas fijas para no romper la experiencia de usuario.
5. El resultado se compara con el plan de nutrición semanal activo para calcular el % de adherencia diaria.
6. La comida se guarda en Firestore y el usuario puede editarla manualmente en la UI para mantener el control final ("humano en el loop").

### 2. Prescripción Semanal Científica (IA + ACSM + Buckets de Fitness)
1. El usuario configura su perfil deportivo y de salud (ej: Fuerza en gimnasio, pérdida de peso, diabetes tipo 2).
2. Se ejecuta el **Cribado Preparticipación ACSM** para identificar riesgos metabólicos o cardíacos y limitar/adaptar la intensidad inicial de forma segura.
3. El motor genera una distribución FITT (Frecuencia, Intensidad, Tiempo, Tipo) alineada con la 12.ª edición de las ACSM Guidelines y la actualización de resistencia científica de 2026.
4. Se consultan los **Buckets de Fitness Científicos** en base al nivel y fatiga reciente del usuario para asegurar una sobrecarga progresiva y recuperación óptimas.
5. Se invoca a Gemini para generar un bloque de coaching personalizado diario explicando detalladamente:
   - Resumen motivador diario adaptado al día actual de entrenamiento.
   - Explicación científica de por qué se eligieron esos ejercicios concretos (biomecánica, sinergias musculares).
   - Justificación ACSM oficial detrás de las variables del día.
   - Ajustes específicos de carga/volumen basados en la fatiga acumulada del usuario.
6. Si Gemini no está disponible, el sistema utiliza un **generador heurístico ACSM interno** que calcula las justificaciones basándose en reglas científicas para garantizar el funcionamiento.
7. La UI del Dashboard muestra este "IA Coach Session Briefing" de forma prominente con un diseño visual de tarjetas expandibles y paneles de técnica e instrucciones (cues) detallados.

---

## Observabilidad y Trazabilidad

- Cada endpoint de API envuelve su lógica en un wrapper `withTrace()` que asigna un `traceId` único.
- Toda llamada externa a la API de Gemini o Firestore registra sus latencias, tokens y posibles fallos.
- La consola del navegador y los logs del backend permiten una auditoría de rendimiento rápida:
  ```json
  {"level":"info","message":"API health check","traceId":"tr_827f309a...","durationMs":4}
  ```
