import { createHash } from 'node:crypto';
import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { withTrace, logError, logInfo } from '../../../lib/logger.js';
import { enforceUserRateLimit, getRateLimitHeaders, RATE_LIMIT_SCOPES } from '../../../lib/rateLimit.js';
import { isValidGoogleAiModelName, requestGoogleGenerateContent } from '../../../services/googleGenAiTransport.js';
import { resolveGeminiCoachModel } from '../../../services/exerciseCoachClient.js';
import { currentWeekKey as currentAppWeekKey } from '../../../lib/appTime.js';
import {
  getUserProfile,
  getLatestWeeklyPlan,
  getStudioNutritionPlan,
  saveStudioNutritionPlan,
} from '../../../lib/repositories/firestoreRepository.js';

// Fase 3: genera con Gemini el PLAN SEMANAL de comidas (7 días, recetas + lista de compra
// semanal + batch cooking) personalizado al perfil y objetivos del usuario, en JSON con la
// forma que consume el rediseño Studio. Reemplaza los datos de muestra de Nutrición.
//
// PERSISTENCIA: el plan se cachea en Firestore por semana (clave = lunes AAAA-MM-DD). El GET
// devuelve el plan guardado (sin gastar IA); el POST regenera y lo guarda. Así el plan es
// estable durante la semana y no se regenera (ni cuesta tokens) en cada visita.

// El plan semanal (28 comidas) puede tardar; ampliamos el límite de ejecución en Vercel.
export const maxDuration = 60;

// Clave de la semana actual: lunes de la fecha civil de la app (Europe/Madrid por defecto).
function currentWeekKey() {
  return currentAppWeekKey();
}

