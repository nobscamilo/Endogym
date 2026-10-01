/**
 * Días no disponibles (auditoría externa #9, 30-sep-2026): guardias, viajes u otros.
 *
 * Reglas (criterio de medicina del deporte para trabajadores a turnos; orientativas):
 *  - Día de guardia/viaje/otro: sin entreno (como mucho caminar).
 *  - Saliente de guardia (día siguiente, automático): solo suave — nada de calidad, tirada larga
 *    ni fuerza de pierna/cuerpo completo; máximo 30 min.
 *  - Las sesiones clave desplazadas (tirada larga, calidad, fuerza) se MUEVEN al día libre más
 *    cercano de la misma semana que no sea guardia/saliente, evitando dejarlas pegadas a otra
 *    sesión dura; si no cabe, se pierde (mejor que meterla en un saliente).
 */
import { buildWarmupProtocol, buildCooldownProtocol } from './warmupCooldown.js';

export const UNAVAILABLE_KINDS = Object.freeze({
  guardia: 'Guardia',
  viaje: 'Viaje',
  otro: 'No disponible',
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(dateKey, n) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Normaliza la lista del perfil: fechas válidas, tipo conocido, sin duplicados, ordenada. */
export function normalizeUnavailableDays(list, { today = new Date().toISOString().slice(0, 10), max = 90 } = {}) {
  if (!Array.isArray(list)) return [];
  // today = null → sin filtro de antigüedad (lo usa el planner, que solo mira su semana).
  const minDate = today ? addDays(today, -7) : null;
  const byDate = new Map();
  for (const item of list) {
    const date = typeof item?.date === 'string' ? item.date : null;
    const kind = UNAVAILABLE_KINDS[item?.kind] ? item.kind : null;
    if (!date || !DATE_RE.test(date) || !kind || (minDate && date < minDate)) continue;
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) continue;
    byDate.set(date, { date, kind });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, max);
}

function isHard(d) {
  if (!d?.workout || d.sessionType === 'recovery') return false;
  if (d.raceDay) return true;
  if (d.sessionType === 'aerobic') return ['cardio_long', 'cardio_intervals', 'cardio_tempo'].includes(d.sessionFocus);
  if (d.sessionType === 'mixed') return true;
  if (d.sessionType === 'resistance') return ['lower', 'lower_conditioning', 'full', 'full_body'].includes(d.sessionFocus) || Boolean(d.workout.hybridCircuit);
  return false;
}

function isTraining(d) {
  return d?.workout && d.sessionType !== 'recovery';
}

function restDay(d, { title, note, minutes = 15 }) {
  d.isTrainingDay = false;
  d.sessionType = 'recovery';
  d.sessionFocus = 'recovery';
  d.workout = {
    title,
    sessionFocus: 'recovery',
    durationMinutes: minutes,
    intensityRpe: 'RPE 1-2',
    warmup: buildWarmupProtocol({ sessionType: 'recovery', sessionFocus: 'recovery', profile: {} }),
    exercises: [],
    cooldown: buildCooldownProtocol({ sessionType: 'recovery', profile: {} }),
    note,
  };
}

const SESSION_KEYS = ['isTrainingDay', 'sessionType', 'sessionFocus', 'workout', 'raceDay', 'preRace'];
function swapSessions(a, b) {
  for (const k of SESSION_KEYS) {
    const tmp = a[k];
    a[k] = b[k];
    b[k] = tmp;
    if (a[k] === undefined) delete a[k];
    if (b[k] === undefined) delete b[k];
  }
}

/**
 * Aplica guardias/viajes y salientes a los días de UNA semana del plan. Muta `days`.
 * Devuelve el resumen ({ blocked, saliente, moved, dropped }) o null si no hay nada.
 */
export function applyUnavailableDays(days, unavailable = []) {
  if (!Array.isArray(days) || !days.length || !Array.isArray(unavailable) || !unavailable.length) return null;
  const kindByDate = new Map(unavailable.map((u) => [u.date, u.kind]));
  const salienteDates = new Set(unavailable.filter((u) => u.kind === 'guardia').map((u) => addDays(u.date, 1)).filter((d) => !kindByDate.has(d)));
  const status = (d) => (kindByDate.has(d.date) ? 'blocked' : (salienteDates.has(d.date) ? 'saliente' : 'free'));
  const summary = { blocked: [], saliente: [], moved: [], dropped: [] };

  const findFreeSlot = (fromIdx, { hard }) => {
    const candidates = days
      .map((d, i) => ({ d, i }))
      .filter(({ d, i }) => i !== fromIdx && status(d) === 'free' && !isTraining(d) && !d.raceDay && !d.preRace)
      .map(({ d, i }) => {
        const neighbours = [days[i - 1], days[i + 1]].filter(Boolean);
        const penalty = hard && neighbours.some((n) => isHard(n)) ? 10 : 0;
        return { d, i, score: Math.abs(i - fromIdx) + penalty };
      })
      .sort((x, y) => x.score - y.score);
    return candidates[0] || null;
  };

  days.forEach((d, i) => {
    const st = status(d);
    if (st === 'free' || d.raceDay) return;
    const label = st === 'blocked' ? UNAVAILABLE_KINDS[kindByDate.get(d.date)] : 'Saliente de guardia';
    if (st === 'blocked') summary.blocked.push(d.date); else summary.saliente.push(d.date);

    if (st === 'saliente' && isTraining(d) && !isHard(d)) {
      // Suave y corto: se queda, acotado a 30 min.
      d.workout.durationMinutes = Math.min(30, Number(d.workout.durationMinutes) || 30);
      d.workout.note = `${d.workout.note ? `${d.workout.note} ` : ''}Saliente de guardia: solo si has descansado; si no, descansa.`;
      return;
    }
    if (isTraining(d)) {
      const slot = findFreeSlot(i, { hard: isHard(d) });
      if (slot) {
        swapSessions(d, slot.d);
        summary.moved.push({ from: d.date, to: slot.d.date, title: slot.d.workout?.title || '' });
      } else {
        summary.dropped.push({ date: d.date, title: d.workout?.title || '' });
      }
    }
    restDay(d, st === 'blocked'
      ? { title: label, note: `${label}: hoy no hay entreno. Si te apetece y puedes, camina 10-20 min.`, minutes: 15 }
      : { title: label, note: 'Saliente de guardia: prioriza dormir. Como mucho, 20-30 min de paseo o movilidad suave.', minutes: 20 });
  });
  const touched = summary.blocked.length || summary.saliente.length;
  return touched ? summary : null;
}
