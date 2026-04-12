'use client';

import Image from 'next/image';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { getFirebaseClient, isFirebaseClientConfigured } from '../lib/firebaseClient.js';
import { calculateCalories } from '../core/nutrition.js';
import { classifyGlycemicLoad, estimateInsulinIndex, glycemicLoad } from '../core/glucose.js';
import { suggestSessionAlternatives as suggestSessionAlternativesByDay } from '../core/planner.js';
import {
  buildSessionExercises,
  exportExerciseLibraryCatalogCsv,
  exportExerciseLibraryCatalogJson,
  getExerciseLibraryAuditSchema,
  getExerciseLibraryCatalog,
  isExerciseCompatibleWithSessionFocus,
  parseExerciseLibraryAuditText,
  resolveExerciseMetadata,
  resolveSessionFocus,
  suggestExerciseAlternatives,
  validateExerciseLibraryAuditCatalog,
} from '../core/exerciseLibrary.js';
import MuscleMapFigure from './MuscleMapFigure.js';

const DEFAULT_PROFILE = {
  displayName: '',
  goal: 'weight_loss',
  trainingMode: 'gym',
  trainingModality: 'full_gym',
  metabolicProfile: 'none',
  activityLevel: 'moderate',
  sex: 'male',
  age: 30,
  weightKg: 75,
  heightCm: 175,
  mealsPerDay: 4,
  targetCalories: '',
  preparticipation: {
    knownCardiometabolicDisease: false,
    exerciseSymptoms: false,
    currentlyActive: false,
    medicalClearance: false,
    contraindications: false,
    desiredIntensity: 'moderate',
  },
  preparticipationUpdatedAt: null,
  screeningRefreshDays: 15,
  nutritionPreferences: {
    dietaryPattern: 'omnivore',
    allergies: '',
    intolerances: '',
    dislikedFoods: '',
  },
  adaptiveThresholds: {
    highFatigue: 7,
    highSessionRpe: 8.2,
    lowCompletionRate: 0.6,
    lowAdherencePercent: 60,
    highReadiness: 78,
  },
  legalConsents: {
    termsAccepted: false,
    privacyAccepted: false,
    dataProcessingAccepted: false,
    marketingAccepted: false,
    consentVersion: '2026-04-02',
    acceptedAt: null,
    updatedAt: null,
  },
  onboardingCompleted: false,
};

const DASHBOARD_UI_STATE_KEY = 'endogym-ui-state-v1';
const DASHBOARD_TAB_IDS = ['dashboard', 'user', 'daily', 'weekly', 'library', 'nutrition'];
const SESSION_FOCUS_LABELS = {
  upper: 'Torso',
  push: 'Empuje',
  pull: 'Tracción',
  lower: 'Pierna',
  lower_conditioning: 'Pierna + acondicionamiento',
  full_body: 'Full body',
  cardio: 'Cardio',
  mindbody: 'Mind-body',
  recovery: 'Recuperación',
  general_resistance: 'Fuerza general',
  general_mixed: 'Mixto',
};

function toNumber(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBarcode(value) {
  return String(value || '')
    .replace(/[^\d]/g, '')
    .slice(0, 14);
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setTimeout(resolve, 16);
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForVideoElement(videoRef, maxFrames = 14) {
  for (let index = 0; index < maxFrames; index += 1) {
    if (videoRef.current) {
      return videoRef.current;
    }
    await waitForNextFrame();
  }

  throw new Error('No se pudo inicializar el visor de cámara.');
}

function waitForVideoReady(video, timeoutMs = 2600) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error('Elemento de video no disponible.'));
      return;
    }

    if (video.readyState >= 2 && video.videoWidth > 0) {
      resolve(video);
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('La cámara se abrió, pero no entregó imagen.'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('playing', handleReady);
    };

    const handleReady = () => {
      if (video.videoWidth > 0 || video.readyState >= 2) {
        cleanup();
        resolve(video);
      }
    };

    video.addEventListener('loadedmetadata', handleReady, { once: true });
    video.addEventListener('canplay', handleReady, { once: true });
    video.addEventListener('playing', handleReady, { once: true });
  });
}

async function attachStreamToVideo(videoRef, stream) {
  const video = await waitForVideoElement(videoRef);
  video.setAttribute('playsinline', 'true');
  video.setAttribute('autoplay', 'true');
  video.muted = true;
  video.autoplay = true;
  video.srcObject = stream;

  try {
    await video.play();
  } catch {
    // Safari/iOS puede necesitar metadata primero; lo reintentamos abajo.
  }

  await waitForVideoReady(video);

  if (video.paused) {
    await video.play();
  }

  return video;
}

