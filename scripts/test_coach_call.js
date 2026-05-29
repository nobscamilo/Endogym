import { callGeminiExerciseCoach } from '../src/services/exerciseCoachClient.js';

// Verify that the environment variables are loaded
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Loaded" : "NOT Loaded");
console.log("GEMINI_MODEL_COACH:", process.env.GEMINI_MODEL_COACH);

const profile = {
  sex: 'male',
  age: 30,
  weightKg: 75,
  heightCm: 175,
  activityLevel: 'moderate',
};

const weeklyPlan = {
  goal: 'strength',
  trainingModality: 'full_gym',
  metabolicProfile: 'none',
  acsmPrescription: {
    fitt: {
      aerobic: '90-180 min',
      resistance: '3-5 días',
    },
  },
  days: [
    {
      dayName: 'Lunes',
      date: '2026-04-06',
      sessionType: 'resistance',
      workout: {
        title: 'Torso A',
        durationMinutes: 70,
        intensityRpe: 'RPE 7-9',
      },
    },
  ],
};

async function testCall() {
  try {
    console.log("Calling exercise coach...");
    const result = await callGeminiExerciseCoach({
      profile,
      weeklyPlan,
      traceId: 'test-trace-' + Date.now(),
    });
    console.log("SUCCESS!");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("FAILED!");
    console.error("Error Code:", error.code);
    console.error("Status Code:", error.statusCode);
    console.error("Message:", error.message);
    console.error("Details:", error.details);
  }
}

testCall();
