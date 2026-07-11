import { getAdminServices } from '../lib/firebaseAdmin.js';
import { logError, logInfo } from '../lib/logger.js';
import { FieldValue } from 'firebase-admin/firestore';
import { requestGoogleEmbeddings, EMBEDDING_DIMENSIONS } from './googleGenAiTransport.js';

// ============================================================================
// RAG de directrices médicas.
//
// Modo principal: BÚSQUEDA SEMÁNTICA (embeddings + Firestore vector search).
//   - Colección `guideline_passages`: pasajes (~800 tokens) con vector de 768 dims.
//   - Se embebe una consulta en lenguaje natural derivada del perfil/objetivo y se
//     recuperan los pasajes más cercanos con findNearest (COSINE).
//
// Fallback: BÚSQUEDA LÉXICA por keywords sobre la colección `guidelines` (libros
//   completos). Se usa si no hay GEMINI_API_KEY, si la generación del embedding
//   falla, o si findNearest falla (p. ej. índice vectorial aún no creado) o no
//   devuelve resultados. Garantiza que /api/weekly-plan nunca quede sin contexto.
// ============================================================================

const PASSAGES_COLLECTION = 'guideline_passages';
const PASSAGE_LIMIT = 12; // pasajes a recuperar por findNearest
const CONTEXT_CHAR_BUDGET = 20000; // tope de caracteres de contexto inyectado

// Términos que identifican a un documento como de nutrición/nutrición deportiva.
// Debe mantenerse alineado con las keywords de nutrición del parser (parse_pdf_improved.py).
const NUTRITION_TERMS = new Set([
  'nutrition', 'sports nutrition', 'protein', 'amino acid', 'protein synthesis', 'carbohydrate',
  'glycogen', 'dietary fat', 'hydration', 'fluid', 'electrolyte', 'sodium', 'micronutrient',
  'vitamin', 'mineral', 'iron', 'calcium', 'creatine', 'caffeine', 'nitrate', 'beta-alanine',
  'bicarbonate', 'supplement', 'ergogenic', 'energy availability', 'energy balance', 'calorie',
  'fiber', 'gastrointestinal', 'recovery',
]);

// ----------------------------------------------------------------------------
// Intención HÍBRIDA (fuerza + cardio en formato circuito).
//
// El usuario puede pedir "ejercicio híbrido": sesiones de fuerza ejecutadas como
// circuito (descansos cortos, FC elevada) para obtener estímulo cardiovascular y
// de fuerza a la vez. Se detecta por la pregunta del chat, por el objetivo o por
// la modalidad, y se enriquece la query semántica con la terminología que usa la
// literatura (ACSM) para que los pasajes correctos queden cerca en el espacio de
// embeddings: circuit resistance training, HIIT, concurrent training, etc.
// ----------------------------------------------------------------------------
const HYBRID_INTENT_RE = new RegExp(
  [
    'h[ií]brid\\w*',
    'circuito',
    'circuit\\s*training',
    'hiit',
    'metcon',
    'acondicionamiento\\s+metab[óo]lico',
    'metabolic\\s+conditioning',
    'entrenamiento\\s+concurrente',
    'concurrent\\s+training',
    // "fuerza ... cardio" o "cardio ... fuerza" en la misma frase (hasta 5 palabras entre medias)
    '(?:fuerza|strength)(?:\\W+\\w+){0,5}?\\W+(?:cardio\\w*|aer[óo]bic\\w*)',
    '(?:cardio\\w*|aer[óo]bic\\w*)(?:\\W+\\w+){0,5}?\\W+(?:fuerza|strength)',
  ].join('|'),
  'i'
);

// hybrid_run_gym NO está aquí a propósito: ese perfil (corredor + gimnasio) prescribe
// fuerza tradicional SEPARADA del rodaje y tiene su propio enriquecimiento de
// interferencia; el circuito con FC elevada es para el híbrido general (mixed/hybrid).
const HYBRID_MODALITIES = new Set(['mixed', 'hybrid']);

