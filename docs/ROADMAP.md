# Plan de Trabajo y Roadmap (v0.3.0 → v1.0.0)

Este documento detalla el estado actual del desarrollo de Endogym y la hoja de ruta para futuras iteraciones y mejoras.

---

## Estado de Fases de Desarrollo

### 🟢 Fase 0 — Fundación (Completada)
- [x] Definir arquitectura y dominios clínicos.
- [x] Implementar motor de cálculo nutricional y control glucémico básico (`src/core/nutrition.js`, `src/core/glucose.js`).
- [x] Diseñar contratos base y conectores para integraciones con Inteligencia Artificial.

### 🟢 Fase 1 — Vertical End-to-End (Completada)
- [x] Conectar persistencia gestionada con Firebase (`firebase-admin` para Auth, Firestore y Storage).
- [x] Diseñar e implementar endpoints HTTP API (`/health`, `/meals`, `/workouts`, `/metrics`, `/profile`, `/weekly-plan`, `/analyze-plate`).
- [x] Crear un Dashboard Web interactivo y responsive en Next.js (App Router, React 19).
- [x] Integrar trazabilidad y observabilidad unificada mediante `withTrace()` y logs estructurados JSON (`src/lib/logger.js`).

### 🟡 Fase 2 — Inteligencia Artificial Real & Avanzada (En Progreso)
- [x] Sustituir el mock de Gemini por llamadas de producción reales usando `GEMINI_API_KEY` (soporta API de Google AI Studio y Vertex AI en GCP).
- [x] Implementar el **Coach IA Científico** que analiza fatiga, calcula adaptaciones, genera cues de técnica detalladas y redacta justificaciones clínicas/ACSM.
- [x] Diseñar e implementar un sistema de **fallback robusto y heurístico** para que la aplicación siga operativa si falla la IA (ej: límites de cuota excedidos).
- [x] Crear la UI del **Coach IA Session Briefing** en el Dashboard, mostrando resúmenes motivacionales diarios, justificaciones de ejercicios y ACSM mediante tarjetas dinámicas interactivas.
- [ ] Implementar la corrección manual en UI de alimentos/porciones detectados por IA ("humano en el loop").
- [ ] Optimizar prompts multimodales para análisis de platos para calibrar con mayor precisión el peso visual de los alimentos.

### 🟢 Fase 3 — Planificación Inteligente e Interacciones (Completada)
- [x] Generación de planes nutricionales semanales personalizados, filtrando alimentos según alergias, intolerancias y alimentos desagradables (no preferidos).
- [x] Cribado Preparticipación ACSM automatizado para seguridad cardíaca y metabólica antes de iniciar rutinas.
- [x] Ajuste automático de carga de volumen/intensidad semanal en base a la fatiga subjetiva y el historial de progreso.
- [x] Biblioteca completa de ejercicios clasificados por modalidad deportiva:
  - Gimnasio Completo (`full_gym`)
  - Solo Casa / Calistenia (`home`)
  - Yoga / Flexibilidad (`yoga`)
  - TRX / Suspensión (`trx`)
  - Cardio / Running (`running`)
- [ ] Implementar recomendaciones pre/post entreno específicas según el nivel de glucemia y sensibilidad a la insulina estimadas para el usuario.

### 🔴 Fase 4 — Calidad, Pruebas y Escalabilidad (Siguiente Paso)
- [ ] Implementar batería completa de tests unitarios y de integración con **Vitest** (esqueleto base configurado en `vitest.config.js`).
- [ ] Crear flujos de prueba E2E de análisis de platos (cargando fotos simuladas) y generación de planes.
- [ ] Implementar dashboards de analíticas avanzados para ver la evolución a largo plazo del control glucémico (HbA1c estimada) y fatiga/volumen de entrenamiento.
- [ ] Auditoría profunda de seguridad, cifrado de datos de salud sensibles y cumplimiento de normativas de privacidad de datos médicos.