async function requestCameraStream(preferRearCamera = true) {
  const constraintsQueue = [
    {
      video: {
        facingMode: { ideal: preferRearCamera ? 'environment' : 'user' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    {
      video: {
        facingMode: preferRearCamera ? 'environment' : 'user',
      },
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ];

  let lastError = null;

  for (const constraints of constraintsQueue) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No se pudo abrir la cámara.');
}

function cameraUsageBlockedByPolicy() {
  if (typeof document === 'undefined') return false;
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (!policy || typeof policy.allowsFeature !== 'function') return false;

  try {
    return policy.allowsFeature('camera') === false;
  } catch {
    return false;
  }
}

function compactText(value, maxLength = 72) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (source.length <= maxLength) return source;
  return `${source.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseIsoDate(dateString) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildLocalNoonIso(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0
  ).toISOString();
}

function resolveFocusFamily(sessionFocus = '') {
  switch (sessionFocus) {
    case 'upper':
    case 'push':
    case 'pull':
      return 'upper';
    case 'lower':
    case 'lower_conditioning':
      return 'lower';
    case 'full_body':
    case 'general_resistance':
    case 'general_mixed':
      return 'full';
    case 'cardio':
      return 'cardio';
    case 'mindbody':
      return 'mindbody';
    case 'recovery':
      return 'recovery';
    default:
      return 'general';
  }
}

function summarizeWorkoutMuscles(exercises = [], limit = 4) {
  return Array.from(
    new Set(
      exercises.flatMap((exercise) => exercise?.primaryMuscles || [])
    )
  ).slice(0, limit);
}

function summarizeWorkoutPreview(exercises = [], limit = 3) {
  return exercises.slice(0, limit).map((exercise) => exercise?.name).filter(Boolean);
}

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function downloadTextFile(filename, contents, mimeType = 'text/plain;charset=utf-8') {
  if (typeof window === 'undefined') return;
  const blob = new Blob([contents], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function formatDayNameFromIso(dateString) {
  const date = parseIsoDate(dateString);
  if (!date) return '';
  return capitalize(new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date));
}

function formatDateLabel(dateString) {
  const date = parseIsoDate(dateString);
  if (!date) return dateString || '';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatFullDateLabel(dateString) {
  const date = parseIsoDate(dateString);
  if (!date) return dateString || '';
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function formatDateTimeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizeSearchToken(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function findCoachAdjustmentForDay(adjustments = [], day = null) {
  if (!Array.isArray(adjustments) || !day) return null;

  const dayTokens = [
    day.dayName,
    day.date,
    formatDayNameFromIso(day.date),
    formatFullDateLabel(day.date),
  ]
    .map((token) => normalizeSearchToken(token))
    .filter(Boolean);

  return adjustments.find((adjustment) => {
    const label = normalizeSearchToken(adjustment?.day);
    return label && dayTokens.some((token) => label.includes(token) || token.includes(label));
  }) || null;
}

function mealTargetSummary(target) {
  if (!target) return 'Objetivo nutricional no disponible';
  return `${target.calories || 0} kcal · P ${target.proteinGrams || 0} · C ${target.carbsGrams || 0} · G ${target.fatGrams || 0}`;
}

function summarizePrescription(prescription) {
  if (!prescription) return 'Prescripción pendiente';
  if (prescription.format === 'reps') {
    const loadPart = prescription.loadKg != null ? ` · ${prescription.loadKg} kg` : '';
    return `${prescription.sets || 0} series · ${prescription.reps || 'n/d'} reps${loadPart}`;
  }
  return `${prescription.sets || 0} bloques · ${prescription.durationMinutes || 0} min`;
}

function SectionLabel({ title, subtitle }) {
  return (
    <div className="section-label">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function buildProfilePayload(profile) {
  return {
    displayName: profile.displayName || '',
    goal: profile.goal,
    trainingMode: profile.trainingModality === 'full_gym' ? 'gym' : 'home',
    trainingModality: profile.trainingModality,
    metabolicProfile: profile.metabolicProfile,
    activityLevel: profile.activityLevel,
    sex: profile.sex,
    age: toNumber(profile.age, 30),
    weightKg: toNumber(profile.weightKg, 75),
    heightCm: toNumber(profile.heightCm, 175),
    mealsPerDay: toNumber(profile.mealsPerDay, 4),
    targetCalories: toNumber(profile.targetCalories, null),
    preparticipation: {
      knownCardiometabolicDisease: toBoolean(profile.preparticipation?.knownCardiometabolicDisease, false),
      exerciseSymptoms: toBoolean(profile.preparticipation?.exerciseSymptoms, false),
      currentlyActive: toBoolean(profile.preparticipation?.currentlyActive, false),
      medicalClearance: toBoolean(profile.preparticipation?.medicalClearance, false),
      contraindications: toBoolean(profile.preparticipation?.contraindications, false),
      desiredIntensity: profile.preparticipation?.desiredIntensity || 'moderate',
    },
    preparticipationUpdatedAt: profile.preparticipationUpdatedAt || null,
    screeningRefreshDays: Math.max(15, Math.round(toNumber(profile.screeningRefreshDays, 15))),
    nutritionPreferences: {
      dietaryPattern: profile.nutritionPreferences?.dietaryPattern || 'omnivore',
      allergies: String(profile.nutritionPreferences?.allergies || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      intolerances: String(profile.nutritionPreferences?.intolerances || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      dislikedFoods: String(profile.nutritionPreferences?.dislikedFoods || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    },
    adaptiveThresholds: {
      highFatigue: toNumber(profile.adaptiveThresholds?.highFatigue, 7),
      highSessionRpe: toNumber(profile.adaptiveThresholds?.highSessionRpe, 8.2),
      lowCompletionRate: toNumber(profile.adaptiveThresholds?.lowCompletionRate, 0.6),
      lowAdherencePercent: toNumber(profile.adaptiveThresholds?.lowAdherencePercent, 60),
      highReadiness: toNumber(profile.adaptiveThresholds?.highReadiness, 78),
    },
    legalConsents: {
      termsAccepted: toBoolean(profile.legalConsents?.termsAccepted, false),
      privacyAccepted: toBoolean(profile.legalConsents?.privacyAccepted, false),
      dataProcessingAccepted: toBoolean(profile.legalConsents?.dataProcessingAccepted, false),
      marketingAccepted: toBoolean(profile.legalConsents?.marketingAccepted, false),
      consentVersion: profile.legalConsents?.consentVersion || '2026-04-02',
      acceptedAt: profile.legalConsents?.acceptedAt ?? null,
    },
    onboardingCompleted: true,
  };
}

const GOAL_LABELS = {
  weight_loss: 'Bajar peso',
  maintain_weight: 'Mantener peso',
  endurance: 'Resistencia',
  hypertrophy: 'Hipertrofia',
  strength: 'Fuerza',
  recomposition: 'Recomposición',
  glycemic_control: 'Control glucémico',
};

const DIETARY_PATTERN_LABELS = {
  omnivore: 'Omnívoro',
  vegetarian: 'Vegetariano',
  vegan: 'Vegano',
};

const MODALITY_LABELS = {
  full_gym: 'Gimnasio completo',
  home: 'Entrenamiento en casa',
  yoga: 'Yoga',
  trx: 'TRX',
  calisthenics: 'Calistenia',
  running: 'Running',
  cycling: 'Ciclismo',
  pilates: 'Pilates',
  mixed: 'Mixto',
};

const METABOLIC_LABELS = {
  none: 'Sin condición declarada',
  insulin_resistance: 'Resistencia a la insulina',
  prediabetes: 'Prediabetes',
  type2_diabetes: 'Diabetes tipo 2',
  hypothyroidism: 'Hipotiroidismo',
  pcos: 'SOP / PCOS',
};

const CATEGORY_LABELS = {
  lower_body_strength: 'Pierna principal',
  lower_body_unilateral: 'Pierna unilateral',
  lower_body_accessory: 'Pierna accesorio',
  posterior_chain: 'Cadena posterior',
  upper_push: 'Empuje superior',
  upper_pull: 'Tracción superior',
  core: 'Core',
  conditioning: 'Acondicionamiento',
  mobility: 'Movilidad',
  mobility_strength: 'Movilidad con fuerza',
  core_mobility: 'Core y movilidad',
  neuromotor: 'Neuromotor',
  recovery: 'Recuperación',
  cardio_base: 'Cardio base',
  cardio_threshold: 'Cardio umbral',
  cardio_interval: 'Cardio intervalos',
  cardio_skill: 'Cardio técnico',
};

const DIFFICULTY_LABELS = {
  foundation: 'Base',
  build: 'Construcción',
  performance: 'Avanzado',
};

const MODALITY_SPOTLIGHTS = {
  home: {
    title: 'Home Lab',
    description: 'Fuerza, core y acondicionamiento serio sin depender de máquinas.',
    signatureIds: ['home-band-overhead-press', 'home-cossack-squat', 'home-suitcase-carry'],
  },
  trx: {
    title: 'TRX Engine',
    description: 'Suspensión con progresiones reales, no solo filas y sentadillas básicas.',
    signatureIds: ['trx-chest-fly', 'trx-rollout', 'trx-single-leg-squat'],
  },
  yoga: {
    title: 'Yoga Control',
    description: 'Movilidad con fuerza, equilibrio y posturas útiles para prescripción real.',
    signatureIds: ['yoga-triangle-pose', 'yoga-dancer-pose', 'yoga-revolved-chair'],
  },
  pilates: {
    title: 'Pilates Precision',
    description: 'Core, control segmentario y cadena posterior con más profundidad técnica.',
    signatureIds: ['pilates-criss-cross', 'pilates-open-leg-rocker', 'pilates-bridge-march'],
  },
};

export default function DashboardPage() {
  const router = useRouter();
  const firebaseClient = useMemo(() => getFirebaseClient(), []);
  const firebaseClientConfigured = isFirebaseClientConfigured();
  const devAuthMode = process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';
  const authConfigMissing = !devAuthMode && !firebaseClientConfigured;

  const [authReady, setAuthReady] = useState(devAuthMode || authConfigMissing);
  const [authUser, setAuthUser] = useState(null);
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [profileStatus, setProfileStatus] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [showAdvancedProfile, setShowAdvancedProfile] = useState(false);

  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [planStatus, setPlanStatus] = useState('');
  const [planLoading, setPlanLoading] = useState(false);

  const [plateDish, setPlateDish] = useState('');
  const [plateFile, setPlateFile] = useState(null);
  const [platePreviewUrl, setPlatePreviewUrl] = useState('');
  const [cameraStatus, setCameraStatus] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeStatus, setBarcodeStatus] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [barcodeServingGrams, setBarcodeServingGrams] = useState(100);
  const [barcodeScanOpen, setBarcodeScanOpen] = useState(false);
  const [barcodeScanStatus, setBarcodeScanStatus] = useState('');
  const [barcodeImageLoading, setBarcodeImageLoading] = useState(false);

  const [calculatorInput, setCalculatorInput] = useState({
    foodName: '',
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    availableCarbsGrams: 0,
    glycemicIndex: 50,
    processedLevel: 1,
  });
  const [calculatorStatus, setCalculatorStatus] = useState('');
  const [calculatorSaving, setCalculatorSaving] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryModalityFilter, setLibraryModalityFilter] = useState('all');
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState('all');
  const [libraryImportedCatalog, setLibraryImportedCatalog] = useState(null);
  const [libraryAuditStatus, setLibraryAuditStatus] = useState({
    type: 'neutral',
    message: 'Exporta la base actual o importa un archivo JSON/CSV para auditarlo.',
    errors: [],
    warnings: [],
    fileName: '',
    format: 'built-in',
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedDate, setSelectedDate] = useState(null);
  const [sessionSwapState, setSessionSwapState] = useState({});
  const [sessionSwapOpen, setSessionSwapOpen] = useState(false);
  const [exerciseSwapState, setExerciseSwapState] = useState({});
  const [openSwapTarget, setOpenSwapTarget] = useState(null);
  const [selectedExerciseKey, setSelectedExerciseKey] = useState(null);
  const [workoutStatus, setWorkoutStatus] = useState('');
  const [workoutLoading, setWorkoutLoading] = useState(false);
  const [workoutCheckin, setWorkoutCheckin] = useState({
    title: 'Sesión planificada',
    mode: 'full_gym',
    durationMinutes: 60,
    sessionRpe: 6,
    fatigue: 4,
    sleepHours: 7,
    completed: true,
    notes: '',
  });
  const [metricStatus, setMetricStatus] = useState('');
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricInput, setMetricInput] = useState({
    weightKg: '',
    waistCm: '',
    fastingGlucoseMgDl: '',
    notes: '',
  });
  const [privacyStatus, setPrivacyStatus] = useState('');
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const plateObjectUrlRef = useRef('');
  const scannerVideoRef = useRef(null);
  const scannerStreamRef = useRef(null);
  const scannerDetectorRef = useRef(null);
  const scannerFrameRef = useRef(0);
  const scannerControlsRef = useRef(null);
  const scannerReaderRef = useRef(null);
  const barcodeImageInputRef = useRef(null);
  const libraryFileInputRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawState = window.localStorage.getItem(DASHBOARD_UI_STATE_KEY);
      if (!rawState) return;
      const parsedState = JSON.parse(rawState);
      if (DASHBOARD_TAB_IDS.includes(parsedState?.activeTab)) {
        setActiveTab(parsedState.activeTab);
      }
      if (typeof parsedState?.selectedDate === 'string' && parsedState.selectedDate) {
        setSelectedDate(parsedState.selectedDate);
      }
    } catch {
      // Ignore invalid persisted UI state.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        DASHBOARD_UI_STATE_KEY,
        JSON.stringify({
          activeTab,
          selectedDate,
        })
      );
    } catch {
      // Ignore storage failures.
    }
  }, [activeTab, selectedDate]);

  useEffect(() => {
    if (devAuthMode || authConfigMissing || !firebaseClient?.auth) {
      setAuthReady(true);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(firebaseClient.auth, (nextUser) => {
      setAuthUser(nextUser);
      setAuthReady(true);
    });

    return unsubscribe;
  }, [devAuthMode, authConfigMissing, firebaseClient]);

  useEffect(() => {
    if (!authReady) return;
    if (devAuthMode) return;
    if (authUser) return;
    router.replace('/');
  }, [authReady, devAuthMode, authUser, router]);

  const loadProfileRef = useRef(null);
  const loadWeeklyPlanRef = useRef(null);
  loadProfileRef.current = loadProfile;
  loadWeeklyPlanRef.current = loadWeeklyPlan;

  useEffect(() => {
    if (!authReady) return;
    if (authConfigMissing) return;
    if (!devAuthMode && !authUser) return;
    loadProfileRef.current();
    loadWeeklyPlanRef.current();
  }, [authReady, authConfigMissing, devAuthMode, authUser]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }

      if (plateObjectUrlRef.current) {
        URL.revokeObjectURL(plateObjectUrlRef.current);
        plateObjectUrlRef.current = '';
      }

      if (scannerFrameRef.current) {
        cancelAnimationFrame(scannerFrameRef.current);
        scannerFrameRef.current = 0;
      }

      if (scannerControlsRef.current?.stop) {
        try {
          scannerControlsRef.current.stop();
        } catch {}
        scannerControlsRef.current = null;
      }

      if (scannerReaderRef.current?.reset) {
        try {
          scannerReaderRef.current.reset();
        } catch {}
        scannerReaderRef.current = null;
      }

      if (scannerStreamRef.current) {
        scannerStreamRef.current.getTracks().forEach((track) => track.stop());
        scannerStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'nutrition' && cameraOpen) {
      stopCameraCapture();
    }

    if (activeTab !== 'nutrition' && barcodeScanOpen) {
      stopBarcodeScanner();
    }

    if (activeTab !== 'daily') {
      setOpenSwapTarget(null);
      setSessionSwapOpen(false);
    }
  }, [activeTab, cameraOpen, barcodeScanOpen]);

  async function getAuthHeaders() {
    const headers = { 'content-type': 'application/json' };

    if (devAuthMode) {
      return { ...headers, 'x-dev-user-id': 'demo-athlete' };
    }

    if (authConfigMissing) {
      throw new Error('Falta configurar Firebase Client en variables NEXT_PUBLIC_FIREBASE_*.');
    }

    if (!authUser) {
      throw new Error('Debes iniciar sesión para usar la API.');
    }

    const token = await authUser.getIdToken();
    return { ...headers, authorization: `Bearer ${token}` };
  }

  async function safeJson(response) {
    try {
      return await response.json();
    } catch {
      return { error: 'Respuesta no JSON del servidor.' };
    }
  }

  async function apiFetch(path, options = {}) {
    const headers = await getAuthHeaders();
    const response = await fetch(path, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });
    const data = await safeJson(response);

    if (!response.ok) {
      throw new Error(data.error || 'Error en la petición.');
    }

    return data;
  }

  function applyPlanCustomizationState(plan, options = {}) {
    const resetSelection = options.resetSelection !== false;
    const customizations = plan?.customizations || {};
    setSessionSwapState(
      customizations?.sessionSwapsByDate && typeof customizations.sessionSwapsByDate === 'object'
        ? customizations.sessionSwapsByDate
        : {}
    );
    setExerciseSwapState(
      customizations?.exerciseSwapsByDate && typeof customizations.exerciseSwapsByDate === 'object'
        ? customizations.exerciseSwapsByDate
        : {}
    );
    setSessionSwapOpen(false);
    setOpenSwapTarget(null);
    if (resetSelection) {
      setSelectedExerciseKey(null);
    }
  }

  async function persistPlanCustomizations(nextSessionSwapState, nextExerciseSwapState, successMessage = 'Personalización guardada.') {
    if (!weeklyPlan?.id) {
      setPlanStatus('El plan actual no se pudo identificar; cambios solo locales.');
      return;
    }

    try {
      const data = await apiFetch('/api/weekly-plan', {
        method: 'PATCH',
        body: JSON.stringify({
          planId: weeklyPlan.id,
          customizations: {
            sessionSwapsByDate: nextSessionSwapState,
            exerciseSwapsByDate: nextExerciseSwapState,
          },
        }),
      });

      if (data.plan) {
        setWeeklyPlan(data.plan);
        applyPlanCustomizationState(data.plan, { resetSelection: false });
      }

      setPlanStatus(successMessage);
    } catch (error) {
      setPlanStatus(`No se pudo guardar la personalización: ${error.message}`);
    }
  }

  function normalizeExerciseForView(exercise, index) {
    const metadata = resolveExerciseMetadata(exercise);
    if (exercise && typeof exercise === 'object') {
      return {
        ...exercise,
        id: exercise.id || `legacy-${index}`,
        name: exercise.name || `Ejercicio ${index + 1}`,
        difficulty: exercise.difficulty || '',
        progressions: exercise.progressions || [],
        regressions: exercise.regressions || [],
        contraindications: exercise.contraindications || [],
        primaryMuscles: exercise.primaryMuscles || metadata.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles || metadata.secondaryMuscles,
        anatomyRegions: exercise.anatomyRegions || metadata.anatomyRegions,
      };
    }

    return {
      id: `legacy-${index}`,
      name: typeof exercise === 'string' ? exercise : `Ejercicio ${index + 1}`,
      equipment: 'Sin especificar',
      cues: [],
      prescription: null,
      videoUrl: null,
      difficulty: '',
      progressions: [],
      regressions: [],
      contraindications: [],
      primaryMuscles: metadata.primaryMuscles,
      secondaryMuscles: metadata.secondaryMuscles,
      anatomyRegions: metadata.anatomyRegions,
    };
  }

  function buildSwapKey(exercise, index) {
    return `${exercise?.id || 'legacy'}-${index}`;
  }

  function getDaySessionOverride(dayDate) {
    return sessionSwapState?.[dayDate] || null;
  }

  function getDayOverrideMap(dayDate) {
    return exerciseSwapState?.[dayDate] || {};
  }

  function clearDayExerciseSwaps(dayDate) {
    if (!exerciseSwapState?.[dayDate]) return exerciseSwapState;

    const next = { ...exerciseSwapState };
    delete next[dayDate];
    setExerciseSwapState(next);
    return next;
  }

  function applyExerciseSwap(dayDate, exerciseKey, replacementExercise) {
    const nextExerciseSwapState = {
      ...exerciseSwapState,
      [dayDate]: {
        ...(exerciseSwapState?.[dayDate] || {}),
        [exerciseKey]: replacementExercise,
      },
    };

    setExerciseSwapState(nextExerciseSwapState);
    setOpenSwapTarget(null);
    persistPlanCustomizations(sessionSwapState, nextExerciseSwapState, 'Cambio 1:1 guardado.');
  }

  function clearExerciseSwap(dayDate, exerciseKey) {
    const dayMap = { ...(exerciseSwapState?.[dayDate] || {}) };
    delete dayMap[exerciseKey];

    const nextExerciseSwapState = { ...exerciseSwapState };
    if (!Object.keys(dayMap).length) {
      delete nextExerciseSwapState[dayDate];
    } else {
      nextExerciseSwapState[dayDate] = dayMap;
    }

    setExerciseSwapState(nextExerciseSwapState);
    setOpenSwapTarget(null);
    persistPlanCustomizations(sessionSwapState, nextExerciseSwapState, 'Cambio 1:1 retirado.');
  }

  function applySessionSwap(dayDate, sessionOption) {
    if (!dayDate || !sessionOption) return;

    const nextSessionSwapState = {
      ...sessionSwapState,
      [dayDate]: sessionOption,
    };
    setSessionSwapState(nextSessionSwapState);
    const nextExerciseSwapState = clearDayExerciseSwaps(dayDate);
    setSessionSwapOpen(false);
    setOpenSwapTarget(null);
    setSelectedExerciseKey(null);
    persistPlanCustomizations(nextSessionSwapState, nextExerciseSwapState, 'Sesión alternativa guardada.');
  }

  function clearSessionSwap(dayDate) {
    if (!dayDate || !sessionSwapState?.[dayDate]) return;

    const nextSessionSwapState = { ...sessionSwapState };
    delete nextSessionSwapState[dayDate];
    setSessionSwapState(nextSessionSwapState);
    const nextExerciseSwapState = clearDayExerciseSwaps(dayDate);
    setSessionSwapOpen(false);
    setOpenSwapTarget(null);
    setSelectedExerciseKey(null);
    persistPlanCustomizations(nextSessionSwapState, nextExerciseSwapState, 'Sesión base restaurada.');
  }

  function toggleExerciseSwapMenu(day, exercise, index) {
    if (!day) return;

    const exerciseKey = buildSwapKey(exercise, index);
    const isCurrentOpen =
      openSwapTarget?.dayDate === day.date
      && openSwapTarget?.exerciseKey === exerciseKey;

    if (isCurrentOpen) {
      setOpenSwapTarget(null);
      return;
    }

    const options = suggestExerciseAlternatives({
      currentExerciseId: exercise.id,
      currentExercise: exercise,
      modality: profile.trainingModality,
      sessionType: day.sessionType,
      sessionTitle: day?.workout?.title || '',
      sessionFocus:
        day?.sessionFocus
        || day?.workout?.sessionFocus
        || resolveSessionFocus({
          modality: profile.trainingModality,
          sessionType: day.sessionType,
          sessionTitle: day?.workout?.title || '',
        }),
      goal: profile.goal,
      profile,
      adaptiveTuning: weeklyPlan?.adaptiveTuning || null,
      limit: 4,
    });

    setOpenSwapTarget({
      dayDate: day.date,
      exerciseKey,
      options,
    });
  }

  function scrollToNutritionTool(sectionId) {
    if (activeTab !== 'nutrition') return;
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function loadProfile() {
    setProfileLoading(true);
    setProfileStatus('Cargando perfil...');
    try {
      const data = await apiFetch('/api/profile', { method: 'GET' });
      const serverProfile = data.profile || {};
      setProfile({
        displayName: serverProfile.displayName || '',
        goal: serverProfile.goal || 'weight_loss',
        trainingMode: serverProfile.trainingMode || 'gym',
        trainingModality: serverProfile.trainingModality || 'full_gym',
        metabolicProfile: serverProfile.metabolicProfile || 'none',
        activityLevel: serverProfile.activityLevel || 'moderate',
        sex: serverProfile.sex || 'male',
        age: serverProfile.age ?? 30,
        weightKg: serverProfile.weightKg ?? 75,
        heightCm: serverProfile.heightCm ?? 175,
        mealsPerDay: serverProfile.mealsPerDay ?? 4,
        targetCalories: serverProfile.targetCalories ?? '',
        preparticipation: {
          knownCardiometabolicDisease: serverProfile.preparticipation?.knownCardiometabolicDisease ?? false,
          exerciseSymptoms: serverProfile.preparticipation?.exerciseSymptoms ?? false,
          currentlyActive: serverProfile.preparticipation?.currentlyActive ?? false,
          medicalClearance: serverProfile.preparticipation?.medicalClearance ?? false,
          contraindications: serverProfile.preparticipation?.contraindications ?? false,
          desiredIntensity: serverProfile.preparticipation?.desiredIntensity || 'moderate',
        },
        preparticipationUpdatedAt:
          typeof serverProfile.preparticipationUpdatedAt === 'string'
            ? serverProfile.preparticipationUpdatedAt
            : null,
        screeningRefreshDays:
          Number.isFinite(Number(serverProfile.screeningRefreshDays))
            ? Math.max(15, Math.round(Number(serverProfile.screeningRefreshDays)))
            : 15,
        nutritionPreferences: {
          dietaryPattern: serverProfile.nutritionPreferences?.dietaryPattern || 'omnivore',
          allergies: (serverProfile.nutritionPreferences?.allergies || []).join(', '),
          intolerances: (serverProfile.nutritionPreferences?.intolerances || []).join(', '),
          dislikedFoods: (serverProfile.nutritionPreferences?.dislikedFoods || []).join(', '),
        },
        adaptiveThresholds: {
          highFatigue: serverProfile.adaptiveThresholds?.highFatigue ?? 7,
          highSessionRpe: serverProfile.adaptiveThresholds?.highSessionRpe ?? 8.2,
          lowCompletionRate: serverProfile.adaptiveThresholds?.lowCompletionRate ?? 0.6,
          lowAdherencePercent: serverProfile.adaptiveThresholds?.lowAdherencePercent ?? 60,
          highReadiness: serverProfile.adaptiveThresholds?.highReadiness ?? 78,
        },
        legalConsents: {
          termsAccepted: serverProfile.legalConsents?.termsAccepted ?? false,
          privacyAccepted: serverProfile.legalConsents?.privacyAccepted ?? false,
          dataProcessingAccepted: serverProfile.legalConsents?.dataProcessingAccepted ?? false,
          marketingAccepted: serverProfile.legalConsents?.marketingAccepted ?? false,
          consentVersion: serverProfile.legalConsents?.consentVersion || '2026-04-02',
          acceptedAt: serverProfile.legalConsents?.acceptedAt ?? null,
          updatedAt: serverProfile.legalConsents?.updatedAt ?? null,
        },
        onboardingCompleted: serverProfile.onboardingCompleted === true || serverProfile.needsSetup === false,
      });
      setWorkoutCheckin((prev) => ({
        ...prev,
        mode: serverProfile.trainingModality || 'full_gym',
      }));
      setProfileStatus('Perfil cargado.');
    } catch (error) {
      setProfileStatus(`Error de perfil: ${error.message}`);
    } finally {
      setProfileLoading(false);
    }
  }

  async function saveProfile() {
    if (profileLoading) return;
    setProfileLoading(true);
    setProfileStatus('Guardando perfil...');

    try {
      const payload = buildProfilePayload(profile);
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (data.profile) {
        setProfile((prev) => ({
          ...prev,
          preparticipationUpdatedAt: data.profile.preparticipationUpdatedAt || prev.preparticipationUpdatedAt || null,
          screeningRefreshDays: Number.isFinite(Number(data.profile.screeningRefreshDays))
            ? Math.max(15, Math.round(Number(data.profile.screeningRefreshDays)))
            : prev.screeningRefreshDays,
          onboardingCompleted: data.profile.onboardingCompleted === true || data.profile.needsSetup === false,
        }));
      }
      setProfileStatus(`Perfil guardado. Objetivo: ${data.profile.targetMacros?.targetCalories || 'n/d'} kcal`);
      showToast('Perfil actualizado correctamente', 'success');
    } catch (error) {
      setProfileStatus(`Error al guardar perfil: ${error.message}`);
      showToast('Error al guardar perfil', 'error');
    } finally {
      setProfileLoading(false);
    }
  }

  async function completeQuickOnboarding() {
    if (profileLoading) return;
    setProfileLoading(true);
    setProfileStatus('Guardando onboarding inicial...');

    try {
      const payload = buildProfilePayload(profile);
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setProfile((prev) => ({
        ...prev,
        onboardingCompleted: true,
        preparticipationUpdatedAt: data.profile?.preparticipationUpdatedAt || prev.preparticipationUpdatedAt || null,
        screeningRefreshDays: Number.isFinite(Number(data.profile?.screeningRefreshDays))
          ? Math.max(15, Math.round(Number(data.profile.screeningRefreshDays)))
          : prev.screeningRefreshDays,
      }));
      setProfileStatus(`Onboarding completado. Objetivo: ${data.profile.targetMacros?.targetCalories || 'n/d'} kcal`);
    } catch (error) {
      setProfileStatus(`Error guardando onboarding: ${error.message}`);
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadWeeklyPlan() {
    setPlanLoading(true);
    setPlanStatus('Cargando plan...');
    try {
      const data = await apiFetch('/api/weekly-plan?limit=1', { method: 'GET' });
      setWeeklyPlan(data.latestPlan || null);
      const todayIso = buildLocalDateKey();
      const matchingDay = data.latestPlan?.days?.find((day) => day.date === todayIso);
      const persistedDate = selectedDate && data.latestPlan?.days?.some((day) => day.date === selectedDate)
        ? selectedDate
        : null;
      setSelectedDate(matchingDay?.date || persistedDate || data.latestPlan?.startDate || null);
      applyPlanCustomizationState(data.latestPlan || null);
      setPlanStatus(data.latestPlan ? 'Plan semanal activo cargado.' : 'Aún no existe plan semanal.');
    } catch (error) {
      setPlanStatus(`Error cargando plan: ${error.message}`);
    } finally {
      setPlanLoading(false);
    }
  }

  async function generatePlan() {
    if (planLoading) return;
    setPlanLoading(true);
    setPlanStatus('Generando plan semanal...');

    try {
      const data = await apiFetch('/api/weekly-plan', {
        method: 'POST',
        body: JSON.stringify({ startDate: buildLocalNoonIso() }),
      });
      setWeeklyPlan(data.plan);
      const todayIso = buildLocalDateKey();
      const matchingDay = data.plan?.days?.find((day) => day.date === todayIso);
      setSelectedDate(matchingDay?.date || data.plan?.startDate || null);
      applyPlanCustomizationState(data.plan || null);
      setPlanStatus(`Plan generado (${data.plan.startDate} → ${data.plan.endDate}).`);
      showToast('Plan semanal generado', 'success');
    } catch (error) {
      setPlanStatus(`Error al generar plan: ${error.message}`);
      showToast('Error generando plan', 'error');
    } finally {
      setPlanLoading(false);
    }
  }

  async function logout() {
    try {
      if (firebaseClient?.auth && authUser) {
        await signOut(firebaseClient.auth);
      }
    } finally {
      window.location.assign('/?signedOut=1');
    }
  }

  function applyPlateFile(file) {
    if (plateObjectUrlRef.current) {
      URL.revokeObjectURL(plateObjectUrlRef.current);
      plateObjectUrlRef.current = '';
    }

    if (!file) {
      setPlateFile(null);
      setPlatePreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    plateObjectUrlRef.current = objectUrl;
    setPlateFile(file);
    setPlatePreviewUrl(objectUrl);
    setAnalysisStatus('');
  }

  function clearPlateSelection() {
    applyPlateFile(null);
    setAnalysisResult(null);
  }

  async function startCameraCapture() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('Tu navegador no soporta acceso a cámara.');
      return;
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCameraStatus('La cámara requiere HTTPS o localhost.');
      return;
    }

    if (cameraUsageBlockedByPolicy()) {
      setCameraStatus('La cámara está bloqueada por la política del host. Abre Endogym en el dominio principal, no en una vista previa embebida.');
      return;
    }

    if (cameraStreamRef.current) {
      stopCameraCapture();
    }

    setCameraStatus('Iniciando cámara...');
    setCameraOpen(true);

    try {
      const stream = await requestCameraStream(true);
      cameraStreamRef.current = stream;
      await attachStreamToVideo(cameraVideoRef, stream);
      setCameraStatus('Cámara lista. Captura una imagen del plato.');
    } catch (error) {
      stopCameraCapture();
      setCameraStatus(`No se pudo abrir la cámara: ${error.message}`);
    }
  }

  function stopCameraCapture() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause?.();
      cameraVideoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  }

  async function capturePhotoFromCamera() {
    if (!cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraStatus('No se pudo inicializar el lienzo de captura.');
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      setCameraStatus('No se pudo capturar la foto.');
      return;
    }

    const file = new File([blob], `plate-${Date.now()}.jpg`, { type: 'image/jpeg' });
    applyPlateFile(file);
    stopCameraCapture();
    setCameraStatus('Foto capturada. Puedes lanzar análisis IA.');
  }

  async function analyzePlate() {
    if (!plateFile || analysisLoading) return;
    setAnalysisLoading(true);
    setAnalysisStatus('Analizando plato...');
    setAnalysisResult(null);

    try {
      const imageBase64 = await toDataUrl(plateFile);
      const data = await apiFetch('/api/analyze-plate', {
        method: 'POST',
        body: JSON.stringify({
          imageBase64,
          eatenAt: new Date().toISOString(),
          context: {
            dish: plateDish || 'Plato sin descripción',
          },
        }),
      });
      setAnalysisResult(data);
      const adherenceText = data.adherence?.scorePercent != null ? `${data.adherence.scorePercent}%` : 'n/d';
      setAnalysisStatus(`Análisis completado. Adherencia: ${adherenceText}.`);
    } catch (error) {
      setAnalysisStatus(`Error de análisis: ${error.message}`);
    } finally {
      setAnalysisLoading(false);
    }
  }

  function stopBarcodeScanner() {
    if (scannerFrameRef.current) {
      cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = 0;
    }

    if (scannerControlsRef.current?.stop) {
      try {
        scannerControlsRef.current.stop();
      } catch {}
      scannerControlsRef.current = null;
    }

    if (scannerReaderRef.current?.reset) {
      try {
        scannerReaderRef.current.reset();
      } catch {}
      scannerReaderRef.current = null;
    }

    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }

    if (scannerVideoRef.current) {
      scannerVideoRef.current.pause?.();
      scannerVideoRef.current.srcObject = null;
    }

    setBarcodeScanOpen(false);
  }

  async function handleDetectedBarcode(rawValue, sourceLabel = 'escáner') {
    const normalized = normalizeBarcode(rawValue);
    if (!normalized) return false;
    setBarcodeInput(normalized);
    setBarcodeScanStatus(`Código detectado por ${sourceLabel}: ${normalized}`);
    stopBarcodeScanner();
    await lookupBarcode(normalized);
    return true;
  }

  async function loadZxingScanner() {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType, NotFoundException }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);

    return {
      BrowserMultiFormatReader,
      NotFoundException,
      hints,
    };
  }

  async function startBarcodeScannerWithZxing() {
    const { BrowserMultiFormatReader, NotFoundException, hints } = await loadZxingScanner();
    const reader = new BrowserMultiFormatReader(hints);
    scannerReaderRef.current = reader;
    const video = await waitForVideoElement(scannerVideoRef);
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    const controls = await reader.decodeFromConstraints(constraints, video, async (result, error) => {
      if (result?.getText) {
        await handleDetectedBarcode(result.getText(), 'ZXing');
        return;
      }

      if (error && !(error instanceof NotFoundException)) {
        setBarcodeScanStatus(`Lectura en curso: ${error.message || 'sin coincidencia todavía'}`);
      }
    });

    scannerControlsRef.current = controls;
    setBarcodeScanStatus('Escaneando con compatibilidad ampliada...');
  }

  async function scanBarcodeFromImageFile(file) {
    if (!file || barcodeImageLoading) return;
    setBarcodeImageLoading(true);
    setBarcodeScanStatus('Procesando imagen de código...');

    try {
      const { BrowserMultiFormatReader } = await loadZxingScanner();
      const reader = new BrowserMultiFormatReader();
      scannerReaderRef.current = reader;
      const objectUrl = URL.createObjectURL(file);

      try {
        const result = await reader.decodeFromImageUrl(objectUrl);
        await handleDetectedBarcode(result?.getText?.() || '', 'foto');
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (error) {
      setBarcodeScanStatus(`No se pudo leer el código desde la imagen: ${error.message}`);
    } finally {
      setBarcodeImageLoading(false);
      if (barcodeImageInputRef.current) {
        barcodeImageInputRef.current.value = '';
      }
    }
  }

  async function lookupBarcode(rawCode = barcodeInput) {
    const normalizedCode = normalizeBarcode(rawCode);
    if (!normalizedCode) {
      setBarcodeStatus('Código de barras inválido.');
      return null;
    }

    if (barcodeLoading) return null;
    setBarcodeLoading(true);
    setBarcodeStatus('Buscando producto...');
    setBarcodeProduct(null);

    try {
      const data = await apiFetch(`/api/products/barcode?code=${normalizedCode}`, {
        method: 'GET',
      });
      setBarcodeProduct(data.product);
      setBarcodeServingGrams(data.product.defaultServingGrams || 100);
      setBarcodeInput(normalizedCode);
      setBarcodeStatus(`Producto cargado: ${data.product.name}`);
      return data.product;
    } catch (error) {
      setBarcodeStatus(`Error de lookup: ${error.message}`);
      return null;
    } finally {
      setBarcodeLoading(false);
    }
  }

  async function startBarcodeScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeScanStatus('Tu navegador no soporta cámara para escaneo.');
      return;
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setBarcodeScanStatus('El escáner requiere HTTPS o localhost.');
      return;
    }

    if (cameraUsageBlockedByPolicy()) {
      setBarcodeScanStatus('La cámara está bloqueada por la política del host. Usa el dominio principal o sube una foto del código.');
      return;
    }

    if (scannerStreamRef.current || scannerFrameRef.current) {
      stopBarcodeScanner();
    }

    setBarcodeScanStatus('Abriendo cámara para escaneo...');
    setBarcodeScanOpen(true);

    try {
      if (typeof window.BarcodeDetector === 'undefined') {
        await startBarcodeScannerWithZxing();
        return;
      }

      try {
        scannerDetectorRef.current = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
        });
      } catch {
        await startBarcodeScannerWithZxing();
        return;
      }

      const stream = await requestCameraStream(true);

      scannerStreamRef.current = stream;
      await attachStreamToVideo(scannerVideoRef, stream);
      setBarcodeScanStatus('Escaneando código...');

      const scanLoop = async () => {
        if (!scannerDetectorRef.current || !scannerVideoRef.current) {
          return;
        }

        try {
          const detections = await scannerDetectorRef.current.detect(scannerVideoRef.current);
          const match = detections?.find((item) => typeof item?.rawValue === 'string' && item.rawValue.trim());
          if (match?.rawValue) {
            if (await handleDetectedBarcode(match.rawValue, 'escáner nativo')) {
              return;
            }
          }
        } catch {
          // Ignore frame-level detector errors while the stream is active.
        }

        scannerFrameRef.current = requestAnimationFrame(scanLoop);
      };

      scannerFrameRef.current = requestAnimationFrame(scanLoop);
    } catch (error) {
      if (typeof window.BarcodeDetector !== 'undefined') {
        try {
          await startBarcodeScannerWithZxing();
          return;
        } catch {}
      }
      setBarcodeScanStatus(`No se pudo abrir cámara para escaneo: ${error.message}`);
      stopBarcodeScanner();
    }
  }

  function buildScaledProductNutrition(product, servingGrams) {
    const baseServing = Math.max(1, toNumber(product?.defaultServingGrams, 100));
    const targetServing = Math.max(1, toNumber(servingGrams, baseServing));
    const factor = targetServing / baseServing;
    const base = product?.nutritionPerServing || {};

    const proteinGrams = Number((toNumber(base.proteinGrams, 0) * factor).toFixed(2));
    const carbsGrams = Number((toNumber(base.carbsGrams, 0) * factor).toFixed(2));
    const fatGrams = Number((toNumber(base.fatGrams, 0) * factor).toFixed(2));
    const availableCarbsGrams = Math.max(
      0,
      Number((toNumber(product?.availableCarbsPerServing, carbsGrams) * factor).toFixed(2))
    );
    const calories = Math.round(calculateCalories({ proteinGrams, carbsGrams, fatGrams }));
    const glycemicIndex = clamp(Math.round(toNumber(product?.glycemic?.indexEstimate, 50)), 0, 100);
    const processedLevel = clamp(Math.round(toNumber(product?.quality?.novaGroup, 1)), 0, 4);
    const gl = Number(glycemicLoad(glycemicIndex, availableCarbsGrams).toFixed(2));
    const insulinIndex = estimateInsulinIndex({
      gl,
      proteinGrams,
      processedLevel,
    });

    return {
      servingGrams: targetServing,
      food: {
        name: product?.name || 'Producto comercial',
        calories,
        proteinGrams,
        carbsGrams,
        fatGrams,
        availableCarbsGrams,
        glycemicIndex,
        processedLevel,
      },
      totals: {
        calories,
        proteinGrams,
        carbsGrams,
        fatGrams,
        glycemicLoad: gl,
        insulinIndex,
      },
    };
  }

  async function addBarcodeProductToMeals() {
    if (!barcodeProduct || barcodeLoading) return;
    setBarcodeLoading(true);
    setBarcodeStatus('Guardando producto en historial nutricional...');

    try {
      const scaled = buildScaledProductNutrition(barcodeProduct, barcodeServingGrams);
      await apiFetch('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          foods: [scaled.food],
          totals: scaled.totals,
          eatenAt: new Date().toISOString(),
          source: 'barcode',
          planId: weeklyPlan?.id ?? null,
          context: {
            barcode: barcodeProduct.barcode,
            servingGrams: scaled.servingGrams,
          },
        }),
      });
      setBarcodeStatus('Producto añadido al registro nutricional.');
    } catch (error) {
      setBarcodeStatus(`No se pudo guardar el producto: ${error.message}`);
    } finally {
      setBarcodeLoading(false);
    }
  }

  async function saveCalculatorMeal() {
    if (calculatorSaving) return;
    setCalculatorSaving(true);
    setCalculatorStatus('Guardando cálculo en historial...');

    try {
      const proteinGrams = Math.max(0, toNumber(calculatorInput.proteinGrams, 0));
      const carbsGrams = Math.max(0, toNumber(calculatorInput.carbsGrams, 0));
      const fatGrams = Math.max(0, toNumber(calculatorInput.fatGrams, 0));
      const availableCarbsGrams = Math.max(0, toNumber(calculatorInput.availableCarbsGrams, carbsGrams));
      const glycemicIndex = clamp(Math.round(toNumber(calculatorInput.glycemicIndex, 50)), 0, 100);
      const processedLevel = clamp(Math.round(toNumber(calculatorInput.processedLevel, 1)), 0, 4);
      const calories = Math.round(calculateCalories({ proteinGrams, carbsGrams, fatGrams }));
      const gl = Number(glycemicLoad(glycemicIndex, availableCarbsGrams).toFixed(2));
      const insulinIndex = estimateInsulinIndex({ gl, proteinGrams, processedLevel });

      await apiFetch('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          foods: [
            {
              name: calculatorInput.foodName?.trim() || 'Registro manual',
              calories,
              proteinGrams,
              carbsGrams,
              fatGrams,
              availableCarbsGrams,
              glycemicIndex,
              processedLevel,
            },
          ],
          totals: {
            calories,
            proteinGrams,
            carbsGrams,
            fatGrams,
            glycemicLoad: gl,
            insulinIndex,
          },
          eatenAt: new Date().toISOString(),
          source: 'calculator',
          planId: weeklyPlan?.id ?? null,
        }),
      });
      setCalculatorStatus('Registro nutricional guardado.');
    } catch (error) {
      setCalculatorStatus(`Error guardando cálculo: ${error.message}`);
    } finally {
      setCalculatorSaving(false);
    }
  }

  async function registerWorkoutCheckin() {
    if (workoutLoading) return;
    setWorkoutLoading(true);
    setWorkoutStatus('Registrando sesión...');

    try {
      await apiFetch('/api/workouts', {
        method: 'POST',
        body: JSON.stringify({
          title: workoutCheckin.title || 'Sesión',
          mode: workoutCheckin.mode || profile.trainingModality || 'full_gym',
          performedAt: new Date().toISOString(),
          durationMinutes: toNumber(workoutCheckin.durationMinutes, 45),
          sessionRpe: toNumber(workoutCheckin.sessionRpe, 6),
          fatigue: toNumber(workoutCheckin.fatigue, 4),
          sleepHours: toNumber(workoutCheckin.sleepHours, 7),
          completed: toBoolean(workoutCheckin.completed, true),
          notes: workoutCheckin.notes || '',
          planId: weeklyPlan?.id ?? null,
        }),
      });
      setWorkoutStatus('Sesión registrada. Ya se usará en la adaptación automática del próximo plan.');
    } catch (error) {
      setWorkoutStatus(`Error registrando sesión: ${error.message}`);
    } finally {
      setWorkoutLoading(false);
    }
  }

  async function registerMetricsCheckin() {
    if (metricLoading) return;
    setMetricLoading(true);
    setMetricStatus('Registrando métricas...');

    try {
      await apiFetch('/api/metrics', {
        method: 'POST',
        body: JSON.stringify({
          takenAt: new Date().toISOString(),
          weightKg: toNumber(metricInput.weightKg, null),
          waistCm: toNumber(metricInput.waistCm, null),
          fastingGlucoseMgDl: toNumber(metricInput.fastingGlucoseMgDl, null),
          notes: metricInput.notes || '',
        }),
      });
      setMetricStatus('Métricas registradas. Se usarán en el próximo ajuste automático.');
    } catch (error) {
      setMetricStatus(`Error registrando métricas: ${error.message}`);
    } finally {
      setMetricLoading(false);
    }
  }

  async function savePrivacyPreferences() {
    if (privacyLoading) return;
    setPrivacyLoading(true);
    setPrivacyStatus('Guardando preferencias de privacidad...');

    try {
      const payload = {
        legalConsents: {
          termsAccepted: toBoolean(profile.legalConsents?.termsAccepted, false),
          privacyAccepted: toBoolean(profile.legalConsents?.privacyAccepted, false),
          dataProcessingAccepted: toBoolean(profile.legalConsents?.dataProcessingAccepted, false),
          marketingAccepted: toBoolean(profile.legalConsents?.marketingAccepted, false),
          consentVersion: profile.legalConsents?.consentVersion || '2026-04-02',
          acceptedAt: profile.legalConsents?.acceptedAt || new Date().toISOString(),
        },
      };
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (data.profile?.legalConsents) {
        setProfile((prev) => ({
          ...prev,
          legalConsents: data.profile.legalConsents,
        }));
      }
      setPrivacyStatus('Preferencias de privacidad actualizadas.');
    } catch (error) {
      setPrivacyStatus(`Error guardando privacidad: ${error.message}`);
    } finally {
      setPrivacyLoading(false);
    }
  }

  async function exportAccountData() {
    if (privacyLoading) return;
    setPrivacyLoading(true);
    setPrivacyStatus('Preparando exportación de datos...');

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/account/export', {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const data = await safeJson(response);
        throw new Error(data.error || 'No se pudo exportar tu cuenta.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `endogym-export-${new Date().toISOString().slice(0, 10)}.json`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPrivacyStatus('Exportación completada. Archivo descargado.');
    } catch (error) {
      setPrivacyStatus(`Error exportando datos: ${error.message}`);
    } finally {
      setPrivacyLoading(false);
    }
  }

  async function deleteMyAccount() {
    if (deleteLoading) return;
    if (deleteConfirmText.trim() !== 'ELIMINAR MI CUENTA') {
      setPrivacyStatus('Debes escribir exactamente "ELIMINAR MI CUENTA" para confirmar.');
      return;
    }

    setDeleteLoading(true);
    setPrivacyStatus('Eliminando cuenta y datos...');

    try {
      await apiFetch('/api/account/delete', {
        method: 'DELETE',
        body: JSON.stringify({ confirmText: deleteConfirmText.trim() }),
      });

      if (!devAuthMode && firebaseClient?.auth && authUser) {
        await signOut(firebaseClient.auth);
      }

      setDeleteConfirmText('');
      setPrivacyStatus('Cuenta eliminada correctamente. Redirigiendo al inicio...');
      window.location.href = '/';
    } catch (error) {
      setPrivacyStatus(`Error eliminando cuenta: ${error.message}`);
    } finally {
      setDeleteLoading(false);
    }
  }

  const basePlannedDays = useMemo(() => {
    const sourceDays = Array.isArray(weeklyPlan?.days) ? weeklyPlan.days : [];
    if (!sourceDays.length) return [];

    return sourceDays.map((day, index) => {
      if (!day?.workout) return day;

      const sessionFocus =
        day.sessionFocus
        || day.workout?.sessionFocus
        || resolveSessionFocus({
          modality: weeklyPlan?.trainingModality || profile.trainingModality,
          sessionType: day.sessionType,
          sessionTitle: day.workout?.title || '',
        });

      const exercises = Array.isArray(day.workout.exercises) ? day.workout.exercises : [];
      const shouldRepairFocus =
        exercises.length > 0
        && exercises.some((exercise) =>
          !isExerciseCompatibleWithSessionFocus(exercise, {
            sessionType: day.sessionType,
            sessionFocus,
          })
        );

      const repairedExercises = shouldRepairFocus
        ? buildSessionExercises({
          modality: weeklyPlan?.trainingModality || profile.trainingModality,
          sessionType: day.sessionType,
          sessionTitle: day.workout?.title || '',
          sessionFocus,
          goal: profile.goal,
          profile,
          adaptiveTuning: weeklyPlan?.adaptiveTuning || null,
          daySeed: index,
        })
        : exercises;

      return {
        ...day,
        sessionFocus,
        workout: {
          ...day.workout,
          sessionFocus,
          focusRepairApplied: shouldRepairFocus || day.workout?.focusRepairApplied || false,
          exercises: repairedExercises,
        },
      };
    });
  }, [weeklyPlan, profile]);
  const plannedDays = useMemo(() => {
    if (!basePlannedDays.length) return [];

    return basePlannedDays.map((day) => {
      const sessionOverride = getDaySessionOverride(day.date);
      if (!sessionOverride?.workout) return day;

      return {
        ...day,
        sessionFocus: sessionOverride.sessionFocus || day.sessionFocus,
        workout: {
          ...day.workout,
          ...sessionOverride.workout,
          sessionFocus: sessionOverride.sessionFocus || day.sessionFocus,
          sessionOverrideApplied: true,
          originalTitle: day.workout?.title || null,
          overrideDescriptor: sessionOverride.descriptor || null,
          overrideCompatibilityNote: sessionOverride.compatibilityNote || null,
        },
      };
    });
  }, [basePlannedDays, sessionSwapState]);
  const selectedDay = plannedDays.find((day) => day.date === selectedDate) || plannedDays[0] || null;
  const selectedDayExercises = useMemo(() => {
    if (!selectedDay || !Array.isArray(selectedDay?.workout?.exercises)) return [];

    const dayOverrides = getDayOverrideMap(selectedDay.date);
    return selectedDay.workout.exercises.map((exercise, index) => {
      const normalized = normalizeExerciseForView(exercise, index);
      const exerciseKey = buildSwapKey(normalized, index);
      const replacement = dayOverrides[exerciseKey];

      if (!replacement) {
        return {
          ...normalized,
          _swapKey: exerciseKey,
          _replaced: false,
        };
      }

      return {
        ...replacement,
        _swapKey: exerciseKey,
        _replaced: true,
        _originalExercise: normalized,
      };
    });
  }, [selectedDay, exerciseSwapState]);
  const activeExercise = selectedDayExercises.find((exercise) => exercise._swapKey === selectedExerciseKey)
    || selectedDayExercises[0]
    || null;
  const activeExerciseIndex = activeExercise
    ? selectedDayExercises.findIndex((exercise) => exercise._swapKey === activeExercise._swapKey)
    : -1;
  const activeExerciseSwapOpen = Boolean(
    activeExercise
    && selectedDay
    && openSwapTarget?.dayDate === selectedDay.date
    && openSwapTarget?.exerciseKey === activeExercise._swapKey
  );
  const activeExerciseSwapOptions = activeExerciseSwapOpen ? (openSwapTarget?.options || []) : [];
  const selectedDaySessionSwapOptions = useMemo(() => {
    if (!selectedDay || !plannedDays.length) return [];

    const dayIndex = plannedDays.findIndex((day) => day.date === selectedDay.date);
    if (dayIndex < 0) return [];

    return suggestSessionAlternativesByDay({
      days: plannedDays,
      dayIndex,
      profile,
      adaptiveTuning: weeklyPlan?.adaptiveTuning || null,
      limit: 5,
    });
  }, [selectedDay, plannedDays, profile, weeklyPlan?.adaptiveTuning]);
  const selectedDayMusclePreview = useMemo(
    () => summarizeWorkoutMuscles(selectedDayExercises, 4),
    [selectedDayExercises]
  );
  const selectedDayExercisePreview = useMemo(
    () => summarizeWorkoutPreview(selectedDayExercises, 3),
    [selectedDayExercises]
  );
  const selectedDaySessionOverride = selectedDay ? getDaySessionOverride(selectedDay.date) : null;
  const selectedDayFocusLabel = SESSION_FOCUS_LABELS[selectedDay?.sessionFocus] || selectedDay?.sessionFocus || 'Sesión';
  useEffect(() => {
    if (!selectedDay || !selectedDayExercises.length) {
      setSelectedExerciseKey(null);
      return;
    }

    const currentExists = selectedDayExercises.some((exercise) => exercise._swapKey === selectedExerciseKey);
    if (!currentExists) {
      setSelectedExerciseKey(selectedDayExercises[0]._swapKey);
    }
  }, [selectedDay, selectedDayExercises, selectedExerciseKey]);
  useEffect(() => {
    setSessionSwapOpen(false);
  }, [selectedDate]);
  const weeklyMeals = Array.isArray(weeklyPlan?.nutritionPlan?.days)
    ? weeklyPlan.nutritionPlan.days.reduce((total, day) => total + (Array.isArray(day.meals) ? day.meals.length : 0), 0)
    : 0;
  const weeklyCaloriesTotal = plannedDays.reduce((total, day) => total + (Number(day.nutritionTarget?.calories) || 0), 0);
  const weeklyMinutesTotal = plannedDays.reduce((total, day) => total + (Number(day.workout?.durationMinutes) || 0), 0);
  const nutritionDays = Array.isArray(weeklyPlan?.nutritionPlan?.days) ? weeklyPlan.nutritionPlan.days : [];
  const nutritionRestrictionCount = useMemo(() => {
    const restrictions = weeklyPlan?.nutritionPlan?.restrictionsApplied || {};
    return ['allergies', 'intolerances', 'dislikedFoods']
      .reduce((total, key) => total + (Array.isArray(restrictions[key]) ? restrictions[key].length : 0), 0);
  }, [weeklyPlan?.nutritionPlan?.restrictionsApplied]);
  const nutritionRestrictionTags = useMemo(() => {
    const restrictions = weeklyPlan?.nutritionPlan?.restrictionsApplied || {};
    return [
      ...(Array.isArray(restrictions.allergies) ? restrictions.allergies.map((value) => `Alergia: ${value}`) : []),
      ...(Array.isArray(restrictions.intolerances) ? restrictions.intolerances.map((value) => `Intolerancia: ${value}`) : []),
      ...(Array.isArray(restrictions.dislikedFoods) ? restrictions.dislikedFoods.map((value) => `Excluir: ${value}`) : []),
    ];
  }, [weeklyPlan?.nutritionPlan?.restrictionsApplied]);
  const nutritionSelectedDay = nutritionDays.find((day) => day.date === selectedDate) || nutritionDays[0] || null;
  const nutritionFocusMeals = Array.isArray(nutritionSelectedDay?.meals) ? nutritionSelectedDay.meals : [];
  const nutritionFocusCalories = nutritionFocusMeals.reduce(
    (total, meal) => total + (Number(meal.target?.calories) || 0),
    0
  );
  const averageNutritionKcal = nutritionDays.length
    ? Math.round(
      nutritionDays.reduce((total, day) => (
        total + (Array.isArray(day.meals)
          ? day.meals.reduce((mealTotal, meal) => mealTotal + (Number(meal.target?.calories) || 0), 0)
          : 0)
      ), 0) / nutritionDays.length
    )
    : 0;
  const hasBaseData =
    Boolean(String(profile.displayName || '').trim())
    || Boolean(profile.preparticipationUpdatedAt)
    || Number(toNumber(profile.weightKg, 75)) !== 75
    || Number(toNumber(profile.heightCm, 175)) !== 175
    || Number(toNumber(profile.age, 30)) !== 30
    || Boolean(profile.targetCalories)
    || Boolean(weeklyPlan);
  const needsOnboarding = profile.onboardingCompleted !== true && !hasBaseData;
  const screeningRefreshDays = Math.max(15, Math.round(toNumber(profile.screeningRefreshDays, 15) || 15));
  const screeningLastUpdateDate = profile.preparticipationUpdatedAt ? new Date(profile.preparticipationUpdatedAt) : null;
  const hasValidScreeningDate = Boolean(
    screeningLastUpdateDate && !Number.isNaN(screeningLastUpdateDate.getTime())
  );
  const screeningAgeDays = hasValidScreeningDate
    ? Math.max(0, Math.floor((Date.now() - screeningLastUpdateDate.getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  const needsScreeningRefresh = screeningAgeDays == null || screeningAgeDays >= screeningRefreshDays;
  const screeningDaysRemaining = screeningAgeDays == null
    ? 0
    : Math.max(0, screeningRefreshDays - screeningAgeDays);
  const aiAdjustmentReasons = Array.isArray(weeklyPlan?.adaptiveTuning?.appliedRules)
    ? weeklyPlan.adaptiveTuning.appliedRules.slice(0, 2)
    : [];
  const dashboardPlanDays = plannedDays.slice(0, 3);
  const dashboardFocusDay = selectedDay || plannedDays[0] || null;
  const readinessScore = clamp(Math.round(toNumber(weeklyPlan?.progressMemory?.readinessScore, 0) || 0), 0, 100);
  const completionPercent = clamp(
    Math.round((toNumber(weeklyPlan?.progressMemory?.metrics?.completionRate, 0) || 0) * 100),
    0,
    100
  );
  const nutritionAdherencePercent = clamp(
    Math.round(toNumber(weeklyPlan?.progressMemory?.metrics?.avgNutritionAdherence, 0) || 0),
    0,
    100
  );
  const fatigueAverage = toNumber(weeklyPlan?.progressMemory?.metrics?.avgFatigue, null);
  const coachAdjustments = Array.isArray(weeklyPlan?.coachPlan?.prescriptionAdjustments)
    ? weeklyPlan.coachPlan.prescriptionAdjustments.slice(0, 3)
    : [];
  const selectedDayCoachAdjustment = useMemo(
    () => findCoachAdjustmentForDay(weeklyPlan?.coachPlan?.prescriptionAdjustments || [], selectedDay),
    [selectedDay, weeklyPlan?.coachPlan?.prescriptionAdjustments]
  );
  const weeklySessionCount = plannedDays.length;
  const weeklyMealsCount = weeklyMeals || 0;
  const weeklyKcal = weeklyCaloriesTotal || 0;
  const coachStatusMode = weeklyPlan?.coachSource === 'gemini'
    ? 'live'
    : weeklyPlan?.coachMeta?.failureCode
      ? 'fallback'
      : 'heuristic';
  const coachStatusLabel = coachStatusMode === 'live'
    ? 'Gemini en vivo'
    : coachStatusMode === 'fallback'
      ? 'Fallback ACSM'
      : 'Heurística ACSM';
  const coachStatusDetail = coachStatusMode === 'live'
    ? [
      weeklyPlan?.coachMeta?.backend === 'vertex' ? 'Vertex AI' : weeklyPlan?.coachMeta?.backend === 'gemini' ? 'Gemini API' : null,
      weeklyPlan?.coachMeta?.modelResolved || weeklyPlan?.coachMeta?.modelRequested || null,
      weeklyPlan?.coachMeta?.attempts ? `${weeklyPlan.coachMeta.attempts} intento(s)` : null,
    ].filter(Boolean).join(' · ')
    : weeklyPlan?.coachWarning
      || weeklyPlan?.coachMeta?.failureMessage
      || 'No se recibió respuesta clínicamente utilizable del modelo.';
  const coachGeneratedLabel = formatDateTimeLabel(weeklyPlan?.coachMeta?.generatedAt);
  const dailyCoachHeadline = selectedDayCoachAdjustment?.adjustment
    || weeklyPlan?.coachPlan?.coachSummary
    || (coachStatusMode === 'live'
      ? 'Plan semanal ajustado por IA.'
      : 'El plan cargado no trae una salida valida de Gemini.');
  const dailyCoachSupportingText = selectedDayCoachAdjustment?.rationale
    || selectedDayCoachAdjustment?.evidence
    || coachStatusDetail;
  const barcodeScaledNutrition = useMemo(() => {
    if (!barcodeProduct) return null;
    return buildScaledProductNutrition(barcodeProduct, barcodeServingGrams);
  }, [barcodeProduct, barcodeServingGrams]);
  const analysisModelMode = analysisResult?.model?.mode || (analysisResult?.model?.source === 'gemini' ? 'live' : null);
  const analysisModelLabel = analysisModelMode === 'live'
    ? 'Gemini en vivo'
    : analysisModelMode === 'fallback'
      ? 'Fallback heurístico'
      : analysisResult?.model?.source
        ? capitalize(String(analysisResult.model.source))
        : 'Sin motor';
  const analysisModelDetail = [
    analysisResult?.model?.backend === 'vertex' ? 'Vertex AI' : analysisResult?.model?.backend === 'gemini' ? 'Gemini API' : null,
    analysisResult?.model?.modelResolved || analysisResult?.model?.requestedModel || null,
    analysisResult?.warning || null,
  ].filter(Boolean).join(' · ');
  const analysisNotes = Array.isArray(analysisResult?.analysis?.notes)
    ? analysisResult.analysis.notes.filter(Boolean).slice(0, 4)
    : [];

  const calculatorPreview = useMemo(() => {
    const proteinGrams = Math.max(0, toNumber(calculatorInput.proteinGrams, 0));
    const carbsGrams = Math.max(0, toNumber(calculatorInput.carbsGrams, 0));
    const fatGrams = Math.max(0, toNumber(calculatorInput.fatGrams, 0));
    const availableCarbsGrams = Math.max(0, toNumber(calculatorInput.availableCarbsGrams, carbsGrams));
    const glycemicIndex = clamp(Math.round(toNumber(calculatorInput.glycemicIndex, 50)), 0, 100);
    const processedLevel = clamp(Math.round(toNumber(calculatorInput.processedLevel, 1)), 0, 4);
    const calories = Math.round(calculateCalories({ proteinGrams, carbsGrams, fatGrams }));
    const gl = Number(glycemicLoad(glycemicIndex, availableCarbsGrams).toFixed(2));
    const insulinIndex = estimateInsulinIndex({ gl, proteinGrams, processedLevel });

    return {
      calories,
      gl,
      glCategory: classifyGlycemicLoad(gl),
      insulinIndex,
      proteinGrams,
      carbsGrams,
      fatGrams,
      availableCarbsGrams,
      glycemicIndex,
      processedLevel,
    };
  }, [calculatorInput]);

  const nutritionPatternValue = weeklyPlan?.nutritionPlan?.dietaryPattern || profile.nutritionPreferences?.dietaryPattern || 'omnivore';
  const nutritionPatternLabel = DIETARY_PATTERN_LABELS[nutritionPatternValue] || nutritionPatternValue;
  const exerciseLibraryCatalog = useMemo(() => getExerciseLibraryCatalog(), []);
  const exerciseLibraryAuditSchema = useMemo(() => getExerciseLibraryAuditSchema(), []);
  const activeExerciseLibraryCatalog = libraryImportedCatalog || exerciseLibraryCatalog;
  const activeExerciseLibraryValidation = useMemo(
    () => validateExerciseLibraryAuditCatalog(activeExerciseLibraryCatalog),
    [activeExerciseLibraryCatalog]
  );
  const deferredLibrarySearch = useDeferredValue(librarySearch.trim().toLowerCase());
  const libraryCategories = useMemo(
    () => Array.from(new Set(activeExerciseLibraryCatalog.map((exercise) => exercise.category))).sort(),
    [activeExerciseLibraryCatalog]
  );
  const filteredExerciseCatalog = useMemo(() => (
    activeExerciseLibraryCatalog.filter((exercise) => {
      const matchesSearch = !deferredLibrarySearch
        || [
          exercise.name,
          exercise.equipment,
          ...(exercise.primaryMuscles || []),
          ...(exercise.secondaryMuscles || []),
          ...(exercise.progressions || []),
          ...(exercise.regressions || []),
          ...(exercise.contraindications || []),
        ].join(' ').toLowerCase().includes(deferredLibrarySearch);
      const matchesModality = libraryModalityFilter === 'all' || exercise.modalities.includes(libraryModalityFilter);
      const matchesCategory = libraryCategoryFilter === 'all' || exercise.category === libraryCategoryFilter;
      return matchesSearch && matchesModality && matchesCategory;
    })
  ), [activeExerciseLibraryCatalog, deferredLibrarySearch, libraryModalityFilter, libraryCategoryFilter]);
  const librarySpotlightCards = useMemo(
    () => Object.entries(MODALITY_SPOTLIGHTS).map(([modality, config]) => {
      const exercises = activeExerciseLibraryCatalog.filter((exercise) => exercise.modalities.includes(modality));
      const highlighted = config.signatureIds
        .map((id) => exercises.find((exercise) => exercise.id === id))
        .filter(Boolean);
      const totalProgressions = exercises.reduce((total, exercise) => total + (exercise.progressions?.length || 0), 0);
      return {
        modality,
        ...config,
        count: exercises.length,
        highlighted,
        totalProgressions,
      };
    }),
    [activeExerciseLibraryCatalog]
  );

  const handleLibraryExportJson = () => {
    downloadTextFile(
      'endogym-exercise-catalog.json',
      exportExerciseLibraryCatalogJson(activeExerciseLibraryCatalog),
      'application/json;charset=utf-8'
    );
    setLibraryAuditStatus((current) => ({
      ...current,
      type: current.errors.length ? current.type : 'success',
      message: current.errors.length ? current.message : 'Catálogo exportado en JSON para edición o auditoría.',
    }));
  };

  const handleLibraryExportCsv = () => {
    downloadTextFile(
      'endogym-exercise-catalog.csv',
      exportExerciseLibraryCatalogCsv(activeExerciseLibraryCatalog),
      'text/csv;charset=utf-8'
    );
    setLibraryAuditStatus((current) => ({
      ...current,
      type: current.errors.length ? current.type : 'success',
      message: current.errors.length ? current.message : 'Catálogo exportado en CSV para revisión masiva.',
    }));
  };

  const handleLibraryImportClick = () => {
    libraryFileInputRef.current?.click();
  };

  const handleLibraryResetAudit = () => {
    setLibraryImportedCatalog(null);
    setLibraryAuditStatus({
      type: 'neutral',
      message: 'Auditoría reiniciada. Se está usando la base interna validada.',
      errors: [],
      warnings: [],
      fileName: '',
      format: 'built-in',
    });
  };

  const handleLibraryImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = parseExerciseLibraryAuditText(text);
      setLibraryImportedCatalog(result.catalog);
      setLibraryAuditStatus({
        type: result.validation.valid ? 'success' : 'error',
        message: result.validation.valid
          ? 'Archivo cargado y validado. Ahora la auditoría muestra ese catálogo importado.'
          : `Archivo cargado con ${result.validation.errors.length} errores de schema. Revísalo antes de usarlo como fuente real.`,
        errors: result.validation.errors,
        warnings: result.validation.warnings,
        fileName: file.name,
        format: result.format,
      });
      setLibraryCategoryFilter('all');
      setLibraryModalityFilter('all');
      setLibrarySearch('');
    } catch (error) {
      setLibraryAuditStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo importar el archivo.',
        errors: [],
        warnings: [],
        fileName: file.name,
        format: 'unknown',
      });
    } finally {
      event.target.value = '';
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Inicio', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
    { id: 'user', label: 'Perfil', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { id: 'daily', label: 'Hoy', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
    { id: 'weekly', label: 'Semana', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { id: 'library', label: 'Biblioteca', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
    { id: 'nutrition', label: 'Nutrición', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg> },
  ];
  const activeTabMeta = {
    dashboard: {
      eyebrow: 'Panel de rendimiento',
      title: 'Tu día en una vista',
      description: 'Entrena, registra y ajusta.',
      context: dashboardFocusDay
        ? `${formatDayNameFromIso(dashboardFocusDay.date)} · ${dashboardFocusDay.workout?.title || 'Sesión'} · ${dashboardFocusDay.workout?.durationMinutes || 0} min`
        : 'Genera tu semana para activar métricas, rutina y nutrición.',
    },
    user: {
      eyebrow: 'Perfil y control',
      title: needsOnboarding ? 'Configura tu base' : 'Tu perfil operativo',
      description: needsOnboarding
        ? 'Completa el setup inicial y deja de repetir datos en cada sesión.'
        : 'Biometría, cribado, consentimiento y ajustes personales en un solo sitio.',
      context: hasValidScreeningDate
        ? `Cribado vigente · ${screeningDaysRemaining} días restantes`
        : 'Cribado pendiente de actualización.',
    },
    daily: {
      eyebrow: 'Sesión del día',
      title: 'Plan diario',
      description: 'Técnica, carga y sustituciones rápidas sin perder la lógica del plan.',
      context: selectedDay
        ? `${formatDayNameFromIso(selectedDay.date)} · ${selectedDay.workout?.title || 'Sesión'} · ${selectedDay.workout?.intensityRpe || 'RPE n/d'}`
        : 'Genera tu semana para desbloquear la sesión diaria.',
    },
    weekly: {
      eyebrow: 'Plan semanal',
      title: 'Semana completa',
      description: 'Calendario, alertas y volumen total de la semana en una sola vista.',
      context: weeklyPlan
        ? `${plannedDays.length} días · ${weeklyMinutesTotal || 0} min · ${weeklyCaloriesTotal || 0} kcal`
        : 'Aún no hay una semana cargada.',
    },
    library: {
      eyebrow: 'Base de ejercicios',
      title: 'Biblioteca auditada',
      description: 'Revisa cobertura por modalidad, técnica, músculos y schema del catálogo.',
      context: `${filteredExerciseCatalog.length} visibles · ${activeExerciseLibraryCatalog.length} totales`,
    },
    nutrition: {
      eyebrow: 'Nutrición inteligente',
      title: 'Plan nutricional',
      description: 'Escaneo, análisis IA y control diario con menos fricción.',
      context: `${nutritionDays.length || 0} días · ${weeklyMeals || 0} comidas · ${averageNutritionKcal || 0} kcal promedio`,
    },
  }[activeTab] || {
    eyebrow: 'Endogym',
    title: 'Panel',
    description: 'Control integral de entrenamiento y nutrición.',
    context: 'Vista activa.',
  };
  const topbarExpanded = activeTab === 'dashboard';

  if (!authReady) {
    return (
      <main className="app-shell">
        <div className="loading-shell">
          <div className="skeleton" style={{ height: '3rem', width: '160px' }} />
          <div className="skeleton skeleton-line long" />
          <div className="skeleton skeleton-line short" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginTop: '0.8rem' }}>
            <div className="skeleton skeleton-block" />
            <div className="skeleton skeleton-block" />
            <div className="skeleton skeleton-block" />
            <div className="skeleton skeleton-block" />
          </div>
        </div>
      </main>
    );
  }

  if (!devAuthMode && !authUser) {
    return (
      <main className="app-shell">
        <div className="loading-shell">
          <div className="skeleton" style={{ height: '3rem', width: '160px' }} />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell-dashboard">
      <header className={`topbar ${topbarExpanded ? 'is-expanded' : 'is-compact'}`}>
        <div className="topbar-main">
          <div className="topbar-brand">
            <Image src="/brand/canva/logo-canva-crop.png" alt="Endogym" width={215} height={90} priority />
          </div>
          <p className="eyebrow">{activeTabMeta.eyebrow}</p>
          <h1>{activeTabMeta.title}</h1>
          <p>{activeTabMeta.description}</p>
          {activeTabMeta.context ? <p className="topbar-context">{activeTabMeta.context}</p> : null}
        </div>
        <div className="status-row">
          <span className="chip">
            {devAuthMode
              ? 'Modo demo'
              : authConfigMissing
                ? 'Configurar Firebase'
                : authUser
                  ? <><span className="signal-dot" /> Activo</>
                  : 'Sin sesión'}
          </span>
          <span className="chip subtle">{weeklyPlan ? <><span className="signal-dot" /> Plan activo</> : 'Sin plan'}</span>
          <span className="chip subtle">{MODALITY_LABELS[profile.trainingModality] || 'Sin modalidad'}</span>
          {weeklyPlan && plannedDays.length > 0 ? (
            <span className="streak-badge">
              <span className="streak-flame">🔥</span>
              {plannedDays.length} sesiones
            </span>
          ) : null}
        </div>
        {topbarExpanded ? (
          <>
            <div className="topbar-visual" aria-hidden="true">
              <Image src="/brand/canva/dashboard-canva-alt.png" alt="" width={250} height={312} />
            </div>
            <section className="kpi-strip" aria-label="Resumen rápido">
              <article className="kpi">
                <span>Objetivo</span>
                <strong>{GOAL_LABELS[profile.goal] || profile.goal || 'No definido'}</strong>
              </article>
              <article className="kpi">
                <span>Perfil metabólico</span>
                <strong>{METABOLIC_LABELS[profile.metabolicProfile] || 'No definido'}</strong>
              </article>
              <article className="kpi">
                <span>Sesiones semanales</span>
                <strong>{plannedDays.length || 0}</strong>
              </article>
              <article className="kpi">
                <span>Comidas planificadas</span>
                <strong>{weeklyMeals || 0}</strong>
              </article>
            </section>
            <section className="media-strip" aria-label="Vista visual del sistema">
              <article className="media-tile">
                <Image src="/brand/canva/dashboard-canva-alt.png" alt="Analítica de progreso" width={180} height={225} />
              </article>
              <article className="media-tile">
                <Image src="/brand/canva/hero-canva-clean.png" alt="Integración fitness y nutrición" width={180} height={67} />
              </article>
              <article className="media-tile">
                <Image src="/brand/canva/logo-canva-crop.png" alt="Marca Endogym" width={180} height={75} />
              </article>
            </section>
          </>
        ) : null}
      </header>

      {devAuthMode ? (
        <section className="notice">
          <strong>Modo demo activo</strong>
          <small>Firebase Client no configurado. Se usa un usuario de desarrollo para navegar la app.</small>
        </section>
      ) : null}

      {authConfigMissing ? (
        <section className="notice">
          <strong>Configura Firebase público</strong>
          <small>Faltan variables `NEXT_PUBLIC_FIREBASE_*` para iniciar sesión y sincronizar datos reales en producción.</small>
        </section>
      ) : null}

      <section className="app-body">
        <aside className="side-nav" aria-label="Navegación de vistas">
          <p className="side-nav-title">Navegación</p>
          <div className="side-nav-list" role="tablist" aria-label="Secciones del dashboard">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="nav-icon" aria-hidden="true">
                  {tab.icon}
                </span>
                <span className="nav-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="main-content">
          <section
            className={`workspace ${activeTab === 'user' ? 'workspace-user' : ''}`}
            style={{ display: activeTab === 'dashboard' || activeTab === 'user' ? 'grid' : 'none' }}
          >
        <section className="primary-column" style={{ display: activeTab === 'dashboard' || activeTab === 'user' ? 'grid' : 'none' }}>
          {activeTab === 'dashboard' ? (
            <section className="panel dashboard-hub">
              <article className="dashboard-hero-card">
                <div className="dashboard-hero-media">
                  <Image src="/brand/canva/dashboard-canva.png" alt="Panel visual Endogym" width={420} height={420} priority />
                </div>
                <div className="dashboard-hero-copy">
                  <p className="dashboard-eyebrow">Inicio visual</p>
                  <h2>{GOAL_LABELS[profile.goal] || profile.goal || 'Tu objetivo'}</h2>
                  <div className="dashboard-pill-row">
                    <span>{MODALITY_LABELS[profile.trainingModality] || 'Modalidad por definir'}</span>
                    <span>{METABOLIC_LABELS[profile.metabolicProfile] || 'Perfil metabólico no definido'}</span>
                    <span>{coachStatusLabel}</span>
                  </div>
                  <div className="dashboard-cta-row">
                    <button onClick={generatePlan} disabled={planLoading}>
                      {planLoading ? 'Actualizando...' : 'Actualizar semana'}
                    </button>
                    <button className="secondary" type="button" onClick={() => setActiveTab('daily')}>
                      Ver sesión de hoy
                    </button>
                    <button className="secondary" type="button" onClick={() => setActiveTab('nutrition')}>
                      Registrar comida
                    </button>
                  </div>
                </div>
              </article>

              <section className="dashboard-metrics-grid">
                <article className="visual-metric-card">
                  <div className="metric-ring" style={{ '--value': readinessScore }}>
                    <span>{readinessScore}</span>
                  </div>
                  <div>
                    <h3>Readiness</h3>
                    <p>{weeklyPlan?.progressMemory?.readinessState || 'sin datos'}</p>
                  </div>
                </article>
                <article className="visual-metric-card">
                  <div className="metric-ring" style={{ '--value': completionPercent }}>
                    <span>{completionPercent}%</span>
                  </div>
                  <div>
                    <h3>Cumplimiento</h3>
                    <p>Sesiones completadas</p>
                  </div>
                </article>
                <article className="visual-metric-card">
                  <div className="metric-ring" style={{ '--value': nutritionAdherencePercent }}>
                    <span>{nutritionAdherencePercent}%</span>
                  </div>
                  <div>
                    <h3>Adherencia</h3>
                    <p>Nutrición semanal</p>
                  </div>
                </article>
                <article className="visual-metric-card">
                  <div className="metric-plain">
                    <strong>{fatigueAverage != null ? fatigueAverage.toFixed(1) : 'n/d'}</strong>
                    <span>/10</span>
                  </div>
                  <div>
                    <h3>Fatiga media</h3>
                    <p>Se ajusta automáticamente</p>
                  </div>
                </article>
              </section>

              <article className="dashboard-session-snapshot">
                <header>
                  <h3>Resumen de semana</h3>
                  <span>{weeklyPlan ? `${weeklyPlan.startDate} → ${weeklyPlan.endDate}` : 'Aún sin plan'}</span>
                </header>
                <div className="snapshot-grid">
                  <div>
                    <strong>{weeklySessionCount}</strong>
                    <span>Sesiones</span>
                  </div>
                  <div>
                    <strong>{weeklyMealsCount}</strong>
                    <span>Comidas</span>
                  </div>
                  <div>
                    <strong>{weeklyMinutesTotal}</strong>
                    <span>Minutos</span>
                  </div>
                  <div>
                    <strong>{weeklyKcal}</strong>
                    <span>Kcal plan</span>
                  </div>
                </div>
                {dashboardFocusDay ? (
                  <div className="snapshot-focus">
                    <p>
                      <strong>{formatDayNameFromIso(dashboardFocusDay.date)}</strong> · {dashboardFocusDay.workout?.title}
                    </p>
                    <p>
                      {dashboardFocusDay.workout?.durationMinutes || 0} min · {dashboardFocusDay.workout?.intensityRpe || 'RPE n/d'} ·{' '}
                      {Array.isArray(dashboardFocusDay.workout?.exercises) ? dashboardFocusDay.workout.exercises.length : 0} ejercicios
                    </p>
                  </div>
                ) : (
                  <p className="empty-text">Genera tu plan para ver el resumen visual.</p>
                )}
              </article>
            </section>
          ) : null}

          {activeTab === 'user' && needsOnboarding ? (
            <section className="panel onboarding-panel">
              <SectionLabel
                title="Onboarding rápido"
                subtitle="Completa tu setup inicial en menos de 1 minuto."
              />
              <div className="onboarding-grid">
                <Field label="Nombre">
                  <input
                    value={profile.displayName}
                    onChange={(event) => setProfile((prev) => ({ ...prev, displayName: event.target.value }))}
                    placeholder="Tu nombre"
                  />
                </Field>
                <Field label="Objetivo principal">
                  <select
                    value={profile.goal}
                    onChange={(event) => setProfile((prev) => ({ ...prev, goal: event.target.value }))}
                  >
                    <option value="weight_loss">Bajar peso</option>
                    <option value="maintain_weight">Mantener peso</option>
                    <option value="endurance">Aumentar resistencia</option>
                    <option value="hypertrophy">Hipertrofia</option>
                    <option value="strength">Ganar fuerza</option>
                    <option value="recomposition">Recomposición</option>
                    <option value="glycemic_control">Control glucémico</option>
                  </select>
                </Field>
                <Field label="Entrenamiento preferido">
                  <select
                    value={profile.trainingModality}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        trainingModality: event.target.value,
                        trainingMode: event.target.value === 'full_gym' ? 'gym' : 'home',
                      }))}
                  >
                    <option value="full_gym">Gimnasio completo</option>
                    <option value="home">Entrenamiento en casa</option>
                    <option value="yoga">Yoga</option>
                    <option value="trx">TRX</option>
                    <option value="calisthenics">Calistenia</option>
                    <option value="running">Running</option>
                    <option value="cycling">Ciclismo</option>
                    <option value="pilates">Pilates</option>
                    <option value="mixed">Mixto</option>
                  </select>
                </Field>
                <Field label="Patrón alimentario">
                  <select
                    value={profile.nutritionPreferences?.dietaryPattern || 'omnivore'}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        nutritionPreferences: {
                          ...prev.nutritionPreferences,
                          dietaryPattern: event.target.value,
                        },
                      }))}
                  >
                    <option value="omnivore">Omnívoro</option>
                    <option value="vegetarian">Vegetariano</option>
                    <option value="vegan">Vegano</option>
                  </select>
                </Field>
                <Field label="Alergias (coma separadas)">
                  <input
                    value={profile.nutritionPreferences?.allergies || ''}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        nutritionPreferences: {
                          ...prev.nutritionPreferences,
                          allergies: event.target.value,
                        },
                      }))}
                    placeholder="ej: marisco, frutos secos"
                  />
                </Field>
                <Field label="Intolerancias / no deseados">
                  <input
                    value={profile.nutritionPreferences?.intolerances || ''}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        nutritionPreferences: {
                          ...prev.nutritionPreferences,
                          intolerances: event.target.value,
                        },
                      }))}
                    placeholder="ej: lactosa, gluten"
                  />
                </Field>
                <Field label="Alimentos no deseados">
                  <input
                    value={profile.nutritionPreferences?.dislikedFoods || ''}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        nutritionPreferences: {
                          ...prev.nutritionPreferences,
                          dislikedFoods: event.target.value,
                        },
                      }))}
                    placeholder="ej: hígado, coles de bruselas"
                  />
                </Field>
              </div>
              <div className="inline-actions">
                <button onClick={completeQuickOnboarding} disabled={profileLoading}>
                  {profileLoading ? 'Guardando...' : 'Finalizar onboarding'}
                </button>
                <small>{profileStatus}</small>
              </div>
            </section>
          ) : null}

          {activeTab === 'user' ? (
          <section className="panel">
            <SectionLabel
              title="Perfil y objetivo"
              subtitle="Configura tus datos base."
            />

            <article className={`screening-status ${needsScreeningRefresh ? 'warn' : 'ok'}`}>
              <h3>Estado de cribado</h3>
              <p>
                {needsScreeningRefresh
                  ? `Actualiza tu cribado ahora. Vigencia configurada: ${screeningRefreshDays} días.`
                  : `Cribado vigente. Restan ${screeningDaysRemaining} de ${screeningRefreshDays} días.`}
              </p>
              <small>
                {hasValidScreeningDate
                  ? `Última actualización: ${screeningLastUpdateDate.toLocaleDateString()}`
                  : 'Aún no hay fecha registrada de cribado.'}
              </small>
            </article>

            <div className="form-grid">
              <Field label="Nombre">
                <input
                  value={profile.displayName}
                  onChange={(event) => setProfile((prev) => ({ ...prev, displayName: event.target.value }))}
                />
              </Field>
              <Field label="Objetivo">
                <select
                  value={profile.goal}
                  onChange={(event) => setProfile((prev) => ({ ...prev, goal: event.target.value }))}
                >
                  <option value="weight_loss">Bajar peso</option>
                  <option value="maintain_weight">Mantener peso</option>
                  <option value="endurance">Aumentar resistencia</option>
                  <option value="hypertrophy">Hipertrofia</option>
                  <option value="strength">Ganar fuerza</option>
                  <option value="recomposition">Recomposition</option>
                  <option value="glycemic_control">Control glucémico</option>
                </select>
              </Field>
              <Field label="Modalidad principal">
                <select
                  value={profile.trainingModality}
                  onChange={(event) => {
                    const nextModality = event.target.value;
                    setProfile((prev) => ({
                      ...prev,
                      trainingModality: nextModality,
                      trainingMode: nextModality === 'full_gym' ? 'gym' : 'home',
                    }));
                    setWorkoutCheckin((prev) => ({ ...prev, mode: nextModality }));
                  }}
                >
                  <option value="full_gym">Gimnasio completo</option>
                  <option value="home">Entrenamiento en casa</option>
                  <option value="yoga">Yoga</option>
                  <option value="trx">TRX</option>
                  <option value="calisthenics">Calistenia</option>
                  <option value="running">Running</option>
                  <option value="cycling">Ciclismo</option>
                  <option value="pilates">Pilates</option>
                  <option value="mixed">Mixto</option>
                </select>
              </Field>
              <Field label="Perfil metabólico">
                <select
                  value={profile.metabolicProfile}
                  onChange={(event) => setProfile((prev) => ({ ...prev, metabolicProfile: event.target.value }))}
                >
                  <option value="none">Sin condición declarada</option>
                  <option value="insulin_resistance">Resistencia a la insulina</option>
                  <option value="prediabetes">Prediabetes</option>
                  <option value="type2_diabetes">Diabetes tipo 2</option>
                  <option value="hypothyroidism">Hipotiroidismo</option>
                  <option value="pcos">SOP/PCOS</option>
                </select>
              </Field>
              <Field label="Nivel actividad">
                <select
                  value={profile.activityLevel}
                  onChange={(event) => setProfile((prev) => ({ ...prev, activityLevel: event.target.value }))}
                >
                  <option value="sedentary">Sedentario</option>
                  <option value="light">Ligero</option>
                  <option value="moderate">Moderado</option>
                  <option value="high">Alto</option>
                </select>
              </Field>
              <Field label="Sexo">
                <select
                  value={profile.sex}
                  onChange={(event) => setProfile((prev) => ({ ...prev, sex: event.target.value }))}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>
              <Field label="Edad">
                <input
                  type="number"
                  value={profile.age}
                  onChange={(event) => setProfile((prev) => ({ ...prev, age: event.target.value }))}
                />
              </Field>
              <Field label="Peso (kg)">
                <input
                  type="number"
                  value={profile.weightKg}
                  onChange={(event) => setProfile((prev) => ({ ...prev, weightKg: event.target.value }))}
                />
              </Field>
              <Field label="Altura (cm)">
                <input
                  type="number"
                  value={profile.heightCm}
                  onChange={(event) => setProfile((prev) => ({ ...prev, heightCm: event.target.value }))}
                />
              </Field>
              <Field label="Comidas por día">
                <input
                  type="number"
                  value={profile.mealsPerDay}
                  onChange={(event) => setProfile((prev) => ({ ...prev, mealsPerDay: event.target.value }))}
                />
              </Field>
              <Field label="Calorías objetivo (opcional)">
                <input
                  type="number"
                  value={profile.targetCalories}
                  onChange={(event) => setProfile((prev) => ({ ...prev, targetCalories: event.target.value }))}
                />
              </Field>
              {showAdvancedProfile ? (
                <>
                  <Field label="Cribado: síntomas de alarma en ejercicio">
                    <select
                      value={String(profile.preparticipation?.exerciseSymptoms ?? false)}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          preparticipation: {
                            ...prev.preparticipation,
                            exerciseSymptoms: event.target.value === 'true',
                          },
                        }))}
                    >
                      <option value="false">No</option>
                      <option value="true">Sí</option>
                    </select>
                  </Field>
                  <Field label="Cribado: enfermedad cardiometabólica/renal conocida">
                    <select
                      value={String(profile.preparticipation?.knownCardiometabolicDisease ?? false)}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          preparticipation: {
                            ...prev.preparticipation,
                            knownCardiometabolicDisease: event.target.value === 'true',
                          },
                        }))}
                    >
                      <option value="false">No</option>
                      <option value="true">Sí</option>
                    </select>
                  </Field>
                  <Field label="Cribado: actualmente activo (>=3 días/sem)">
                    <select
                      value={String(profile.preparticipation?.currentlyActive ?? false)}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          preparticipation: {
                            ...prev.preparticipation,
                            currentlyActive: event.target.value === 'true',
                          },
                        }))}
                    >
                      <option value="false">No</option>
                      <option value="true">Sí</option>
                    </select>
                  </Field>
                  <Field label="Cribado: alta médica disponible">
                    <select
                      value={String(profile.preparticipation?.medicalClearance ?? false)}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          preparticipation: {
                            ...prev.preparticipation,
                            medicalClearance: event.target.value === 'true',
                          },
                        }))}
                    >
                      <option value="false">No</option>
                      <option value="true">Sí</option>
                    </select>
                  </Field>
                  <Field label="Cribado: contraindicaciones activas">
                    <select
                      value={String(profile.preparticipation?.contraindications ?? false)}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          preparticipation: {
                            ...prev.preparticipation,
                            contraindications: event.target.value === 'true',
                          },
                        }))}
                    >
                      <option value="false">No</option>
                      <option value="true">Sí</option>
                    </select>
                  </Field>
                  <Field label="Cribado: intensidad deseada">
                    <select
                      value={profile.preparticipation?.desiredIntensity || 'moderate'}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          preparticipation: {
                            ...prev.preparticipation,
                            desiredIntensity: event.target.value,
                          },
                        }))}
                    >
                      <option value="light">Ligera</option>
                      <option value="moderate">Moderada</option>
                      <option value="vigorous">Vigorosa</option>
                    </select>
                  </Field>
                  <Field label="Actualizar cribado cada (días)">
                    <input
                      type="number"
                      min="15"
                      max="90"
                      step="1"
                      value={profile.screeningRefreshDays ?? 15}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          screeningRefreshDays: event.target.value,
                        }))}
                    />
                  </Field>
                  <Field label="Patrón alimentario">
                    <select
                      value={profile.nutritionPreferences?.dietaryPattern || 'omnivore'}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          nutritionPreferences: {
                            ...prev.nutritionPreferences,
                            dietaryPattern: event.target.value,
                          },
                        }))}
                    >
                      <option value="omnivore">Omnívoro</option>
                      <option value="vegetarian">Vegetariano</option>
                      <option value="vegan">Vegano</option>
                    </select>
                  </Field>
                  <Field label="Alergias alimentarias (coma separadas)">
                    <input
                      value={profile.nutritionPreferences?.allergies || ''}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          nutritionPreferences: {
                            ...prev.nutritionPreferences,
                            allergies: event.target.value,
                          },
                        }))}
                      placeholder="ej: marisco, cacahuete"
                    />
                  </Field>
                  <Field label="Intolerancias (coma separadas)">
                    <input
                      value={profile.nutritionPreferences?.intolerances || ''}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          nutritionPreferences: {
                            ...prev.nutritionPreferences,
                            intolerances: event.target.value,
                          },
                        }))}
                      placeholder="ej: lactosa, gluten"
                    />
                  </Field>
                  <Field label="Alimentos no deseados (coma separadas)">
                    <input
                      value={profile.nutritionPreferences?.dislikedFoods || ''}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          nutritionPreferences: {
                            ...prev.nutritionPreferences,
                            dislikedFoods: event.target.value,
                          },
                        }))}
                      placeholder="ej: brócoli, hígado"
                    />
                  </Field>
                  <Field label="Umbral fatiga alta (0-10)">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={profile.adaptiveThresholds?.highFatigue ?? 7}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          adaptiveThresholds: {
                            ...prev.adaptiveThresholds,
                            highFatigue: event.target.value,
                          },
                        }))}
                    />
                  </Field>
                  <Field label="Umbral RPE alto (0-10)">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={profile.adaptiveThresholds?.highSessionRpe ?? 8.2}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          adaptiveThresholds: {
                            ...prev.adaptiveThresholds,
                            highSessionRpe: event.target.value,
                          },
                        }))}
                    />
                  </Field>
                  <Field label="Umbral adherencia baja (%)">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={profile.adaptiveThresholds?.lowAdherencePercent ?? 60}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          adaptiveThresholds: {
                            ...prev.adaptiveThresholds,
                            lowAdherencePercent: event.target.value,
                          },
                        }))}
                    />
                  </Field>
                  <Field label="Umbral cumplimiento bajo (0-1)">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={profile.adaptiveThresholds?.lowCompletionRate ?? 0.6}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          adaptiveThresholds: {
                            ...prev.adaptiveThresholds,
                            lowCompletionRate: event.target.value,
                          },
                        }))}
                    />
                  </Field>
                  <Field label="Umbral readiness alto (0-100)">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={profile.adaptiveThresholds?.highReadiness ?? 78}
                      onChange={(event) =>
                        setProfile((prev) => ({
                          ...prev,
                          adaptiveThresholds: {
                            ...prev.adaptiveThresholds,
                            highReadiness: event.target.value,
                          },
                        }))}
                    />
                  </Field>
                </>
              ) : (
                <p className="empty-text">Campos clínicos avanzados ocultos para simplificar la vista.</p>
              )}
            </div>

            <div className="inline-actions">
              <button onClick={saveProfile} disabled={profileLoading}>
                {profileLoading ? 'Guardando...' : 'Guardar perfil'}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setShowAdvancedProfile((prev) => !prev)}
              >
                {showAdvancedProfile ? 'Ocultar ajustes avanzados' : 'Mostrar ajustes avanzados'}
              </button>
              <small>{profileStatus}</small>
            </div>
          </section>
          ) : null}

        </section>

        <aside className="secondary-column">
          {activeTab === 'user' ? (
            <>
              {authUser ? (
                <section className="panel">
                  <SectionLabel title="Cuenta" subtitle="Sesión actual activa." />
                  <div className="auth-live">
                    <p>{authUser.email}</p>
                    <button onClick={logout}>Cerrar sesión</button>
                  </div>
                </section>
              ) : devAuthMode ? (
                <section className="panel">
                  <SectionLabel title="Cuenta" subtitle="Modo demo activo." />
                  <p className="empty-text">En modo demo no se requiere autenticación real.</p>
                </section>
              ) : null}

              <section className="panel">
                <SectionLabel
                  title="Mi privacidad y datos"
                  subtitle="Consentimientos y control de cuenta."
                />
                <Field label="Tratamiento de datos de salud y entrenamiento">
                  <select
                    value={String(profile.legalConsents?.dataProcessingAccepted ?? false)}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        legalConsents: {
                          ...prev.legalConsents,
                          dataProcessingAccepted: event.target.value === 'true',
                        },
                      }))}
                  >
                    <option value="true">Aceptado</option>
                    <option value="false">Revocado</option>
                  </select>
                </Field>
                <Field label="Comunicaciones informativas">
                  <select
                    value={String(profile.legalConsents?.marketingAccepted ?? false)}
                    onChange={(event) =>
                      setProfile((prev) => ({
                        ...prev,
                        legalConsents: {
                          ...prev.legalConsents,
                          marketingAccepted: event.target.value === 'true',
                        },
                      }))}
                  >
                    <option value="false">No autorizadas</option>
                    <option value="true">Autorizadas</option>
                  </select>
                </Field>
                <small>
                  Consentimiento versión: {profile.legalConsents?.consentVersion || 'n/d'}
                  {profile.legalConsents?.acceptedAt ? ` · Aceptado: ${new Date(profile.legalConsents.acceptedAt).toLocaleString()}` : ''}
                </small>
                <div className="inline-actions stacked">
                  <button onClick={savePrivacyPreferences} disabled={privacyLoading}>
                    {privacyLoading ? 'Procesando...' : 'Guardar privacidad'}
                  </button>
                  <button className="secondary" onClick={exportAccountData} disabled={privacyLoading}>
                    Descargar mis datos (JSON)
                  </button>
                  <small>{privacyStatus}</small>
                </div>
                <article className="warning-block">
                  <h3>Eliminar cuenta y datos</h3>
                  <p>
                    Esta acción es irreversible. Se eliminará tu perfil, historial, planes, registros y archivos vinculados.
                  </p>
                  <Field label='Escribe "ELIMINAR MI CUENTA" para confirmar'>
                    <input
                      value={deleteConfirmText}
                      onChange={(event) => setDeleteConfirmText(event.target.value)}
                      placeholder="ELIMINAR MI CUENTA"
                    />
                  </Field>
                  <button className="danger" onClick={deleteMyAccount} disabled={deleteLoading}>
                    {deleteLoading ? 'Eliminando...' : 'Eliminar cuenta'}
                  </button>
                </article>
              </section>

              <section className="panel">
                <SectionLabel
                  title="Registro de métricas"
                  subtitle="Peso, cintura y glucosa."
                />
                <div className="form-grid">
                  <Field label="Peso (kg)">
                    <input
                      type="number"
                      step="0.1"
                      value={metricInput.weightKg}
                      onChange={(event) => setMetricInput((prev) => ({ ...prev, weightKg: event.target.value }))}
                    />
                  </Field>
                  <Field label="Cintura (cm)">
                    <input
                      type="number"
                      step="0.1"
                      value={metricInput.waistCm}
                      onChange={(event) => setMetricInput((prev) => ({ ...prev, waistCm: event.target.value }))}
                    />
                  </Field>
                  <Field label="Glucosa ayunas (mg/dL)">
                    <input
                      type="number"
                      step="1"
                      value={metricInput.fastingGlucoseMgDl}
                      onChange={(event) => setMetricInput((prev) => ({ ...prev, fastingGlucoseMgDl: event.target.value }))}
                    />
                  </Field>
                </div>
                <Field label="Notas (opcional)">
                  <textarea
                    rows={2}
                    value={metricInput.notes}
                    onChange={(event) => setMetricInput((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Estado general, hora de medición, etc."
                  />
                </Field>
                <div className="inline-actions stacked">
                  <button onClick={registerMetricsCheckin} disabled={metricLoading}>
                    {metricLoading ? 'Registrando...' : 'Registrar métricas'}
                  </button>
                  <small>{metricStatus}</small>
                </div>
              </section>

              <section className="panel">
                <SectionLabel
                  title="Check-in de entrenamiento"
                  subtitle="Carga y sensación diaria."
                />
                <Field label="Título de sesión">
                  <input
                    value={workoutCheckin.title}
                    onChange={(event) => setWorkoutCheckin((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </Field>
                <Field label="Modalidad">
                  <select
                    value={workoutCheckin.mode}
                    onChange={(event) => setWorkoutCheckin((prev) => ({ ...prev, mode: event.target.value }))}
                  >
                    <option value="full_gym">Gimnasio completo</option>
                    <option value="home">Casa</option>
                    <option value="yoga">Yoga</option>
                    <option value="trx">TRX</option>
                    <option value="calisthenics">Calistenia</option>
                    <option value="running">Running</option>
                    <option value="cycling">Ciclismo</option>
                    <option value="pilates">Pilates</option>
                    <option value="mixed">Mixto</option>
                  </select>
                </Field>
                <div className="form-grid">
                  <Field label="Duración (min)">
                    <input
                      type="number"
                      value={workoutCheckin.durationMinutes}
                      onChange={(event) => setWorkoutCheckin((prev) => ({ ...prev, durationMinutes: event.target.value }))}
                    />
                  </Field>
                  <Field label="RPE sesión (0-10)">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="1"
                      value={workoutCheckin.sessionRpe}
                      onChange={(event) => setWorkoutCheckin((prev) => ({ ...prev, sessionRpe: event.target.value }))}
                    />
                  </Field>
                  <Field label="Fatiga actual (0-10)">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="1"
                      value={workoutCheckin.fatigue}
                      onChange={(event) => setWorkoutCheckin((prev) => ({ ...prev, fatigue: event.target.value }))}
                    />
                  </Field>
                  <Field label="Sueño (horas)">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={workoutCheckin.sleepHours}
                      onChange={(event) => setWorkoutCheckin((prev) => ({ ...prev, sleepHours: event.target.value }))}
                    />
                  </Field>
                </div>
                <Field label="Sesión completada">
                  <select
                    value={String(workoutCheckin.completed)}
                    onChange={(event) =>
                      setWorkoutCheckin((prev) => ({
                        ...prev,
                        completed: event.target.value === 'true',
                      }))}
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </Field>
                <Field label="Notas (opcional)">
                  <textarea
                    rows={2}
                    value={workoutCheckin.notes}
                    onChange={(event) => setWorkoutCheckin((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Dolor, molestias, percepción de rendimiento..."
                  />
                </Field>
                <div className="inline-actions stacked">
                  <button onClick={registerWorkoutCheckin} disabled={workoutLoading}>
                    {workoutLoading ? 'Registrando...' : 'Registrar check-in'}
                  </button>
                  <small>{workoutStatus}</small>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === 'dashboard' ? (
          <section className="panel dashboard-ai-overview">
            <SectionLabel
              title="Semana IA"
              subtitle="Ajustes del plan en formato compacto."
            />
            <div className="inline-actions">
              <button onClick={generatePlan} disabled={planLoading}>
                {planLoading ? 'Actualizando...' : 'Regenerar'}
              </button>
              <button className="secondary" onClick={loadWeeklyPlan} disabled={planLoading}>
                Recargar plan
              </button>
              <small>{planStatus}</small>
            </div>

            {weeklyPlan ? (
              <div className="dashboard-ai-body">
                <div className="signal-row">
                  <span
                    className={`signal-chip ${
                      weeklyPlan.preparticipationScreening?.readinessGate === 'stop'
                        ? 'danger'
                        : weeklyPlan.preparticipationScreening?.readinessGate === 'caution'
                          ? 'warn'
                          : 'ok'
                    }`}
                  >
                    Cribado: {weeklyPlan.preparticipationScreening?.readinessGate || 'ok'}
                  </span>
                  <span className="signal-chip">
                    Readiness: {weeklyPlan.progressMemory?.readinessScore ?? 'n/d'}/100
                  </span>
                  <span
                    className={`signal-chip ${
                      coachStatusMode === 'live'
                        ? 'ok'
                        : coachStatusMode === 'fallback'
                          ? 'warn'
                          : ''
                    }`}
                  >
                    Coach: {coachStatusLabel}
                  </span>
                </div>

                <article className={`ai-engine-note ${coachStatusMode}`}>
                  <strong>{coachStatusLabel}</strong>
                  <p>{coachStatusDetail}</p>
                </article>

                {coachAdjustments.length ? (
                  <div className="coach-adjustment-grid">
                    {coachAdjustments.map((item, index) => (
                      <article key={`${item.day}-${index}`} className="coach-adjustment-card">
                        <h3>{item.day}</h3>
                        <p>{item.adjustment}</p>
                      </article>
                    ))}
                  </div>
                ) : null}

                <div className="dashboard-day-strip">
                  {dashboardPlanDays.map((day) => (
                    <button
                      key={day.date}
                      className={`dashboard-day-pill ${selectedDay?.date === day.date ? 'active' : ''}`}
                      type="button"
                      onClick={() => {
                        setSelectedDate(day.date);
                        setActiveTab('daily');
                      }}
                    >
                      <strong>{formatDayNameFromIso(day.date)}</strong>
                      <span>{day.workout?.durationMinutes || 0} min</span>
                    </button>
                  ))}
                </div>

                <details className="technical-details">
                  <summary>Detalle clínico</summary>
                  <div className="technical-details-body">
                    {weeklyPlan.preparticipationScreening ? (
                      <p>
                        <strong>Cribado:</strong> riesgo {weeklyPlan.preparticipationScreening.riskLevel},
                        gate {weeklyPlan.preparticipationScreening.readinessGate},
                        RPE máx {weeklyPlan.preparticipationScreening.maxAllowedSessionRpe}.
                      </p>
                    ) : null}
                    {weeklyPlan.adaptiveTuning?.summary ? (
                      <p><strong>Ajuste:</strong> {weeklyPlan.adaptiveTuning.summary}</p>
                    ) : null}
                    {aiAdjustmentReasons.length ? (
                      <p><strong>Reglas:</strong> {aiAdjustmentReasons.map((rule) => rule.reason).join(' · ')}</p>
                    ) : null}
                    {weeklyPlan.coachMeta ? (
                      <p>
                        <strong>Motor IA:</strong> {weeklyPlan.coachMeta.source || 'heuristic'}
                        {weeklyPlan.coachMeta.modelResolved ? ` · ${weeklyPlan.coachMeta.modelResolved}` : ''}
                        {weeklyPlan.coachMeta.attempts ? ` · intentos ${weeklyPlan.coachMeta.attempts}` : ''}
                      </p>
                    ) : null}
                    {weeklyPlan.coachPlan?.acsmJustification ? (
                      <p><strong>Justificación ACSM:</strong> {weeklyPlan.coachPlan.acsmJustification}</p>
                    ) : null}
                    {weeklyPlan.coachWarning ? <p className="warning">{weeklyPlan.coachWarning}</p> : null}
                  </div>
                </details>
              </div>
            ) : (
              <p className="empty-text">Aún no hay plan generado.</p>
            )}
          </section>
          ) : null}
        </aside>
          </section>

          {activeTab === 'daily' && <section className="workspace-alt" style={{ display: 'grid' }}>
        <section className="panel">
          <SectionLabel
            title="Plan diario"
            subtitle="Técnica, carga y tiempos del día."
          />
          {plannedDays.length ? (
            <>
              <div className="calendar-grid">
                {plannedDays.map((day) => (
                  <button
                    key={day.date}
                    className={`calendar-day ${selectedDay?.date === day.date ? 'active' : ''}`}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <strong>{formatDayNameFromIso(day.date)}</strong>
                    <span>{formatDateLabel(day.date)}</span>
                  </button>
                ))}
              </div>
              {selectedDay ? (
                <article className="day-detail">
                  <header className="day-hero">
                    <div className="day-hero-main">
                      <div className="day-hero-copy">
                        <p className="day-kicker">{formatFullDateLabel(selectedDay.date)}</p>
                        <div className="day-hero-title-row">
                          <h3>{selectedDay.workout?.title}</h3>
                          <span className="day-focus-pill">{selectedDayFocusLabel}</span>
                        </div>
                        <p className="day-hero-meta">
                          {selectedDay.workout?.durationMinutes || 0} min · {selectedDay.workout?.intensityRpe || 'RPE n/d'}
                        </p>
                      </div>

                      <div className="day-hero-badges" aria-label="Resumen de sesión">
                        <article className="day-badge">
                          <span>Bloques</span>
                          <strong>{selectedDayExercises.length || 0}</strong>
                        </article>
                        <article className="day-badge">
                          <span>Swap</span>
                          <strong>{selectedDay.workout?.sessionOverrideApplied ? 'Activo' : 'Base'}</strong>
                        </article>
                        <article className="day-badge">
                          <span>Recambio 1:1</span>
                          <strong>{selectedDayExercises.filter((exercise) => exercise._replaced).length}</strong>
                        </article>
                      </div>
                    </div>

                    <div className="day-hero-grid">
                      <article className="day-snapshot-card">
                        <span className="day-snapshot-eyebrow">Musculatura</span>
                        <strong>
                          {selectedDayMusclePreview.length ? selectedDayMusclePreview.join(' · ') : 'Sesión técnica o de recuperación'}
                        </strong>
                        <p>{selectedDayExercisePreview.length ? selectedDayExercisePreview.join(' · ') : 'Sin bloques cargados'}</p>
                      </article>

                      <article className="day-snapshot-card">
                        <span className="day-snapshot-eyebrow">Compatibilidad semanal</span>
                        <strong>
                          {selectedDay.workout?.sessionOverrideApplied ? 'Sesión alternativa activa' : 'Sesión base activa'}
                        </strong>
                        <p>
                          {selectedDaySessionOverride?.descriptor
                            || selectedDaySessionOverride?.compatibilityNote
                            || selectedDay.workout?.overrideDescriptor
                            || selectedDay.workout?.overrideCompatibilityNote
                            || selectedDaySessionSwapOptions[0]?.compatibilityNote
                            || 'Puedes reemplazar la sesión completa sin repetir grupos musculares adyacentes.'}
                        </p>
                      </article>
                    </div>

                    <article className={`day-coach-strip is-${coachStatusMode}`}>
                      <div className="day-coach-strip-copy">
                        <span className="day-coach-eyebrow">Coach IA</span>
                        <strong>{coachStatusLabel}</strong>
                        <p>{dailyCoachHeadline}</p>
                        <small>
                          {[dailyCoachSupportingText, coachGeneratedLabel ? `Generado ${coachGeneratedLabel}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </div>

                      <div className="day-coach-strip-meta">
                        <span className={`coach-status-pill ${coachStatusMode}`}>{coachStatusLabel}</span>
                        <p>{coachStatusDetail}</p>
                        {coachStatusMode !== 'live' ? (
                          <button type="button" onClick={generatePlan} disabled={planLoading}>
                            {planLoading ? 'Regenerando...' : 'Reintentar con Gemini'}
                          </button>
                        ) : null}
                      </div>
                    </article>

                    <div className="day-hero-actions">
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => setSessionSwapOpen((prev) => !prev)}
                        disabled={!selectedDaySessionSwapOptions.length && !selectedDaySessionOverride}
                      >
                        {sessionSwapOpen ? 'Cerrar swap de sesión' : 'Cambiar sesión completa'}
                      </button>
                      {selectedDaySessionOverride ? (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => clearSessionSwap(selectedDay.date)}
                        >
                          Restaurar sesión base
                        </button>
                      ) : null}
                    </div>

                    {selectedDay.workout?.focusRepairApplied ? (
                      <p className="day-status-line focus-repair-note">
                        Plan previo normalizado al foco {selectedDayFocusLabel}.
                      </p>
                    ) : null}

                    {selectedDaySessionOverride ? (
                      <p className="day-status-line session-override-note">
                        Sesión alternativa activa. Base: {selectedDay.workout?.originalTitle || 'sesión anterior'}.
                        {' '}{selectedDaySessionOverride?.compatibilityNote || selectedDaySessionOverride?.descriptor || ''}
                      </p>
                    ) : null}

                    {sessionSwapOpen ? (
                      <section className="day-swap-sheet">
                        <div className="exercise-selector-head">
                          <div>
                            <h4>Sesiones compatibles</h4>
                            <p className="exercise-selector-note">
                              Solo aparecen opciones que respetan el día anterior y el siguiente.
                            </p>
                          </div>
                          <span>{selectedDaySessionSwapOptions.length} opciones</span>
                        </div>

                        {selectedDaySessionSwapOptions.length ? (
                          <div className="session-option-grid">
                            {selectedDaySessionSwapOptions.map((option) => (
                              <article key={option.id} className="session-option-card">
                                <div className="session-option-head">
                                  <div>
                                    <h5>{option.title}</h5>
                                    <p>{SESSION_FOCUS_LABELS[option.sessionFocus] || option.sessionFocus}</p>
                                  </div>
                                  <div className="session-option-metrics">
                                    <span>{option.workout?.durationMinutes || 0} min</span>
                                    <span>{option.workout?.intensityRpe || 'RPE n/d'}</span>
                                  </div>
                                </div>
                                <div className="muscle-chip-row session-option-muscles">
                                  {(option.previewMuscles || []).map((muscle, index) => (
                                    <strong key={`${option.id}-muscle-${index}`} className="muscle-chip primary">
                                      {muscle}
                                    </strong>
                                  ))}
                                </div>
                                <p className="session-option-preview">
                                  {(option.previewExercises || []).join(' · ')}
                                </p>
                                <p className="day-snapshot-note">{option.compatibilityNote}</p>
                                <button
                                  type="button"
                                  onClick={() => applySessionSwap(selectedDay.date, option)}
                                >
                                  Usar sesión
                                </button>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-text">
                            No hay otra sesión compatible sin romper la secuencia muscular semanal.
                          </p>
                        )}
                      </section>
                    ) : null}
                  </header>
                  {Array.isArray(selectedDay.workout?.warmup) && selectedDay.workout.warmup.length ? (
                    <details className="session-block">
                      <summary>
                        Calentamiento ({selectedDay.workout.warmup.length} bloques ·{' '}
                        {selectedDay.workout.warmup.reduce((total, step) => total + (Number(step.durationMinutes) || 0), 0)} min)
                      </summary>
                      <div className="session-block-body">
                        {selectedDay.workout.warmup.map((step, index) => (
                          <p key={`${step.step}-${index}`}>
                            <strong>{step.step}</strong> · {step.durationMinutes} min
                          </p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {Array.isArray(selectedDayExercises) && selectedDayExercises.length ? (
                    <section className="day-workbench">
                      <aside className="exercise-selector">
                        <div className="exercise-selector-head">
                          <div>
                            <h4>Bloques del día</h4>
                            <p className="exercise-selector-note">
                              Reemplazo 1:1 manteniendo el foco de la sesión.
                            </p>
                          </div>
                          <span>{selectedDayExercises.length} bloques</span>
                        </div>
                        <div className="exercise-selector-list">
                          {selectedDayExercises.map((exercise, index) => (
                            <button
                              key={exercise._swapKey || exercise.id || `exercise-${index}`}
                              type="button"
                              className={`exercise-selector-item ${activeExercise?._swapKey === exercise._swapKey ? 'active' : ''}`}
                              onClick={() => setSelectedExerciseKey(exercise._swapKey)}
                            >
                              <span className="exercise-selector-index">{String(index + 1).padStart(2, '0')}</span>
                              <div className="exercise-selector-summary">
                                <strong>{exercise.name}</strong>
                                <p>{compactText(exercise.primaryMuscles?.join(' · ') || exercise.equipment, 52)}</p>
                                <div className="exercise-selector-labels">
                                  <span className="exercise-selector-prescription">
                                    {summarizePrescription(exercise.prescription)}
                                  </span>
                                  {exercise._replaced ? <span className="exercise-replaced-badge">1:1 swap</span> : null}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </aside>

                      {activeExercise ? (
                        <article className="exercise-spotlight">
                          <header className="exercise-spotlight-head">
                            <div>
                              <p className="exercise-kicker">Trabajo muscular</p>
                              <h4>
                                {activeExercise.name}
                                {activeExercise._replaced ? <span className="exercise-replaced-badge">Sustituido</span> : null}
                              </h4>
                              <p className="exercise-equipment">{activeExercise.equipment}</p>
                            </div>
                            <div className="exercise-badges">
                              {activeExercise.difficulty ? <span>{DIFFICULTY_LABELS[activeExercise.difficulty] || activeExercise.difficulty}</span> : null}
                              <span>{summarizePrescription(activeExercise.prescription)}</span>
                              {activeExercise.prescription?.restSeconds ? <span>Descanso {activeExercise.prescription.restSeconds}s</span> : null}
                            </div>
                          </header>

                          <div className="exercise-spotlight-grid">
                            <div className="exercise-detail-stack">
                              <section className="exercise-muscle-list">
                                <div>
                                  <span>Primarios</span>
                                  <div className="muscle-chip-row">
                                    {(activeExercise.primaryMuscles || []).map((muscle, index) => (
                                      <strong key={`${activeExercise._swapKey}-primary-${index}`} className="muscle-chip primary">
                                        {muscle}
                                      </strong>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <span>Secundarios</span>
                                  <div className="muscle-chip-row">
                                    {(activeExercise.secondaryMuscles || []).map((muscle, index) => (
                                      <strong key={`${activeExercise._swapKey}-secondary-${index}`} className="muscle-chip secondary">
                                        {muscle}
                                      </strong>
                                    ))}
                                  </div>
                                </div>
                              </section>

                              {Array.isArray(activeExercise.cues) && activeExercise.cues.length ? (
                                <section className="exercise-cue-panel">
                                  <h5>Tecnica clave</h5>
                                  <ul>
                                    {activeExercise.cues.map((cue, cueIndex) => (
                                      <li key={`${activeExercise.id || 'cue'}-${cueIndex}`}>{cue}</li>
                                    ))}
                                  </ul>
                                </section>
                              ) : null}

                              {Array.isArray(activeExercise.progressions) && activeExercise.progressions.length ? (
                                <section className="exercise-cue-panel accent">
                                  <h5>Progresar</h5>
                                  <ul>
                                    {activeExercise.progressions.map((item, itemIndex) => (
                                      <li key={`${activeExercise.id || 'progression'}-${itemIndex}`}>{item}</li>
                                    ))}
                                  </ul>
                                </section>
                              ) : null}

                              {Array.isArray(activeExercise.regressions) && activeExercise.regressions.length ? (
                                <section className="exercise-cue-panel soft">
                                  <h5>Regresiones utiles</h5>
                                  <ul>
                                    {activeExercise.regressions.map((item, itemIndex) => (
                                      <li key={`${activeExercise.id || 'regression'}-${itemIndex}`}>{item}</li>
                                    ))}
                                  </ul>
                                </section>
                              ) : null}

                              {Array.isArray(activeExercise.contraindications) && activeExercise.contraindications.length ? (
                                <section className="exercise-cue-panel caution">
                                  <h5>Precauciones</h5>
                                  <ul>
                                    {activeExercise.contraindications.map((item, itemIndex) => (
                                      <li key={`${activeExercise.id || 'contra'}-${itemIndex}`}>{item}</li>
                                    ))}
                                  </ul>
                                </section>
                              ) : null}

                              <section className="exercise-action-panel compact">
                                <div className="exercise-actions">
                                  <button
                                    className="secondary"
                                    type="button"
                                    onClick={() => toggleExerciseSwapMenu(
                                      selectedDay,
                                      activeExercise._originalExercise || activeExercise,
                                      activeExerciseIndex
                                    )}
                                  >
                                    {activeExerciseSwapOpen ? 'Cerrar swap 1:1' : 'Cambiar 1:1'}
                                  </button>
                                  {activeExercise._replaced ? (
                                    <button
                                      className="secondary"
                                      type="button"
                                      onClick={() => clearExerciseSwap(selectedDay.date, activeExercise._swapKey)}
                                    >
                                      Volver al original
                                    </button>
                                  ) : null}
                                  {activeExercise.videoUrl ? (
                                    <a className="video-link" href={activeExercise.videoUrl} target="_blank" rel="noreferrer">
                                      Ver técnica
                                    </a>
                                  ) : null}
                                </div>

                                {activeExerciseSwapOpen ? (
                                  <div className="swap-panel">
                                    {activeExerciseSwapOptions.length ? (
                                      activeExerciseSwapOptions.map((option) => (
                                        <article key={option.id} className="swap-option">
                                          <div>
                                            <h6>{option.name}</h6>
                                            <p>{option.equipment}</p>
                                            <p className="swap-option-meta">{summarizePrescription(option.prescription)}</p>
                                            {Array.isArray(option.cues) && option.cues.length ? (
                                              <p className="swap-option-cue">{compactText(option.cues[0], 92)}</p>
                                            ) : null}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => applyExerciseSwap(selectedDay.date, activeExercise._swapKey, option)}
                                          >
                                            Usar
                                          </button>
                                        </article>
                                      ))
                                    ) : (
                                      <p className="empty-text">
                                        No hay alternativas compatibles para esta sesión.
                                      </p>
                                    )}
                                  </div>
                                ) : null}
                              </section>
                            </div>

                            <aside className="exercise-muscle-panel">
                              <MuscleMapFigure
                                anatomyRegions={activeExercise.anatomyRegions}
                                primaryMuscles={activeExercise.primaryMuscles}
                                secondaryMuscles={activeExercise.secondaryMuscles}
                              />
                            </aside>
                          </div>
                        </article>
                      ) : null}
                    </section>
                  ) : null}
                  {Array.isArray(selectedDay.workout?.cooldown) && selectedDay.workout.cooldown.length ? (
                    <details className="session-block">
                      <summary>
                        Enfriamiento ({selectedDay.workout.cooldown.length} bloques ·{' '}
                        {selectedDay.workout.cooldown.reduce((total, step) => total + (Number(step.durationMinutes) || 0), 0)} min)
                      </summary>
                      <div className="session-block-body">
                        {selectedDay.workout.cooldown.map((step, index) => (
                          <p key={`${step.step}-${index}`}>
                            <strong>{step.step}</strong> · {step.durationMinutes} min
                          </p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </article>
              ) : null}
            </>
          ) : (
            <p className="empty-text">Genera primero un plan semanal.</p>
          )}
        </section>
          </section>}

          {activeTab === 'weekly' && <section className="workspace-alt" style={{ display: 'grid' }}>
        <section className="panel">
          <SectionLabel title="Plan completo semanal" subtitle="Calendario y alertas." />
          {weeklyPlan ? (
            <>
              <section className="tab-hero">
                <article className="tab-hero-media">
                  <Image src="/brand/canva/weekly-canva-clean.png" alt="Resumen visual semanal" width={280} height={280} />
                </article>
                <div className="tab-hero-stats">
                  <article>
                    <span>Sesiones</span>
                    <strong>{plannedDays.length || 0}</strong>
                  </article>
                  <article>
                    <span>Min totales</span>
                    <strong>{weeklyMinutesTotal || 0}</strong>
                  </article>
                  <article>
                    <span>Kcal plan</span>
                    <strong>{weeklyCaloriesTotal || 0}</strong>
                  </article>
                  <article>
                    <span>Objetivo</span>
                    <strong>{GOAL_LABELS[profile.goal] || profile.goal || 'No definido'}</strong>
                  </article>
                </div>
              </section>
              <div className="calendar-grid">
                {plannedDays.map((day) => (
                  <button
                    key={day.date}
                    className={`calendar-day ${selectedDay?.date === day.date ? 'active' : ''}`}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <strong>{formatDayNameFromIso(day.date)}</strong>
                    <span>{day.workout?.title}</span>
                    <span>{day.workout?.intensityRpe}</span>
                  </button>
                ))}
              </div>
              {Array.isArray(weeklyPlan.systemAlerts) && weeklyPlan.systemAlerts.length ? (
                <div className="alert-chips">
                  {weeklyPlan.systemAlerts.map((alert) => (
                    <span key={alert.id} className="alert-chip">{alert.message}</span>
                  ))}
                </div>
              ) : null}
              <div className="day-cards">
                {plannedDays.map((day) => (
                  <article key={day.date} className="day-card">
                    <header>
                      <h3>{formatDayNameFromIso(day.date)}</h3>
                      <span>{formatDateLabel(day.date)}</span>
                    </header>
                    <p className="day-card-meta">
                      {day.workout?.title} · {day.workout?.durationMinutes} min · {day.workout?.intensityRpe}
                    </p>
                    <div className="macro-chips">
                      <span>{day.nutritionTarget?.calories} kcal</span>
                      <span>P {day.nutritionTarget?.proteinGrams}</span>
                      <span>C {day.nutritionTarget?.carbsGrams}</span>
                      <span>G {day.nutritionTarget?.fatGrams}</span>
                    </div>
                    <details className="day-card-details">
                      <summary>Ver bloques de sesión</summary>
                      {Array.isArray(day.workout?.warmup) && day.workout.warmup.length ? (
                        <ul>
                          {day.workout.warmup.slice(0, 3).map((step, index) => (
                            <li key={`${day.date}-warmup-${index}`}>
                              {step.step}: {step.durationMinutes} min
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {Array.isArray(day.workout?.exercises) && day.workout.exercises.length ? (
                        <ul>
                          {day.workout.exercises.slice(0, 4).map((exercise, index) => {
                            const name = typeof exercise === 'string' ? exercise : exercise?.name;
                            return <li key={`${day.date}-exercise-${index}`}>{name}</li>;
                          })}
                        </ul>
                      ) : null}
                      {Array.isArray(day.workout?.cooldown) && day.workout.cooldown.length ? (
                        <ul>
                          {day.workout.cooldown.slice(0, 2).map((step, index) => (
                            <li key={`${day.date}-cooldown-${index}`}>
                              {step.step}: {step.durationMinutes} min
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-text">Genera primero un plan semanal.</p>
          )}
          </section>
          </section>}

          {activeTab === 'library' && <section className="workspace-alt" style={{ display: 'grid' }}>
        <section className="panel">
          <SectionLabel
            title="Biblioteca de ejercicios"
            subtitle="Base de datos actual para auditar nombre, modalidad, tecnica y grupos musculares."
          />

          <section className="tab-hero">
            <article className="tab-hero-media">
              <Image src="/brand/canva/weekly-canva-clean-b.png" alt="Biblioteca de ejercicios Endogym" width={280} height={280} />
            </article>
            <div className="tab-hero-stats">
              <article>
                <span>Total ejercicios</span>
                <strong>{activeExerciseLibraryCatalog.length}</strong>
              </article>
              <article>
                <span>Filtrados</span>
                <strong>{filteredExerciseCatalog.length}</strong>
              </article>
              <article>
                <span>Modalidades</span>
                <strong>{Object.keys(MODALITY_LABELS).length}</strong>
              </article>
              <article>
                <span>Categorias</span>
                <strong>{libraryCategories.length}</strong>
              </article>
            </div>
          </section>

          <section className="modality-spotlight-grid">
            {librarySpotlightCards.map((card) => (
              <article key={card.modality} className={`modality-spotlight-card modality-${card.modality}`}>
                <div className="modality-spotlight-head">
                  <div>
                    <span>{MODALITY_LABELS[card.modality] || card.modality}</span>
                    <h4>{card.title}</h4>
                  </div>
                  <strong>{card.count}</strong>
                </div>
                <p>{card.description}</p>
                <div className="chip-cloud">
                  {card.highlighted.map((exercise) => (
                    <span key={exercise.id} className="soft-chip">{exercise.name}</span>
                  ))}
                </div>
                <div className="modality-spotlight-footer">
                  <small>{card.totalProgressions} progresiones auditables</small>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setLibraryModalityFilter(card.modality);
                      setLibraryCategoryFilter('all');
                      setLibrarySearch('');
                    }}
                  >
                    Ver {MODALITY_LABELS[card.modality] || card.modality}
                  </button>
                </div>
              </article>
            ))}
          </section>

          <input
            ref={libraryFileInputRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            style={{ display: 'none' }}
            onChange={handleLibraryImportFile}
          />

          <section className="library-audit-toolbar">
            <div className="library-audit-actions">
              <button type="button" className="secondary" onClick={handleLibraryExportJson}>Exportar JSON</button>
              <button type="button" className="secondary" onClick={handleLibraryExportCsv}>Exportar CSV</button>
              <button type="button" className="secondary" onClick={handleLibraryImportClick}>Importar para auditar</button>
              <button
                type="button"
                className="secondary"
                onClick={handleLibraryResetAudit}
                disabled={!libraryImportedCatalog}
              >
                Volver a base interna
              </button>
            </div>
            <div className={`library-audit-status is-${libraryAuditStatus.type}`}>
              <strong>{libraryImportedCatalog ? 'Fuente importada' : 'Fuente interna'}</strong>
              <p>{libraryAuditStatus.message}</p>
              <small>
                {libraryImportedCatalog
                  ? `${libraryAuditStatus.fileName || 'Archivo manual'} · ${libraryAuditStatus.format.toUpperCase()}`
                  : 'Catálogo base validado en build'}
              </small>
            </div>
          </section>

          <section className="library-audit-summary-grid">
            <article className="library-audit-summary-card">
              <span>Errores de schema</span>
              <strong>{activeExerciseLibraryValidation.errors.length}</strong>
            </article>
            <article className="library-audit-summary-card">
              <span>Warnings</span>
              <strong>{activeExerciseLibraryValidation.warnings.length}</strong>
            </article>
            <article className="library-audit-summary-card">
              <span>Campos obligatorios</span>
              <strong>{exerciseLibraryAuditSchema.requiredFields.length}</strong>
            </article>
            <article className="library-audit-summary-card">
              <span>Modo activo</span>
              <strong>{libraryImportedCatalog ? 'Archivo auditado' : 'Base interna'}</strong>
            </article>
          </section>

          <section className="library-audit-meta-grid">
            <article className="library-schema-card">
              <h4>Schema obligatorio</h4>
              <div className="chip-cloud">
                {exerciseLibraryAuditSchema.requiredFields.map((field) => (
                  <span key={field} className="soft-chip">{field}</span>
                ))}
              </div>
            </article>
            <article className="library-schema-card">
              <h4>Modalidades soportadas</h4>
              <div className="chip-cloud">
                {exerciseLibraryAuditSchema.allowedModalities.map((field) => (
                  <span key={field} className="soft-chip">{MODALITY_LABELS[field] || field}</span>
                ))}
              </div>
            </article>
          </section>

          {libraryAuditStatus.errors.length ? (
            <section className="library-audit-issues">
              <h4>Errores detectados</h4>
              <ul>
                {libraryAuditStatus.errors.slice(0, 8).map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    <strong>{issue.path}</strong> {issue.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {libraryAuditStatus.warnings.length ? (
            <section className="library-audit-issues warnings">
              <h4>Warnings</h4>
              <ul>
                {libraryAuditStatus.warnings.slice(0, 6).map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    <strong>{issue.path}</strong> {issue.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="exercise-audit-filters">
            <Field label="Buscar ejercicio o musculo">
              <input
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
                placeholder="Ej: squat, dorsal, gluteos, trx"
              />
            </Field>
            <Field label="Modalidad">
              <select
                value={libraryModalityFilter}
                onChange={(event) => setLibraryModalityFilter(event.target.value)}
              >
                <option value="all">Todas</option>
                {Object.entries(MODALITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Categoria">
              <select
                value={libraryCategoryFilter}
                onChange={(event) => setLibraryCategoryFilter(event.target.value)}
              >
                <option value="all">Todas</option>
                {libraryCategories.map((category) => (
                  <option key={category} value={category}>{CATEGORY_LABELS[category] || category}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="exercise-audit-table-wrap">
            <table className="exercise-audit-table">
              <thead>
                <tr>
                  <th>Ejercicio</th>
                  <th>Categoria</th>
                  <th>Modalidades</th>
                  <th>Sesion</th>
                  <th>Musculos primarios</th>
                  <th>Musculos secundarios</th>
                  <th>Equipo</th>
                </tr>
              </thead>
              <tbody>
                {filteredExerciseCatalog.map((exercise) => (
                  <tr key={exercise.id}>
                    <td>
                      <strong>{exercise.name}</strong>
                      <small>{exercise.id}</small>
                      {exercise.difficulty ? (
                        <small>{DIFFICULTY_LABELS[exercise.difficulty] || exercise.difficulty} · prog {exercise.progressions?.length || 0} · reg {exercise.regressions?.length || 0}</small>
                      ) : null}
                    </td>
                    <td>{CATEGORY_LABELS[exercise.category] || exercise.category}</td>
                    <td>{exercise.modalities.map((item) => MODALITY_LABELS[item] || item).join(', ')}</td>
                    <td>{exercise.sessionTypes.join(', ')}</td>
                    <td>{exercise.primaryMuscles.join(', ')}</td>
                    <td>{exercise.secondaryMuscles.join(', ')}</td>
                    <td>{exercise.equipment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredExerciseCatalog.length ? (
              <p className="empty-text">No hay ejercicios que coincidan con los filtros.</p>
            ) : null}
          </div>

          <div className="exercise-audit-card-grid">
            {filteredExerciseCatalog.map((exercise) => (
              <article key={`${exercise.id}-mobile`} className="exercise-audit-card">
                <div className="exercise-audit-card-head">
                  <div>
                    <strong>{exercise.name}</strong>
                    <small>{exercise.id}</small>
                  </div>
                  {exercise.difficulty ? (
                    <span className="soft-chip">
                      {DIFFICULTY_LABELS[exercise.difficulty] || exercise.difficulty}
                    </span>
                  ) : null}
                </div>
                <p className="exercise-audit-card-meta">
                  {CATEGORY_LABELS[exercise.category] || exercise.category} · {exercise.equipment}
                </p>
                <div className="chip-cloud">
                  {exercise.modalities.map((item) => (
                    <span key={`${exercise.id}-${item}`} className="soft-chip">
                      {MODALITY_LABELS[item] || item}
                    </span>
                  ))}
                </div>
                <div className="exercise-audit-card-detail">
                  <span>Sesión</span>
                  <p>{exercise.sessionTypes.join(', ')}</p>
                </div>
                <div className="exercise-audit-card-detail">
                  <span>Primarios</span>
                  <p>{compactText(exercise.primaryMuscles.join(', '), 120)}</p>
                </div>
                <div className="exercise-audit-card-detail">
                  <span>Secundarios</span>
                  <p>{compactText(exercise.secondaryMuscles.join(', '), 120)}</p>
                </div>
              </article>
            ))}
            {!filteredExerciseCatalog.length ? (
              <p className="empty-text">No hay ejercicios que coincidan con los filtros.</p>
            ) : null}
          </div>
        </section>
          </section>}

          {activeTab === 'nutrition' && <section className="workspace-alt" style={{ display: 'grid' }}>
        <section className="panel">
          <SectionLabel
            title="Plan nutricional completo"
            subtitle="Vista visual, herramientas IA y control diario."
          />

          <section className="nutrition-hero">
            <article className="nutrition-hero-media">
              <Image src="/brand/canva/nutrition-canva-p2.png" alt="Visual nutricional Endogym" width={420} height={420} />
            </article>
            <div className="nutrition-hero-content">
              <div className="nutrition-hero-head">
                <h3>Nutrición práctica del día</h3>
                <p>Menos texto, más acción: foto del plato, escáner y cálculo en segundos.</p>
              </div>
              <div className="nutrition-kpi-grid">
                <article>
                  <span>Patrón</span>
                  <strong>{nutritionPatternLabel}</strong>
                </article>
                <article>
                  <span>Días cargados</span>
                  <strong>{nutritionDays.length || 0}</strong>
                </article>
                <article>
                  <span>Kcal promedio</span>
                  <strong>{averageNutritionKcal || 0}</strong>
                </article>
                <article>
                  <span>Restricciones</span>
                  <strong>{nutritionRestrictionCount}</strong>
                </article>
              </div>
              <div className="nutrition-quick-actions">
                <button type="button" onClick={() => scrollToNutritionTool('nutrition-plate-tool')}>
                  Analizar plato
                </button>
                <button className="secondary" type="button" onClick={() => scrollToNutritionTool('nutrition-barcode-tool')}>
                  Escanear producto
                </button>
                <button className="secondary" type="button" onClick={() => scrollToNutritionTool('nutrition-calculator-tool')}>
                  Abrir calculadora
                </button>
              </div>
            </div>
          </section>

          <article id="nutrition-plate-tool" className="nutrition-tool-card">
            <div className="nutrition-tool-head">
              <SectionLabel
                title="Análisis IA de plato"
                subtitle="Foto, macros, carga glucémica y encaje con tu plan."
              />
              <div className="nutrition-tool-thumb" aria-hidden="true">
                <Image src="/brand/canva/nutrition-canva-p3.png" alt="" width={132} height={132} />
              </div>
            </div>
            <div className="analysis-inputs">
              <Field label="Descripción del plato">
                <input
                  value={plateDish}
                  onChange={(event) => setPlateDish(event.target.value)}
                  placeholder="Ej: Arroz con pollo y ensalada"
                />
              </Field>
              <Field label="Subir foto">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => applyPlateFile(event.target.files?.[0] || null)}
                />
              </Field>
            </div>

            <div className="inline-actions">
              <button className="secondary" type="button" onClick={startCameraCapture}>
                Usar cámara
              </button>
              <button className="secondary" type="button" onClick={clearPlateSelection} disabled={!plateFile}>
                Limpiar imagen
              </button>
              <button onClick={analyzePlate} disabled={!plateFile || analysisLoading}>
                {analysisLoading ? 'Analizando...' : 'Analizar plato'}
              </button>
            </div>
            {analysisStatus ? <div className="tool-status-line">{analysisStatus}</div> : null}

            {cameraOpen ? (
              <div className="camera-panel">
                <div className="camera-viewfinder" aria-hidden="true">
                  <span>Centra el plato dentro del encuadre</span>
                </div>
                <video ref={cameraVideoRef} autoPlay playsInline muted />
                <div className="inline-actions">
                  <button type="button" onClick={capturePhotoFromCamera}>Capturar</button>
                  <button className="secondary" type="button" onClick={stopCameraCapture}>Cerrar cámara</button>
                </div>
              </div>
            ) : null}

            {cameraStatus ? <div className="tool-status-line neutral">{cameraStatus}</div> : null}

            {platePreviewUrl ? (
              <div className="plate-preview">
                <img src={platePreviewUrl} alt="Vista previa del plato" />
              </div>
            ) : null}

            {analysisResult ? (
              <div className="plate-analysis-board">
                <div className="result-grid">
                  <div>
                    <h3>Motor</h3>
                    <p>{analysisModelLabel}</p>
                    {analysisModelDetail ? <small>{analysisModelDetail}</small> : null}
                  </div>
                  <div>
                    <h3>Macros estimados</h3>
                    <p>
                      {analysisResult.analysis?.totals?.calories} kcal · P {analysisResult.analysis?.totals?.proteinGrams}g · C{' '}
                      {analysisResult.analysis?.totals?.carbsGrams}g · G {analysisResult.analysis?.totals?.fatGrams}g
                    </p>
                  </div>
                  <div>
                    <h3>Impacto glucémico</h3>
                    <p>
                      GL {analysisResult.analysis?.totals?.glycemicLoad} · II {analysisResult.analysis?.totals?.insulinIndex}
                    </p>
                  </div>
                  <div>
                    <h3>Adherencia</h3>
                    <p>
                      {analysisResult.adherence?.scorePercent != null
                        ? `${analysisResult.adherence.scorePercent}% (${analysisResult.adherence.status})`
                        : 'No evaluable'}
                    </p>
                  </div>
                </div>
                {analysisNotes.length ? (
                  <div className="analysis-note-cloud">
                    {analysisNotes.map((note, index) => (
                      <span key={`analysis-note-${index}`}>{note}</span>
                    ))}
                  </div>
                ) : null}
                {analysisResult.warning ? <p className="warning">{analysisResult.warning}</p> : null}
              </div>
            ) : null}
          </article>

          {weeklyPlan?.nutritionPlan ? (
            <div className="nutrition-plan">
              <section className="restriction-chips">
                {nutritionRestrictionTags.map((item, index) => (
                  <span key={`restriction-${index}`}>{item}</span>
                ))}
                {!nutritionRestrictionTags.length ? (
                  <span>Sin restricciones específicas.</span>
                ) : null}
              </section>

              <section id="nutrition-day-grid" className="nutrition-day-rail">
                {nutritionDays.map((day) => {
                  const dayCalories = Array.isArray(day.meals)
                    ? day.meals.reduce((total, meal) => total + (Number(meal.target?.calories) || 0), 0)
                    : 0;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={`nutrition-day-chip ${nutritionSelectedDay?.date === day.date ? 'active' : ''}`}
                      onClick={() => setSelectedDate(day.date)}
                    >
                      <strong>{formatDayNameFromIso(day.date)}</strong>
                      <span>{formatDateLabel(day.date)}</span>
                      <small>{dayCalories} kcal · {day.meals?.length || 0} comidas</small>
                    </button>
                  );
                })}
              </section>

              {nutritionSelectedDay ? (
                <section className="nutrition-focus-layout">
                  <article className="nutrition-focus-panel">
                    <div className="nutrition-focus-head">
                      <p className="exercise-kicker">Plan del día</p>
                      <h3>{capitalize(formatFullDateLabel(nutritionSelectedDay.date))}</h3>
                      <p>
                        Objetivo {GOAL_LABELS[profile.goal] || profile.goal || 'No definido'} · patrón {nutritionPatternLabel}
                      </p>
                    </div>
                    <div className="nutrition-focus-kpis">
                      <article>
                        <span>Kcal</span>
                        <strong>{nutritionFocusCalories}</strong>
                      </article>
                      <article>
                        <span>Comidas</span>
                        <strong>{nutritionFocusMeals.length || 0}</strong>
                      </article>
                      <article>
                        <span>Pre-entreno</span>
                        <strong>{nutritionSelectedDay.preWorkout ? 'Activo' : 'Opcional'}</strong>
                      </article>
                    </div>
                    <div className="nutrition-focus-notes">
                      <article>
                        <span>Hidratación</span>
                        <p>{nutritionSelectedDay.hydration}</p>
                      </article>
                      <article>
                        <span>Pre</span>
                        <p>{nutritionSelectedDay.preWorkout}</p>
                      </article>
                      <article>
                        <span>Post</span>
                        <p>{nutritionSelectedDay.postWorkout}</p>
                      </article>
                    </div>
                    {Array.isArray(weeklyPlan?.nutritionPlan?.notes) && weeklyPlan.nutritionPlan.notes.length ? (
                      <div className="nutrition-guidance-list">
                        {weeklyPlan.nutritionPlan.notes.map((item, index) => (
                          <p key={`nutrition-note-${index}`}>{item}</p>
                        ))}
                      </div>
                    ) : null}
                  </article>

                  <div className="nutrition-meal-stack">
                    {nutritionFocusMeals.length ? (
                      nutritionFocusMeals.map((meal, index) => (
                        <article key={`${nutritionSelectedDay.date}-${meal.slot}-${index}`} className="nutrition-meal-card">
                          <div className="nutrition-meal-head">
                            <div>
                              <span className="nutrition-slot-pill">{meal.slot}</span>
                              <h4>{meal.dish}</h4>
                              <p>{mealTargetSummary(meal.target)}</p>
                            </div>
                            <div className="nutrition-prep-meta">
                              <strong>{meal.prep?.prepTimeMinutes || 0} min</strong>
                              <span>{meal.prep?.methodLabel || 'Preparación'}</span>
                            </div>
                          </div>

                          {Array.isArray(meal.ingredients) && meal.ingredients.length ? (
                            <div className="ingredient-chips">
                              {meal.ingredients.map((ingredient, ingredientIndex) => (
                                <span key={`${nutritionSelectedDay.date}-${meal.slot}-${ingredientIndex}`}>
                                  {compactText(ingredient, 28)}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div className="nutrition-meal-grid">
                            <section>
                              <span className="nutrition-mini-label">Preparación</span>
                              <ol className="nutrition-step-list">
                                {(meal.prep?.steps || [meal.instructions]).map((step, stepIndex) => (
                                  <li key={`${nutritionSelectedDay.date}-${meal.slot}-step-${stepIndex}`}>{step}</li>
                                ))}
                              </ol>
                            </section>
                            <section>
                              <span className="nutrition-mini-label">Servicio</span>
                              <p>{meal.prep?.servingGuide || meal.notes || 'Sin guía adicional.'}</p>
                              <p>{meal.prep?.chefNote || meal.notes}</p>
                            </section>
                          </div>

                          <div className="nutrition-meal-footer">
                            <span>{meal.notes}</span>
                            {meal.prep?.batchFriendly ? <span>Batch friendly</span> : <span>Preparación puntual</span>}
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="empty-text">Sin comidas cargadas para este día.</p>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="empty-text">Genera primero un plan semanal para ver el plan nutricional completo.</p>
          )}

          <section className="nutrition-tools">
            <article id="nutrition-barcode-tool" className="nutrition-tool-card">
              <SectionLabel
                title="Productos comerciales"
                subtitle="Escanea en vivo, sube una foto del código o escribe el EAN/UPC."
              />
              <div className="barcode-command-row">
                <div className="barcode-row">
                  <input
                    value={barcodeInput}
                    onChange={(event) => setBarcodeInput(normalizeBarcode(event.target.value))}
                    placeholder="Ej: 8410100083897"
                    inputMode="numeric"
                  />
                  <button type="button" onClick={() => lookupBarcode()} disabled={barcodeLoading}>
                    {barcodeLoading ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                <div className="barcode-action-row">
                  <button className="secondary" type="button" onClick={startBarcodeScanner}>
                    Escaneo en vivo
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => barcodeImageInputRef.current?.click()}
                    disabled={barcodeImageLoading}
                  >
                    {barcodeImageLoading ? 'Leyendo foto...' : 'Escanear desde foto'}
                  </button>
                  {barcodeScanOpen ? (
                    <button className="secondary" type="button" onClick={stopBarcodeScanner}>
                      Detener
                    </button>
                  ) : null}
                </div>
                <input
                  ref={barcodeImageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="visually-hidden"
                  onChange={(event) => scanBarcodeFromImageFile(event.target.files?.[0] || null)}
                />
              </div>
              {barcodeScanStatus ? <div className="tool-status-line">{barcodeScanStatus}</div> : null}
              {barcodeStatus ? <div className="tool-status-line neutral">{barcodeStatus}</div> : null}

              {barcodeScanOpen ? (
                <div className="camera-panel scanner-mode">
                  <div className="camera-viewfinder barcode" aria-hidden="true">
                    <span>Alinea el código en horizontal</span>
                  </div>
                  <video ref={scannerVideoRef} autoPlay playsInline muted />
                </div>
              ) : null}

              {barcodeProduct ? (
                <div className="product-card product-spotlight">
                  {barcodeProduct.imageUrl ? <img src={barcodeProduct.imageUrl} alt={barcodeProduct.name} /> : null}
                  <div className="product-spotlight-copy">
                    <div>
                      <h3>{barcodeProduct.name}</h3>
                      <p>{barcodeProduct.brand || 'Marca no disponible'}</p>
                      <p>Porción base: {barcodeProduct.servingSizeText}</p>
                    </div>
                    <Field label="Porción a registrar (g)">
                      <input
                        type="number"
                        min="1"
                        value={barcodeServingGrams}
                        onChange={(event) => setBarcodeServingGrams(event.target.value)}
                      />
                    </Field>
                  </div>
                  {barcodeScaledNutrition ? (
                    <div className="macro-chips">
                      <span>{barcodeScaledNutrition.totals.calories} kcal</span>
                      <span>P {barcodeScaledNutrition.totals.proteinGrams}</span>
                      <span>C {barcodeScaledNutrition.totals.carbsGrams}</span>
                      <span>G {barcodeScaledNutrition.totals.fatGrams}</span>
                      <span>GI {barcodeScaledNutrition.food.glycemicIndex}</span>
                      <span>GL {barcodeScaledNutrition.totals.glycemicLoad}</span>
                      <span>II {barcodeScaledNutrition.totals.insulinIndex}</span>
                    </div>
                  ) : null}
                  {Array.isArray(barcodeProduct.estimationNotes) && barcodeProduct.estimationNotes.length ? (
                    <div className="analysis-note-cloud">
                      {barcodeProduct.estimationNotes.map((note, index) => (
                        <span key={`product-note-${index}`}>{note}</span>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" onClick={addBarcodeProductToMeals} disabled={barcodeLoading}>
                    Añadir al registro nutricional
                  </button>
                </div>
              ) : null}
            </article>

            <article id="nutrition-calculator-tool" className="nutrition-tool-card">
              <SectionLabel
                title="Calculadora nutricional"
                subtitle="Calorías, índice glucémico, carga glucémica e índice insulínico estimado."
              />
              <div className="nutrition-calculator-shell">
                <div className="nutrition-calculator-kpis">
                  <article>
                    <span>Kcal</span>
                    <strong>{calculatorPreview.calories}</strong>
                  </article>
                  <article>
                    <span>GI</span>
                    <strong>{calculatorPreview.glycemicIndex}</strong>
                  </article>
                  <article>
                    <span>GL</span>
                    <strong>{calculatorPreview.gl}</strong>
                  </article>
                  <article>
                    <span>II</span>
                    <strong>{calculatorPreview.insulinIndex}</strong>
                  </article>
                </div>
                <div className="form-grid">
                  <Field label="Nombre del alimento/plato">
                    <input
                      value={calculatorInput.foodName}
                    onChange={(event) =>
                      setCalculatorInput((prev) => ({
                        ...prev,
                        foodName: event.target.value,
                      }))}
                    placeholder="Ej: Yogur griego con avena"
                  />
                </Field>
                <Field label="Proteína (g)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={calculatorInput.proteinGrams}
                    onChange={(event) =>
                      setCalculatorInput((prev) => ({
                        ...prev,
                        proteinGrams: event.target.value,
                      }))}
                  />
                </Field>
                <Field label="Carbohidratos (g)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={calculatorInput.carbsGrams}
                    onChange={(event) =>
                      setCalculatorInput((prev) => ({
                        ...prev,
                        carbsGrams: event.target.value,
                      }))}
                  />
                </Field>
                <Field label="Grasas (g)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={calculatorInput.fatGrams}
                    onChange={(event) =>
                      setCalculatorInput((prev) => ({
                        ...prev,
                        fatGrams: event.target.value,
                      }))}
                  />
                </Field>
                <Field label="Carbohidratos disponibles (g)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={calculatorInput.availableCarbsGrams}
                    onChange={(event) =>
                      setCalculatorInput((prev) => ({
                        ...prev,
                        availableCarbsGrams: event.target.value,
                      }))}
                  />
                </Field>
                <Field label="Índice glucémico (0-100)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={calculatorInput.glycemicIndex}
                    onChange={(event) =>
                      setCalculatorInput((prev) => ({
                        ...prev,
                        glycemicIndex: event.target.value,
                      }))}
                  />
                </Field>
                <Field label="Procesamiento (0-4)">
                  <input
                    type="number"
                    min="0"
                    max="4"
                    step="1"
                    value={calculatorInput.processedLevel}
                    onChange={(event) =>
                      setCalculatorInput((prev) => ({
                        ...prev,
                        processedLevel: event.target.value,
                      }))}
                    />
                  </Field>
                </div>
              </div>
              <div className="macro-chips">
                <span>Carga {calculatorPreview.glCategory}</span>
                <span>P {calculatorPreview.proteinGrams}</span>
                <span>C {calculatorPreview.carbsGrams}</span>
                <span>G {calculatorPreview.fatGrams}</span>
              </div>
              <div className="inline-actions">
                <button type="button" onClick={saveCalculatorMeal} disabled={calculatorSaving}>
                  {calculatorSaving ? 'Guardando...' : 'Guardar en registro'}
                </button>
              </div>
              {calculatorStatus ? <div className="tool-status-line neutral">{calculatorStatus}</div> : null}
            </article>
          </section>
        </section>
          </section>}
        </section>
      </section>

      <nav className="mobile-tabbar" aria-label="Navegación principal móvil">
        {tabs.map((tab) => (
          <button
            key={`mobile-${tab.id}`}
            type="button"
            className={`mobile-tabbar-item ${activeTab === tab.id ? 'active' : ''}`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="mobile-tabbar-icon" aria-hidden="true">{tab.icon}</span>
            <span className="mobile-tabbar-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {toasts.length > 0 ? (
        <div className="toast-container" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.type}`}>
              <span className="toast-icon">
                {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
              </span>
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