// Texto de enriquecimiento con términos en español e inglés (los libros fuente
// están en inglés; los embeddings multilingües aprovechan ambos anclajes).
const HYBRID_CIRCUIT_ENRICHMENT = 'Prescripción de entrenamiento HÍBRIDO fuerza + cardio en formato circuito '
  + '(circuit resistance training, high-intensity circuit training, metabolic conditioning, HIIT con cargas): '
  + 'ejercicios de fuerza multiarticulares encadenados con descansos cortos (15-30 s) para mantener la frecuencia '
  + 'cardiaca elevada; prescripción FITT-VP simultánea de fuerza (series, repeticiones, %1RM, RPE) y '
  + 'cardiorrespiratoria (%FCmáx, %FCR, VO2R, RPE); entrenamiento concurrente (concurrent training) y efecto de '
  + 'interferencia; seguridad, técnica bajo fatiga y progresión de volumen e intensidad.';

// Solo texto (pregunta/objetivo). La modalidad se evalúa aparte en cada camino:
// en el chat NO basta con que el usuario tenga modalidad híbrida — la pregunta
// debe ir de híbrido/circuito para no contaminar preguntas ajenas (p. ej. creatina).
function detectHybridIntentText(...texts) {
  return texts.some((t) => HYBRID_INTENT_RE.test(String(t || '')));
}

// Espejo de resolveHybridCircuitDays (src/core/planner.js) — NO se importa el planner
// aquí para no arrastrar el catálogo de ejercicios a este servicio. Si el plan del
// usuario incluirá circuitos híbridos (preferencia explícita o sesgo de recomposición),
// el contexto del weekly-plan debe traer las guías de circuito. Mantener alineado.
const HYBRID_CIRCUIT_ALLOWED_MODALITIES = new Set(['full_gym', 'home', 'trx', 'calisthenics', 'mixed']);

function planWillIncludeHybridCircuit(profile, goal, modality) {
  if (modality && !HYBRID_CIRCUIT_ALLOWED_MODALITIES.has(String(modality)) && !HYBRID_MODALITIES.has(String(modality))) {
    return false;
  }
  if (profile?.prefersHybridCircuit === true) return true;
  if (profile?.prefersHybridCircuit === false) return false;
  return String(goal || '').toLowerCase().includes('recomposition');
}

// ----------------------------------------------------------------------------
// Construcción de la consulta semántica en lenguaje natural.
// ----------------------------------------------------------------------------
function buildQueryText(profileInput, weeklyPlanInput, userQuery) {
  const profile = profileInput || {};
  const weeklyPlan = weeklyPlanInput || {};
  // FASE 0.3 — Chat del coach: si hay pregunta del usuario, la query semántica se
  // construye desde la PREGUNTA + (objetivo, modalidad), no desde el perfil clínico
  // completo. Así los pasajes recuperados responden a lo que el usuario pregunta.
  const trimmedQuery = typeof userQuery === 'string' ? userQuery.trim() : '';
  if (trimmedQuery) {
    const queryParts = [`Pregunta del usuario: ${trimmedQuery}`];
    const qGoal = weeklyPlan.goal || profile.goal || '';
    if (qGoal) queryParts.push(`Objetivo de entrenamiento: ${qGoal}.`);
    const qModality = weeklyPlan.trainingModality || profile.trainingModality || profile.trainingMode || '';
    if (qModality) queryParts.push(`Modalidad: ${qModality}.`);
    // HÍBRIDO (fuerza + cardio en circuito): si la PREGUNTA (u objetivo) va de eso,
    // ancla la query en la terminología de la literatura para recuperar pasajes de
    // fuerza, cardio y entrenamiento concurrente a la vez.
    if (detectHybridIntentText(trimmedQuery, qGoal)) {
      queryParts.push(HYBRID_CIRCUIT_ENRICHMENT);
    }
    return queryParts.join(' ');
  }

  const parts = [];
  const goal = weeklyPlan.goal || '';
  if (goal) parts.push(`Objetivo de entrenamiento: ${goal}.`);

  const modality = weeklyPlan.trainingModality || profile.trainingModality || profile.trainingMode || '';
  if (modality) parts.push(`Modalidad de entrenamiento: ${modality}.`);
  // Entrenamiento concurrente (correr + gimnasio): pide guías específicas de interferencia,
  // orden de sesiones y recuperación entre fuerza y resistencia.
  if (modality === 'hybrid_run_gym') {
    parts.push(
      'Entrenamiento concurrente de fuerza y resistencia (correr + gimnasio): minimizar el '
      + 'efecto de interferencia, ordenar sesiones (separar fuerza de piernas de tiradas largas), '
      + 'gestionar volumen e intensidad y recuperación entre estímulos.'
    );
  }
  // Modalidad híbrida general (fuerza + cardio, incluida la fuerza en circuito),
  // objetivo que lo pida explícitamente, o plan que incluirá circuitos híbridos
  // (preferencia del usuario / sesgo de recomposición): recuperar guías de
  // circuito/concurrente.
  if (HYBRID_MODALITIES.has(modality)
    || detectHybridIntentText(goal)
    || planWillIncludeHybridCircuit(profile, goal, modality)) {
    parts.push(HYBRID_CIRCUIT_ENRICHMENT);
  }

  const age = Number(profile.age);
  if (Number.isFinite(age)) parts.push(`Edad: ${age} años.`);
  if (profile.sex) parts.push(`Sexo: ${profile.sex}.`);

  const screening = weeklyPlan.preparticipationScreening?.input || {};
  if (screening.knownCardiometabolicDisease) {
    parts.push('Enfermedad cardiometabólica conocida (cardiovascular, diabetes, renal o pulmonar).');
  }
  if (screening.exerciseSymptoms) parts.push('Presenta síntomas durante el ejercicio.');
  if (screening.contraindications) parts.push('Posibles contraindicaciones para el ejercicio.');

  if (profile.medicalConditions) parts.push(`Condiciones médicas: ${profile.medicalConditions}.`);
  if (profile.physicalInjuries) parts.push(`Lesiones o dolores físicos: ${profile.physicalInjuries}.`);

  parts.push(
    'Necesito prescripción de ejercicio basada en evidencia (ACSM) y recomendaciones de '
    + 'nutrición deportiva (proteína, carbohidratos, hidratación y suplementación con evidencia) '
    + 'apropiadas y seguras para este perfil clínico.'
  );

  return parts.join(' ');
}

