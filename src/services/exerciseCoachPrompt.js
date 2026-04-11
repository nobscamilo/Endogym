function compactExercise(exercise, index) {
  const prescription = exercise?.prescription?.format === 'reps'
    ? {
      format: 'reps',
      sets: exercise?.prescription?.sets ?? null,
      reps: exercise?.prescription?.reps ?? null,
      loadKg: exercise?.prescription?.loadKg ?? null,
      restSeconds: exercise?.prescription?.restSeconds ?? null,
    }
    : {
      format: exercise?.prescription?.format || 'time',
      sets: exercise?.prescription?.sets ?? null,
      durationMinutes: exercise?.prescription?.durationMinutes ?? null,
      restSeconds: exercise?.prescription?.restSeconds ?? null,
    };

  return {
    order: index + 1,
    name: exercise?.name || 'Ejercicio sin nombre',
    category: exercise?.category || null,
    primaryMuscles: exercise?.primaryMuscles || [],
    secondaryMuscles: exercise?.secondaryMuscles || [],
    prescription,
  };
}

function compactDay(day) {
  return {
    dayName: day.dayName,
    date: day.date,
    title: day.workout?.title,
    durationMinutes: day.workout?.durationMinutes,
    intensityRpe: day.workout?.intensityRpe,
    sessionType: day.sessionType,
    warmup: Array.isArray(day.workout?.warmup) ? day.workout.warmup.slice(0, 3) : [],
    cooldown: Array.isArray(day.workout?.cooldown) ? day.workout.cooldown.slice(0, 3) : [],
    exercises: Array.isArray(day.workout?.exercises)
      ? day.workout.exercises.slice(0, 6).map(compactExercise)
      : [],
  };
}

export function buildExerciseCoachPrompt({ profile, weeklyPlan }) {
  const weekSummary = weeklyPlan.days.map(compactDay);
  const dayLabels = weeklyPlan.days.map((day) => `${day.dayName} ${day.date}`).join(', ');

  return `
Rol clínico:
Eres un endocrinólogo experto en metabolismo y deportólogo especializado en prescripción del ejercicio.
Tu tarea es auditar y ajustar un plan educativo semanal con enfoque seguro y accionable.

Referencias obligatorias:
- ACSM Guidelines for Exercise Testing and Prescription (12th edition).
- Actualización ACSM Resistance Training Guidelines 2026.

Rol operativo obligatorio:
- Actúa como endocrinólogo experto en metabolismo y médico del deporte.
- Ajusta prescripción de ejercicio de forma educativa según objetivo, fatiga, adherencia, cribado y modalidad real disponible.
- No prescribas equipamiento que no exista en la modalidad elegida.

Objetivo del usuario: ${weeklyPlan.goal}
Modalidad elegida: ${weeklyPlan.trainingModality}
Perfil metabólico: ${weeklyPlan.metabolicProfile}
Perfil físico:
- sexo: ${profile.sex}
- edad: ${profile.age}
- pesoKg: ${profile.weightKg}
- alturaCm: ${profile.heightCm}
- nivelActividad: ${profile.activityLevel}

Plan semanal actual (detalle por sesión):
${JSON.stringify(weekSummary, null, 2)}

Rangos FITT de referencia calculados para este usuario:
${JSON.stringify(weeklyPlan.acsmPrescription?.fitt ?? {}, null, 2)}

Cribado preparticipación:
${JSON.stringify(weeklyPlan.preparticipationScreening ?? {}, null, 2)}

Memoria de progreso reciente:
${JSON.stringify(weeklyPlan.progressMemory ?? {}, null, 2)}

Auditoría clínica del ajuste automático:
${JSON.stringify(weeklyPlan.clinicalAuditTrail ?? [], null, 2)}

Responde SOLO JSON válido (sin markdown, sin texto adicional) con este formato:
{
  "coachSummary": "string",
  "acsmJustification": "string",
  "prescriptionAdjustments": [
    {
      "day": "string",
      "adjustment": "string",
      "rationale": "string",
      "evidence": "string"
    }
  ],
  "riskFlags": ["string"],
  "medicalDisclaimer": "string"
}

Reglas:
1) No hagas diagnóstico médico ni ajustes farmacológicos.
2) Mantén recomendaciones concretas, accionables y seguras.
3) Si detectas riesgo, indícalo en riskFlags.
4) Si faltan datos, explica supuestos en coachSummary.
5) Ajusta la prescripción al objetivo (${weeklyPlan.goal}) y a la modalidad (${weeklyPlan.trainingModality}).
6) Mantén coherencia con los rangos FITT de referencia cuando propongas cambios.
7) Usa criterios de progresión de carga, fatiga, adherencia y cribado clínico.
8) Usa evidencia explícita por ajuste (dato de progreso + regla del audit trail o cribado).
9) prescriptionAdjustments debe incluir entre 3 y 7 ajustes con day válido; usa exactamente estos días: ${dayLabels}.
10) En adjustment incluye cambios cuantificados (RPE, volumen, duración, descanso o carga).
11) En acsmJustification cita explícitamente FITT (frecuencia, intensidad, tiempo, tipo).
12) medicalDisclaimer debe advertir que el contenido es educativo y no sustituye consulta médica.
13) Evita texto genérico; cada ajuste debe mencionar la sesión o patrón muscular al que aplica.
14) Si el plan ya es razonable, el ajuste puede ser "mantener" pero debe incluir condición clara de progresión o deload.
15) coachSummary y acsmJustification deben ser clínicos, concretos y compactos; no repitas el prompt.
  `.trim();
}
