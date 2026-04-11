import { classifyGlycemicLoad, estimateInsulinIndex, glycemicLoad } from '../../../../core/glucose.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../../lib/auth.js';
import { errorResponse, jsonResponse } from '../../../../lib/http.js';
import { withTrace } from '../../../../lib/logger.js';

const OPEN_FOOD_FACTS_BASE = 'https://world.openfoodfacts.org/api/v2/product';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function firstFinite(values, fallback = 0) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return fallback;
}

function normalizeBarcode(rawCode) {
  if (typeof rawCode !== 'string') return null;
  const normalized = rawCode.replace(/[^\d]/g, '').trim();
  if (!normalized) return null;
  if (normalized.length < 8 || normalized.length > 14) return null;
  return normalized;
}

function parseServingGrams(product) {
  const servingQuantity = toFiniteNumber(product?.serving_quantity, 0);
  const servingUnit = String(product?.serving_quantity_unit || '').trim().toLowerCase();
  if (servingQuantity > 0 && (!servingUnit || servingUnit === 'g')) {
    return servingQuantity;
  }

  const servingText = String(product?.serving_size || '');
  const gramsMatch = servingText.match(/(\d+(?:[.,]\d+)?)\s*g/i);
  if (gramsMatch) {
    return toFiniteNumber(gramsMatch[1].replace(',', '.'), 100);
  }

  return 100;
}

function estimateGlycemicIndex({ carbs100g, sugars100g, fiber100g, processedLevel }) {
  if (carbs100g <= 0) {
    return 0;
  }

  const sugarRatio = clamp(sugars100g / Math.max(carbs100g, 1), 0, 1.3);
  const fiberRatio = clamp(fiber100g / Math.max(carbs100g, 1), 0, 1);
  const processedBoost = clamp(processedLevel, 0, 4) * 5;

  const estimate = 34 + sugarRatio * 38 - fiberRatio * 15 + processedBoost;
  return clamp(Math.round(estimate), 15, 95);
}

function getPer100gNutrition(product) {
  const nutriments = product?.nutriments || {};

  const calories = firstFinite(
    [
      nutriments['energy-kcal_100g'],
      nutriments['energy-kcal'],
      Number.isFinite(Number(nutriments.energy_100g)) ? Number(nutriments.energy_100g) / 4.184 : null,
    ],
    0
  );

  const proteinGrams = firstFinite([nutriments.proteins_100g, nutriments.proteins], 0);
  const carbsGrams = firstFinite([nutriments.carbohydrates_100g, nutriments.carbohydrates], 0);
  const fatGrams = firstFinite([nutriments.fat_100g, nutriments.fat], 0);
  const sugarsGrams = firstFinite([nutriments.sugars_100g, nutriments.sugars], 0);
  const fiberGrams = firstFinite([nutriments.fiber_100g, nutriments.fiber], 0);
  const sodiumGrams = firstFinite([nutriments.sodium_100g, nutriments.sodium], 0);
  const saltGrams = firstFinite([nutriments.salt_100g, nutriments.salt], 0);

  return {
    calories: Number(calories.toFixed(2)),
    proteinGrams: Number(proteinGrams.toFixed(2)),
    carbsGrams: Number(carbsGrams.toFixed(2)),
    fatGrams: Number(fatGrams.toFixed(2)),
    sugarsGrams: Number(sugarsGrams.toFixed(2)),
    fiberGrams: Number(fiberGrams.toFixed(2)),
    sodiumGrams: Number(sodiumGrams.toFixed(4)),
    saltGrams: Number(saltGrams.toFixed(4)),
  };
}

