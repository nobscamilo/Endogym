import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieveGuidelinesContext, retrieveGuidelinesContextWithCitations } from '../../src/services/guidelinesRetriever.js';
import { getAdminServices } from '../../src/lib/firebaseAdmin.js';
import { requestGoogleEmbeddings } from '../../src/services/googleGenAiTransport.js';

// Mock del Firebase Admin para no hacer llamadas reales
vi.mock('../../src/lib/firebaseAdmin.js', () => ({
  getAdminServices: vi.fn(),
}));

// Mock del transporte de embeddings (evita red real). FieldValue se reexporta real.
vi.mock('../../src/services/googleGenAiTransport.js', () => ({
  requestGoogleEmbeddings: vi.fn(),
  EMBEDDING_DIMENSIONS: 768,
}));

const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

describe('guidelines RAG retriever', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Por defecto, sin embeddings disponibles -> el retriever cae al modo léxico (keywords).
    delete process.env.GEMINI_API_KEY;
    requestGoogleEmbeddings.mockResolvedValue([]);
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  });

  // --------------------------------------------------------------------------
  // Camino principal: búsqueda semántica (vector).
  // --------------------------------------------------------------------------
  it('uses semantic vector search (findNearest) when embeddings are available', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    requestGoogleEmbeddings.mockResolvedValue([new Array(768).fill(0.1)]);

    const passageDocs = [
      {
        id: 'p1',
        data: () => ({
          parentId: 'docA', fileName: 'Sports Nutrition.pdf',
          pageStart: 10, pageEnd: 11, text: 'La creatina monohidrato mejora la fuerza.', _distance: 0.12,
        }),
      },
      {
        id: 'p2',
        data: () => ({
          parentId: 'docB', fileName: 'Resistance Training.pdf',
          pageStart: 3, pageEnd: 3, text: 'Series y repeticiones para hipertrofia.', _distance: 0.20,
        }),
      },
    ];

    const vectorQuery = { get: vi.fn().mockResolvedValue({ empty: false, size: 2, docs: passageDocs }) };
    const findNearest = vi.fn().mockReturnValue(vectorQuery);
    const mockDb = {
      collection: vi.fn().mockReturnValue({ findNearest }),
    };
    getAdminServices.mockResolvedValue({ db: mockDb });

    const { contextText, citations } = await retrieveGuidelinesContextWithCitations({
      profile: { age: 28 },
      weeklyPlan: { goal: 'hypertrophy', preparticipationScreening: { input: {} } },
      traceId: 'test',
    });

    expect(requestGoogleEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'RETRIEVAL_QUERY' }),
    );
    expect(findNearest).toHaveBeenCalled();
    expect(contextText).toContain('recuperación semántica');
    expect(contextText).toContain('Sports Nutrition.pdf');
    expect(contextText).toContain('La creatina monohidrato mejora la fuerza.');
    expect(citations.map((c) => c.fileName)).toContain('Sports Nutrition.pdf');
  });

  // --------------------------------------------------------------------------
  // Fallback léxico: cuando el vector no está disponible.
  // --------------------------------------------------------------------------
  it('falls back to keyword search and fetches the most relevant guidelines', async () => {
    const mockFilesMetadata = [
      { id: '1', data: () => ({ source: { fileName: '025 - 18. The Athlete With Diabetes.pdf' } }) },
      { id: '2', data: () => ({ source: { fileName: '044 - 35. Osteoporosis.pdf' } }) },
      { id: '3', data: () => ({ source: { fileName: '043 - 34. Low Back Disorders.pdf' } }) },
      { id: '4', data: () => ({ source: { fileName: '013 - 6. Exercise Physiology.pdf' } }) },
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
        data: () => ({ source: { fileName }, pages: [{ pageNumber: 1, text: textContent }] }),
      };
    });

    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: false, docs: mockFilesMetadata }),
      doc: vi.fn().mockImplementation((docId) => ({ get: async () => mockGetDoc(docId) })),
    };

    getAdminServices.mockResolvedValue({ db: mockDb });

    const context = await retrieveGuidelinesContext({
      profile: { age: 65, medicalConditions: 'diabetes tipo 2, osteoporosis leve' },
      weeklyPlan: { goal: 'GLYCEMIC_CONTROL', preparticipationScreening: { input: { knownCardiometabolicDisease: true } } },
      traceId: 'test-trace-id',
    });

    expect(mockDb.collection).toHaveBeenCalledWith('guidelines');
    expect(mockDb.select).toHaveBeenCalledWith('source.fileName', 'keywords');
    expect(mockDb.doc).toHaveBeenCalledWith('1');
    expect(mockDb.doc).toHaveBeenCalledWith('2');
    expect(context).toContain('=== CONTEXTO CIENTÍFICO Y DIRECTRICES DE MEDICINA DEL DEPORTE ===');
    expect(context).toContain('025 - 18. The Athlete With Diabetes.pdf');
    expect(context).toContain('044 - 35. Osteoporosis.pdf');
    expect(context).toContain('Pautas médicas para el manejo de la diabetes tipo 2');
    expect(context).toContain('Directrices para el entrenamiento de fuerza seguro en pacientes con osteoporosis');
  });

  it('returns empty string if Firestore collection is empty (keyword fallback)', async () => {
    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    };
    getAdminServices.mockResolvedValue({ db: mockDb });

    const context = await retrieveGuidelinesContext({ profile: {}, weeklyPlan: {}, traceId: 'test-trace-id' });
    expect(context).toBe('');
  });

  it('matches documents by chunk-level keywords and ranks them higher (keyword fallback)', async () => {
    const mockFilesMetadata = [
      { id: '1', data: () => ({ source: { fileName: 'General_Nutrition.pdf' }, keywords: ['obesity', 'diabetes'] }) },
      { id: '2', data: () => ({ source: { fileName: 'ACSM_Guidelines.pdf' }, keywords: ['aerobic', 'endurance'] }) },
    ];

    const mockGetDoc = vi.fn().mockImplementation((docId) => ({
      exists: true,
      data: () => ({
        source: { fileName: docId === '1' ? 'General_Nutrition.pdf' : 'ACSM_Guidelines.pdf' },
        pages: [{ pageNumber: 1, text: 'Clinical details about the matching criteria.' }],
      }),
    }));

    const mockDb = {
      collection: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: false, docs: mockFilesMetadata }),
      doc: vi.fn().mockImplementation((docId) => ({ get: async () => mockGetDoc(docId) })),
    };

    getAdminServices.mockResolvedValue({ db: mockDb });

    const context = await retrieveGuidelinesContext({
      profile: { age: 30 },
      weeklyPlan: { goal: 'GLYCEMIC_CONTROL' },
      traceId: 'test-trace-id',
    });

    expect(mockDb.doc).toHaveBeenCalledWith('1');
    expect(context).toContain('General_Nutrition.pdf');
  });
});
