import { assessDietPreferences } from './dietSuitability.js';
// Recomendaciones de nutrición ALREDEDOR del entreno (pre/post), deterministas y con límites
// clínicos. No es IA: se construye de hechos (tipo/duración de sesión, peso, objetivo y
// comorbilidades declaradas). Todo orientativo y acotado al objetivo diario; con condiciones
// médicas, prevalece el criterio del médico.

function isQualityOrLongSession(day) {
  const t = day?.sessionType;
  const f = day?.sessionFocus || day?.workout?.sessionFocus || '';
  const dur = Number(day?.workout?.durationMinutes) || 0;
  if (t === 'aerobic') return ['cardio_long', 'cardio_intervals', 'cardio_tempo'].includes(f) || dur >= 60;
  if (t === 'resistance' || t === 'mixed') return dur >= 45;
  return false;
}

export function buildPrePostNutrition({ day, profile } = {}) {
  if (!day || !['resistance', 'mixed', 'aerobic'].includes(day.sessionType)) return null;

  const weight = Number(profile?.weightKg);
  const c = profile?.conditions || {};
  // Salud (condición declarada) y dieta (preferencia) por separado; ver dietSuitability.js.
  const diabetes = c.diabetes === true || profile?.metabolicProfile === 'type2_diabetes';
  const hypertension = c.hypertension === true;
  const diet = assessDietPreferences(profile || {});
  const keto = diet.chosen.pattern === 'keto';
  const lowGlycemic = diet.lowGlycemic;
  const sodiumLimited = diet.healthConstraints.some((x) => x.key === 'sodium');
  const demanding = isQualityOrLongSession(day);
  const easyShort = !demanding && day.sessionType === 'aerobic';

  // Proteína post por ración: ~0.3 g/kg, acotada a 20-40 g (cap clínico por ración).
  const proteinPostG = Number.isFinite(weight) && weight > 0
    ? Math.round(Math.min(40, Math.max(20, 0.3 * weight)))
    : null;

  const pre = { items: [], caution: null };
  if (easyShort) {
    pre.items.push('Para una sesión corta y suave no necesitas comer antes; basta con estar hidratado.');
  } else if (keto) {
    pre.items.push('Dieta cetogénica: come 2-3 h antes proteína + grasa (huevos, yogur griego entero, frutos secos); no hay carga de hidratos.');
    if (demanding) pre.items.push('En series, umbral o tiradas largas rendirás menos sin glucógeno: no persigas ritmos, guíate por sensaciones.');
  } else {
    pre.items.push(lowGlycemic
      ? 'Come 1-3 h antes: hidrato de índice glucémico bajo (avena, pan integral, fruta entera) + algo de proteína.'
      : 'Come 1-3 h antes: carbohidrato + algo de proteína. Si vas con el tiempo justo, un snack ligero 30-60 min antes (p. ej. fruta).');
    if (demanding) {
      pre.items.push(lowGlycemic
        ? 'Sesión larga o intensa: aquí sí vale un hidrato rápido (plátano, dátil) 30-60 min antes; es el momento en que la carga glucémica alta tiene sentido.'
        : 'Para sesiones largas o intensas, prioriza el carbohidrato para llegar con energía.');
    }
  }
  pre.items.push('Bebe agua antes de empezar.');
  if (diabetes) {
    pre.caution = 'Si usas insulina o medicación para la glucosa, revísala antes y lleva carbohidrato de absorción rápida por si aparece hipoglucemia.';
  } else if (hypertension) {
    pre.caution = 'Con tensión alta, evita el exceso de cafeína y la maniobra de Valsalva (aguantar la respiración) en las series pesadas.';
  }

  const post = { items: [], caution: null };
  post.items.push(proteinPostG != null
    ? `Proteína: ~${proteinPostG} g en las 1-2 h siguientes, dentro de tu objetivo diario.`
    : 'Incluye una fuente de proteína en las 1-2 h siguientes, dentro de tu objetivo diario.');
  if (keto) {
    post.items.push('Dieta cetogénica: sin recarga de hidratos; completa la comida con verdura y grasa insaturada.');
  } else {
    post.items.push(demanding
      ? 'Repón carbohidrato: la sesión fue larga o intensa.'
      : 'Carbohidrato moderado según tu plan del día.');
  }
  post.items.push(sodiumLimited
    ? 'Rehidrata con agua; por tu condición de salud, no añadas sal extra salvo indicación de tu médico.'
    : 'Rehidrata; si sudaste mucho, añade algo de sal a la comida.');
  if (diabetes) {
    post.caution = 'Tras ejercicio prolongado puede haber hipoglucemia tardía (incluso horas después): controla tu glucosa.';
  }

  return {
    pre,
    post,
    note: 'Orientativo y ajustado a tu objetivo diario. Si tienes una condición médica, sigue siempre la indicación de tu médico.',
  };
}
