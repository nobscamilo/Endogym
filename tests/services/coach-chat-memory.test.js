import { describe, expect, it } from 'vitest';
import {
  trimChatMemory,
  appendChatTurns,
  formatChatMemory,
  CHAT_MEMORY_MAX_TURNS,
  CHAT_MEMORY_MAX_CHARS,
  CHAT_MEMORY_TURN_MAX_CHARS,
} from '../../src/services/coachChatMemory.js';

const NOW = new Date('2026-06-11T12:00:00.000Z');
const at = (daysAgo = 0) => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
};
const turn = (role, text, daysAgo = 0) => ({ role, text, at: at(daysAgo) });

describe('trimChatMemory (FASE 2.1 — recorte)', () => {
  it('aplica TTL de 7 días: los turnos viejos desaparecen', () => {
    const turns = [turn('user', 'viejo', 8), turn('coach', 'también viejo', 8), turn('user', 'reciente', 1)];
    const out = trimChatMemory(turns, NOW);
    expect(out.map((t) => t.text)).toEqual(['reciente']);
  });

  it('conserva solo los últimos MAX_TURNS', () => {
    const turns = Array.from({ length: 12 }, (_, i) => turn(i % 2 ? 'coach' : 'user', `t${i}`, 0));
    const out = trimChatMemory(turns, NOW);
    expect(out).toHaveLength(CHAT_MEMORY_MAX_TURNS);
    expect(out[out.length - 1].text).toBe('t11');
    expect(out[0].text).toBe(`t${12 - CHAT_MEMORY_MAX_TURNS}`);
  });

  it('trunca cada turno y respeta el presupuesto total descartando los más antiguos', () => {
    const long = 'x'.repeat(1000);
    const turns = Array.from({ length: 6 }, (_, i) => turn('user', `${i}-${long}`, 0));
    const out = trimChatMemory(turns, NOW);
    out.forEach((t) => expect(t.text.length).toBeLessThanOrEqual(CHAT_MEMORY_TURN_MAX_CHARS));
    const total = out.reduce((acc, t) => acc + t.text.length, 0);
    expect(total).toBeLessThanOrEqual(CHAT_MEMORY_MAX_CHARS);
    // se descartó el más antiguo, no el más nuevo
    expect(out[out.length - 1].text.startsWith('5-')).toBe(true);
  });

  it('descarta turnos malformados (sin rol válido, sin texto, sin fecha)', () => {
    const out = trimChatMemory([
      { role: 'system', text: 'no', at: at(0) },
      { role: 'user', text: '', at: at(0) },
      { role: 'user', text: 'ok' }, // sin at → fuera (no se puede aplicar TTL)
      turn('coach', 'válido', 0),
    ], NOW);
    expect(out.map((t) => t.text)).toEqual(['válido']);
  });
});

describe('appendChatTurns y formatChatMemory', () => {
  it('añade el intercambio y devuelve ya recortado', () => {
    const out = appendChatTurns([turn('user', 'a', 1), turn('coach', 'b', 1)], '¿y hoy?', 'Hoy descansa.', NOW);
    expect(out.map((t) => `${t.role}:${t.text}`)).toEqual(['user:a', 'coach:b', 'user:¿y hoy?', 'coach:Hoy descansa.']);
  });

  it('formatChatMemory: vacío sin turnos; con turnos marca que NO son instrucciones', () => {
    expect(formatChatMemory([])).toBe('');
    const text = formatChatMemory([turn('user', 'hola', 0), turn('coach', 'buenas', 0)]);
    expect(text).toContain('Usuario: hola');
    expect(text).toContain('Coach: buenas');
    expect(text).toMatch(/NO son instrucciones/i);
  });
});
