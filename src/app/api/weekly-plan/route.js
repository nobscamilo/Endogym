import { buildHeuristicCoachPlan, generateWeeklyPlan, normalizeWeeklyPlanSessionFocus } from '../../../core/planner.js';
import { buildAdaptiveTuning, buildProgressMemory } from '../../../core/progressMemory.js';
import { evaluatePreparticipationScreening } from '../../../core/screening.js';
import { resolveExerciseMetadata } from '../../../core/exerciseLibrary.js';
import {
  callGeminiExerciseCoach,
  isGeminiConfigured,
  resolveGeminiCoachModel,
} from '../../../services/exerciseCoachClient.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import {
  createWeeklyPlan,
  getLatestWeeklyPlan,
  getUserProfile,
  listMealsSince,
  listMetricsSince,
  listWorkoutsSince,
  listWeeklyPlans,
  updateWeeklyPlanCustomizations,
  upsertUserProfile,
} from '../../../lib/repositories/firestoreRepository.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { logError, logInfo, withTrace } from '../../../lib/logger.js';

function parseLimit(searchParams) {
  const raw = searchParams.get('limit');
  if (raw == null) return 4;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) return null;
  return limit;
}

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

const ISO_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_DAYS = 7;
const MAX_CUSTOM_EXERCISES_PER_DAY = 14;
const MAX_TEXT_FIELD = 220;

function cleanText(value, maxLength = MAX_TEXT_FIELD) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function sanitizeStringList(values, maxItems = 6, maxLength = 120) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((item) => typeof item === 'string' && item.trim())
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLength));
}

function sanitizeAnatomyRegions(value) {
  const front = sanitizeStringList(value?.front || [], 12, 40);
  const back = sanitizeStringList(value?.back || [], 12, 40);
  return { front, back };
}

function sanitizePrescription(value) {
  if (!value || typeof value !== 'object') return null;

  const numericOrNull = (input) => {
    const numeric = Number(input);
    return Number.isFinite(numeric) ? numeric : null;
  };

  return {
    format: cleanText(value.format, 20) || null,
    sets: numericOrNull(value.sets),
    reps: cleanText(String(value.reps || ''), 24) || null,
    loadKg: numericOrNull(value.loadKg),
    durationMinutes: numericOrNull(value.durationMinutes),
    restSeconds: numericOrNull(value.restSeconds),
    workRatio: cleanText(value.workRatio, 40) || null,
  };
}

function sanitizeExerciseSwap(exercise, fallbackIndex = 0) {
  if (!exercise || typeof exercise !== 'object') return null;

  const metadata = resolveExerciseMetadata(exercise);

  return {
    id: cleanText(exercise.id, 80) || `custom-exercise-${fallbackIndex + 1}`,
    name: cleanText(exercise.name, 120) || `Ejercicio ${fallbackIndex + 1}`,
    equipment: cleanText(exercise.equipment, 120) || metadata.equipment || 'Sin especificar',
    category: cleanText(exercise.category, 60) || metadata.category || '',
    difficulty: cleanText(exercise.difficulty, 40) || metadata.difficulty || '',
    cues: sanitizeStringList(exercise.cues || metadata.cues || [], 6, 140),
    progressions: sanitizeStringList(exercise.progressions || metadata.progressions || [], 6, 140),
    regressions: sanitizeStringList(exercise.regressions || metadata.regressions || [], 6, 140),
    contraindications: sanitizeStringList(exercise.contraindications || metadata.contraindications || [], 6, 140),
    primaryMuscles: sanitizeStringList(exercise.primaryMuscles || metadata.primaryMuscles || [], 8, 80),
    secondaryMuscles: sanitizeStringList(exercise.secondaryMuscles || metadata.secondaryMuscles || [], 8, 80),
    anatomyRegions: sanitizeAnatomyRegions(exercise.anatomyRegions || metadata.anatomyRegions || {}),
    prescription: sanitizePrescription(exercise.prescription),
    videoUrl: cleanText(exercise.videoUrl, 500) || metadata.videoUrl || null,
  };
}

function sanitizeSessionStep(step, index) {
  if (!step || typeof step !== 'object') return null;
  const durationMinutes = Number(step.durationMinutes);
  return {
    step: cleanText(step.step, 120) || `Bloque ${index + 1}`,
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 0,
  };
}

