# Endogym — Guía de Desarrollo para Agentes y Desarrolladores

Bienvenido a **Endogym**, la plataforma científica integral y premium para el control de **nutrición, control glucémico y entrenamiento adaptativo** asistido por Inteligencia Artificial (Gemini y Vertex AI) y validado clínicamente.

Este archivo y la carpeta `docs/` contienen toda la información estructurada, decisiones de diseño y recomendaciones técnicas para que cualquier desarrollador o agente de IA pueda entender el funcionamiento del proyecto de inmediato, operarlo, mantenerlo y extenderlo.

---

## 📌 Estado del Proyecto y Funcionalidades Principales

Endogym es una SPA (Single Page Application) responsiva de Next.js (App Router, React 19) estructurada bajo el principio de **desacoplamiento de negocio y persistencia**.

### 1. Panel de Control de Alto Impacto Visual (Dashboard Premium)
- **Vista Principal (Inicio)**: Visualizaciones en tiempo real del progreso, glucemia reciente, comidas diarias e indicadores calóricos.
- **Vista Plan de Hoy**:
  - **Briefing de Sesión del Coach IA**: Tarjeta destacada expandible que presenta una explicación científica diaria de la rutina del día, justificaciones de la ACSM y ajustes por fatiga acumulada del usuario.
  - **Panel Muscular Interactivo**: Renderiza dinámicamente un mapa de calor muscular mostrando qué áreas se trabajan en la sesión activa.
  - **Lista de Ejercicios del Día**: Desglose con calentamiento/enfriamiento, cues detalladas de técnica biomecánica, enlaces directos a videos de YouTube con las instrucciones correctas y control interactivo de finalización.
- **Vista Plan de la Semana**: Distribución de días activos, modalidades deportivas y volumen semanal FITT.
- **Vista Nutricional Semanal**: Menú semanal desglosado día a día con filtrado de intolerancias, alergias y exclusión de alimentos indeseados.

### 2. Motor Científico e IA
- **Análisis de Fotos de Platos**: Entrada de foto multimodal enviada a Gemini Studio / Vertex AI que estima ingredientes, porciones en gramos, calorías, desglose de macronutrientes, carga glucémica (CG) e impacto insulínico.
- **Planificación Adaptativa FITT (ACSM Guidelines, 12th ed.)**:
  - **Cribado de Salud (ACSM Preparticipation Screening)**: Filtra síntomas y patologías para limitar intensidades y preservar la seguridad cardiovascular y endocrina.
  - **Ajuste por Fatiga Subjetiva**: El sistema adapta automáticamente el volumen, series y RPE según el estado de cansancio acumulado reportado por el usuario.
  - **Buckets de Fitness Científicos**: Biblioteca inteligente organizada por niveles (Principiante, Intermedio, Avanzado) y modalidades deportivas (`full_gym`, `home`, `yoga`, `trx`, `running`).
  - **IA Coach Briefing**: Generador detallado del porqué biomecánico de cada ejercicio seleccionado, enlazado a evidencias científicas sólidas.

### 3. Persistencia Unificada (Firebase)
- Autenticación con Firebase Auth (validación automática de ID Tokens).
- Base de datos relacional y ágil con Cloud Firestore.
- Almacenamiento multimedia seguro en Firebase Storage para las imágenes de platos de comida analizados.

---

## 🛠️ Arquitectura y Estructura del Código

