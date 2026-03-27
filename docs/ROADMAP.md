# Roadmap inicial (MVP → v1)

## Fase 0 — Fundación (completada)
## Fase 0 — Fundación (esta entrega)
- [x] Definir arquitectura y dominios.
- [x] Implementar motor básico de cálculo nutricional/glucémico.
- [x] Crear contrato base para integración Gemini.

## Fase 1 — Vertical end-to-end (completada en base inicial)
- [x] Conectar persistencia con Firebase (Auth + Firestore + Storage).
- [x] Exponer API HTTP para comidas, rutinas y análisis de fotos.
- [x] Implementar dashboard inicial web responsive en Next.js/Vercel.
- [x] Activar observabilidad base con trazas y logging estructurado.

## Fase 2 — IA operativa real
- [ ] Sustituir mock de Gemini por cliente real con `GEMINI_API_KEY`.
- [ ] Corrección manual de resultados y feedback loop por usuario.
- [ ] Calibración de porciones y confianza por tipo de plato.
## Fase 1 — MVP funcional
- [ ] Auth Firebase + onboarding de perfil metabólico.
- [ ] Registro manual de comidas y cálculo GI/GL.
- [ ] Registro de sesiones de entrenamiento (casa/gimnasio).
- [ ] Panel diario: calorías, macros, GL acumulada.

## Fase 2 — IA operativa
- [ ] Subida de imagen de plato.
- [ ] Integración Gemini con salida estructurada.
- [ ] Corrección manual de resultados y aprendizaje de preferencias.

## Fase 3 — Plan inteligente
- [ ] Plan nutricional semanal personalizado.
- [ ] Ajuste automático por carga de entrenamiento.
- [ ] Recomendaciones pre/post entreno basadas en glucemia.

## Fase 4 — Calidad y crecimiento
- [ ] Testing integral (unit + integración + e2e).
- [ ] Observabilidad avanzada (dashboards, métricas, alertas).
- [ ] Observabilidad (logs, trazas, alertas).
- [ ] Hardening de seguridad y privacidad.
