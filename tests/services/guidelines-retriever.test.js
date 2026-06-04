import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieveGuidelinesContext } from '../../src/services/guidelinesRetriever.js';
import { getAdminServices } from '../../src/lib/firebaseAdmin.js';

// Mock del Firebase Admin para no hacer llamadas reales
vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: vi.fn(),
}));

describe('guidelines RAG retriever', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('selects and fetches the most relevant guidelines from Firestore based on profile and goals', async () => {
    // 1. Mock de los documentos en Firestore
    const mockFilesMetadata = [
      { id: '1', data: () => ({ source: { fileName: "025 - 18. The Athlete With Diabetes.pdf" } }) },
      { id: '2', data: () => ({ source: { fileName: "044 - 35. Osteoporosis.pdf" } }) },
      { id: '3', data: () => ({ source: { fileName: "043 - 34. Low Back Disorders.pdf" } }) },
      { id: '4', data: () => ({ source: { fileName: "013 - 6. Exercise Physiology.pdf" } }) },
    ];

    const mockGetDoc = vi.fn().mockImplementation((docId) => {
      let fileName = '';
      let textContent = '';

      if (docId === '1') {
        fileName = '025 - 18. The Athlete With Diabetes.pdf';
        textContent = 'Pautas médicas para el manejo de la diabetes tipo 2 y control de glucosa.';
      } else if (docId === '2') {
        fileName = '044 - 35. Osteoporosis.pdf';
        textContent = 'Directrices para el entrenamiento de fuerza seguro en pacientes con osteoporosis.';
      } else {
        fileName = 'General.pdf';
        textContent = 'General';
      }

      return {
        exists: true,
        data: () => ({
          source: { fileName },
          pages: [
            { pageNumber: 1, text: textContent }
          ]
        })
      };
    });

    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: mockFilesMetadata,
      }),
      doc: vi.fn().mockImplementation((docId) => ({
        get: async () => mockGetDoc(docId)
      })),
    };

    getAdminServices.mockResolvedValue({ db: mockDb });

    // 2. Definir un perfil de usuario con diabetes y osteoporosis
    const profile = {
      age: 65,
      medicalConditions: 'diabetes tipo 2, osteoporosis leve',
    };

    const weeklyPlan = {
      goal: 'GLYCEMIC_CONTROL',
      preparticipationScreening: {
        input: {
          knownCardiometabolicDisease: true,
        }
      }
    };

    // 3. Ejecutar RAG
    const context = await retrieveGuidelinesContext({
      profile,
      weeklyPlan,
      traceId: 'test-trace-id',
    });

    // 4. Aserciones
    expect(mockDb.collection).toHaveBeenCalledWith('guidelines');
    expect(mockDb.select).toHaveBeenCalledWith('source.fileName', 'keywords');
    
    // Debería identificar coincidencia con el documento 1 (diabetes, glycemic, glucose) y el documento 2 (osteoporosis, bone, geriatrics)
    expect(mockDb.doc).toHaveBeenCalledWith('1');
    expect(mockDb.doc).toHaveBeenCalledWith('2');

    expect(context).toContain('=== CONTEXTO CIENTÍFICO Y DIRECTRICES DE MEDICINA DEL DEPORTE ===');
    expect(context).toContain('025 - 18. The Athlete With Diabetes.pdf');
    expect(context).toContain('044 - 35. Osteoporosis.pdf');
    expect(context).toContain('Pautas médicas para el manejo de la diabetes tipo 2');
    expect(context).toContain('Directrices para el entrenamiento de fuerza seguro en pacientes con osteoporosis');
  });

  it('returns empty string if Firestore collection is empty', async () => {
    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        empty: true,
        docs: [],
      }),
    };

    getAdminServices.mockResolvedValue({ db: mockDb });

    const context = await retrieveGuidelinesContext({
      profile: {},
      weeklyPlan: {},
      traceId: 'test-trace-id',
    });

    expect(context).toBe('');
  });

  it('matches documents by chunk-level keywords and ranks them higher', async () => {
    const mockFilesMetadata = [
      { id: '1', data: () => ({ source: { fileName: "General_Nutrition.pdf" }, keywords: ['obesity', 'diabetes'] }) },
      { id: '2', data: () => ({ source: { fileName: "ACSM_Guidelines.pdf" }, keywords: ['aerobic', 'endurance'] }) },
    ];

    const mockGetDoc = vi.fn().mockImplementation((docId) => {
      return {
        exists: true,
        data: () => ({
          source: { fileName: docId === '1' ? 'General_Nutrition.pdf' : 'ACSM_Guidelines.pdf' },
          pages: [
            { pageNumber: 1, text: 'Clinical details about the matching criteria.' }
          ]
        })
      };
    });

    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: mockFilesMetadata,
      }),
      doc: vi.fn().mockImplementation((docId) => ({
        get: async () => mockGetDoc(docId)
      })),
    };

    getAdminServices.mockResolvedValue({ db: mockDb });

    const profile = { age: 30 };
    const weeklyPlan = { goal: 'GLYCEMIC_CONTROL' }; // Derives 'diabetes', 'glycemic', etc.

    const context = await retrieveGuidelinesContext({
      profile,
      weeklyPlan,
      traceId: 'test-trace-id',
    });

    // Should match General_Nutrition.pdf since its keywords array contains 'diabetes'
    expect(mockDb.doc).toHaveBeenCalledWith('1');
    expect(context).toContain('General_Nutrition.pdf');
  });
});
