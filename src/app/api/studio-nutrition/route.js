import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError } from '../../../lib/logger.js';
import { isValidGoogleAiModelName, requestGoogleGenerateContent } from '../../../services/googleGenAiTransport.js';
import { resolveGeminiCoachModel } from '../../../services/exerciseCoachClient.js';
import { getUserProfile, getLatestWeeklyPlan } from '../../../lib/repositories/firestoreRepository.js';

// Fase 3: genera con Gemini el PLAN SEMANAL de comidas (7 días, recetas + lista de compra
// semanal + batch cooking) personalizado al perfil y objetivos del usuario, en JSON con la
// forma que consume el rediseño Studio. Reemplaza los datos de muestra de Nutrición.

// El plan semanal (28 comidas) puede tardar; ampliamos el límite de ejecución en Vercel.
export const maxDuration = 60;

const MEAL_ITEM_SCHEMA = {
  type: 'object',
  required: ['slot', 'dish', 'kcal', 'p', 'c', 'f', 'ingredients', 'steps', 'serving'],
  properties: {
    slot: { type: 'string' },
    dish: { type: 'string' },
    emoji: { type: 'string' },
    time: { type: 'string' },
    mins: { type: 'integer' },
    kcal: { type: 'integer' },
    p: { type: 'integer' },
    c: { type: 'integer' },
    f: { type: 'integer' },
    gl: { type: 'integer' },
    ii: { type: 'integer' },
    glClass: { type: 'string', enum: ['good', 'mid', 'high'] },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    serving: { type: 'string' },
  },
};

const NUTRITION_SCHEMA = {
  type: 'object',
  required: ['days', 'shopping', 'batch'],
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        required: ['day', 'meals'],
        properties: {
          day: { type: 'string', enum: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] },
          meals: { type: 'array', items: MEAL_ITEM_SCHEMA },
        },
      },
    },
    shopping: {
      type: 'array',
      items: {
        type: 'object',
        required: ['cat', 'items'],
        properties: {
          cat: { type: 'string' },
          icon: { type: 'string' },
          items: {
            type: 'array',
            items: { type: 'object', required: ['name', 'qty'], properties: { name: { type: 'string' }, qty: { type: 'string' } } },
          },
        },
      },
    },
    batch: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'desc', 'time', 'day'],
        properties: {
          title: { type: 'string' },
          desc: { type: 'string' },
          time: { type: 'string' },
          day: { type: 'string' },
          emoji: { type: 'string' },
        },
      },
    },
  },
};

function targetsFrom(plan) {
  const t = plan?.baseTarget || (Array.isArray(plan?.days) ? plan.days[0]?.nutritionTarget : null);
  if (!t) return { kcal: 2000, protein: 140, carbs: 200, fat: 65 };
  return {
    kcal: Math.round(Number(t.targetCalories ?? t.calories) || 2000),
    protein: Math.round(Number(t.proteinGrams) || 140),
    carbs: Math.round(Number(t.carbsGrams) || 200),
    fat: Math.round(Number(t.fatGrams) || 65),
  };
}

export async function POST(request) {
  return withTrace('studio_nutrition', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }

    if (!process.env.GEMINI_API_KEY) return errorResponse('IA no configurada.', 503);
    const model = resolveGeminiCoachModel();
    if (!isValidGoogleAiModelName(model)) return errorResponse('Modelo Gemini inválido.', 500);

    const [profile, plan] = await Promise.all([
      getUserProfile(user.uid).catch(() => null),
      getLatestWeeklyPlan(user.uid).catch(() => null),
    ]);
    const t = targetsFrom(plan);
    const goal = profile?.goal || 'salud y composición corporal';
    const conditions = profile?.medicalConditions || 'ninguna declarada';
    const restrictions = profile?.dietaryRestrictions || profile?.allergies || 'ninguna declarada';

    const prompt = `Eres un nutricionista deportivo. Genera el PLAN SEMANAL DE COMIDAS (7 días) para este usuario, en español de España.
Perfil: objetivo "${goal}"; condiciones médicas: ${conditions}; restricciones/alergias: ${restrictions}.
Objetivo nutricional diario: ~${t.kcal} kcal, proteína ${t.protein} g, carbohidratos ${t.carbs} g, grasa ${t.fat} g.
Requisitos:
- days: EXACTAMENTE 7 días, uno por cada day: "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom" (en ese orden, sin repetir).
- Cada día tiene EXACTAMENTE 4 comidas con slot: "Desayuno", "Comida", "Merienda", "Cena". La suma de kcal de cada día debe acercarse al objetivo diario.
- Los menús deben ser DISTINTOS entre días (no repitas el mismo plato día tras día); puedes reaprovechar ingredientes del batch cooking pero varía las recetas.
- Cada comida: dish (nombre apetecible), emoji, time (HH:MM), mins (prep), kcal, p, c, f (gramos enteros), gl (carga glucémica 0-40), ii (índice insulínico 0-100), glClass ('good' baja, 'mid' media, 'high' alta), ingredients (con cantidades), steps (2-3 pasos concisos), serving (consejo breve).
- shopping: lista de la compra para TODA LA SEMANA (7 días), NO para un solo día. 4-6 categorías (cat, icon emoji, items con name y qty), con cantidades agregadas para 7 días (p. ej. "Pollo 1,4 kg", "Huevos 18 ud", "Arroz 1 kg"). El usuario compra una vez para la semana.
- batch: 3-4 tareas de batch cooking del fin de semana para dejar la semana lista (title, desc, time, day, emoji).
- Respeta condiciones/restricciones. Comida real, variada y práctica. Devuelve SOLO el JSON del esquema.`;

    try {
      const { response } = await requestGoogleGenerateContent({
        model,
        traceId,
        timeoutMs: 55000,
        parts: [{ text: prompt }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
          responseJsonSchema: NUTRITION_SCHEMA,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        logError('studio_nutrition_http', new Error(`HTTP ${response.status}`), { traceId, userId: user.uid, detail: detail.slice(0, 200) });
        return errorResponse('No se pudo generar el plan ahora mismo.', 502);
      }
      const data = await response.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').trim();
      let parsed;
      try { parsed = JSON.parse(text); } catch { return errorResponse('Respuesta IA no parseable.', 502); }
      if (!parsed || !Array.isArray(parsed.days) || !parsed.days.length) return errorResponse('Plan IA incompleto.', 502);
      return jsonResponse({ ok: true, nutrition: parsed });
    } catch (error) {
      logError('studio_nutrition_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo generar el plan ahora mismo.', 502);
    }
  });
}