function stableRound(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function compactNutritionTarget(target = {}) {
  return {
    kcal: stableRound(target.targetCalories ?? target.calories),
    protein: stableRound(target.proteinGrams),
    carbs: stableRound(target.carbsGrams),
    fat: stableRound(target.fatGrams),
    carbLevel: target.carbLevel || null,
    carbTiming: target.carbTiming || null,
  };
}

function planNutritionSignature(plan) {
  if (!plan || typeof plan !== 'object') return 'no-weekly-plan';
  const days = Array.isArray(plan.days) ? plan.days : [];
  const payload = {
    version: 1,
    planId: plan.id || null,
    isBlock: plan.isBlock === true,
    blockStartDate: plan.blockStartDate || null,
    blockEndDate: plan.blockEndDate || null,
    phase: plan.phase || null,
    phaseLabel: plan.phaseLabel || null,
    raceGoal: plan.raceGoal || null,
    weeksToRace: Number.isFinite(Number(plan.weeksToRace)) ? Number(plan.weeksToRace) : null,
    runPaces: plan.runPaces || null,
    baseTarget: compactNutritionTarget(plan.baseTarget),
    days: days.map((day) => ({
      date: day.date || null,
      sessionType: day.sessionType || null,
      sessionFocus: day.sessionFocus || day.workout?.sessionFocus || null,
      title: day.workout?.title || null,
      durationMinutes: stableRound(day.workout?.durationMinutes),
      runType: day.workout?.runPrescription?.runType || null,
      runStructure: day.workout?.runPrescription?.structure || null,
      nutritionTarget: compactNutritionTarget(day.nutritionTarget),
    })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

// Pistas de estilo de desayuno por bloque, para diversificar entre días (los bloques se
// generan en paralelo y no se ven entre sí, así que el reparto lo fijamos aquí).
const CHUNK_STYLE_HINTS = [
  'Desayunos de estilo salado (huevos, tortillas, tostadas saladas con proteína).',
  'Desayunos dulces a base de avena (porridge, tortitas de avena, overnight oats).',
  'Desayunos a base de lácteos y fruta (yogur con toppings, bowls de fruta, batidos proteicos). OJO: este estilo tiende a quedarse CORTO de calorías; añade densidad energética (frutos secos, granola, avena, yogur griego entero, aceite de oliva, aguacate) y porciones suficientes hasta CUMPLIR las kcal objetivo de cada día — no entregues días por debajo del objetivo.',
  'Desayunos con pan integral + proteína o repostería fitness casera.',
];

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

    // Rate limit persistente (antes esta ruta de IA costosa NO tenía): cubre la generación
    // semanal completa y los cambios de comida individuales.
    const rateLimit = await enforceUserRateLimit({
      userId: user.uid,
      scope: RATE_LIMIT_SCOPES.STUDIO_NUTRITION,
    });
    if (!rateLimit.allowed) {
      logInfo('rate_limit_exceeded', { traceId, userId: user.uid, scope: RATE_LIMIT_SCOPES.STUDIO_NUTRITION, retryAfterSeconds: rateLimit.retryAfterSeconds });
      return errorResponse('Demasiadas generaciones de nutrición seguidas. Espera antes de reintentar.', 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, getRateLimitHeaders(rateLimit));
    }

    // Cuerpo opcional: { swapMeal: { day, slot, request? } } cambia UNA comida del plan guardado.
    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    const [profile, plan] = await Promise.all([
      getUserProfile(user.uid).catch(() => null),
      getLatestWeeklyPlan(user.uid).catch(() => null),
    ]);
    const t = targetsFrom(plan);
    const goal = profile?.goal || 'salud y composición corporal';
    const conditions = profile?.medicalConditions || 'ninguna declarada';
    const restrictions = profile?.dietaryRestrictions || profile?.allergies || 'ninguna declarada';

    // Contexto de entrenamiento por día (para "fuel for the work required"): tipo de sesión,
    // nivel de carbohidratos, timing y objetivos de macros específicos de cada día.
    const RACE_LABELS = { health: 'salud/forma', race_5k: '5K', race_10k: '10K', race_21k: 'media maratón', race_42k: 'maratón' };
    const DOW_FULL = { lunes: 'Lun', martes: 'Mar', 'miércoles': 'Mié', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', 'sábado': 'Sáb', sabado: 'Sáb', domingo: 'Dom' };
    const dayCtx = {};
    if (Array.isArray(plan?.days)) {
      for (const d of plan.days) {
        const key = DOW_FULL[String(d.dayName || '').toLowerCase()];
        if (!key) continue;
        const nt = d.nutritionTarget || {};
        dayCtx[key] = {
          title: d.workout?.title || (d.isTrainingDay ? 'Entreno' : 'Descanso'),
          type: d.sessionType || 'recovery',
          carbLevel: nt.carbLevel || 'medio',
          timing: nt.carbTiming || '',
          kcal: Math.round(Number(nt.calories) || t.kcal),
          carbs: Math.round(Number(nt.carbsGrams) || t.carbs),
          protein: Math.round(Number(nt.proteinGrams) || t.protein),
          fat: Math.round(Number(nt.fatGrams) || t.fat),
        };
      }
    }
    const raceLabel = RACE_LABELS[plan?.raceGoal] || null;
    const phaseLabel = plan?.phaseLabel || null;

    const baseRules = `Eres un nutricionista deportivo. Trabajas en español de España.
Perfil: objetivo "${goal}"; condiciones médicas: ${conditions}; restricciones/alergias: ${restrictions}.${raceLabel ? `
Objetivo de carrera: ${raceLabel}.${phaseLabel ? ` Fase de entrenamiento: ${phaseLabel}.` : ''}` : ''}
PRINCIPIO "fuel for the work required": ajusta los carbohidratos a la demanda de CADA día (más en tirada larga/series/pierna, menos en descanso). Carbohidratos de absorción LENTA lejos del entreno y RÁPIDA peri-entreno. Cada día abajo trae su objetivo de kcal/macros y su nivel/timing de carbohidratos: respétalos.`;

    function dayLine(day) {
      const c = dayCtx[day];
      if (!c) return `- ${day}: objetivo ~${t.kcal} kcal (C ${t.carbs} g / P ${t.protein} g / F ${t.fat} g).`;
      return `- ${day}: sesión "${c.title}" (${c.type}); carbohidratos ${c.carbLevel}; objetivo ${c.kcal} kcal (C ${c.carbs} g / P ${c.protein} g / F ${c.fat} g).${c.timing ? ` Timing: ${c.timing}` : ''}`;
    }

    function buildPrompt(daysList, withShoppingBatch, styleHint) {
      return `${baseRules}
Genera el menú para ESTOS días: ${daysList.join(', ')}.
Contexto de entrenamiento y objetivo por día (ajusta las comidas y el timing a esto):
${daysList.map(dayLine).join('\n')}
Requisitos:
- days: EXACTAMENTE estos ${daysList.length} días (campo "day" con el valor correspondiente: ${daysList.join(', ')}).
- Cada día tiene EXACTAMENTE 4 comidas con slot: "Desayuno", "Comida", "Merienda", "Cena".
- IMPORTANTE: la suma de kcal de CADA día debe quedar dentro de ±7% del objetivo de ESE día (ver arriba). Ajusta las porciones (gramos); revisa que p·4 + c·4 + f·9 ≈ kcal del día.
- PRIORIDAD PROTEÍNA: alcanza la proteína (P) objetivo de cada día (±5%) aunque tengas que ajustar carbohidratos/grasa. Reparte la proteína entre las comidas (≥25-30 g por comida principal).
- Refleja el TIMING de carbohidratos del día en los slots y en el campo "serving" (p. ej. en día de fuerza, carbos lentos en la comida previa/posterior; en tirada larga, desayuno alto en carbos y recarga después).
- Varía las recetas entre días: NO repitas el mismo plato y NO uses la misma proteína principal en días consecutivos. Comida real, práctica y apetecible; respeta condiciones/restricciones.${styleHint ? `
- ${styleHint}` : ''}
- Cada comida: dish (nombre apetecible), emoji, time (HH:MM), mins (prep), kcal, p, c, f (gramos enteros), gl (carga glucémica 0-40), ii (índice insulínico 0-100), glClass ('good' baja, 'mid' media, 'high' alta), ingredients (con cantidades), steps (2-3 pasos concisos), serving (consejo breve).${withShoppingBatch ? `
- shopping: lista de la compra para TODA LA SEMANA (7 días), NO para estos días sueltos. 4-6 categorías (cat, icon emoji, items con name y qty), con cantidades agregadas para 7 días (p. ej. "Pollo 1,4 kg", "Huevos 18 ud", "Arroz 1 kg").
- batch: 3-4 tareas de batch cooking del fin de semana (title, desc, time, day, emoji).` : ''}
Devuelve SOLO el JSON del esquema.`;
    }

    // ---- Cambio de UNA comida del plan guardado (swapMeal) ----
    const swap = body && body.swapMeal && typeof body.swapMeal === 'object' ? body.swapMeal : null;
    if (swap) {
      const day = String(swap.day || '').slice(0, 3);
      const slot = ['Desayuno', 'Comida', 'Merienda', 'Cena'].includes(swap.slot) ? swap.slot : null;
      const extra = typeof swap.request === 'string' ? swap.request.trim().slice(0, 200) : '';
      if (!/^(Lun|Mar|Mié|Jue|Vie|Sáb|Dom)$/.test(day) || !slot) {
        return errorResponse('swapMeal requiere "day" (Lun..Dom) y "slot" válido.', 400);
      }
      const saved = await getStudioNutritionPlan(user.uid, currentWeekKey()).catch(() => null);
      const dayPlan = saved && Array.isArray(saved.days) ? saved.days.find((d) => d.day === day) : null;
      const current = dayPlan && Array.isArray(dayPlan.meals) ? dayPlan.meals.find((m) => m.slot === slot) : null;
      if (!current) return errorResponse('No se encontró esa comida en el plan guardado de esta semana.', 404);

      const others = dayPlan.meals.filter((m) => m.slot !== slot);
      const c = dayCtx[day] || { kcal: t.kcal, protein: t.protein, title: '', carbLevel: 'medio', timing: '' };
      const restK = others.reduce((a, m) => a + (Number(m.kcal) || 0), 0);
      const restP = others.reduce((a, m) => a + (Number(m.p) || 0), 0);
      const swapPrompt = `${baseRules}
Cambia UNA comida del día ${day} (sesión: "${c.title}"; carbohidratos ${c.carbLevel}${c.timing ? `; timing: ${c.timing}` : ''}).
Comida a sustituir (NO la repitas ni propongas algo casi idéntico): ${slot} — "${current.dish}" (${current.kcal} kcal, P ${current.p} g).
Las otras comidas del día ya suman ${restK} kcal y ${restP} g de proteína; el objetivo del día es ${c.kcal} kcal y ${c.protein} g de proteína → la nueva comida debe aportar ~${Math.max(150, c.kcal - restK)} kcal (±10%) y ~${Math.max(15, c.protein - restP)} g de proteína.${extra ? `
Petición del usuario para la nueva comida: ${extra}.` : ''}
Mantén el slot "${slot}" y el formato completo de comida. Devuelve SOLO el JSON del esquema.`;

      try {
        const { response } = await requestGoogleGenerateContent({
          model,
          traceId,
          timeoutMs: 25000,
          parts: [{ text: swapPrompt }],
          generationConfig: {
            temperature: 0.8,
            topP: 0.9,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json',
            responseJsonSchema: MEAL_ITEM_SCHEMA,
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').trim();
        const meal = JSON.parse(text);
        if (!meal || !meal.dish || !Number(meal.kcal)) throw new Error('comida inválida');
        meal.slot = slot;
        dayPlan.meals = dayPlan.meals.map((m) => (m.slot === slot ? meal : m));
        await saveStudioNutritionPlan(user.uid, currentWeekKey(), saved);
        logInfo('studio_nutrition_meal_swap', { traceId, userId: user.uid, day, slot });
        return jsonResponse({ ok: true, day, slot, meal, nutrition: saved }, 200, getRateLimitHeaders(rateLimit));
      } catch (error) {
        logError('studio_nutrition_meal_swap_failed', error, { traceId, userId: user.uid, day, slot });
        return errorResponse('No se pudo cambiar esa comida ahora mismo.', 502);
      }
    }

    // Presupuesto GLOBAL de generación: todas las llamadas a Gemini y los reintentos lo respetan,
    // para devolver lo que haya (parcial o error claro) ANTES de que Vercel mate la función a los
    // 60s (maxDuration). Antes, 2 rondas con timeouts de 50s + reintento interno superaban 60s → 504.
    const genDeadline = Date.now() + 50000;
    const remainingBudget = () => Math.max(8000, genDeadline - Date.now());

    async function genChunk(daysList, withShoppingBatch, styleHint) {
      const { response } = await requestGoogleGenerateContent({
        model,
        traceId,
        timeoutMs: remainingBudget(),
        parts: [{ text: buildPrompt(daysList, withShoppingBatch, styleHint) }],
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
    // Solo reintenta si queda presupuesto suficiente (si no, propaga el error sin colgar la función).
    async function genChunkSafe(daysList, withShoppingBatch, styleHint) {
      try {
        return await genChunk(daysList, withShoppingBatch, styleHint);
      } catch (e1) {
        if (Date.now() > genDeadline - 9000) throw e1;
        return genChunk(daysList, withShoppingBatch, styleHint);
      }
    }

    // Genera la semana completa (trozos en paralelo) una vez.
    async function generateAll() {
      const results = await Promise.allSettled(
        DAY_CHUNKS.map((days, i) => genChunkSafe(days, i === 0, CHUNK_STYLE_HINTS[i] || '')),
      );
      const days = [];
      let shopping = [];
      let batch = [];
      results.forEach((r) => {
        if (r.status !== 'fulfilled') return;
        if (Array.isArray(r.value.days)) days.push(...r.value.days);
        if (Array.isArray(r.value.shopping) && r.value.shopping.length) shopping = r.value.shopping;
        if (Array.isArray(r.value.batch) && r.value.batch.length) batch = r.value.batch;
      });
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { days, shopping, batch, failed };
    }

    // Verificación de macros en servidor: compara los totales reales por día con el objetivo.
    // El prompt pide ±7% kcal y proteína prioritaria. Reintentamos ante drift diario y bloqueamos
    // solo desviaciones severas para evitar guardar un plan claramente malo sin fragilizar la ruta.
    function macroCheck(days) {
      let pAct = 0; let pTgt = 0; let kAct = 0; let kTgt = 0; let n = 0;
      const perDay = [];
      for (const d of (days || [])) {
        const ctx = dayCtx[d.day];
        if (!ctx) continue;
        const meals = Array.isArray(d.meals) ? d.meals : [];
        const sum = meals.reduce((a, m) => ({
          kcal: a.kcal + (Number(m.kcal) || 0), p: a.p + (Number(m.p) || 0),
        }), { kcal: 0, p: 0 });
        pAct += sum.p; pTgt += ctx.protein; kAct += sum.kcal; kTgt += ctx.kcal; n += 1;
        const kcalRatio = ctx.kcal ? sum.kcal / ctx.kcal : 1;
        const proteinRatio = ctx.protein ? sum.p / ctx.protein : 1;
        perDay.push({
          day: d.day,
          kcal: sum.kcal,
          protein: sum.p,
          kcalTarget: ctx.kcal,
          proteinTarget: ctx.protein,
          kcalRatio: Math.round(kcalRatio * 100) / 100,
          proteinRatio: Math.round(proteinRatio * 100) / 100,
          kcalOutOfRange: kcalRatio < 0.93 || kcalRatio > 1.07,
          proteinOutOfRange: proteinRatio < 0.90 || proteinRatio > 1.15,
          severeDrift: kcalRatio < 0.85 || kcalRatio > 1.15 || proteinRatio < 0.75,
        });
      }
      const proteinRatio = pTgt ? pAct / pTgt : 1;
      const kcalRatio = kTgt ? kAct / kTgt : 1;
      const driftDays = perDay.filter((d) => d.kcalOutOfRange || d.proteinOutOfRange);
      const severeDriftDays = perDay.filter((d) => d.severeDrift);
      return {
        n,
        proteinRatio: Math.round(proteinRatio * 100) / 100,
        kcalRatio: Math.round(kcalRatio * 100) / 100,
        driftDays: driftDays.map((d) => d.day),
        severeDriftDays: severeDriftDays.map((d) => d.day),
        perDay,
      };
    }

    try {
      let best = await generateAll();
      let check = macroCheck(best.days);
      // Reintento DIRIGIDO: si hay drift diario o proteína global baja, regenera SOLO los
      // trozos que contienen días desviados (más barato que regenerar la semana entera y
      // conserva los días que ya cumplen). Se queda con la mejor de las dos versiones.
      if (best.days.length >= 7 && check.n >= 4 && (check.proteinRatio < 0.82 || check.driftDays.length > 0) && Date.now() < genDeadline - 16000) {
        const failingChunks = [...new Set(
          check.driftDays
            .map((day) => DAY_CHUNKS.findIndex((c) => c.includes(day)))
            .filter((i) => i >= 0),
        )];
        const retries = await Promise.allSettled(
          failingChunks.map((i) => genChunkSafe(DAY_CHUNKS[i], false, CHUNK_STYLE_HINTS[i] || '')),
        );
        const replaced = new Map();
        retries.forEach((r) => {
          if (r.status === 'fulfilled') (r.value.days || []).forEach((d) => { if (d?.day) replaced.set(d.day, d); });
        });
        if (replaced.size) {
          const retryDays = best.days.map((d) => replaced.get(d.day) || d);
          const rc = macroCheck(retryDays);
          const score = (c) => c.severeDriftDays.length * 10 + c.driftDays.length + Math.max(0, 0.9 - c.proteinRatio) * 10;
          if (score(rc) < score(check)) { best = { ...best, days: retryDays }; check = rc; }
        }
        logInfo('studio_nutrition_macro_retry', {
          traceId,
          userId: user.uid,
          targetedChunks: failingChunks,
          proteinRatio: check.proteinRatio,
          driftDays: check.driftDays,
          severeDriftDays: check.severeDriftDays,
        });
      }

      const { days, shopping, batch, failed } = best;
      if (!days.length) return errorResponse('No se pudo generar el plan ahora mismo.', 502);
      if (days.length >= 7 && check.severeDriftDays.length > 0) {
        logError('studio_nutrition_macro_invalid', new Error('Macro drift severo en plan IA'), {
          traceId,
          userId: user.uid,
          severeDriftDays: check.severeDriftDays,
        });
        return errorResponse('El plan generado no cumplió los objetivos nutricionales. Inténtalo de nuevo.', 502, { macroCheck: check });
      }

      const nutrition = {
        days,
        shopping,
        batch,
        meta: {
          version: 1,
          weekKey: currentWeekKey(),
          planId: plan?.id || null,
          planSignature: planNutritionSignature(plan),
          generatedAt: new Date().toISOString(),
        },
      };
      if (days.length >= 7) {
        await saveStudioNutritionPlan(user.uid, currentWeekKey(), nutrition).catch(() => null);
      }
      return jsonResponse({ ok: true, nutrition, partial: failed > 0, macroCheck: check });
    } catch (error) {
      logError('studio_nutrition_failed', error, { traceId, userId: user.uid });
      return errorResponse('No se pudo generar el plan ahora mismo.', 502);
    }
  });
}

// GET: devuelve el plan semanal guardado de esta semana (sin gastar IA). El frontend lo llama
// al abrir Nutrición; si no hay plan guardado, responde { ok: true, empty: true } y entonces
// el frontend lanza el POST para generarlo una sola vez.
export async function GET(request) {
  return withTrace('studio_nutrition_get', async () => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) return errorResponse('Autenticación requerida.', 401);
      throw error;
    }
    const [nutrition, plan] = await Promise.all([
      getStudioNutritionPlan(user.uid, currentWeekKey()).catch(() => null),
      getLatestWeeklyPlan(user.uid).catch(() => null),
    ]);
    if (!nutrition) return jsonResponse({ ok: true, empty: true });
    const expectedSignature = planNutritionSignature(plan);
    const cachedSignature = nutrition?.meta?.planSignature || null;
    if (cachedSignature !== expectedSignature) {
      return jsonResponse({
        ok: true,
        empty: true,
        stale: true,
        cached: false,
        reason: cachedSignature ? 'training_plan_changed' : 'legacy_cache_missing_signature',
        planSignature: expectedSignature,
      });
    }
    return jsonResponse({ ok: true, nutrition, cached: true, planSignature: expectedSignature });
  });
}
