/**
 * End-to-end test that simulates the exact POST /api/weekly-plan flow
 * step by step to find where the failure occurs.
 */

// Simulate what Next.js does when loading .env.local
import { isGeminiConfigured, resolveGeminiCoachModel, callGeminiExerciseCoach } from '../src/services/exerciseCoachClient.js';
import { isGoogleAiConfigured, resolveGoogleAiBackend } from '../src/services/googleGenAiTransport.js';

console.log('\n=== DIAGNOSTICO COMPLETO ===\n');
console.log('1. Variables de entorno clave:');
console.log('   GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `✅ (${process.env.GEMINI_API_KEY.length} chars)` : '❌ NO DEFINIDA');
console.log('   GEMINI_MODEL:', process.env.GEMINI_MODEL || 'no definido');
console.log('   GEMINI_MODEL_COACH:', process.env.GEMINI_MODEL_COACH || 'no definido');
console.log('   GEMINI_FORCE_MOCK:', process.env.GEMINI_FORCE_MOCK);
console.log('   GEMINI_FALLBACK_TO_MOCK:', process.env.GEMINI_FALLBACK_TO_MOCK);
console.log('   FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID || 'no definido');
console.log('   FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅ set' : '❌');

console.log('\n2. Configuración resuelta:');
console.log('   Backend:', resolveGoogleAiBackend());
console.log('   isGoogleAiConfigured():', isGoogleAiConfigured());
console.log('   isGeminiConfigured():', isGeminiConfigured());
console.log('   Coach model:', resolveGeminiCoachModel());

const profile = {
  sex: 'male',
  age: 30,
  weightKg: 75,
  heightCm: 175,
  activityLevel: 'moderate',
  goal: 'strength',
  trainingModality: 'full_gym',
};

const weeklyPlan = {
  goal: 'strength',
  trainingModality: 'full_gym',
  metabolicProfile: 'none',
  acsmPrescription: {
    fitt: {
      aerobic: '90-180 min/semana',
      resistance: '3-5 días/semana',
    },
  },
  days: [
    {
      dayName: 'Lunes',
      date: '2026-05-29',
      sessionType: 'resistance',
      sessionFocus: 'upper_push',
      workout: {
        title: 'Torso A — Empuje',
        durationMinutes: 65,
        intensityRpe: 'RPE 7-8',
        exercises: [
          { id: 'bench-press', name: 'Press banca', primaryMuscles: ['Pecho', 'Tríceps'] },
          { id: 'ohp', name: 'Press militar', primaryMuscles: ['Hombro anterior', 'Tríceps'] },
        ],
      },
    },
    {
      dayName: 'Miércoles',
      date: '2026-05-31',
      sessionType: 'resistance',
      sessionFocus: 'upper_pull',
      workout: {
        title: 'Torso B — Tirón',
        durationMinutes: 65,
        intensityRpe: 'RPE 7-8',
        exercises: [
          { id: 'barbell-row', name: 'Remo con barra', primaryMuscles: ['Dorsal', 'Bíceps'] },
          { id: 'pullup', name: 'Dominadas', primaryMuscles: ['Dorsal', 'Bíceps'] },
        ],
      },
    },
  ],
};

console.log('\n3. Llamando a Gemini Coach...');
const start = Date.now();

try {
  const result = await callGeminiExerciseCoach({
    profile,
    weeklyPlan,
    traceId: `diag-${Date.now()}`,
  });

  const elapsed = Date.now() - start;
  console.log(`\n✅ ÉXITO en ${elapsed}ms`);
  console.log('   Backend:', result.diagnostics?.backend);
  console.log('   Modelo:', result.diagnostics?.modelResolved);
  console.log('   Intentos:', result.diagnostics?.attempts);
  console.log('   Resumen:', result.coachSummary?.slice(0, 120) + '...');
  console.log('   Ajustes:', result.prescriptionAdjustments?.length, 'ajustes por día');
  console.log('\n   Primer ajuste:');
  if (result.prescriptionAdjustments?.[0]) {
    const adj = result.prescriptionAdjustments[0];
    console.log('     Día:', adj.day);
    console.log('     Ajuste:', adj.adjustment?.slice(0, 100) + '...');
    console.log('     Razón:', adj.rationale?.slice(0, 100) + '...');
    console.log('     Evidencia:', adj.evidence?.slice(0, 100) + '...');
  }
} catch (error) {
  const elapsed = Date.now() - start;
  console.error(`\n❌ FALLO en ${elapsed}ms`);
  console.error('   Código:', error.code);
  console.error('   Status HTTP:', error.statusCode);
  console.error('   Mensaje:', error.message);
  console.error('   Intento:', error.attempt, '/', error.maxAttempts);
  console.error('   Modelo:', error.model);
  if (error.details) console.error('   Detalles:', JSON.stringify(error.details).slice(0, 300));
}
