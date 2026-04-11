# Roadmap inicial (MVP → v1)

## Fase 0 — Fundación (completada)
- [x] Definir arquitectura y dominios.
- [x] Implementar motor básico de cálculo nutricional/glucémico.
- [x] Crear contrato base para integración Gemini.

## Fase 1 — Vertical end-to-end (completada en base inicial)
- [x] Conectar persistencia con Firebase (Auth + Firestore + Storage).
- [x] Exponer API HTTP para comidas, rutinas y análisis de fotos.
- [x] Implementar dashboard inicial web responsive en Next.js/Vercel.
- [x] Activar observabilidad base con trazas y logging estructurado.

## Fase 2 — IA operativa real
- [x] Sustituir mock de Gemini por cliente real con `GEMINI_API_KEY` + fallback.
- [ ] Corrección manual de resultados y feedback loop por usuario.
- [ ] Calibración de porciones y confianza por tipo de plato.

## Fase 3 — Plan inteligente
- [x] Plan nutricional semanal personalizado.
- [x] Ajuste automático por carga de entrenamiento.
- [ ] Recomendaciones pre/post entreno basadas en glucemia.
- [x] Modalidades configurables: gimnasio completo, casa, yoga, TRX, running/ciclismo, etc.

## Fase 4 — Calidad y crecimiento
- [ ] Testing integral (unit + integración + e2e).
- [ ] Observabilidad avanzada (dashboards, métricas, alertas).
- [ ] Hardening de seguridad y privacidad.
