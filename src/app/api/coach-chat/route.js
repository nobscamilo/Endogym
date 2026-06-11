import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { logError, logInfo, withTrace } from '../../../lib/logger.js';
import { enforceUserRateLimit, getRateLimitHeaders, RATE_LIMIT_SCOPES } from '../../../lib/rateLimit.js';
import {
  isValidGoogleAiModelName,
  requestGoogleGenerateContent,
} from '../../../services/googleGenAiTransport.js';
import { resolveGeminiCoachModel } from '../../../services/exerciseCoachClient.js';
import { getUserProfile, getLatestWeeklyPlan, listWorkoutsSince, listMealsSince, listMetricsSince } from '../../../lib/repositories/firestoreRepository.js';
import { buildNutritionDigest, describeNutritionDigest, buildRecoveryTrend, describeRecoveryTrend } from '../../../core/wellnessDigest.js';
import { buildGoalProgress, describeGoalProgress } from '../../../services/goalProgress.js';
import { hrMaxFromAge, validateRunZone, buildEfficiencyTrend, predictRaceTimeFromRuns, formatRaceTime, RACE_GOAL_METERS } from '../../../core/running.js';
import { retrieveGuidelinesContext } from '../../../services/guidelinesRetriever.js';
import { buildCoachChatPrompt } from '../../../services/coachPersona.js';
import { detectRedFlags, RED_FLAG_RESPONSE } from '../../../services/coachRedFlags.js';

// Presupuesto de RAG para el chat: más pequeño que el del plan semanal (latencia y coste del
// chat interactivo). Se recorta en el último salto de línea para no cortar a mitad de pasaje.
const CHAT_RAG_CHAR_BUDGET = 7000;
const CHAT_RAG_TIMEOUT_MS = 4000;

async function buildGuidelinesContext({ profile, plan, message, traceId }) {
  if (!profile) return '';
  try {
    const raced = await Promise.race([
      // FASE 0.3: la query del RAG es la PREGUNTA del usuario (+ objetivo/modalidad),
      // no el perfil completo. Ver buildQueryText en guidelinesRetriever.js.
      retrieveGuidelinesContext({ profile, weeklyPlan: plan || undefined, userQuery: message, traceId }),
      new Promise((resolve) => { setTimeout(() => resolve(''), CHAT_RAG_TIMEOUT_MS); }),
    ]);
    if (!raced) return '';
    let ctx = String(raced);
    if (ctx.length > CHAT_RAG_CHAR_BUDGET) {
      const cut = ctx.lastIndexOf('\n', CHAT_RAG_CHAR_BUDGET);
      ctx = ctx.slice(0, cut > 1000 ? cut : CHAT_RAG_CHAR_BUDGET);
    }
    return `\n\n${ctx}\n\nUsa este contexto científico SOLO si es pertinente a la pregunta; no lo cites textualmente salvo que aporte.`;
  } catch {
    return ''; // el chat funciona igual sin RAG
  }
}

