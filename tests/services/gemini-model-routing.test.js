import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

import {
  callGeminiExerciseCoach,
  resolveGeminiCoachModel,
} from '../../src/services/exerciseCoachClient.js';
import { callGeminiPlateModel } from '../../src/services/geminiClient.js';

describe('gemini model routing', () => {
  const envBackup = {
    GOOGLE_AI_BACKEND: process.env.GOOGLE_AI_BACKEND,
    VERTEX_AI_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID,
    VERTEX_AI_LOCATION: process.env.VERTEX_AI_LOCATION,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_MODEL_PLATE: process.env.GEMINI_MODEL_PLATE,
    GEMINI_MODEL_COACH: process.env.GEMINI_MODEL_COACH,
    GEMINI_COACH_MAX_RETRIES: process.env.GEMINI_COACH_MAX_RETRIES,
    GEMINI_COACH_RETRY_BASE_MS: process.env.GEMINI_COACH_RETRY_BASE_MS,
  };

  beforeEach(() => {
    process.env.GOOGLE_AI_BACKEND = 'gemini';
    process.env.VERTEX_AI_PROJECT_ID = '';
    process.env.VERTEX_AI_LOCATION = 'global';
    process.env.GOOGLE_CLIENT_EMAIL = '';
    process.env.GOOGLE_PRIVATE_KEY = '';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-default-model';
    process.env.GEMINI_MODEL_PLATE = 'gemini-plate-model';
    process.env.GEMINI_MODEL_COACH = 'gemini-coach-model';
    process.env.GEMINI_COACH_MAX_RETRIES = '2';
    process.env.GEMINI_COACH_RETRY_BASE_MS = '1';
  });

  afterEach(() => {
    process.env.GOOGLE_AI_BACKEND = envBackup.GOOGLE_AI_BACKEND;
    process.env.VERTEX_AI_PROJECT_ID = envBackup.VERTEX_AI_PROJECT_ID;
    process.env.VERTEX_AI_LOCATION = envBackup.VERTEX_AI_LOCATION;
    process.env.GOOGLE_CLIENT_EMAIL = envBackup.GOOGLE_CLIENT_EMAIL;
    process.env.GOOGLE_PRIVATE_KEY = envBackup.GOOGLE_PRIVATE_KEY;
    process.env.GEMINI_API_KEY = envBackup.GEMINI_API_KEY;
    process.env.GEMINI_MODEL = envBackup.GEMINI_MODEL;
    process.env.GEMINI_MODEL_PLATE = envBackup.GEMINI_MODEL_PLATE;
    process.env.GEMINI_MODEL_COACH = envBackup.GEMINI_MODEL_COACH;
    process.env.GEMINI_COACH_MAX_RETRIES = envBackup.GEMINI_COACH_MAX_RETRIES;
    process.env.GEMINI_COACH_RETRY_BASE_MS = envBackup.GEMINI_COACH_RETRY_BASE_MS;
    vi.restoreAllMocks();
  });

  it('uses GEMINI_MODEL_PLATE for plate analysis when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    foods: [
                      {
                        name: 'Arroz',
                        calories: 200,
                        proteinGrams: 4,
                        carbsGrams: 42,
                        fatGrams: 1,
                        availableCarbsGrams: 39,
                        glycemicIndex: 72,
                        processedLevel: 1,
                      },
                    ],
                    confidence: 0.8,
                    notes: ['ok'],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await callGeminiPlateModel({
      imageBase64: Buffer.from('fake-image').toString('base64'),
      promptContext: { dish: 'Arroz' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-plate-model:generateContent');
  });

  it('uses GEMINI_MODEL_COACH for exercise coach when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    coachSummary: 'Resumen',
                    acsmJustification: 'FITT alineado',
                    prescriptionAdjustments: [
                      {
                        day: 'Lunes',
                        adjustment: 'Reducir volumen',
                        rationale: 'Fatiga acumulada',
                        evidence: 'avgFatigue=7.5, completionRate=55%',
                      },
                    ],
                    riskFlags: ['Controlar recuperación'],
                    medicalDisclaimer: 'No sustituye evaluación médica.',
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const coach = await callGeminiExerciseCoach({
      profile: {
        sex: 'male',
        age: 30,
        weightKg: 75,
        heightCm: 175,
        activityLevel: 'moderate',
      },
      weeklyPlan: {
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
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-coach-model:generateContent');
    expect(coach.diagnostics).toBeTruthy();
    expect(coach.diagnostics.modelRequested).toBe('gemini-coach-model');
  });

  it('retries coach call when first response cannot be parsed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'resultado invalido sin json' },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          modelVersion: 'gemini-2.5-pro',
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      coachSummary: 'Resumen final',
                      acsmJustification: 'FITT progresivo',
                      prescriptionAdjustments: [
                        {
                          day: 'Lunes 2026-04-06',
                          adjustment: 'Mantener RPE 7.',
                          rationale: 'Carga interna estable.',
                          evidence: 'readiness=80',
                        },
                      ],
                      riskFlags: [],
                      medicalDisclaimer: 'Educativo',
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const coach = await callGeminiExerciseCoach({
      profile: {
        sex: 'male',
        age: 30,
        weightKg: 75,
        heightCm: 175,
        activityLevel: 'moderate',
      },
      weeklyPlan: {
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
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(coach.coachSummary).toBe('Resumen final');
    expect(coach.diagnostics.attempts).toBe(2);
    expect(coach.diagnostics.modelResolved).toBe('gemini-2.5-pro');
  });

  it('can route coach generation through Vertex AI when configured', async () => {
    process.env.GOOGLE_AI_BACKEND = 'vertex';
    process.env.GEMINI_API_KEY = '';
    process.env.VERTEX_AI_PROJECT_ID = 'endogym-prod';
    process.env.VERTEX_AI_LOCATION = 'global';
    process.env.GOOGLE_CLIENT_EMAIL = 'vertex@endogym.iam.gserviceaccount.com';
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    process.env.GOOGLE_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'vertex-token',
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          modelVersion: 'gemini-2.5-pro',
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      coachSummary: 'Resumen Vertex',
                      acsmJustification: 'FITT conservador',
                      prescriptionAdjustments: [
                        {
                          day: 'Lunes 2026-04-06',
                          adjustment: 'Mantener RPE 6-7.',
                          rationale: 'Adherencia estable.',
                          evidence: 'completionRate=80%',
                        },
                      ],
                      riskFlags: [],
                      medicalDisclaimer: 'Educativo',
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const coach = await callGeminiExerciseCoach({
      profile: {
        sex: 'male',
        age: 30,
        weightKg: 75,
        heightCm: 175,
        activityLevel: 'moderate',
      },
      weeklyPlan: {
        goal: 'strength',
        trainingModality: 'full_gym',
        metabolicProfile: 'none',
        acsmPrescription: { fitt: { aerobic: '90-180 min', resistance: '3-5 días' } },
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
      },
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(fetchMock.mock.calls[1][0]).toContain('/projects/endogym-prod/locations/global/publishers/google/models/gemini-coach-model:generateContent');
    expect(coach.diagnostics.backend).toBe('vertex');
  });

  it('uses Gemini 3.1 Pro as the default coach model for Vertex when no override exists', () => {
    process.env.GOOGLE_AI_BACKEND = 'vertex';
    process.env.GEMINI_MODEL = '';
    process.env.GEMINI_MODEL_COACH = '';

    expect(resolveGeminiCoachModel()).toBe('gemini-3.1-pro-preview');
  });
});
