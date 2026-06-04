import { getAdminServices } from '../lib/firebaseAdmin.js';
import { logError, logInfo } from '../lib/logger.js';

/**
 * Deriva palabras clave de búsqueda basadas en el perfil de salud y los objetivos del usuario.
 */
function deriveKeywords(profile, weeklyPlan) {
  const keywords = new Set(['exercise physiology', 'sports medicine', 'therapeutic exercise']);

  // Analizar objetivo semanal
  const goal = weeklyPlan.goal?.toLowerCase() || '';
  if (goal.includes('loss') || goal.includes('weight') || goal.includes('cut') || goal.includes('recomposition')) {
    keywords.add('obesity');
    keywords.add('fat mass');
    keywords.add('weight loss');
  }
  if (goal.includes('hypertrophy') || goal.includes('strength') || goal.includes('bulk')) {
    keywords.add('strength');
    keywords.add('hypertrophy');
    keywords.add('resistance training');
    keywords.add('muscle');
  }
  if (goal.includes('endurance') || goal.includes('aerobic')) {
    keywords.add('aerobic');
    keywords.add('endurance');
    keywords.add('cardio');
    keywords.add('running');
    keywords.add('cycling');
  }
  if (goal.includes('glycemic') || goal.includes('control') || goal.includes('diabetes')) {
    keywords.add('diabetes');
    keywords.add('diabetic');
    keywords.add('glycemic');
    keywords.add('glucose');
  }

  // Analizar preparticipación y cribado médico
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

  // Analizar edad (poblaciones especiales)
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

  // Si hay alguna mención a dolores o condiciones en el perfil de salud general
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

/**
 * Realiza un RAG (búsqueda y recuperación) en Firestore sobre la colección 'guidelines'.
 * Retorna tanto el texto del contexto como las citaciones estructuradas.
 */
export async function retrieveGuidelinesContextWithCitations({ profile, weeklyPlan, traceId }) {
  try {
    const { db } = await getAdminServices();
    
    // 1. Derivar palabras clave
    const keywords = deriveKeywords(profile, weeklyPlan);
    logInfo('guidelines_retrieval_start', { traceId, keywords });

    // 2. Obtener metadatos de todos los documentos en 'guidelines'
    // Recuperamos también el campo 'keywords' para realizar búsqueda semántica a nivel de bloque
    const snapshot = await db.collection('guidelines').select('source.fileName', 'keywords').get();
    
    if (snapshot.empty) {
      logInfo('guidelines_retrieval_empty_db', { traceId });
      return { contextText: '', citations: [] };
    }

    // 3. Evaluar coincidencia (scoring) de cada documento basado en las palabras clave
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

        // Si la palabra clave coincide con el nombre del archivo (match temático general)
        if (fileName.includes(kwLower)) {
          score += 1.0;
          matched = true;
        }

        // Si coincide con las palabras clave específicas del bloque (match contextual preciso)
        if (docKeywords.some(dk => dk.toLowerCase() === kwLower)) {
          score += 1.5;
          matched = true;
        }

        if (matched) {
          matchedTerms.push(keyword);
        }
      });

      // Registrar el documento si posee al menos una coincidencia válida
      if (score > 0) {
        scoredDocs.push({
          id: doc.id,
          fileName: docData.source.fileName,
          score,
          matchedTerms
        });
      }
    });

    // Ordenar por puntaje descendente
    scoredDocs.sort((a, b) => b.score - a.score);

    // 4. Seleccionar los mejores (máximo 3 documentos para evitar exceder el límite de tokens/contexto útil)
    const topMatches = scoredDocs.slice(0, 3);

    if (topMatches.length === 0) {
      // Coincidencia por defecto si no hay nada específico (ej. Fisiología del ejercicio o Ejercicio terapéutico)
      const defaultMatch = snapshot.docs.find((doc) => {
        const name = String(doc.data().source?.fileName || '').toLowerCase();
        return name.includes('exercise physiology') || name.includes('therapeutic exercise') || name.includes('nutrition');
      });

      if (defaultMatch) {
        topMatches.push({
          id: defaultMatch.id,
          fileName: defaultMatch.data().source?.fileName || 'General Exercise Physiology',
          score: 1,
          matchedTerms: ['general_fallback']
        });
      }
    }

    logInfo('guidelines_retrieval_matches', { traceId, matches: topMatches });

    // 5. Cargar el contenido completo de los documentos seleccionados
    const contextBlocks = [];
    const citations = [];

    for (const match of topMatches) {
      const docSnapshot = await db.collection('guidelines').doc(match.id).get();
      if (!docSnapshot.exists) continue;

      const fullDoc = docSnapshot.data();
      const filename = fullDoc.source?.fileName || 'Documento sin nombre';
      
      citations.push({
        id: match.id,
        fileName: filename,
        matchedTerms: match.matchedTerms
      });

      // Unir el texto de las páginas. Para optimizar el tamaño, limitamos el número de páginas o limpiamos exceso de saltos.
      const fullText = (fullDoc.pages || [])
        .map((page) => `[Página ${page.pageNumber}]\n${page.text}`)
        .join('\n\n');

      // Limitar a máximo 25000 caracteres por documento recuperado para no inundar el contexto innecesariamente
      const truncatedText = fullText.length > 25000 ? `${fullText.slice(0, 25000)}\n... [Texto truncado por longitud] ...` : fullText;

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
Las siguientes secciones han sido recuperadas de la biblioteca médica de Endogym (Braddom's Physical Medicine and Rehabilitation & DeLee, Drez, & Miller's Orthopaedic Sports Medicine) para este usuario específico basado en sus condiciones clínicas y objetivos. Úsalas como la base de mayor prioridad para realizar tus ajustes de prescripción y justificación ACSM:

${contextBlocks.join('\n\n')}
================================================================
`.trim();

    return { contextText, citations };

  } catch (error) {
    logError('guidelines_retrieval_failed', error, { traceId });
    return { contextText: '', citations: [] };
  }
}

/**
 * Realiza un RAG (búsqueda y recuperación) en Firestore sobre la colección 'guidelines' y retorna sólo el texto.
 */
export async function retrieveGuidelinesContext({ profile, weeklyPlan, traceId }) {
  const result = await retrieveGuidelinesContextWithCitations({ profile, weeklyPlan, traceId });
  return result.contextText;
}

