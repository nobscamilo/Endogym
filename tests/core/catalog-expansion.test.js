import { describe, expect, it } from 'vitest';
import { buildExerciseCatalog } from '../../src/core/exerciseCatalog/index.js';
import { strengthCatalogExpansion } from '../../src/core/exerciseCatalog/strengthCatalogExpansion.js';
import { EXERCISE_MEDIA_MAP, exerciseMediaUrls } from '../../src/core/exerciseCatalog/mediaMap.js';
import { filterRestrictedExercises } from '../../src/core/comorbidityRestrictions.js';
import { isEquipmentAvailable } from '../../src/core/equipmentPreferences.js';

// FASE 3 lote 1 (20-jul-2026): 30 variantes clásicas de gimnasio promovidas desde
// exerciseLibrary. Estos tests fijan el contrato de curación del lote.

describe('catálogo — expansión FASE 3 lote 1', () => {
  const catalog = buildExerciseCatalog();
  const ids = new Set(catalog.map((e) => e.id));

  it('el lote tiene 30 ejercicios, todos integrados en el catálogo (214 en total) y sin ids duplicados', () => {
    expect(strengthCatalogExpansion).toHaveLength(30);
    expect(catalog).toHaveLength(214);
    for (const e of strengthCatalogExpansion) expect(ids.has(e.id)).toBe(true);
    expect(ids.size).toBe(catalog.length);
  });

  it('TODOS los ejercicios del lote tienen fotos de técnica (mediaMap → 2 URLs públicas)', () => {
    for (const e of strengthCatalogExpansion) {
      expect(EXERCISE_MEDIA_MAP[e.id], `${e.id} sin entrada en mediaMap`).toBeTruthy();
      const urls = exerciseMediaUrls(e.id);
      expect(urls).toHaveLength(2);
      expect(urls[0]).toContain('storage.googleapis.com');
    }
  });

  it('loadRatio coherente: external en (0, 0.7] anclado a los básicos; bodyweight en 0', () => {
    for (const e of strengthCatalogExpansion) {
      if (e.loadType === 'external') {
        expect(e.loadRatio, e.id).toBeGreaterThan(0);
        expect(e.loadRatio, e.id).toBeLessThanOrEqual(0.7);
      } else {
        expect(e.loadRatio, e.id).toBe(0);
      }
    }
    // Anclas relativas: ningún accesorio supera a su básico de referencia.
    const byId = Object.fromEntries(catalog.map((e) => [e.id, e]));
    expect(byId['gym-goblet-squat'].loadRatio).toBeLessThan(byId['gym-barbell-back-squat'].loadRatio);
    expect(byId['gym-db-bench-press'].loadRatio).toBeLessThan(byId['gym-bench-press'].loadRatio);
    expect(byId['gym-sumo-deadlift'].loadRatio).toBeLessThanOrEqual(byId['gym-conventional-deadlift'].loadRatio);
  });

  it('hombro sensible: excluye los press verticales nuevos (mancuernas y Arnold) pero CONSERVA el press de banca con mancuernas', () => {
    const profile = { physicalInjuries: 'dolor de hombro' };
    const pool = catalog.filter((e) => ['gym-db-shoulder-press', 'gym-arnold-press', 'gym-db-bench-press', 'gym-machine-chest-press'].includes(e.id));
    const { allowed, excluded } = filterRestrictedExercises(pool, profile);
    const excludedIds = excluded.map((x) => x.id);
    expect(excludedIds).toContain('gym-db-shoulder-press');
    expect(excludedIds).toContain('gym-arnold-press');
    expect(allowed.map((x) => x.id)).toContain('gym-db-bench-press');
    expect(allowed.map((x) => x.id)).toContain('gym-machine-chest-press');
  });

  it('lumbar sensible: el peso muerto CONVENCIONAL sigue bloqueado y el SUMO se permite (decisión documentada: torso más vertical, menos cizalla)', () => {
    const profile = { physicalInjuries: 'molestia lumbar' };
    const pool = catalog.filter((e) => ['gym-conventional-deadlift', 'gym-sumo-deadlift', 'gym-tbar-row-supported', 'gym-one-arm-db-row'].includes(e.id));
    const { allowed, excluded } = filterRestrictedExercises(pool, profile);
    expect(excluded.map((x) => x.id)).toContain('gym-conventional-deadlift');
    const allowedIds = allowed.map((x) => x.id);
    expect(allowedIds).toContain('gym-sumo-deadlift');
    // Remos con apoyo (pecho/banco): lumbar-friendly, deben conservarse.
    expect(allowedIds).toContain('gym-tbar-row-supported');
    expect(allowedIds).toContain('gym-one-arm-db-row');
  });

  it('osteoporosis: el core nuevo (Pallof anti-rotación y rueda anti-extensión) NO se bloquea; artrosis no bloquea nada del lote (sin saltos)', () => {
    const osteo = { medicalConditions: 'osteoporosis' };
    const lote = catalog.filter((e) => strengthCatalogExpansion.some((x) => x.id === e.id));
    const osteoRes = filterRestrictedExercises(lote, osteo);
    expect(osteoRes.excluded).toHaveLength(0);
    const artrosis = filterRestrictedExercises(lote, { medicalConditions: 'artrosis de rodilla' });
    // Artrosis bloquea impacto (saltos): el lote no tiene ninguno. Rodilla sensible tampoco caza estos ids.
    expect(artrosis.excluded).toHaveLength(0);
  });

  it('equipment de cada entrada clasifica contra el inventario del usuario (dominadas requiere barra de dominadas; goblet vale con mancuerna O kettlebell)', () => {
    expect(isEquipmentAvailable('Barra de dominadas', new Set(['pullup']))).toBe(true);
    expect(isEquipmentAvailable('Barra de dominadas', new Set(['barbell', 'bench']))).toBe(false);
    expect(isEquipmentAvailable('Mancuerna o kettlebell', new Set(['kettlebell']))).toBe(true);
    expect(isEquipmentAvailable('Mancuerna o kettlebell', new Set(['dumbbells']))).toBe(true);
    expect(isEquipmentAvailable('Barra EZ + Banco', new Set(['barbell', 'bench']))).toBe(true);
  });
});
