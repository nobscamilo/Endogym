import { glycemicLoad, estimateInsulinIndex } from '../core/glucose.js';

/**
 * Adaptador base para integrar Gemini.
 * Este módulo define un contrato explícito para convertir una salida multimodal
 * en datos estructurados que Endogym puede persistir y utilizar.
 */
function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

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
      const glycemicIndex = toNumber(food.glycemicIndex);
      const availableCarbsGrams = toNumber(food.availableCarbsGrams);
      const proteinGrams = toNumber(food.proteinGrams);
      const carbsGrams = toNumber(food.carbsGrams);
      const fatGrams = toNumber(food.fatGrams);
      const calories = toNumber(food.calories);
      const processedLevel = toNumber(food.processedLevel ?? 1);

      const gl = glycemicLoad(glycemicIndex, availableCarbsGrams);
      const insulinIndex = estimateInsulinIndex({
        gl,
        proteinGrams,
        processedLevel,
      });

      acc.calories += calories;
      acc.proteinGrams += proteinGrams;
      acc.carbsGrams += carbsGrams;
      acc.fatGrams += fatGrams;
      acc.glycemicLoad += gl;
      acc.insulinIndexSum += insulinIndex;
      acc.foodCount += 1;
      return acc;
    },
    {
      calories: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      glycemicLoad: 0,
      insulinIndexSum: 0,
      foodCount: 0,
    }
  );

  const normalizedTotals = {
    calories: Math.round(totals.calories),
    proteinGrams: Math.round(totals.proteinGrams),
    carbsGrams: Math.round(totals.carbsGrams),
    fatGrams: Math.round(totals.fatGrams),
    glycemicLoad: Number(totals.glycemicLoad.toFixed(2)),
    insulinIndex:
      totals.foodCount > 0 ? Math.round(totals.insulinIndexSum / totals.foodCount) : 0,
  };

  return {
    foods,
    totals: normalizedTotals,
    notes: modelResponse.notes ?? [],
    confidence: modelResponse.confidence ?? null,
  };
}