// ----------------------------------------------------------------------------
// Modo principal: búsqueda vectorial.
// ----------------------------------------------------------------------------
async function retrieveByVector({ db, profile, weeklyPlan, userQuery, traceId }) {
  if (!process.env.GEMINI_API_KEY) {
    return null; // sin key no se puede embeber; usar fallback
  }

  const queryText = buildQueryText(profile, weeklyPlan, userQuery);
  let queryVector;
  try {
    const [vec] = await requestGoogleEmbeddings({
      texts: [queryText],
      taskType: 'RETRIEVAL_QUERY',
      traceId,
      timeoutMs: 8000,
    });
    if (!vec || vec.length !== EMBEDDING_DIMENSIONS) return null;
    queryVector = vec;
  } catch (error) {
    logError('guidelines_vector_embed_failed', error, { traceId });
    return null;
  }

  let snap;
  try {
    const vq = db.collection(PASSAGES_COLLECTION).findNearest({
      vectorField: 'embedding',
      queryVector: FieldValue.vector(queryVector),
      limit: PASSAGE_LIMIT,
      distanceMeasure: 'COSINE',
      distanceResultField: '_distance',
    });
    snap = await vq.get();
  } catch (error) {
    // Causa típica: índice vectorial aún no creado. Degradar a keywords.
    logError('guidelines_vector_findnearest_failed', error, { traceId });
    return null;
  }

  if (!snap || snap.empty) {
    logInfo('guidelines_vector_empty', { traceId });
    return null;
  }

  // Agrupar pasajes por documento fuente, respetando el orden de cercanía.
  const blocks = [];
  const citationsMap = new Map();
  let charCount = 0;

  for (const doc of snap.docs) {
    const p = doc.data();
    const fileName = p.fileName || p.originalFileName || 'Documento sin nombre';
    const distance = typeof p._distance === 'number' ? p._distance : null;
    const pageRange = p.pageStart && p.pageEnd && p.pageStart !== p.pageEnd
      ? `pp. ${p.pageStart}-${p.pageEnd}`
      : (p.pageStart ? `p. ${p.pageStart}` : '');
    const text = String(p.text || '');

    if (charCount + text.length > CONTEXT_CHAR_BUDGET && blocks.length > 0) {
      continue; // ya tenemos suficiente contexto
    }
    charCount += text.length;

    blocks.push(`---
DOCUMENTO FUENTE: ${fileName} ${pageRange}
RELEVANCIA (distancia coseno, menor = más relevante): ${distance !== null ? distance.toFixed(4) : 'n/d'}

CONTENIDO:
${text}`);

    if (!citationsMap.has(fileName)) {
      citationsMap.set(fileName, {
        id: p.parentId || doc.id,
        fileName,
        passages: 0,
        bestDistance: distance,
        pages: [],
      });
    }
    const c = citationsMap.get(fileName);
    c.passages += 1;
    if (distance !== null && (c.bestDistance === null || distance < c.bestDistance)) c.bestDistance = distance;
    if (pageRange) c.pages.push(pageRange);
  }

  if (blocks.length === 0) return null;

  const citations = Array.from(citationsMap.values()).map((c) => ({
    id: c.id,
    fileName: c.fileName,
    matchedTerms: [`semantic:${c.passages} pasaje(s)`],
    bestDistance: c.bestDistance,
  }));

  logInfo('guidelines_vector_matches', {
    traceId,
    mode: 'vector',
    passages: snap.size,
    sources: citations.map((c) => ({ fileName: c.fileName, bestDistance: c.bestDistance })),
  });

  const contextText = `
=== CONTEXTO CIENTÍFICO Y DIRECTRICES DE MEDICINA DEL DEPORTE (recuperación semántica) ===
Los siguientes pasajes fueron recuperados por similitud semántica de la biblioteca médica de Endogym (incluye ACSM, Braddom's Physical Medicine & Rehabilitation, DeLee/Drez/Miller's Orthopaedic Sports Medicine y referencias de nutrición deportiva) para este usuario, según su perfil clínico y objetivo. Úsalos como base de mayor prioridad para tus ajustes de prescripción y su justificación ACSM:

${blocks.join('\n\n')}
================================================================
`.trim();

  return { contextText, citations };
}

