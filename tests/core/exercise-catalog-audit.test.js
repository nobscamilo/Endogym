import { describe, expect, it } from 'vitest';

import {
  exportExerciseLibraryCatalogCsv,
  exportExerciseLibraryCatalogJson,
  getExerciseLibraryAuditSchema,
  getExerciseLibraryCatalog,
  parseExerciseLibraryAuditText,
  validateExerciseLibraryAuditCatalog,
} from '../../src/core/exerciseLibrary.js';

describe('exercise catalog audit tooling', () => {
  it('exports and reimports the audit catalog as CSV without losing schema validity', () => {
    const catalog = getExerciseLibraryCatalog().slice(0, 4);
    const csv = exportExerciseLibraryCatalogCsv(catalog);
    const parsed = parseExerciseLibraryAuditText(csv, { format: 'csv' });

    expect(parsed.format).toBe('csv');
    expect(parsed.validation.valid).toBe(true);
    expect(parsed.catalog).toHaveLength(catalog.length);
    expect(parsed.catalog[0].id).toBe(catalog[0].id);
    expect(parsed.catalog[0].primaryMuscles).toEqual(catalog[0].primaryMuscles);
    expect(parsed.catalog[0].progressions).toEqual(catalog[0].progressions);
  });

  it('exports and reimports the audit catalog as JSON without losing schema validity', () => {
    const catalog = getExerciseLibraryCatalog().slice(0, 3);
    const json = exportExerciseLibraryCatalogJson(catalog);
    const parsed = parseExerciseLibraryAuditText(json, { format: 'json' });

    expect(parsed.format).toBe('json');
    expect(parsed.validation.valid).toBe(true);
    expect(parsed.catalog[1].id).toBe(catalog[1].id);
    expect(parsed.catalog[1].anatomyRegions).toEqual(catalog[1].anatomyRegions);
    expect(parsed.catalog[1].contraindications).toEqual(catalog[1].contraindications);
  });

  it('exposes a strict audit schema and flags malformed imported rows', () => {
    const schema = getExerciseLibraryAuditSchema();
    const validation = validateExerciseLibraryAuditCatalog([
      {
        id: 'broken-row',
        name: 'Broken Row',
        modalities: ['space_gym'],
        sessionTypes: ['resistance'],
        category: 'upper_pull',
        equipment: 'Cable',
        loadType: 'external',
        loadRatio: 0.2,
        cues: ['Tira'],
        primaryMuscles: ['Dorsal ancho'],
        secondaryMuscles: [],
        anatomyRegions: { front: ['biceps'], back: ['lats'] },
      },
    ]);

    expect(schema.requiredFields).toContain('anatomyRegions.front');
    expect(schema.csvColumns).toContain('frontRegions');
    expect(schema.csvColumns).toContain('difficulty');
    expect(schema.csvColumns).toContain('progressions');
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((issue) => issue.path.includes('modalities'))).toBe(true);
  });
});
