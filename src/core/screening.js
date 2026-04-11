function toBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function normalizeDesiredIntensity(value) {
  if (value === 'light' || value === 'moderate' || value === 'vigorous') {
    return value;
  }
  return 'moderate';
}

export function normalizePreparticipationInput(preparticipation = {}) {
  return {
    knownCardiometabolicDisease: toBoolean(preparticipation.knownCardiometabolicDisease, false),
    exerciseSymptoms: toBoolean(preparticipation.exerciseSymptoms, false),
    currentlyActive: toBoolean(preparticipation.currentlyActive, false),
    medicalClearance: toBoolean(preparticipation.medicalClearance, false),
    contraindications: toBoolean(preparticipation.contraindications, false),
    desiredIntensity: normalizeDesiredIntensity(preparticipation.desiredIntensity),
  };
}

export function evaluatePreparticipationScreening(preparticipation = {}) {
  const normalized = normalizePreparticipationInput(preparticipation);
  const flags = [];
  let riskLevel = 'low';
  let readinessGate = 'ok';
  let clearanceStatus = 'not_required';
  let highIntensityAllowed = true;
  let maxAllowedSessionRpe = 9;

  if (normalized.exerciseSymptoms || normalized.contraindications) {
    riskLevel = 'high';
    readinessGate = 'stop';
    clearanceStatus = 'required';
    highIntensityAllowed = false;
    maxAllowedSessionRpe = 4;
    if (normalized.exerciseSymptoms) {
      flags.push('Síntomas de alarma reportados durante o tras ejercicio.');
    }
    if (normalized.contraindications) {
      flags.push('Contraindicación médica activa declarada.');
    }
  } else if (normalized.knownCardiometabolicDisease) {
    riskLevel = 'high';
    readinessGate = 'caution';
    highIntensityAllowed = false;
    maxAllowedSessionRpe = 6;

    if (!normalized.medicalClearance) {
      clearanceStatus = normalized.desiredIntensity === 'light' ? 'recommended' : 'required';
      flags.push('Enfermedad cardiometabólica/renal conocida sin alta médica vigente.');
    } else if (normalized.desiredIntensity === 'vigorous') {
      clearanceStatus = 'recommended';
      highIntensityAllowed = true;
      maxAllowedSessionRpe = 7;
      flags.push('Con enfermedad conocida, progresar a vigoroso solo con seguimiento clínico.');
    }
  } else {
    if (normalized.desiredIntensity === 'vigorous' && !normalized.currentlyActive) {
      riskLevel = 'moderate';
      readinessGate = 'caution';
      clearanceStatus = 'recommended';
      highIntensityAllowed = false;
      maxAllowedSessionRpe = 7;
      flags.push('Usuario inactivo solicitando intensidad vigorosa: requiere progresión gradual.');
    }
  }

  const recommendation = readinessGate === 'stop'
    ? 'Detener prescripción de intensidad moderada/vigorosa hasta valoración médica.'
    : readinessGate === 'caution'
      ? 'Aplicar progresión conservadora y monitorizar respuesta clínica.'
      : 'Sin barreras mayores para progresar según tolerancia.';

  return {
    source: 'ACSM preparticipation screening algorithm (adaptación educativa 2026).',
    input: normalized,
    riskLevel,
    readinessGate,
    clearanceStatus,
    highIntensityAllowed,
    maxAllowedSessionRpe,
    recommendation,
    flags,
  };
}