// ----------------------------------------------------------------------------
// Derivación de keywords (fallback léxico).
// ----------------------------------------------------------------------------
function deriveKeywords(profile, weeklyPlan) {
  // Base ligera: fisiología/medicina deportiva + ancla nutricional mínima.
  const keywords = new Set([
    'exercise physiology', 'sports medicine', 'therapeutic exercise',
    'nutrition', 'sports nutrition',
  ]);

  const goal = weeklyPlan.goal?.toLowerCase() || '';
  if (goal.includes('loss') || goal.includes('weight') || goal.includes('cut') || goal.includes('recomposition')) {
    keywords.add('obesity');
    keywords.add('fat mass');
    keywords.add('weight loss');
    keywords.add('energy availability');
    keywords.add('energy balance');
    keywords.add('calorie');
    keywords.add('fiber');
  }
  if (goal.includes('hypertrophy') || goal.includes('strength') || goal.includes('bulk')) {
    keywords.add('strength');
    keywords.add('hypertrophy');
    keywords.add('resistance training');
    keywords.add('muscle');
    keywords.add('protein synthesis');
    keywords.add('amino acid');
    keywords.add('creatine');
  }
  if (goal.includes('endurance') || goal.includes('aerobic')) {
    keywords.add('aerobic');
    keywords.add('endurance');
    keywords.add('cardio');
    keywords.add('running');
    keywords.add('cycling');
    keywords.add('glycogen');
    keywords.add('electrolyte');
    keywords.add('caffeine');
    keywords.add('nitrate');
  }
  // HÍBRIDO (fuerza + cardio / fuerza en circuito): el fallback léxico también debe
  // traer documentos de AMBOS dominios y de circuito/concurrente, no solo del objetivo.
  const modality = weeklyPlan.trainingModality || profile.trainingModality || profile.trainingMode || '';
  if (HYBRID_MODALITIES.has(modality) || detectHybridIntentText(goal)
    || planWillIncludeHybridCircuit(profile, goal, modality)) {
    keywords.add('circuit training');
    keywords.add('circuit');
    keywords.add('high-intensity');
    keywords.add('interval');
    keywords.add('concurrent training');
    keywords.add('resistance training');
    keywords.add('strength');
    keywords.add('aerobic');
    keywords.add('cardiorespiratory');
    keywords.add('cardio');
    keywords.add('heart rate');
  }

  if (goal.includes('glycemic') || goal.includes('control') || goal.includes('diabetes')) {
    keywords.add('diabetes');
    keywords.add('diabetic');
    keywords.add('glycemic');
    keywords.add('glucose');
    keywords.add('fiber');
  }

  const screening = weeklyPlan.preparticipationScreening?.input || {};
  if (screening.knownCardiometabolicDisease) {
    keywords.add('diabetes');
    keywords.add('diabetic');
    keywords.add('cardiovascular');
    keywords.add('cardiopulmonary');
    keywords.add('heart');
    keywords.add('renal');
    keywords.add('pulmonary');
  }

  if (screening.exerciseSymptoms || screening.contraindications) {
    keywords.add('pain');
    keywords.add('injury');
    keywords.add('rehabilitation');
    keywords.add('prevention');
  }

  const age = Number(profile.age);
  if (Number.isFinite(age)) {
    if (age > 60) {
      keywords.add('geriatrics');
      keywords.add('osteoporosis');
      keywords.add('medical frailty');
    } else if (age < 18) {
      keywords.add('young athlete');
      keywords.add('pediatric');
      keywords.add('adolescent');
      keywords.add('immature');
    }
  }

  const conditions = String(profile.medicalConditions || '').toLowerCase();
  const physicalInjuries = String(profile.physicalInjuries || '').toLowerCase();
  const healthText = `${conditions} ${physicalInjuries}`;

  if (healthText.includes('osteoporosis') || healthText.includes('hueso') || healthText.includes('osteopenia')) {
    keywords.add('osteoporosis');
    keywords.add('bone');
  }
  if (healthText.includes('hipertension') || healthText.includes('presion') || healthText.includes('tensión')) {
    keywords.add('hypertension');
    keywords.add('cardiovascular');
  }
  if (healthText.includes('espalda') || healthText.includes('lumbar') || healthText.includes('columna')) {
    keywords.add('low back');
    keywords.add('spine');
    keywords.add('neck');
  }
  if (healthText.includes('rodilla') || healthText.includes('knee') || healthText.includes('patel')) {
    keywords.add('knee');
    keywords.add('patella');
    keywords.add('patellofemoral');
  }
  if (healthText.includes('hombro') || healthText.includes('shoulder')) {
    keywords.add('shoulder');
    keywords.add('glenohumeral');
    keywords.add('rotator cuff');
  }

  return Array.from(keywords);
}