function getServingNutrition(per100g, servingGrams) {
  const multiplier = servingGrams / 100;

  return {
    calories: Math.round(per100g.calories * multiplier),
    proteinGrams: Number((per100g.proteinGrams * multiplier).toFixed(2)),
    carbsGrams: Number((per100g.carbsGrams * multiplier).toFixed(2)),
    fatGrams: Number((per100g.fatGrams * multiplier).toFixed(2)),
    sugarsGrams: Number((per100g.sugarsGrams * multiplier).toFixed(2)),
    fiberGrams: Number((per100g.fiberGrams * multiplier).toFixed(2)),
    sodiumGrams: Number((per100g.sodiumGrams * multiplier).toFixed(4)),
    saltGrams: Number((per100g.saltGrams * multiplier).toFixed(4)),
  };
}

function buildResponseProduct({ barcode, product }) {
  const name = product?.product_name_es || product?.product_name || 'Producto sin nombre';
  const brand = product?.brands || null;
  const defaultServingGrams = parseServingGrams(product);
  const per100g = getPer100gNutrition(product);
  const perServing = getServingNutrition(per100g, defaultServingGrams);
  const availableCarbsPerServing = Math.max(0, perServing.carbsGrams - perServing.fiberGrams);
  const novaGroup = clamp(Math.round(toFiniteNumber(product?.nova_group, 1)), 0, 4);
  const glycemicIndexEstimate = estimateGlycemicIndex({
    carbs100g: per100g.carbsGrams,
    sugars100g: per100g.sugarsGrams,
    fiber100g: per100g.fiberGrams,
    processedLevel: novaGroup,
  });
  const glycemicLoadPerServing = Number(glycemicLoad(glycemicIndexEstimate, availableCarbsPerServing).toFixed(2));
  const insulinIndexEstimate = estimateInsulinIndex({
    gl: glycemicLoadPerServing,
    proteinGrams: perServing.proteinGrams,
    processedLevel: novaGroup,
  });

  return {
    barcode,
    name,
    brand,
    imageUrl: product?.image_front_small_url || product?.image_front_url || null,
    servingSizeText: product?.serving_size || `${defaultServingGrams} g`,
    defaultServingGrams,
    nutritionPer100g: per100g,
    nutritionPerServing: perServing,
    glycemic: {
      indexEstimate: glycemicIndexEstimate,
      loadPerServing: glycemicLoadPerServing,
      loadCategory: classifyGlycemicLoad(glycemicLoadPerServing),
    },
    insulinIndexEstimate,
    quality: {
      novaGroup: novaGroup || null,
      nutritionGrade: product?.nutriscore_grade || product?.nutrition_grades || null,
    },
    availableCarbsPerServing: Number(availableCarbsPerServing.toFixed(2)),
    estimationNotes: [
      'GI, GL e índice insulínico son estimaciones educativas, no equivalen a laboratorio.',
      'Los datos dependen de la ficha nutricional publicada por el fabricante.',
    ],
  };
}

export async function GET(request) {
  try {
    return await withTrace('barcode_lookup', async ({ traceId }) => {
      await getAuthenticatedUser(request);
      const { searchParams } = new URL(request.url);
      const barcode = normalizeBarcode(searchParams.get('code'));

      if (!barcode) {
        return errorResponse('Código de barras inválido. Debe contener entre 8 y 14 dígitos.', 400);
      }

      const url = `${OPEN_FOOD_FACTS_BASE}/${barcode}.json?fields=code,product_name,product_name_es,brands,image_front_url,image_front_small_url,serving_size,serving_quantity,serving_quantity_unit,nutriments,nova_group,nutriscore_grade,nutrition_grades`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let response;
      try {
        response = await fetch(url, {
          headers: {
            'user-agent': 'Endogym/1.0 (nutrition barcode lookup)',
          },
          signal: controller.signal,
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          return errorResponse('La consulta al catálogo de productos excedió el tiempo límite.', 504);
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return errorResponse('No se pudo consultar la base de productos comerciales.', 502);
      }

      const payload = await response.json();
      if (!payload || payload.status !== 1 || !payload.product) {
        return errorResponse('Producto no encontrado para el código de barras indicado.', 404);
      }

      const product = buildResponseProduct({ barcode, product: payload.product });
      return jsonResponse({ traceId, source: 'openfoodfacts', product });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno consultando código de barras.', 500);
  }
}
