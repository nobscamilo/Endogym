import { strengthCatalog } from './strengthCatalog.js';
import { trxYogaCatalog } from './trxYogaCatalog.js';
import { conditioningCatalog } from './conditioningCatalog.js';
import { pilatesRecoveryCatalog } from './pilatesRecoveryCatalog.js';
import {
  EXERCISE_AUDIT_SCHEMA,
  EXERCISE_BASE_SCHEMA,
  parseExerciseCatalogText,
  serializeExerciseCatalogAsCsv,
  validateExerciseCatalog,
} from './schema.js';

const BUILT_IN_CATALOG = [
  ...strengthCatalog,
  ...trxYogaCatalog,
  ...conditioningCatalog,
  ...pilatesRecoveryCatalog,
];

const BUILT_IN_VALIDATION = validateExerciseCatalog(BUILT_IN_CATALOG, { mode: 'base' });

if (!BUILT_IN_VALIDATION.valid) {
  const details = BUILT_IN_VALIDATION.errors
    .map((error) => `${error.path}: ${error.message}`)
    .join('\n');
  throw new Error(`Exercise catalog schema validation failed.\n${details}`);
}

export function buildExerciseCatalog() {
  return BUILT_IN_VALIDATION.normalizedCatalog.map((exercise) => ({
    ...exercise,
    modalities: [...exercise.modalities],
    sessionTypes: [...exercise.sessionTypes],
    cues: [...exercise.cues],
  }));
}

export {
  BUILT_IN_CATALOG,
  EXERCISE_AUDIT_SCHEMA,
  EXERCISE_BASE_SCHEMA,
  parseExerciseCatalogText,
  serializeExerciseCatalogAsCsv,
  validateExerciseCatalog,
};
