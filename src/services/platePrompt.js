function targetBlock(nutritionTargets) {
  if (!nutritionTargets) {
    return 'No hay objetivo nutricional disponible para este usuario.';
  }

  return `Objetivo diario del usuario:
- calorias: ${nutritionTargets.calories}
- proteina_g: ${nutritionTargets.proteinGrams}
- carbohidratos_g: ${nutritionTargets.carbsGrams}
- grasa_g: ${nutritionTargets.fatGrams}`;
}

function renderList(label, values) {
  if (!Array.isArray(values) || !values.length) {
    return `- ${label}: no especificado`;
  }
  return `- ${label}: ${values.join(', ')}`;
}

function contextBlock(promptContext) {
  return `Contexto clínico-deportivo del usuario:
- objetivo: ${promptContext?.goal || 'no especificado'}
- perfil_metabolico: ${promptContext?.metabolicProfile || 'no especificado'}
- modalidad_entrenamiento: ${promptContext?.trainingModality || 'no especificado'}
- nivel_actividad: ${promptContext?.activityLevel || 'no especificado'}
- patron_dietetico: ${promptContext?.dietaryPattern || 'no especificado'}
${renderList('alergias', promptContext?.allergies)}
${renderList('intolerancias', promptContext?.intolerances)}
${renderList('alimentos_excluir', promptContext?.dislikedFoods)}
- consentimiento_datos_salud: ${promptContext?.hasHealthDataConsent ? 'si' : 'no'}`;
}

export function buildPlateAnalysisPrompt({ promptContext = {}, nutritionTargets = null }) {
  const dish = promptContext?.dish ? `Plato declarado por usuario: ${promptContext.dish}.` : '';
  const extraNotes = promptContext?.notes ? `Notas del usuario: ${promptContext.notes}.` : '';

  return `
Eres un nutricionista deportivo experto en metabolismo (enfoque educativo, no diagnóstico ni tratamiento).
Tu tarea: analizar el plato, estimar alimentos, porciones y macros con enfoque conservador. Evalúa adherencia nutricional y compatibilidad con el objetivo del usuario. Sé preciso en la estimación pero accesible en las notas — el usuario quiere entender qué come y cómo mejorarlo.

${dish}
${extraNotes}
${contextBlock(promptContext)}
${targetBlock(nutritionTargets)}

Reglas:
1) Devuelve solo JSON valido (sin markdown).
2) Debes incluir "foods", "confidence" y "notes".
3) En cada food incluye: name, calories, proteinGrams, carbsGrams, fatGrams, availableCarbsGrams, glycemicIndex, processedLevel.
4) glycemicIndex debe estar entre 0 y 100.
5) processedLevel debe estar entre 0 y 4 (0=minimamente procesado, 4=ultraprocesado).
6) Si detectas ingredientes potencialmente conflictivos para alergias/intolerancias/exclusiones, reportalo en notes.
7) Si no estas seguro, reduce la confianza y explica dudas en notes.
8) Usa criterio de control glucémico cuando aplique (preferir estimación prudente de carbohidratos disponibles).
9) Si no puedes inferir porciones con certeza, prioriza no sobreestimar proteína ni subestimar carbohidratos disponibles.
10) No inventes alimentos no visibles o no plausibles para el contexto del plato.
11) La suma de macros de foods debe ser coherente con calories (aprox. 4-4-9).
12) Incluye en notes si la imagen impide una estimación robusta (oclusiones, iluminación, ángulo).
13) Si el plato parece no alineado con el objetivo o el control glucémico, indícalo en notes de forma breve y accionable.
14) Mantén notes cortas, específicas y clínicas; evita frases vacías.

Formato esperado:
{
  "foods": [
    {
      "name": "string",
      "calories": 0,
      "proteinGrams": 0,
      "carbsGrams": 0,
      "fatGrams": 0,
      "availableCarbsGrams": 0,
      "glycemicIndex": 0,
      "processedLevel": 0
    }
  ],
  "confidence": 0.0,
  "notes": ["string"]
}
  `.trim();
}