Para comprender la arquitectura técnica, consulta [docs/ARCHITECTURE.md](file:///Users/camilosar/Documents/antigravity/fearless-davinci/docs/ARCHITECTURE.md).

Estructura resumida:
- `/src/app/page.js`: El componente de UI principal que aloja el Dashboard interactivo con sus 4 tabs y la UI del Coach IA.
- `/src/app/api/`: Capa de Route Handlers de Next.js.
  - `/api/weekly-plan`: Generador inteligente de planes nutricionales y deportivos.
  - `/api/analyze-plate`: Endpoint de análisis multimodal de imágenes.
- `/src/core/`: Motores de cálculo 100% aislados de llamadas externas y efectos secundarios.
  - `weeklyPlan.js`: Algoritmo de planificación de entrenamiento (ACSM, Buckets, Fatiga, Biblioteca de Ejercicios).
  - `nutrition.js` y `glucose.js`: Motores de estimación metabólica.
  - `screening.js`: Cuestionario y cribado cardiovascular inicial.
- `/src/services/geminiPlateAnalyzer.js`: Servicio integrador con Gemini que utiliza prompts optimizados y ofrece un **fallback heurístico** local robusto en caso de fallos.
- `/src/lib/logger.js`: Mapea trazas globales mediante `traceId` en cada llamada HTTP para facilitar la observabilidad en producción.

---

## ⚙️ Configuración y Variables de Entorno

Copia el archivo de plantilla `.env.example` para crear tu `.env.local` en local:
```bash
cp .env.example .env.local
```

### Variables Requeridas para Inferencia Real de IA
- `GOOGLE_AI_BACKEND`: Define el motor. Usa `gemini` para Google AI Studio y `vertex` para Vertex AI en GCP.
- `GEMINI_API_KEY`: API Key obtenida de Google AI Studio.
- `GEMINI_MODEL_COACH`: Modelo recomendado: `gemini-3.1-pro-preview`.
- `GEMINI_FALLBACK_TO_MOCK`: `true` (recomendado para desarrollo, proporciona un fallback local robusto si se supera el límite de cuotas de la IA).

> [!TIP]
> Si estás en desarrollo local y no deseas configurar Firebase Authentication en la UI, puedes establecer `AUTH_DISABLED=true` y `NEXT_PUBLIC_AUTH_DISABLED=true` en tu archivo `.env.local` para simular un inicio de sesión instantáneo con un perfil mock.

---

## 🚀 Comandos de Operación Local

1. **Instalar Dependencias**:
   ```bash
   npm install
   ```

2. **Iniciar Servidor de Desarrollo**:
   ```bash
   npm run dev
   ```
   La aplicación estará disponible en `http://localhost:3000`.

3. **Ejecutar Pruebas de Integración y Regresión (Smoke Test)**:
   Asegura que el motor de cálculos, cribados, fallbacks y rutinas funcione perfectamente sin errores lógicos:
   ```bash
   npm run smoke
   ```

4. **Ejecutar Pruebas Unitarias**:
   ```bash
   npm run test
   ```

---

## 📋 Recomendaciones para otros Agentes de IA

Si eres otro Agente de IA continuando el desarrollo de Endogym, sigue estrictamente estas directrices para mantener la calidad y el diseño estético de la aplicación:

### 🎨 1. Estética UI/UX
- **Vanilla CSS Premium**: No utilices frameworks CSS como Tailwind a menos que se te indique explícitamente. Todos los estilos están centralizados en `src/app/styles.css`.
- **Glassmorphism y Efectos Modernos**: Usa gradientes sutiles (`linear-gradient`), efectos de desenfoque de fondo (`backdrop-filter`), sombras profundas y bordes muy finos semitransparentes en tarjetas.
- **Micro-animaciones**: Toda acción (cargando, hover en botones, transiciones entre pestañas, expansión del briefing del Coach IA) debe contar con una transición suave (`transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1)`).

### 🧪 2. Principios de IA y Robustez
- **Tolerancia a Fallos (Fallbacks)**: Toda consulta externa a la IA de Gemini (en análisis de platos o generación de planes) **debe** estar envuelta en bloques `try/catch` robustos que llamen a generadores heurísticos locales en caso de error. Nunca dejes que un fallo en la API Key de Gemini bloquee la experiencia del usuario.
- **Salida Estructurada JSON**: Al llamar a Gemini con prompts, exige siempre respuestas en formato JSON limpio y utilízalo para poblar directamente los campos.
- **Validaciones Clínicas Explicables**: El motor glucémico e insulínico debe calcular resultados transparentes basados en gramos e índices oficiales.

### 📦 3. Despliegue en Producción
- Consulta la guía de despliegue en Vercel y Firebase en [docs/DEPLOYMENT.md](file:///Users/camilosar/Documents/antigravity/fearless-davinci/docs/DEPLOYMENT.md).
- Detalle paso a paso del CLI y de las configuraciones en la nube en [docs/ROUTE_A_VERCEL.md](file:///Users/camilosar/Documents/antigravity/fearless-davinci/docs/ROUTE_A_VERCEL.md).
