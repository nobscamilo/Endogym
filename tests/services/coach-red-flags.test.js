import { describe, expect, it } from 'vitest';
import {
  detectRedFlags,
  redFlagResponse,
  RED_FLAG_RESPONSE,
  EATING_DISORDER_RESPONSE,
  normalizeText,
} from '../../src/services/coachRedFlags.js';

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

// ---------------------------------------------------------------------------
// Conducta alimentaria. Ignios es una app de pérdida de peso con registro de comidas:
// el listado de NEGATIVOS es aquí tan importante como el de positivos, porque disparar
// sobre la conversación normal de una dieta sería paternalista y rompería la confianza.
// ---------------------------------------------------------------------------
describe('coach red flags — conducta alimentaria', () => {
  const positives = [
    ['vómito autoinducido', 'A veces vomito después de comer para no engordar, ¿me afecta al entreno?'],
    ['vómito provocado', 'Me provoco el vómito cuando me paso, ¿es muy malo para el rendimiento?'],
    ['laxantes con fin de peso', 'Estoy tomando laxantes para adelgazar más rápido, ¿pasa algo?'],
    ['restricción prolongada', 'Llevo tres días sin comer casi nada para bajar rápido, ¿puedo entrenar?'],
    ['restricción sostenida', 'No como nada desde el lunes, ¿aguanto la tirada larga?'],
    ['compensación con ejercicio', 'He comido de más y quiero saber cuánto tengo que correr para compensarlo'],
    ['compensación (castigo)', '¿Cuánto cardio para quemar lo que comí ayer? necesito castigarme'],
    ['atracón con culpa', 'Me doy atracones y luego me siento culpable, ¿cómo lo paro?'],
    ['atracón con descontrol', 'Empiezo a comer y no puedo parar, es un atracón cada noche'],
    ['autodesprecio ligado a comer', 'Me odio cada vez que como, ¿qué dieta me pongo?'],
    ['no merecer comer', 'Hoy no he entrenado así que no merezco comer, ¿salto la cena?'],
    // Casos añadidos tras sondear frases realistas: se escapaban todos.
    ['purga por eufemismo', 'Después de cenar me meto los dedos, ¿me quita nutrientes del entreno?'],
    ['diuréticos para la báscula', 'Uso diuréticos antes de pesarme, ¿afecta a la fuerza?'],
    ['doble sesión compensatoria', 'Ayer me pasé comiendo y hoy quiero hacer doble sesión para quemarlo'],
    ['saltarse comidas a diario + compensar', 'Me salto la cena todos los días para adelgazar y luego entreno el doble'],
  ];

  it.each(positives)('dispara: %s', (_name, phrase) => {
    const r = detectRedFlags(phrase);
    expect(r.flagged).toBe(true);
    expect(r.category).toBe('conducta_alimentaria');
  });

  // La conversación cotidiana de quien usa la app. Ninguna debe disparar.
  const negatives = [
    ['déficit calórico', 'Estoy en déficit calórico, ¿cuántas calorías debería cenar hoy?'],
    ['objetivo de peso', 'Quiero perder 5 kg antes del verano, ¿cómo lo planteo?'],
    ['ayuno intermitente', 'Hago ayuno intermitente 16/8, ¿es compatible con entrenar en ayunas?'],
    ['exceso puntual sin compensación', 'Ayer me pasé con la cena, ¿retomo el plan hoy sin más?'],
    ['atracón coloquial', 'Me di un atracón de pizza el sábado, ¿sigo con la semana normal?'],
    ['gasto calórico', '¿Cuántas calorías quemo en una sesión de fuerza de 50 minutos?'],
    ['comer menos', 'Si como un poco menos por la noche, ¿bajaré más rápido?'],
    ['saltarse una comida por horario', 'Hoy me he saltado la comida porque no me daba tiempo, ¿ceno más?'],
    ['culpa sin comida', 'Me odio cuando me salto un entreno, ¿cómo recupero la rutina?'],
    ['vómito por esfuerzo', 'Vomité después de las series de ayer del esfuerzo que hice'],
    ['pregunta de proteína', '¿Cuánta proteína necesito al día para no perder músculo en déficit?'],
    // Dietas de EXCLUSIÓN: se describen igual que la restricción y no lo son.
    ['vegetarianismo', 'Llevo dos semanas sin comer carne, ¿pierdo músculo?'],
    ['celiaquía', 'No como nada de gluten desde el lunes porque soy celiaco'],
    ['intolerancia', 'Llevo tres días sin comer lácteos, ¿afecta al rendimiento?'],
    ['exclusión por preferencia', 'Llevo un mes sin comer ultraprocesados y me encuentro mejor'],
    // El ayuno intermitente es un protocolo legítimo y se describe igual que saltarse comidas.
    ['ayuno intermitente habitual', 'Me salto el desayuno todos los días porque hago ayuno intermitente para bajar de peso'],
    ['ventana 16/8', 'Con la ventana 16/8 me salto siempre la cena, ¿entreno por la mañana?'],
    ['salto puntual por horario', 'Hoy no me dio tiempo a comer, ¿ceno más?'],
    ['diurético recetado', 'Tomo un diurético recetado por el médico para la tensión, ¿afecta al entreno?'],
  ];

  it.each(negatives)('NO dispara (conversación normal de dieta): %s', (_name, phrase) => {
    expect(detectRedFlags(phrase).flagged).toBe(false);
  });

  it('un síntoma agudo gana: lo clínico se atiende antes que la conducta', () => {
    // Restricción + desmayo: manda la respuesta de parar y buscar valoración urgente.
    const r = detectRedFlags('Llevo tres días sin comer casi nada y hoy me desmayé en el gimnasio');
    expect(r.flagged).toBe(true);
    expect(r.category).toBe('sincope');
    expect(redFlagResponse(r.category)).toBe(RED_FLAG_RESPONSE);
  });

  it('la respuesta se niega a dar la pauta pedida, deriva y no juzga', () => {
    expect(EATING_DISORDER_RESPONSE).toMatch(/no voy a darte pautas/i);
    expect(EATING_DISORDER_RESPONSE).toMatch(/restringir/i);
    expect(EATING_DISORDER_RESPONSE).toMatch(/médico de cabecera/i);
    expect(EATING_DISORDER_RESPONSE).toMatch(/psicología|nutrición clínica/i);
    expect(EATING_DISORDER_RESPONSE).toMatch(/no es un juicio/i);
    // Sin diagnóstico ni etiquetas clínicas encima de la persona.
    expect(EATING_DISORDER_RESPONSE).not.toMatch(/anorexia|bulimia|trastorno|tca/i);
    // Y NO manda parar de entrenar: el asunto no es el ejercicio.
    expect(EATING_DISORDER_RESPONSE).not.toMatch(/detén el ejercicio/i);
  });

  it('redFlagResponse devuelve el texto clínico para el resto de categorías', () => {
    for (const category of ['sincope', 'disnea', 'palpitaciones', 'lesion_aguda', 'dolor_toracico']) {
      expect(redFlagResponse(category)).toBe(RED_FLAG_RESPONSE);
    }
    expect(redFlagResponse('conducta_alimentaria')).toBe(EATING_DISORDER_RESPONSE);
  });
});
