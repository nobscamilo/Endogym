import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// El chat del coach mostraba el MISMO texto ("no puedo consultar el motor IA") para un 429
// de rate limit, un 503 sin API key y un 401 de sesión caducada: tres causas distintas y
// ninguna accionable para el usuario. Estos tests fijan que el motivo llega hasta la UI.

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// `coachErrorMessage` es pura y sin dependencias: se extrae del fuente que se empaqueta en
// el bundle y se evalúa, para testear el comportamiento REAL y no una copia del código.
function extractBlock(source, header) {
  const start = source.indexOf(header);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 2);
}

function loadCoachErrorMessage() {
  const source = read('public/studio/app/studio/coach.jsx');
  // El mensaje genérico vive en COACH_FALLBACK: se lleva también, no una copia.
  const fallback = extractBlock(source, 'const COACH_FALLBACK = {');
  const fn = extractBlock(source, 'function coachErrorMessage(err) {');
  // eslint-disable-next-line no-new-func
  return new Function(`${fallback};\n${fn};\nreturn coachErrorMessage;`)();
}

describe('Chat del coach — el error que ve el usuario explica la causa real', () => {
  const coachErrorMessage = loadCoachErrorMessage();

  it('429: dice que es el límite de preguntas y cuándo volver', () => {
    const msg = coachErrorMessage({ status: 429, retryAfterSeconds: 600 });
    expect(msg).toMatch(/límite/i);
    expect(msg).toContain('10 min');
    expect(msg).not.toContain('motor IA');
  });

  it('429 sin retryAfterSeconds: no inventa un tiempo de espera', () => {
    const msg = coachErrorMessage({ status: 429 });
    expect(msg).toMatch(/límite/i);
    expect(msg).not.toMatch(/\d+ min/);
  });

  it('401 pide volver a entrar y 503 aclara que el fallo es del servidor', () => {
    expect(coachErrorMessage({ status: 401 })).toMatch(/sesión ha caducado/i);
    expect(coachErrorMessage({ status: 503 })).toMatch(/no está disponible/i);
  });

  it('422 (salida bloqueada) invita a reformular, no culpa a la red', () => {
    expect(coachErrorMessage({ status: 422 })).toMatch(/reformular/i);
  });

  it('un fallo desconocido o de red sigue cayendo al mensaje genérico', () => {
    expect(coachErrorMessage(new Error('network'))).toContain('motor IA');
    expect(coachErrorMessage({ status: 500 })).toContain('motor IA');
  });

  it('el shim window.claude.complete propaga status y detalles del servidor', () => {
    const source = read('scripts/build-studio.mjs');
    expect(source).toContain('err.status = res.status;');
    expect(source).toContain('data.details.retryAfterSeconds');
    // Ya no se descarta el cuerpo del error con un mensaje genérico de HTTP.
    expect(source).not.toContain("if (!res.ok) throw new Error('coach-chat HTTP ' + res.status);");
  });

  it('las burbujas de error no piden feedback 👍👎 (no son respuestas del coach)', () => {
    const coach = read('public/studio/app/studio/coach.jsx');
    expect(coach).toContain("m.role === 'coach' && !m.failed ? <CoachFeedback");
  });
});
