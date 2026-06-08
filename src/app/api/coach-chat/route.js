import { jsonResponse, errorResponse } from '../../../lib/http.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { logError, logInfo, withTrace } from '../../../lib/logger.js';
import { enforceUserRateLimit, getRateLimitHeaders, RATE_LIMIT_SCOPES } from '../../../lib/rateLimit.js';
import {
  isValidGoogleAiModelName,
  requestGoogleGenerateContent,
} from '../../../services/googleGenAiTransport.js';
import { resolveGeminiCoachModel } from '../../../services/exerciseCoachClient.js';
import { getUserProfile, getLatestWeeklyPlan, listWorkoutsSince } from '../../../lib/repositories/firestoreRepository.js';
import { hrMaxFromAge, validateRunZone } from '../../../core/running.js';

async function buildUserContext(uid) {
  try {
    const sinceIso = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
    const [profile, plan, workouts] = await Promise.all([
      getUserProfile(uid).catch(() => null),
      getLatestWeeklyPlan(uid).catch(() => null),
      listWorkoutsSince(uid, sinceIso, 60).catch(() => []),
    ]);
    if (!profile && !plan) return '';
    const parts = [];
    const name = profile?.firstName || profile?.name || profile?.displayName;
    if (name) parts.push(`Nombre: ${name}.`);
    if (profile?.goal) parts.push(`Objetivo: ${profile.goal}.`);
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
    const today = Array.isArray(plan?.days) ? (plan.days.find((d) => d?.today) || plan.days[0]) : null;
    if (today?.workout?.title) parts.push(`Sesión de hoy: ${today.workout.title}.`);
    if (today?.workout?.runPrescription?.structure) parts.push(`Prescripción de hoy: ${today.workout.runPrescription.structure}`);
    if (today?.nutritionTarget?.carbLevel) parts.push(`Carbohidratos hoy: nivel ${today.nutritionTarget.carbLevel}. ${today.nutritionTarget.carbTiming || ''}`);

    // Validación de zonas (personalizada por edad/FCmáx): compara la última carrera con la
    // zona prescrita. Solo para perfiles de carrera.
    const isRunner = modality === 'hybrid_run_gym' || modality === 'running' || (profile?.runRaceGoal && profile.runRaceGoal !== 'health');
    if (isRunner) {
      const runs = (Array.isArray(workouts) ? workouts : [])
        .filter((w) => w.source === 'strava' && /run|carrera|trail/i.test(String(w.sportType || '')) && Number(w.avgHeartRate))
        .sort((a, b) => String(b.performedAt || '').localeCompare(String(a.performedAt || '')));
      const observedMax = Math.max(0, ...runs.map((w) => Number(w.maxHeartRate) || 0));
      const hrMax = Math.max(observedMax, hrMaxFromAge(profile?.age) || 0) || null;
      if (runs.length && hrMax) {
        const last = runs[0];
        const date = String(last.performedAt || '').slice(0, 10);
        const runType = (Array.isArray(plan?.days) ? plan.days.find((d) => d.date === date) : null)?.workout?.runPrescription?.runType || null;
        const v = validateRunZone({ avgHr: Number(last.avgHeartRate), hrMax, runType: runType || 'easy' });
        if (v) parts.push(`FCmáx estimada ~${hrMax} ppm (por su edad). Última carrera: ${v.message}`);
      }
      parts.push('Si pregunta por su entreno de carrera, valora la disciplina de zonas (correr fácil de verdad en Z2, apretar en los días de calidad) usando SU FCmáx por edad/medida; cada usuario es distinto.');
    }
    if (!parts.length) return '';
    return `\n\nContexto real del usuario (úsalo para personalizar): ${parts.join(' ')}`;
  } catch { return ''; }
}

// Chat "Pregúntale al coach" del rediseño Studio.
// Recibe { prompt } (el frontend ya incluye el system + contexto del usuario) y
// devuelve { text } con la respuesta del Coach IA usando la Gemini Developer API.
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

    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return errorResponse('Falta "prompt".', 400);
    }
    if (prompt.length > 4000) {
      return errorResponse('Prompt demasiado largo.', 413);
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

    const userContext = await buildUserContext(user.uid);

    try {
      const { response } = await requestGoogleGenerateContent({
        model,
        traceId,
        timeoutMs: 12000,
        parts: [{ text: prompt + userContext }],
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
