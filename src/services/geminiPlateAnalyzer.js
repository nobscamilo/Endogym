import { glycemicLoad, estimateInsulinIndex } from '../core/glucose.js';

/**
 * Adaptador base para integrar Gemini.
 * Este módulo define un contrato explícito para convertir una salida multimodal
 * en datos estructurados que Endogym puede persistir y utilizar.
 */
export async function analyzePlateWithGemini({ imageBase64, promptContext, callModel }) {
  if (!imageBase64) {
    throw new Error('Se requiere una imagen en base64.');
  }

  if (typeof callModel !== 'function') {
    throw new Error('Debes inyectar una función callModel para la integración real con Gemini.');
  }

  const modelResponse = await callModel({ imageBase64, promptContext });

  const foods = modelResponse.foods ?? [];

  const totals = foods.reduce(
    (acc, food) => {
      const gl = glycemicLoad(food.glycemicIndex ?? 0, food.availableCarbsGrams ?? 0);
      const insulinIndex = estimateInsulinIndex({
        gl,
        proteinGrams: food.proteinGrams ?? 0,
        processedLevel: food.processedLevel ?? 1,
      });

      acc.calories += food.calories ?? 0;
      acc.proteinGrams += food.proteinGrams ?? 0;
      acc.carbsGrams += food.carbsGrams ?? 0;
      acc.fatGrams += food.fatGrams ?? 0;
      acc.glycemicLoad += gl;
      acc.insulinIndex = Math.round((acc.insulinIndex + insulinIndex) / 2);
      return acc;
    },
    {
      calories: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      glycemicLoad: 0,
      insulinIndex: 0,
    }
  );

  return {
    foods,
    totals,
    notes: modelResponse.notes ?? [],
    confidence: modelResponse.confidence ?? null,
  };
}
