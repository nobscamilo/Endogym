# Arquitectura inicial de Endogym

## Objetivo
Construir una app full-stack para nutrición + glucemia + entrenamiento + IA de análisis de platos.

## Stack propuesto

- **Frontend**: Next.js (App Router) desplegado en Vercel.
- **Backend/API**: Next.js Route Handlers + Firebase Functions para jobs pesados.
- **Base de datos**: Firestore (perfiles, comidas, sesiones, planes, métricas).
- **Archivos**: Firebase Storage (fotos de platos, assets de usuario).
- **Auth**: Firebase Authentication.
- **IA**: Gemini API (análisis multimodal de imágenes + texto).

## Módulos de dominio

1. **Perfil metabólico**
   - Objetivo principal (déficit, mantenimiento, superávit, control glucémico).
   - Preferencias y restricciones alimentarias.
   - Sensibilidad glucémica estimada.

2. **Nutrición**
   - Registro de alimentos por comida.
   - Cálculo de macros/micros y calorías.
   - Sugerencias automáticas por objetivo y horario.

3. **Glucemia**
   - Cálculo de GI/GL por alimento y por plato.
   - Proyección de respuesta glucémica cualitativa.
   - Alertas preventivas por carga glucémica diaria.

4. **Entrenamiento**
   - Rutinas en casa/gimnasio.
   - Progresión por volumen, carga y adherencia.
   - Ajustes de nutrición pre/post entreno.

5. **IA de plato**
   - Detección de alimentos y porciones aproximadas.
   - Estimación de macros/micros.
   - Cálculo de impacto glucémico e insulínico estimado.

## Flujo de alto nivel

1. Usuario sube foto del plato.
2. App guarda imagen temporal en Storage.
3. Servicio Gemini recibe contexto (objetivo, hora, entreno del día) + imagen.
4. IA retorna lista estructurada de alimentos y cantidades.
5. Motor nutricional/glucémico calcula métricas finales.
6. Se guarda en Firestore y se presenta feedback accionable.

## Principios

- **Explícito > implícito**: cálculos explicables al usuario.
- **Humano en el loop**: usuario puede corregir alimentos/porciones detectadas.
- **Seguridad primero**: no hacer recomendaciones médicas diagnósticas.
- **Escalabilidad modular**: servicios desacoplados por dominio.
