import { describe, it, expect } from 'vitest';
import {
  isEquipmentAvailable,
  filterByEquipmentAndPreferences,
  sanitizeEquipmentList,
} from '../../src/core/equipmentPreferences.js';

const pool = [
  { id: 'a', equipment: 'Barbell + Rack' },
  { id: 'b', equipment: 'Mancuernas' },
  { id: 'c', equipment: 'Peso corporal' },
  { id: 'd', equipment: 'Polea o banda' },
];

describe('equipmentPreferences', () => {
  it('clasifica combos (AND) y alternativas (OR)', () => {
    const set = (arr) => new Set(arr);
    expect(isEquipmentAvailable('Barbell + Rack', set(['barbell']))).toBe(false); // falta rack
    expect(isEquipmentAvailable('Barbell + Rack', set(['barbell', 'rack']))).toBe(true);
    expect(isEquipmentAvailable('Polea o banda', set(['band']))).toBe(true); // una alternativa basta
    expect(isEquipmentAvailable('Máquina o peso corporal', set(['barbell']))).toBe(true); // peso corporal = mínimo
    expect(isEquipmentAvailable('Mancuernas', set([]))).toBe(true); // sin restricción si no hay material declarado
  });

  it('filtra por material disponible', () => {
    const out = filterByEquipmentAndPreferences(pool, { equipment: ['dumbbells'] });
    expect(out.map((e) => e.id).sort()).toEqual(['b', 'c']);
  });

  it('excluye ejercicios vetados', () => {
    const out = filterByEquipmentAndPreferences(pool, { excludedExercises: ['c'], equipment: ['dumbbells'] });
    expect(out.map((e) => e.id)).toEqual(['b']);
  });

  it('prioriza favoritos al frente', () => {
    const out = filterByEquipmentAndPreferences(pool, { favoriteExercises: ['c'] });
    expect(out[0].id).toBe('c');
  });

  it('relaja el filtro si dejaría el pool vacío (no rompe la sesión)', () => {
    const only = [{ id: 'a', equipment: 'Mancuernas' }];
    const out = filterByEquipmentAndPreferences(only, { equipment: ['barbell'] });
    expect(out.map((e) => e.id)).toEqual(['a']);
  });

  it('sanitiza la lista de equipo a ids válidos', () => {
    expect(sanitizeEquipmentList(['barbell', 'foo', 'band', 'band'])).toEqual(['barbell', 'band']);
    expect(sanitizeEquipmentList('x')).toEqual([]);
  });
});
