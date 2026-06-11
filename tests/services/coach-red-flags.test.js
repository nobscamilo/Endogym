import { describe, expect, it } from 'vitest';
import { detectRedFlags, RED_FLAG_RESPONSE, normalizeText } from '../../src/services/coachRedFlags.js';

describe('coach red flags detector (determinista, ES)', () => {
  // ---------------------------------------------------------------------------
  // POSITIVOS: deben disparar (comportamiento conservador).
  // ---------------------------------------------------------------------------
  const positives = [
    ['dolor torácico en esfuerzo', 'Me dio un dolor fuerte en el pecho mientras corría, ¿sigo entrenando?', 'dolor_toracico'],
    ['opresión torácica', 'Siento opresión en el pecho al subir cuestas', 'dolor_toracico'],
    ['dolor pecho + brazo', 'Tengo dolor en el pecho que me irradia al brazo izquierdo', 'dolor_toracico'],
    ['dolor pecho ambiguo (duda → conservador)', 'Desde ayer me duele el pecho, ¿qué hago?', 'dolor_toracico'],
    ['agujetas PERO con mareo (modificador gana)', 'Tengo agujetas en el pecho del press banca pero también mareo y sudor frío', 'dolor_toracico'],
    ['síncope', 'Ayer me desmayé al acabar las series, ¿entreno hoy?', 'sincope'],
    ['pérdida de conocimiento', 'Perdí el conocimiento un momento después de la tirada larga', 'sincope'],
    ['disnea desproporcionada', 'Me falta el aire incluso en reposo después de entrenar suave', 'disnea'],
    ['ahogo en esfuerzo leve', 'Me ahogo al subir escaleras desde la sesión del martes', 'disnea'],
    ['palpitaciones con mareo', 'Noto palpitaciones y mareo cuando corro en zona 2', 'palpitaciones'],
    ['taquicardia + visión borrosa', 'Taquicardia y visión borrosa al terminar el HIIT', 'palpitaciones'],
    ['posible fractura', 'Escuché un chasquido en el tobillo y ahora tengo un dolor que no puedo apoyar el pie', 'lesion_aguda'],
    ['no puedo apoyar tras caída', 'No puedo apoyar la pierna después de la caída, me duele mucho', 'lesion_aguda'],
  ];

  it.each(positives)('dispara: %s', (_name, phrase, category) => {
    const r = detectRedFlags(phrase);
    expect(r.flagged).toBe(true);
    expect(r.category).toBe(category);
  });

  // ---------------------------------------------------------------------------
  // NEGATIVOS: no deben disparar (falsos positivos típicos del gimnasio).
  // ---------------------------------------------------------------------------
  const negatives = [
    ['agujetas pectorales (caso documentado)', 'Me duele el pecho de las agujetas de press banca de ayer'],
    ['agujetas genéricas', 'Tengo unas agujetas terribles en el pectoral, ¿entreno igual?'],
    ['dolor muscular piernas', 'Me duelen las piernas después de la tirada larga, ¿es normal?'],
    ['fatiga normal', 'Acabé muy cansado y sin aliento justo al terminar las series, como siempre'],
    ['pregunta nutricional', '¿Qué ceno hoy para no subir la glucosa?'],
    ['progresión de cargas', '¿Debería subir peso en press banca esta semana?'],
    ['pulsaciones informativas', 'Mi corazón llegó a 180 ppm en las series, ¿está bien?'],
    ['mareo sin contexto cardíaco', 'Si entreno en ayunas a veces me siento flojo, ¿qué como antes?'],
    ['mensaje vacío', ''],
  ];

  it.each(negatives)('NO dispara: %s', (_name, phrase) => {
    expect(detectRedFlags(phrase).flagged).toBe(false);
  });

  it('normaliza tildes y mayúsculas', () => {
    expect(normalizeText('OPRESIÓN Torácica')).toBe('opresion toracica');
    expect(detectRedFlags('SÍNCOPE tras el esfuerzo, me desmayé').flagged).toBe(true);
  });

  it('la respuesta fija recomienda parar y valoración médica, sin diagnosticar', () => {
    expect(RED_FLAG_RESPONSE).toMatch(/detén el ejercicio/i);
    expect(RED_FLAG_RESPONSE).toMatch(/urgencias|112/i);
    expect(RED_FLAG_RESPONSE).not.toMatch(/infarto|angina|diagnostico/i);
  });
});