// ----------------------------------------------------------------------------
// Fallback léxico: scoring por keywords sobre la colección `guidelines`.
// ----------------------------------------------------------------------------
async function retrieveByKeywords({ db, profile, weeklyPlan, traceId }) {
  const keywords = deriveKeywords(profile, weeklyPlan);
  logInfo('guidelines_retrieval_start', { traceId, mode: 'keywords', keywords });

  const snapshot = await db.collection('guidelines').select('source.fileName', 'keywords').get();
  if (snapshot.empty) {
    logInfo('guidelines_retrieval_empty_db', { traceId });
    return { contextText: '', citations: [] };
  }

  const scoredDocs = [];
  snapshot.docs.forEach((doc) => {
    const docData = doc.data();
    const fileName = String(docData.source?.fileName || '').toLowerCase();
    const docKeywords = Array.isArray(docData.keywords) ? docData.keywords : [];

    let score = 0;
    const matchedTerms = [];

    keywords.forEach((keyword) => {
      const kwLower = keyword.toLowerCase();
      let matched = false;
      if (fileName.includes(kwLower)) {
        score += 1.0;
        matched = true;
      }
      if (docKeywords.some((dk) => dk.toLowerCase() === kwLower)) {
        score += 1.5;
        matched = true;
      }
      if (matched) matchedTerms.push(keyword);
    });

    if (score > 0) {
      const isNutrition = fileName.includes('nutrition')
        || docKeywords.some((dk) => NUTRITION_TERMS.has(String(dk).toLowerCase()));
      scoredDocs.push({ id: doc.id, fileName: docData.source.fileName, score, matchedTerms, isNutrition });
    }
  });

  scoredDocs.sort((a, b) => b.score - a.score);

  const topMatches = scoredDocs.slice(0, 3);
  if (!topMatches.some((m) => m.isNutrition)) {
    const bestNutrition = scoredDocs.slice(3).find((m) => m.isNutrition);
    if (bestNutrition) topMatches.push(bestNutrition);
  }

  if (topMatches.length === 0) {
    const defaultMatch = snapshot.docs.find((doc) => {
      const data = doc.data();
      const name = String(data.source?.fileName || '').toLowerCase();
      const dkw = Array.isArray(data.keywords) ? data.keywords.map((k) => String(k).toLowerCase()) : [];
      return (
        name.includes('exercise physiology')
        || name.includes('therapeutic exercise')
        || name.includes('nutrition')
        || dkw.includes('nutrition')
        || dkw.includes('sports nutrition')
      );
    });
    if (defaultMatch) {
      topMatches.push({
        id: defaultMatch.id,
        fileName: defaultMatch.data().source?.fileName || 'General Exercise Physiology',
        score: 1,
        matchedTerms: ['general_fallback'],
      });
    }
  }

  logInfo('guidelines_retrieval_matches', { traceId, mode: 'keywords', matches: topMatches });

  const contextBlocks = [];
  const citations = [];

  for (const match of topMatches) {
    const docSnapshot = await db.collection('guidelines').doc(match.id).get();
    if (!docSnapshot.exists) continue;

    const fullDoc = docSnapshot.data();
    const filename = fullDoc.source?.fileName || 'Documento sin nombre';

    citations.push({ id: match.id, fileName: filename, matchedTerms: match.matchedTerms });

    const fullText = (fullDoc.pages || [])
      .map((page) => `[Página ${page.pageNumber}]\n${page.text}`)
      .join('\n\n');
    const truncatedText = fullText.length > 25000
      ? `${fullText.slice(0, 25000)}\n... [Texto truncado por longitud] ...`
      : fullText;

    contextBlocks.push(`---
DOCUMENTO FUENTE: ${filename}
PALABRAS CLAVE QUE COINCIDIERON: ${match.matchedTerms.join(', ')}

CONTENIDO:
${truncatedText}`);
  }

  if (contextBlocks.length === 0) {
    return { contextText: '', citations: [] };
  }

  const contextText = `
=== CONTEXTO CIENTÍFICO Y DIRECTRICES DE MEDICINA DEL DEPORTE ===
Las siguientes secciones han sido recuperadas de la biblioteca médica de Endogym para este usuario específico basado en sus condiciones clínicas y objetivos. Úsalas como la base de mayor prioridad para realizar tus ajustes de prescripción y justificación ACSM:

${contextBlocks.join('\n\n')}
================================================================
`.trim();

  return { contextText, citations };
}