async function buildUserContext(uid) {
  try {
    const sinceIso = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
    const mealsSinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const metricsSinceIso = new Date(Date.now() - 42 * 24 * 3600 * 1000).toISOString();
    const [profile, plan, workouts, meals, metrics] = await Promise.all([
      getUserProfile(uid).catch(() => null),
      getLatestWeeklyPlan(uid).catch(() => null),
      listWorkoutsSince(uid, sinceIso, 60).catch(() => []),
      listMealsSince(uid, mealsSinceIso, 120).catch(() => []),
      listMetricsSince(uid, metricsSinceIso, 100).catch(() => []),
    ]);
    if (!profile && !plan) return { text: '', profile, plan };
    const parts = [];
    const name = profile?.firstName || profile?.name || profile?.displayName;
    if (name) parts.push(`Nombre: ${name}.`);
    if (profile?.goal) parts.push(`Objetivo: ${profile.goal}.`);
    // Objetivo SMART medible (meta + fecha + tendencia real). Se omite si no hay meta.
    try {
      const goalLine = describeGoalProgress(buildGoalProgress({ profile, metrics, workouts }));
      if (goalLine) parts.push(goalLine);
    } catch { /* sin objetivo SMART */ }
    if (profile?.trainingModality || profile?.trainingMode) parts.push(`Modalidad: ${profile.trainingModality || profile.trainingMode}.`);
    if (Number.isFinite(Number(profile?.weightKg))) parts.push(`Peso: ${profile.weightKg} kg.`);
    if (Number.isFinite(Number(profile?.age))) parts.push(`Edad: ${profile.age}.`);
    if (profile?.medicalConditions) parts.push(`Condiciones: ${profile.medicalConditions}.`);
    // Contexto de carrera: objetivo, ritmos y entrenamiento concurrente (correr + gimnasio).
    const modality = profile?.trainingModality || profile?.trainingMode || '';
    if (profile?.runRaceGoal && profile.runRaceGoal !== 'health') {
      parts.push(`Objetivo de carrera: ${profile.runRaceGoal.replace('race_', '').toUpperCase()}.`);
    }
    if (plan?.runPaces) {
      const rp = plan.runPaces;
      parts.push(`Ritmos de carrera: fácil ${rp.facil}, larga ${rp.larga}, umbral ${rp.umbral}, intervalos ${rp.intervalos}.`);
    }
    if (modality === 'hybrid_run_gym') {
      parts.push('Entrena CONCURRENTE (correr + gimnasio): ten en cuenta el efecto de interferencia, el orden de sesiones (no fuerza pesada de pierna antes de la tirada larga) y la recuperación entre estímulos.');
    }
    if (plan?.phaseLabel) {
      parts.push(`Fase de entrenamiento: ${plan.phaseLabel}${Number.isFinite(Number(plan.weeksToRace)) && plan.weeksToRace > 0 ? ` (faltan ${plan.weeksToRace} semanas para la carrera)` : ''}.`);
    }
    // BUG corregido (10 jun 2026): los días del plan NO tienen flag `.today` — con bloques de
    // 21 días, caer a days[0] daba la sesión del PRIMER día del bloque como "hoy" durante 20 días.
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = Array.isArray(plan?.days)
      ? (plan.days.find((d) => d?.date === todayKey) || plan.days[0])
      : null;
    if (today?.workout?.title) parts.push(`Sesión de hoy: ${today.workout.title}.`);
    if (today?.workout?.runPrescription?.structure) parts.push(`Prescripción de hoy: ${today.workout.runPrescription.structure}`);
    if (today?.nutritionTarget?.carbLevel) parts.push(`Carbohidratos hoy: nivel ${today.nutritionTarget.carbLevel}. ${today.nutritionTarget.carbTiming || ''}`);

    // FASE 1.1 — Digest nutricional determinista (7 días). Se omite si no hay registros.
    const nutritionLine = describeNutritionDigest(buildNutritionDigest({ meals, plan }));
    if (nutritionLine) parts.push(nutritionLine);
    // FASE 1.2 — Tendencia de recuperación desde check-ins. Se omite si no hay datos.
    const recoveryLine = describeRecoveryTrend(buildRecoveryTrend({ workouts }));
    if (recoveryLine) parts.push(recoveryLine);

    // Validación de zonas (personalizada por edad/FCmáx): compara la última carrera con la
    // zona prescrita. Solo para perfiles de carrera.
    const isRunner = modality === 'hybrid_run_gym' || modality === 'running' || (profile?.runRaceGoal && profile.runRaceGoal !== 'health');
    if (isRunner) {
      const runs = (Array.isArray(workouts) ? workouts : [])
        .filter((w) => w.source === 'strava' && /run|carrera|trail/i.test(String(w.sportType || '')) && Number(w.avgHeartRate))
        .sort((a, b) => String(b.performedAt || '').localeCompare(String(a.performedAt || '')));
      const observedMax = Math.max(0, ...runs.map((w) => Number(w.maxHeartRate) || 0));
      const manualHrMax = Number(profile?.hrMaxBpm);
      const hrMax = (Number.isFinite(manualHrMax) && manualHrMax >= 120)
        ? Math.max(manualHrMax, observedMax)
        : (Math.max(observedMax, hrMaxFromAge(profile?.age) || 0) || null);
      if (runs.length && hrMax) {
        const last = runs[0];
        const date = String(last.performedAt || '').slice(0, 10);
        const runType = (Array.isArray(plan?.days) ? plan.days.find((d) => d.date === date) : null)?.workout?.runPrescription?.runType || null;
        const v = validateRunZone({ avgHr: Number(last.avgHeartRate), hrMax, runType: runType || 'easy' });
        const hrMaxSource = (Number.isFinite(manualHrMax) && manualHrMax >= 120) ? 'medida por el usuario' : 'estimada por su edad/observada';
        if (v) parts.push(`FCmáx ~${hrMax} ppm (${hrMaxSource}). Última carrera: ${v.message}`);
      }
      // Forma aeróbica real: eficiencia ritmo/FC y predicción con sus mejores esfuerzos.
      const efTrend = buildEfficiencyTrend(runs);
      if (efTrend) {
        parts.push(`Eficiencia aeróbica (m/min por ppm): reciente ${efTrend.recentEf} vs base ${efTrend.baselineEf} (${efTrend.trendPct >= 0 ? '+' : ''}${efTrend.trendPct}%).`);
      }
      const targetMeters = RACE_GOAL_METERS[profile?.runRaceGoal] || null;
      if (targetMeters) {
        const pred = predictRaceTimeFromRuns({ distanceMeters: targetMeters, runs });
        if (pred) parts.push(`Predicción actual para su objetivo (${profile.runRaceGoal.replace('race_', '').toUpperCase()}, Riegel sobre su mejor esfuerzo real del ${pred.basedOn.date}): ~${formatRaceTime(pred.seconds)}.`);
      }
      parts.push('Si pregunta por su entreno de carrera, valora la disciplina de zonas (correr fácil de verdad en Z2, apretar en los días de calidad) usando SU FCmáx por edad/medida; cada usuario es distinto.');
    }
    if (!parts.length) return { text: '', profile, plan };
    return { text: `\n\nContexto real del usuario (úsalo para personalizar): ${parts.join(' ')}`, profile, plan };
  } catch { return { text: '', profile: null, plan: null }; }
}

