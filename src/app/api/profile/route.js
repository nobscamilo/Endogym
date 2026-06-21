import {
  GoalType,
  MetabolicProfile,
  TrainingModality,
  TrainingMode,
} from '../../../domain/models.js';
import { buildMacroTargetFromProfile } from '../../../core/planner.js';
import { getMissingNutritionProfileFields } from '../../../core/profileCompleteness.js';
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
  const existing = existingProfile && typeof existingProfile === 'object' ? existingProfile : {};
  const nowIso = new Date().toISOString();
  const goal = hasOwn(source, 'goal')
    ? (GOALS.has(payload.goal) ? payload.goal : null)
    : (GOALS.has(existing.goal) ? existing.goal : null);
  const trainingMode = hasOwn(source, 'trainingMode')
    ? (TRAINING_MODES.has(payload.trainingMode) ? payload.trainingMode : null)
    : (TRAINING_MODES.has(existing.trainingMode) ? existing.trainingMode : null);
  const explicitModality = hasOwn(source, 'trainingModality')
    ? (TRAINING_MODALITIES.has(payload.trainingModality) ? payload.trainingModality : null)
    : (TRAINING_MODALITIES.has(existing.trainingModality) ? existing.trainingModality : null);
  const trainingModality = explicitModality
    || (trainingMode === TrainingMode.HOME ? TrainingModality.HOME : null)
    || (trainingMode === TrainingMode.GYM ? TrainingModality.FULL_GYM : null);
  const activityLevel = hasOwn(source, 'activityLevel')
    ? (ACTIVITY_LEVELS.has(payload.activityLevel) ? payload.activityLevel : null)
    : (ACTIVITY_LEVELS.has(existing.activityLevel) ? existing.activityLevel : null);
  const sex = hasOwn(source, 'sex')
    ? (SEX_VALUES.has(payload.sex) ? payload.sex : null)
    : (SEX_VALUES.has(existing.sex) ? existing.sex : null);
  const metabolicProfile = hasOwn(source, 'metabolicProfile')
    ? (METABOLIC_PROFILES.has(payload.metabolicProfile) ? payload.metabolicProfile : null)
    : (METABOLIC_PROFILES.has(existing.metabolicProfile) ? existing.metabolicProfile : null);
  const existingPreparticipation = normalizePreparticipationInput(existingProfile?.preparticipation);
  const payloadIncludesPreparticipation = hasOwn(source, 'preparticipation');
  const preparticipation = payloadIncludesPreparticipation
    ? normalizePreparticipationInput(payload.preparticipation)
    : existingPreparticipation;
  const existingPreparticipationUpdatedAt = isIsoDateString(existingProfile?.preparticipationUpdatedAt)
    ? existingProfile.preparticipationUpdatedAt
    : null;
  const preparticipationChanged = !isSamePreparticipation(preparticipation, existingPreparticipation);
  const forceScreeningRefresh = payload.forceScreeningRefresh === true;
  const preparticipationUpdatedAt = payloadIncludesPreparticipation
    ? preparticipationChanged || forceScreeningRefresh || !existingPreparticipationUpdatedAt
      ? nowIso
      : existingPreparticipationUpdatedAt
    : existingPreparticipationUpdatedAt;
  const screeningRefreshDays = normalizeScreeningRefreshDays(
    payload.screeningRefreshDays,
    existingProfile?.screeningRefreshDays
  );
  const preferredDurationValue = toNumber(
    hasOwn(source, 'preferredDurationMinutes') ? payload.preferredDurationMinutes : existing.preferredDurationMinutes,
    null
  );
  const preferredDurationMinutes = preferredDurationValue == null
    ? null
    : clamp(Math.round(preferredDurationValue), 20, 180);
  const nutritionPreferences = hasOwn(source, 'nutritionPreferences')
    ? normalizeNutritionPreferencesInput(payload.nutritionPreferences)
    : (existing.nutritionPreferences || normalizeNutritionPreferencesInput());
  const adaptiveThresholds = hasOwn(source, 'adaptiveThresholds')
    ? normalizeAdaptiveThresholds(payload.adaptiveThresholds)
    : (existing.adaptiveThresholds || normalizeAdaptiveThresholds());
  const legalConsents = normalizeLegalConsentsInput(payload.legalConsents, existingProfile?.legalConsents);
  const onboardingCompleted = payload?.onboardingCompleted === true
    ? true
    : existingProfile?.onboardingCompleted === true
      ? true
      : existingProfile?.needsSetup === false
        ? true
      : false;

  return {
    displayName: typeof payload.displayName === 'string'
      ? payload.displayName.trim()
      : (typeof existing.displayName === 'string' ? existing.displayName : ''),
    goal,
    trainingMode: trainingModality
      ? (trainingModality === TrainingModality.FULL_GYM ? TrainingMode.GYM : TrainingMode.HOME)
      : trainingMode,
    trainingModality,
    metabolicProfile,
    activityLevel,
    sex,
    age: toNumber(hasOwn(source, 'age') ? payload.age : existing.age, null),
    weightKg: toNumber(hasOwn(source, 'weightKg') ? payload.weightKg : existing.weightKg, null),
    heightCm: toNumber(hasOwn(source, 'heightCm') ? payload.heightCm : existing.heightCm, null),
    mealsPerDay: toNumber(hasOwn(source, 'mealsPerDay') ? payload.mealsPerDay : existing.mealsPerDay, null),
    targetCalories: toNumber(hasOwn(source, 'targetCalories') ? payload.targetCalories : existing.targetCalories, null),
    medicalConditions: typeof payload.medicalConditions === 'string' ? payload.medicalConditions.trim().slice(0, 500) : (existingProfile?.medicalConditions || ''),
    physicalInjuries: typeof payload.physicalInjuries === 'string' ? payload.physicalInjuries.trim().slice(0, 500) : (existingProfile?.physicalInjuries || ''),
    preferredDurationMinutes,
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
    goal: null,
    trainingMode: null,
    trainingModality: null,
    metabolicProfile: null,
    activityLevel: null,
    sex: null,
    age: null,
    weightKg: null,
    heightCm: null,
    mealsPerDay: null,
    targetCalories: null,
    medicalConditions: '',
    physicalInjuries: '',
    preferredDurationMinutes: null,
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
      const targetMacros = getMissingNutritionProfileFields(normalized).length === 0
        ? buildMacroTargetFromProfile(normalized)
        : null;
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
