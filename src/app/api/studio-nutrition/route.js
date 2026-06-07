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

const DAYS_PROP = {
  type: 'array',
  items: {
    type: 'object',
    required: ['day', 'meals'],
    properties: {
      day: { type: 'string', enum: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] },
      meals: { type: 'array', items: MEAL_ITEM_SCHEMA },
    },
  },
};

const SHOPPING_PROP = {
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
};

const BATCH_PROP = {
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
};

// Esquema del trozo que incluye compra + batch (primer trozo de la semana).
const FULL_CHUNK_SCHEMA = {
  type: 'object',
  required: ['days', 'shopping', 'batch'],
  properties: { days: DAYS_PROP, shopping: SHOPPING_PROP, batch: BATCH_PROP },
};

// Esquema del trozo que solo trae días (resto de la semana).
const DAYS_CHUNK_SCHEMA = {
  type: 'object',
  required: ['days'],
  properties: { days: DAYS_PROP },
};

// La semana se genera en VARIOS trozos pequeños EN PARALELO. Una sola llamada con 28 recetas
// supera el tope de tiempo del transporte (~30-60s) y se abortaba; trozos de 2 días caben
// holgadamente y, al ir en paralelo, la latencia total se mantiene baja.
const DAY_CHUNKS = [['Lun', 'Mar'], ['Mié', 'Jue'], ['Vie', 'Sáb'], ['Dom']];

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

    const baseRules = `Eres un nutricionista deportivo. Trabajas en español de España.
Perfil: objetivo "${goal}"; condiciones médicas: ${conditions}; restricciones/alergias: ${restrictions}.
Objetivo nutricional diario: ~${t.kcal} kcal, proteína ${t.protein} g, carbohidratos ${t.carbs} g, grasa ${t.fat} g.`;

    function buildPrompt(daysList, withShoppingBatch) {
      return `${baseRules}
Genera el menú para ESTOS días: ${daysList.join(', ')}.
Requisitos:
- days: EXACTAMENTE estos ${daysList.length} días (campo "day" con el valor correspondiente: ${daysList.join(', ')}).
- Cada día tiene EXACTAMENTE 4 comidas con slot: "Desayuno", "Comida", "Merienda", "Cena". La suma de kcal de cada día debe acercarse al objetivo diario.
- Varía las recetas entre días (no repitas el mismo plato); comida real, práctica y apetecible; respeta condiciones/restricciones.
- Cada comida: dish (nombre apetecible), emoji, time (HH:MM), mins (prep), kcal, p, c, f (gramos enteros), gl (carga glucémica 0-40), ii (índice insulínico 0-100), glClass ('good' baja, 'mid' media, 'high' alta), ingredients (con cantidades), steps (2-3 pasos concisos), serving (consejo breve).${withShoppingBatch ? `
- shopping: lista de la compra para TODA LA SEMANA (7 días), NO para estos días sueltos. 4-6 categorías (cat, icon emoji, items con name y qty), con cantidades agregadas para 7 días (p. ej. "Pollo 1,4 kg", "Huevos 18 ud", "Arroz 1 kg").
- batch: 3-4 tareas de batch cooking del fin de semana (title, desc, time, day, emoji).` : ''}
Devuelve SOLO el JSON del esquema.`;
    }

    async function genChunk(daysList, withShoppingBatch) {
      const { response } = await requestGoogleGenerateContent({
        model,
        traceId,
        timeoutMs: 50000,
        parts: [{ text: buildPrompt(daysList, withShoppingBatch) }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: withShoppingBatch ? 12000 : 9000,
          responseMimeType: 'application/json',
          responseJsonSchema: withShoppingBatch ? FULL_CHUNK_SCHEMA : DAYS_CHUNK_SCHEMA,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').trim();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.days) || !parsed.days.length) throw new Error('chunk sin days');
      return parsed;
    }

    // Un reintento por trozo: cubre truncaciones puntuales o errores transitorios de Gemini.
    async function genChunkSafe(daysList, withShoppingBatch) {
      try {
        return await genChunk(daysList, withShoppingBatch);
      } catch (e1) {
        return genChunk(daysList, withShoppingBatch);
      }
    }

    try {
      // Trozos en paralelo: el primero trae además compra + batch (semanales).
      const results = await Promise.allSettled(DAY_CHUNKS.map((days, i) => genChunkSafe(days, i === 0)));

      const days = [];
      let shopping = [];
      let batch = [];
      results.forEach((r) => {
        if (r.status !== 'fulfilled') return;
        if (Array.isArray(r.value.days)) days.push(...r.value.days);
        if (Array.isArray(r.value.shopping) && r.value.shopping.length) shopping = r.value.shopping;
        if (Array.isArray(r.value.batch) && r.value.batch.length) batch = r.value.batch;
      });

      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        logError('studio_nutrition_chunk_failed', failed[0].reason || new Error('chunk error'),
          { traceId, userId: user.uid, failedChunks: failed.length, daysOk: days.length });
      }
      if (!days.length) return errorResponse('No se pudo generar el plan ahora mismo.', 502);

      return jsonResponse({ ok: true, nutrition: { days, shopping, batch }, partial: failed.length > 0 });
    } catch (error) {
      logError('studio_nutrition_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo generar el plan ahora mismo.', 502);
    }
  });
}