// Chat "Pregúntale al coach" del rediseño Studio.
// Recibe { message } (SOLO el mensaje del usuario; la persona y el contexto se
// construyen server-side en coachPersona.js — FASE 0.1) y devuelve { text } con la
// respuesta del Coach IA usando la Gemini Developer API.
// Compatibilidad: si un bundle antiguo envía { prompt }, se trata ÍNTEGRO como mensaje
// de usuario (nunca como system prompt).
// Requiere autenticación para evitar abuso/coste de un endpoint de IA abierto.
export async function POST(request) {
  return withTrace('coach_chat', async ({ traceId }) => {
    let user;
    try {
      user = await getAuthenticatedUser(request);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return errorResponse('Autenticación requerida.', 401);
      }
      throw error;
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Cuerpo JSON inválido.', 400);
    }

    const message = typeof body?.message === 'string' && body.message.trim()
      ? body.message.trim()
      : (typeof body?.prompt === 'string' ? body.prompt.trim() : '');
    if (!message) {
      return errorResponse('Falta "message".', 400);
    }
    if (message.length > 4000) {
      return errorResponse('Mensaje demasiado largo.', 413);
    }

    // FASE 0.2 — Red flags deterministas ANTES de Gemini, del rate limit y de la
    // comprobación de API key: la respuesta de seguridad nunca debe quedar bloqueada
    // por cuota ni depender de que la IA esté configurada. Log sin contenido del mensaje.
    const redFlag = detectRedFlags(message);
    if (redFlag.flagged) {
      logInfo('coach_chat_red_flag', {
        traceId,
        userId: user.uid,
        category: redFlag.category,
      });
      return jsonResponse({ text: RED_FLAG_RESPONSE, redFlag: true, category: redFlag.category });
    }

    if (!process.env.GEMINI_API_KEY) {
      return errorResponse('Coach IA no configurado.', 503);
    }

    const rateLimit = await enforceUserRateLimit({
      userId: user.uid,
      scope: RATE_LIMIT_SCOPES.COACH_CHAT,
    });
    const rateLimitHeaders = getRateLimitHeaders(rateLimit);

    if (!rateLimit.allowed) {
      logInfo('rate_limit_exceeded', {
        traceId,
        userId: user.uid,
        scope: RATE_LIMIT_SCOPES.COACH_CHAT,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return errorResponse(
        'Demasiadas preguntas al coach. Espera antes de volver a intentarlo.',
        429,
        { retryAfterSeconds: rateLimit.retryAfterSeconds },
        rateLimitHeaders
      );
    }

    const model = resolveGeminiCoachModel();
    if (!isValidGoogleAiModelName(model)) {
      return errorResponse('Modelo Gemini inválido.', 500);
    }

    const { text: userContext, profile, plan } = await buildUserContext(user.uid);
    // RAG médico-deportivo recortado (no bloquea: timeout corto y fallback a vacío).
    const guidelinesContext = await buildGuidelinesContext({ profile, plan, message, traceId });

    try {
      const { response } = await requestGoogleGenerateContent({
        model,
        traceId,
        timeoutMs: 12000,
        parts: [{ text: buildCoachChatPrompt({ message, userContext, guidelinesContext }) }],
        generationConfig: {
          temperature: 0.6,
          topP: 0.9,
          maxOutputTokens: 512,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        logError('coach_chat_http_error', new Error(`HTTP ${response.status}`), {
          traceId,
          userId: user.uid,
          detail: detail.slice(0, 300),
        });
        return errorResponse('El coach no pudo responder ahora mismo.', 502);
      }

      const data = await response.json();
      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();

      if (!text) {
        return errorResponse('Respuesta vacía del coach.', 502);
      }

      return jsonResponse({ text }, 200, rateLimitHeaders);
    } catch (error) {
      logError('coach_chat_failed', error, { traceId, userId: user.uid });
      return errorResponse('El coach no pudo responder ahora mismo.', 502);
    }
  });
}
