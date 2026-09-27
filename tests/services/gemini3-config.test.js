import { describe, expect, it } from 'vitest';
import { adaptGenerationConfigForModel, isGemini3OrLaterModel, lowestThinkingLevel } from '../../src/services/googleGenAiTransport.js';

// Migración a Gemini 3 (27-sep-2026). Comportamiento verificado con sondas reales contra la API:
// 3.7/3.8 Flash devuelven HTTP 400 con thinkingLevel 'minimal'; 2.5 devuelve 400 con cualquier
// thinkingLevel. Si esta traducción se rompe, TODAS las llamadas de IA caen al heurístico.
describe('adaptGenerationConfigForModel', () => {
  it('no toca la configuración de Gemini 2.5 (rollback por variable de entorno sin cambiar código)', () => {
    const cfg = { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 900 };
    expect(adaptGenerationConfigForModel('gemini-2.5-flash', cfg)).toEqual(cfg);
  });

  it('en 3.8 Flash fuerza temperatura 1.0 y traduce presupuesto 0 a "low" (minimal no existe)', () => {
    const out = adaptGenerationConfigForModel('gemini-3.8-flash', { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } });
    expect(out.temperature).toBe(1.0);
    expect(out.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('en 3.6 Flash el presupuesto 0 se traduce a "minimal"', () => {
    expect(adaptGenerationConfigForModel('gemini-3.6-flash', { thinkingConfig: { thinkingBudget: 0 } }).thinkingConfig)
      .toEqual({ thinkingLevel: 'minimal' });
  });

  it('añade margen de pensamiento al tope de salida (si no, el chat se corta a mitad de frase)', () => {
    expect(adaptGenerationConfigForModel('gemini-3.8-flash', { maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } }).maxOutputTokens).toBe(1536);
    expect(adaptGenerationConfigForModel('gemini-3.8-flash', { maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 512 } }).maxOutputTokens).toBe(2948);
    expect(adaptGenerationConfigForModel('gemini-3.6-flash', { maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } }).maxOutputTokens).toBe(512);
  });

  it('el reintento anti-bucle (presupuesto > 0) pasa a "medium"', () => {
    expect(adaptGenerationConfigForModel('gemini-3.8-flash', { thinkingConfig: { thinkingBudget: 512 } }).thinkingConfig)
      .toEqual({ thinkingLevel: 'medium' });
  });

  it('nunca envía thinkingBudget y thinkingLevel juntos, y respeta un thinkingLevel explícito', () => {
    const out = adaptGenerationConfigForModel('gemini-3.8-flash', { thinkingConfig: { thinkingLevel: 'high' } });
    expect(out.thinkingConfig).toEqual({ thinkingLevel: 'high' });
    expect(out.thinkingConfig).not.toHaveProperty('thinkingBudget');
  });

  it('detecta la familia y el nivel mínimo', () => {
    expect(isGemini3OrLaterModel('gemini-2.5-pro')).toBe(false);
    expect(isGemini3OrLaterModel('gemini-3.8-flash')).toBe(true);
    expect(lowestThinkingLevel('gemini-3.5-flash-lite')).toBe('minimal');
    expect(lowestThinkingLevel('gemini-3.7-flash')).toBe('low');
    expect(lowestThinkingLevel('gemini-3.1-pro-preview')).toBe('low');
  });
});