function sanitizeSessionSwap(option, dayKey) {
  if (!option || typeof option !== 'object') return null;

  const exercises = Array.isArray(option?.workout?.exercises)
    ? option.workout.exercises
      .slice(0, MAX_CUSTOM_EXERCISES_PER_DAY)
      .map((exercise, index) => sanitizeExerciseSwap(exercise, index))
      .filter(Boolean)
    : [];

  return {
    id: cleanText(option.id, 120) || `${dayKey}-session`,
    title: cleanText(option.title, 120) || 'Sesión personalizada',
    sessionType: cleanText(option.sessionType, 40) || cleanText(option?.workout?.sessionType, 40) || 'resistance',
    sessionFocus: cleanText(option.sessionFocus, 60) || cleanText(option?.workout?.sessionFocus, 60) || 'general_resistance',
    descriptor: cleanText(option.descriptor, 200) || '',
    compatibilityNote: cleanText(option.compatibilityNote, 200) || '',
    previewExercises: sanitizeStringList(option.previewExercises || exercises.map((exercise) => exercise?.name), 5, 120),
    previewMuscles: sanitizeStringList(option.previewMuscles || exercises.flatMap((exercise) => exercise?.primaryMuscles || []), 6, 80),
    workout: {
      title: cleanText(option?.workout?.title, 120) || cleanText(option.title, 120) || 'Sesión personalizada',
      sessionFocus: cleanText(option?.workout?.sessionFocus, 60) || cleanText(option.sessionFocus, 60) || 'general_resistance',
      durationMinutes: Number.isFinite(Number(option?.workout?.durationMinutes))
        ? Number(option.workout.durationMinutes)
        : 45,
      intensityRpe: cleanText(option?.workout?.intensityRpe, 40) || 'RPE moderado',
      warmup: Array.isArray(option?.workout?.warmup)
        ? option.workout.warmup.slice(0, 8).map(sanitizeSessionStep).filter(Boolean)
        : [],
      exercises,
      cooldown: Array.isArray(option?.workout?.cooldown)
        ? option.workout.cooldown.slice(0, 8).map(sanitizeSessionStep).filter(Boolean)
        : [],
    },
  };
}

function sanitizePlanCustomizations(payload = {}) {
  const rawSessionSwaps = payload?.sessionSwapsByDate && typeof payload.sessionSwapsByDate === 'object'
    ? payload.sessionSwapsByDate
    : {};
  const rawExerciseSwaps = payload?.exerciseSwapsByDate && typeof payload.exerciseSwapsByDate === 'object'
    ? payload.exerciseSwapsByDate
    : {};

  const sessionSwapsByDate = Object.fromEntries(
    Object.entries(rawSessionSwaps)
      .filter(([dayKey]) => ISO_DATE_KEY_PATTERN.test(dayKey))
      .slice(0, MAX_CUSTOM_DAYS)
      .map(([dayKey, option]) => [dayKey, sanitizeSessionSwap(option, dayKey)])
      .filter(([, option]) => Boolean(option))
  );

  const exerciseSwapsByDate = Object.fromEntries(
    Object.entries(rawExerciseSwaps)
      .filter(([dayKey]) => ISO_DATE_KEY_PATTERN.test(dayKey))
      .slice(0, MAX_CUSTOM_DAYS)
      .map(([dayKey, exerciseMap]) => {
        if (!exerciseMap || typeof exerciseMap !== 'object') return [dayKey, {}];

        const sanitizedExercises = Object.fromEntries(
          Object.entries(exerciseMap)
            .slice(0, MAX_CUSTOM_EXERCISES_PER_DAY)
            .map(([exerciseKey, exercise], index) => [
              cleanText(exerciseKey, 120) || `swap-${index + 1}`,
              sanitizeExerciseSwap(exercise, index),
            ])
            .filter(([, value]) => Boolean(value))
        );

        return [dayKey, sanitizedExercises];
      })
      .filter(([, exerciseMap]) => Object.keys(exerciseMap).length > 0)
  );

  return {
    version: 1,
    sessionSwapsByDate,
    exerciseSwapsByDate,
  };
}

function toCoachFailureInfo(error) {
  const fallback = {
    code: 'GEMINI_COACH_UNKNOWN',
    message: 'Error desconocido en generación del coach IA.',
    attempt: null,
    statusCode: null,
    model: null,
  };

  if (!error || typeof error !== 'object') return fallback;

  const code = typeof error.code === 'string' && error.code.trim() ? error.code.trim() : fallback.code;
  const message = typeof error.message === 'string' && error.message.trim()
    ? error.message.trim().slice(0, 220)
    : fallback.message;
  const attempt = Number.isInteger(error.attempt) ? error.attempt : null;
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : null;
  const model = typeof error.model === 'string' && error.model.trim() ? error.model.trim() : null;

  return {
    code,
    message,
    attempt,
    statusCode,
    model,
  };
}