/**
 * RAG principal: intenta búsqueda semántica (vector) y degrada a léxica (keywords)
 * si la primera no está disponible. Retorna texto de contexto + citaciones.
 */
export async function retrieveGuidelinesContextWithCitations({ profile, weeklyPlan, userQuery, traceId }) {
  try {
    const { db } = await getAdminServices();

    const vectorResult = await retrieveByVector({ db, profile, weeklyPlan, userQuery, traceId });
    if (vectorResult && vectorResult.contextText) {
      return vectorResult;
    }

    // Nota (FASE 0.3): el fallback léxico sigue siendo por perfil (keywords clínicas);
    // la pregunta del usuario solo dirige el modo semántico.
    logInfo('guidelines_vector_fallback_keywords', { traceId });
    return await retrieveByKeywords({ db, profile, weeklyPlan, traceId });
  } catch (error) {
    logError('guidelines_retrieval_failed', error, { traceId });
    return { contextText: '', citations: [] };
  }
}

/**
 * Igual que el anterior pero retorna sólo el texto del contexto.
 */
export async function retrieveGuidelinesContext({ profile, weeklyPlan, userQuery, traceId }) {
  const result = await retrieveGuidelinesContextWithCitations({ profile, weeklyPlan, userQuery, traceId });
  return result.contextText;
}
