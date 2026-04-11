import {
  GoalType,
  MetabolicProfile,
  TrainingModality,
  TrainingMode,
} from '../../../domain/models.js';
import { buildMacroTargetFromProfile } from '../../../core/planner.js';
import { normalizeNutritionPreferencesInput } from '../../../core/nutritionPlanner.js';
import { normalizeAdaptiveThresholds } from '../../../core/progressMemory.js';
import { normalizePreparticipationInput } from '../../../core/screening.js';
import { AuthenticationError, getAuthenticatedUser } from '../../../lib/auth.js';
import { getUserProfile, upsertUserProfile } from '../../../lib/repositories/firestoreRepository.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { withTrace } from '../../../lib/logger.js';

const GOALS = new Set(Object.values(GoalType));
const TRAINING_MODES = new Set(Object.values(TrainingMode));
const TRAINING_MODALITIES = new Set(Object.values(TrainingModality));
const METABOLIC_PROFILES = new Set(Object.values(MetabolicProfile));
const ACTIVITY_LEVELS = new Set(['sedentary', 'light', 'moderate', 'high']);
const SEX_VALUES = new Set(['male', 'female']);
const DEFAULT_SCREENING_REFRESH_DAYS = 15;
const MIN_SCREENING_REFRESH_DAYS = 15;
const MAX_SCREENING_REFRESH_DAYS = 90;

function toNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isIsoDateString(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeScreeningRefreshDays(value, fallback = DEFAULT_SCREENING_REFRESH_DAYS) {
  const numeric = toNumber(value, fallback);
  return clamp(
    Math.round(numeric ?? DEFAULT_SCREENING_REFRESH_DAYS),
    MIN_SCREENING_REFRESH_DAYS,
    MAX_SCREENING_REFRESH_DAYS
  );
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function isSamePreparticipation(a = {}, b = {}) {
  return (
    a.knownCardiometabolicDisease === b.knownCardiometabolicDisease
    && a.exerciseSymptoms === b.exerciseSymptoms
    && a.currentlyActive === b.currentlyActive
    && a.medicalClearance === b.medicalClearance
    && a.contraindications === b.contraindications
    && a.desiredIntensity === b.desiredIntensity
  );
}

function normalizeLegalConsentsInput(raw = {}, existing = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const fallback = existing && typeof existing === 'object' ? existing : {};

  const termsAccepted = source.termsAccepted ?? fallback.termsAccepted ?? false;
  const privacyAccepted = source.privacyAccepted ?? fallback.privacyAccepted ?? false;
  const dataProcessingAccepted = source.dataProcessingAccepted ?? fallback.dataProcessingAccepted ?? false;
  const marketingAccepted = source.marketingAccepted ?? fallback.marketingAccepted ?? false;
  const consentVersion = typeof source.consentVersion === 'string' && source.consentVersion.trim()
    ? source.consentVersion.trim()
    : typeof fallback.consentVersion === 'string' && fallback.consentVersion.trim()
      ? fallback.consentVersion.trim()
      : '2026-04-02';
  const acceptedAt = typeof source.acceptedAt === 'string' && source.acceptedAt.trim()
    ? source.acceptedAt
    : fallback.acceptedAt ?? null;

  return {
    termsAccepted: Boolean(termsAccepted),
    privacyAccepted: Boolean(privacyAccepted),
    dataProcessingAccepted: Boolean(dataProcessingAccepted),
    marketingAccepted: Boolean(marketingAccepted),
    consentVersion,
    acceptedAt,
    updatedAt: new Date().toISOString(),
  };
}

function normalizePayload(payload = {}, existingProfile = null) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const nowIso = new Date().toISOString();
  const goal = GOALS.has(payload.goal) ? payload.goal : GoalType.WEIGHT_LOSS;
  const trainingMode = TRAINING_MODES.has(payload.trainingMode) ? payload.trainingMode : TrainingMode.GYM;
  const trainingModality = TRAINING_MODALITIES.has(payload.trainingModality)
    ? payload.trainingModality
    : trainingMode === TrainingMode.HOME
      ? TrainingModality.HOME
      : TrainingModality.FULL_GYM;
  const activityLevel = ACTIVITY_LEVELS.has(payload.activityLevel) ? payload.activityLevel : 'moderate';
  const sex = SEX_VALUES.has(payload.sex) ? payload.sex : 'male';
  const metabolicProfile = METABOLIC_PROFILES.has(payload.metabolicProfile)
    ? payload.metabolicProfile
    : MetabolicProfile.NONE;
  const existingPreparticipation = normalizePreparticipationInput(existingProfile?.preparticipation);
  const payloadIncludesPreparticipation = hasOwn(source, 'preparticipation');
  const preparticipation = payloadIncludesPreparticipation
    ? normalizePreparticipationInput(payload.preparticipation)
    : existingPreparticipation;
  const existingPreparticipationUpdatedAt = isIsoDateString(existingProfile?.preparticipationUpdatedAt)
    ? existingProfile.preparticipationUpdatedAt
    : null;
  const preparticipationChanged = !isSamePreparticipation(preparticipation, existingPreparticipation);
  const preparticipationUpdatedAt = payloadIncludesPreparticipation
    ? preparticipationChanged || !existingPreparticipationUpdatedAt
      ? nowIso
      : existingPreparticipationUpdatedAt
    : existingPreparticipationUpdatedAt;
  const screeningRefreshDays = normalizeScreeningRefreshDays(
    payload.screeningRefreshDays,
    existingProfile?.screeningRefreshDays
  );
  const nutritionPreferences = normalizeNutritionPreferencesInput(payload.nutritionPreferences);
  const adaptiveThresholds = normalizeAdaptiveThresholds(payload.adaptiveThresholds);
  const legalConsents = normalizeLegalConsentsInput(payload.legalConsents, existingProfile?.legalConsents);
  const onboardingCompleted = payload?.onboardingCompleted === true
    ? true
    : existingProfile?.onboardingCompleted === true
      ? true
      : existingProfile?.needsSetup === false
        ? true
      : false;

  return {
    displayName: typeof payload.displayName === 'string' ? payload.displayName.trim() : '',
    goal,
    trainingMode: trainingModality === TrainingModality.FULL_GYM ? TrainingMode.GYM : TrainingMode.HOME,
    trainingModality,
    metabolicProfile,
    activityLevel,
    sex,
    age: toNumber(payload.age, 30),
    weightKg: toNumber(payload.weightKg, 75),
    heightCm: toNumber(payload.heightCm, 175),
    mealsPerDay: toNumber(payload.mealsPerDay, 4),
    targetCalories: toNumber(payload.targetCalories, null),
    preparticipation,
    preparticipationUpdatedAt,
    screeningRefreshDays,
    nutritionPreferences,
    adaptiveThresholds,
    legalConsents,
    onboardingCompleted,
  };
}

function buildDefaultProfile(user) {
  return {
    userId: user.uid,
    email: user.email ?? null,
    displayName: '',
    goal: GoalType.WEIGHT_LOSS,
    trainingMode: TrainingMode.GYM,
    trainingModality: TrainingModality.FULL_GYM,
    metabolicProfile: MetabolicProfile.NONE,
    activityLevel: 'moderate',
    sex: 'male',
    age: 30,
    weightKg: 75,
    heightCm: 175,
    mealsPerDay: 4,
    targetCalories: null,
    preparticipation: normalizePreparticipationInput(),
    preparticipationUpdatedAt: null,
    screeningRefreshDays: DEFAULT_SCREENING_REFRESH_DAYS,
    nutritionPreferences: normalizeNutritionPreferencesInput(),
    adaptiveThresholds: normalizeAdaptiveThresholds(),
    legalConsents: normalizeLegalConsentsInput(),
    targetMacros: null,
    onboardingCompleted: false,
    needsSetup: true,
  };
}

export async function GET(request) {
  try {
    return await withTrace('profile_get', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      const profile = await getUserProfile(user.uid);

      return jsonResponse({
        traceId,
        profile: profile ?? buildDefaultProfile(user),
      });
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al obtener perfil.', 500);
  }
}

export async function PUT(request) {
  try {
    return await withTrace('profile_upsert', async ({ traceId }) => {
      const user = await getAuthenticatedUser(request);
      let payload;

      try {
        payload = await request.json();
      } catch {
        return errorResponse('JSON inválido en body.', 400);
      }

      const currentProfile = await getUserProfile(user.uid);
      const normalized = normalizePayload(payload, currentProfile);
      const targetMacros = buildMacroTargetFromProfile(normalized);
      const needsSetup = normalized.onboardingCompleted !== true;
      const profile = await upsertUserProfile(user.uid, {
        ...normalized,
        email: user.email ?? null,
        targetMacros,
        needsSetup,
      });

      return jsonResponse({ traceId, profile }, 200);
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401);
    }
    return errorResponse('Error interno al guardar perfil.', 500);
  }
}