export async function GET(request) {
  try {
    return await withTrace('weekly_plan_get', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      const { searchParams } = new URL(request.url);
      const limit = parseLimit(searchParams);

      if (limit == null) {
        return errorResponse('Query param "limit" debe ser un entero entre 1 y 20.', 400);
      }

      const plans = await listWeeklyPlans(user.uid, limit);
      const profile = await getUserProfile(user.uid);
      const normalizedPlans = plans.map((plan) => normalizeWeeklyPlanSessionFocus(plan, profile || {}));
      return jsonResponse({
        traceId,
        latestPlan: normalizedPlans[0] ?? null,
        plans: normalizedPlans,
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al obtener planes semanales.', 500);
  }
}

export async function POST(request) {
  try {
    return await withTrace('weekly_plan_generate', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      const profile = await getUserProfile(user.uid);

      if (!profile) {
        return errorResponse('No existe perfil. Configura /api/profile antes de generar el plan.', 409);
      }

      let payload = {};
      try {
        payload = await request.json();
      } catch {
        payload = {};
      }

      const lookbackDays = Number.isFinite(Number(payload.lookbackDays))
        ? Math.min(60, Math.max(7, Number(payload.lookbackDays)))
        : 21;
      const now = new Date();
      const since = new Date(now);
      since.setUTCDate(since.getUTCDate() - lookbackDays);
      const sinceIso = since.toISOString();

      const [recentWorkouts, recentMeals, recentMetrics] = await Promise.all([
        listWorkoutsSince(user.uid, sinceIso, 200),
        listMealsSince(user.uid, sinceIso, 250),
        listMetricsSince(user.uid, sinceIso, 200),
      ]);

      const preparticipationScreening = evaluatePreparticipationScreening(profile.preparticipation);
      const progressMemory = buildProgressMemory({
        workouts: recentWorkouts,
        meals: recentMeals,
        metrics: recentMetrics,
        lookbackDays,
        now,
      });
      const adaptiveTuning = buildAdaptiveTuning({
        profile,
        progressMemory,
        screening: preparticipationScreening,
      });

      const generated = generateWeeklyPlan({
        profile,
        startDate: payload.startDate,
        preparticipationScreening,
        progressMemory,
        adaptiveTuning,
      });
      const currentPlan = await getLatestWeeklyPlan(user.uid);

      const forceMock = parseBoolean(process.env.GEMINI_FORCE_MOCK, false);
      const fallbackEnabled = parseBoolean(process.env.GEMINI_FALLBACK_TO_MOCK, true);
      const geminiConfigured = isGeminiConfigured();
      const coachModel = resolveGeminiCoachModel();
      let coachSource = 'heuristic';
      let coachWarning = null;
      let coachMeta = {
        configured: geminiConfigured,
        forceMock,
        fallbackEnabled,
        source: 'heuristic',
        fallbackApplied: true,
        backend: null,
        modelRequested: coachModel,
        modelResolved: null,
        attempts: 0,
        failureCode: null,
        failureMessage: null,
        failureStatusCode: null,
        generatedAt: new Date().toISOString(),
      };

      let coachPlan = buildHeuristicCoachPlan({
        profile,
        weeklyPlan: generated,
      });

      if (!forceMock && geminiConfigured) {
        try {
          const aiCoach = await callGeminiExerciseCoach({
            profile,
            weeklyPlan: generated,
            traceId,
          });
          coachSource = 'gemini';
          coachPlan = {
            ...coachPlan,
            ...aiCoach,
            source: 'gemini',
          };
          coachMeta = {
            ...coachMeta,
            source: 'gemini',
            fallbackApplied: false,
            backend: aiCoach?.diagnostics?.backend || 'gemini',
            modelResolved: aiCoach?.diagnostics?.modelResolved ?? coachModel,
            attempts: Number.isInteger(aiCoach?.diagnostics?.attempts) ? aiCoach.diagnostics.attempts : 1,
            generatedAt: aiCoach?.diagnostics?.generatedAt || new Date().toISOString(),
          };
        } catch (error) {
          logError('exercise_coach_failed', error, { traceId, userId: user.uid });
          const failure = toCoachFailureInfo(error);
          coachMeta = {
            ...coachMeta,
            source: 'heuristic',
            fallbackApplied: true,
            backend: null,
            modelResolved: failure.model ?? coachModel,
            attempts: failure.attempt ?? coachMeta.attempts,
            failureCode: failure.code,
            failureMessage: failure.message,
            failureStatusCode: failure.statusCode,
            generatedAt: new Date().toISOString(),
          };
          if (!fallbackEnabled) {
            throw new Error(`Falló la generación de recomendaciones IA (${failure.code}) y el fallback está desactivado.`);
          }
          coachWarning = `No se pudo generar coaching IA (${failure.code}); se usó prescripción heurística ACSM.`;
          coachPlan = {
            ...coachPlan,
            source: 'heuristic',
          };
        }
      } else if (forceMock) {
        coachWarning = 'Modo GEMINI_FORCE_MOCK activo: se omite coach IA y se usa heurística.';
        coachMeta = {
          ...coachMeta,
          failureCode: 'GEMINI_COACH_FORCE_MOCK',
          failureMessage: 'GEMINI_FORCE_MOCK=true',
        };
      } else if (!geminiConfigured) {
        coachWarning = 'No hay backend Google AI/Vertex configurado; se usó prescripción heurística ACSM.';
        coachMeta = {
          ...coachMeta,
          failureCode: 'GEMINI_COACH_NOT_CONFIGURED',
          failureMessage: 'Sin GEMINI_API_KEY ni credenciales Vertex AI',
        };
      }

      if (preparticipationScreening.readinessGate === 'stop') {
        coachWarning = [
          coachWarning,
          'Cribado preparticipación con riesgo alto: se capó intensidad y se recomienda valoración médica.',
        ].filter(Boolean).join(' ');
      }

      const systemAlerts = [];
      if (
        currentPlan?.preparticipationScreening?.readinessGate === 'stop'
        && preparticipationScreening.readinessGate === 'stop'
      ) {
        systemAlerts.push({
          id: 'STOP_GATE_CONSECUTIVE_WEEKS',
          level: 'high',
          message:
            'Dos semanas consecutivas con gate clínico STOP. Se recomienda valoración médica antes de progresar.',
          createdAt: new Date().toISOString(),
        });
      }

      const createdPlan = await createWeeklyPlan(user.uid, {
        ...generated,
        coachPlan,
        coachSource,
        coachMeta,
        coachWarning,
        systemAlerts,
        previousPlanId: currentPlan?.id ?? null,
      });

      logInfo('weekly_plan_coach_result', {
        traceId,
        userId: user.uid,
        planId: createdPlan?.id || null,
        coachSource,
        coachConfigured: geminiConfigured,
        coachBackend: coachMeta.backend || null,
        coachModelRequested: coachMeta.modelRequested || null,
        coachModelResolved: coachMeta.modelResolved || null,
        coachAttempts: coachMeta.attempts || 0,
        coachFailureCode: coachMeta.failureCode || null,
        fallbackApplied: Boolean(coachMeta.fallbackApplied),
      });

      if (profile.onboardingCompleted !== true && profile.preparticipationUpdatedAt) {
        await upsertUserProfile(user.uid, {
          onboardingCompleted: true,
          needsSetup: false,
        });
      }

      return jsonResponse({ traceId, plan: createdPlan }, 201);
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al generar plan semanal.', 500);
  }
}

export async function PATCH(request) {
  try {
    return await withTrace('weekly_plan_customize', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);

      let payload = {};
      try {
        payload = await request.json();
      } catch {
        payload = {};
      }

      const planId = cleanText(payload.planId, 120);
      if (!planId) {
        return errorResponse('planId es obligatorio para actualizar personalizaciones del plan.', 400);
      }

      const customizations = sanitizePlanCustomizations(payload.customizations || {});
      const updatedPlan = await updateWeeklyPlanCustomizations(user.uid, planId, customizations);

      if (!updatedPlan) {
        return errorResponse('No se encontró el plan semanal a actualizar.', 404);
      }

      const profile = await getUserProfile(user.uid);
      const normalizedPlan = normalizeWeeklyPlanSessionFocus(updatedPlan, profile || {});

      return jsonResponse({
        traceId,
        plan: normalizedPlan,
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al actualizar personalizaciones del plan.', 500);
  }
}
