# Endogym

Endogym es una plataforma integral para **nutrición, control glucémico y entrenamiento** (gimnasio/casa), con capacidades de IA para analizar platos desde fotos y estimar:

- Macronutrientes y micronutrientes.
- Carga glucémica (GL) e índice glucémico (GI).
- Impacto insulínico estimado.
- Recomendaciones contextualizadas según objetivo y entrenamiento.

## Estado actual

Este repositorio incluye la **base funcional inicial**:

1. Motor de cálculo glucémico y nutricional (`src/core`).
2. Contratos de datos para usuarios, comidas, sesiones y planes (`src/domain`).
3. Adaptador base para análisis de platos con Gemini (`src/services`).
4. Roadmap y arquitectura de producto (`docs`).

## Estructura

- `docs/ARCHITECTURE.md`: arquitectura técnica objetivo (Firebase + Vercel + Gemini).
- `docs/ROADMAP.md`: plan de entrega por fases.
- `src/core/glucose.js`: funciones de GI/GL e impacto glucémico.
- `src/core/nutrition.js`: cálculo de macros, calorías y distribución.
- `src/domain/models.js`: modelos de dominio iniciales.
- `src/services/geminiPlateAnalyzer.js`: integración base con Gemini API.
- `scripts/smoke-test.mjs`: validación rápida de cálculos en local.

## Próximos pasos inmediatos

1. Conectar persistencia con Firebase (Auth + Firestore + Storage).
2. Exponer API HTTP para registro de comidas, rutinas y análisis de fotos.
3. Implementar dashboard inicial (web responsive en Vercel).
4. Activar observabilidad y trazas (errores IA + cálculos).

