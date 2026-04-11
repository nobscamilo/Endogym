import { TrainingModality } from '../../domain/models.js';

const ALLOWED_MODALITIES = new Set(Object.values(TrainingModality));
const ALLOWED_SESSION_TYPES = new Set(['resistance', 'mixed', 'mindbody', 'recovery', 'aerobic']);
const ALLOWED_CATEGORIES = new Set([
  'lower_body_strength',
  'lower_body_unilateral',
  'lower_body_accessory',
  'posterior_chain',
  'upper_push',
  'upper_pull',
  'core',
  'conditioning',
  'mobility',
  'mobility_strength',
  'core_mobility',
  'neuromotor',
  'recovery',
  'cardio_base',
  'cardio_threshold',
  'cardio_interval',
  'cardio_skill',
]);
const ALLOWED_LOAD_TYPES = new Set(['external', 'bodyweight', 'time']);
const ALLOWED_DIFFICULTIES = new Set(['foundation', 'build', 'performance']);

export const EXERCISE_BASE_SCHEMA = Object.freeze({
  requiredFields: ['id', 'name', 'modalities', 'sessionTypes', 'category', 'equipment', 'loadType', 'loadRatio', 'cues'],
  optionalFields: Object.freeze(['difficulty', 'progressions', 'regressions', 'contraindications', 'youtubeQuery']),
  allowedModalities: Object.freeze([...ALLOWED_MODALITIES]),
  allowedSessionTypes: Object.freeze([...ALLOWED_SESSION_TYPES]),
  allowedCategories: Object.freeze([...ALLOWED_CATEGORIES]),
  allowedLoadTypes: Object.freeze([...ALLOWED_LOAD_TYPES]),
  allowedDifficulties: Object.freeze([...ALLOWED_DIFFICULTIES]),
});

export const EXERCISE_AUDIT_SCHEMA = Object.freeze({
  ...EXERCISE_BASE_SCHEMA,
  requiredFields: Object.freeze([
    ...EXERCISE_BASE_SCHEMA.requiredFields,
    'primaryMuscles',
    'secondaryMuscles',
    'anatomyRegions.front',
    'anatomyRegions.back',
  ]),
  csvColumns: Object.freeze([
    'id',
    'name',
    'category',
    'modalities',
    'sessionTypes',
    'equipment',
    'loadType',
    'loadRatio',
    'difficulty',
    'youtubeQuery',
    'primaryMuscles',
    'secondaryMuscles',
    'frontRegions',
    'backRegions',
    'progressions',
    'regressions',
    'contraindications',
    'cues',
  ]),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toTrimmedString(value) {
  return String(value ?? '').trim();
}

function normalizeDelimitedArray(value, separator = '|') {
  if (Array.isArray(value)) {
    return value.map((item) => toTrimmedString(item)).filter(Boolean);
  }
  const source = toTrimmedString(value);
  if (!source) return [];
  return source.split(separator).map((item) => item.trim()).filter(Boolean);
}

function normalizeNumber(value) {
  if (value === '' || value == null) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function buildBaseRecord(record) {
  return {
    id: toTrimmedString(record?.id),
    name: toTrimmedString(record?.name),
    modalities: normalizeDelimitedArray(record?.modalities),
    sessionTypes: normalizeDelimitedArray(record?.sessionTypes),
    category: toTrimmedString(record?.category),
    equipment: toTrimmedString(record?.equipment),
    loadType: toTrimmedString(record?.loadType),
    loadRatio: normalizeNumber(record?.loadRatio),
    difficulty: toTrimmedString(record?.difficulty),
    youtubeQuery: toTrimmedString(record?.youtubeQuery),
    cues: normalizeDelimitedArray(record?.cues),
    progressions: normalizeDelimitedArray(record?.progressions),
    regressions: normalizeDelimitedArray(record?.regressions),
    contraindications: normalizeDelimitedArray(record?.contraindications),
  };
}

function buildAuditRecord(record) {
  const base = buildBaseRecord(record);
  const anatomyRegions = isPlainObject(record?.anatomyRegions) ? record.anatomyRegions : {};
  return {
    ...base,
    primaryMuscles: normalizeDelimitedArray(record?.primaryMuscles),
    secondaryMuscles: normalizeDelimitedArray(record?.secondaryMuscles),
    anatomyRegions: {
      front: normalizeDelimitedArray(anatomyRegions.front ?? record?.frontRegions),
      back: normalizeDelimitedArray(anatomyRegions.back ?? record?.backRegions),
    },
  };
}

export function normalizeExerciseRecord(record, { mode = 'base' } = {}) {
  return mode === 'audit' ? buildAuditRecord(record) : buildBaseRecord(record);
}

function validateStringField(record, field, index) {
  if (toTrimmedString(record[field])) return [];
  return [{ path: `[${index}].${field}`, message: `El campo ${field} es obligatorio.` }];
}

function validateArrayField(record, field, index, { allowEmpty = false } = {}) {
  const value = record[field];
  if (Array.isArray(value) && (allowEmpty || value.length > 0)) return [];
  return [{ path: `[${index}].${field}`, message: `El campo ${field} debe ser una lista${allowEmpty ? '' : ' no vacía'}.` }];
}

function validateAllowedValues(values, allowed, index, pathLabel) {
  return values
    .filter((value) => !allowed.has(value))
    .map((value) => ({ path: `[${index}].${pathLabel}`, message: `Valor no permitido: ${value}.` }));
}

function validateBaseRecord(record, index) {
  const errors = [
    ...validateStringField(record, 'id', index),
    ...validateStringField(record, 'name', index),
    ...validateStringField(record, 'category', index),
    ...validateStringField(record, 'equipment', index),
    ...validateStringField(record, 'loadType', index),
    ...validateArrayField(record, 'modalities', index),
    ...validateArrayField(record, 'sessionTypes', index),
    ...validateArrayField(record, 'cues', index),
  ];

  if (!ALLOWED_CATEGORIES.has(record.category)) {
    errors.push({ path: `[${index}].category`, message: `Categoria no soportada: ${record.category}.` });
  }
  if (!ALLOWED_LOAD_TYPES.has(record.loadType)) {
    errors.push({ path: `[${index}].loadType`, message: `Tipo de carga no soportado: ${record.loadType}.` });
  }
  if (!Number.isFinite(record.loadRatio)) {
    errors.push({ path: `[${index}].loadRatio`, message: 'loadRatio debe ser numérico.' });
  }
  if (record.difficulty && !ALLOWED_DIFFICULTIES.has(record.difficulty)) {
    errors.push({ path: `[${index}].difficulty`, message: `Nivel no soportado: ${record.difficulty}.` });
  }

  errors.push(...validateAllowedValues(record.modalities, ALLOWED_MODALITIES, index, 'modalities'));
  errors.push(...validateAllowedValues(record.sessionTypes, ALLOWED_SESSION_TYPES, index, 'sessionTypes'));

  return errors;
}

function validateAuditRecord(record, index) {
  const errors = validateBaseRecord(record, index);
  errors.push(...validateArrayField(record, 'primaryMuscles', index));
  errors.push(...validateArrayField(record, 'secondaryMuscles', index, { allowEmpty: true }));
  if (!isPlainObject(record.anatomyRegions)) {
    errors.push({ path: `[${index}].anatomyRegions`, message: 'anatomyRegions debe ser un objeto.' });
    return errors;
  }
  if (!Array.isArray(record.anatomyRegions.front)) {
    errors.push({ path: `[${index}].anatomyRegions.front`, message: 'anatomyRegions.front debe ser una lista.' });
  }
  if (!Array.isArray(record.anatomyRegions.back)) {
    errors.push({ path: `[${index}].anatomyRegions.back`, message: 'anatomyRegions.back debe ser una lista.' });
  }
  return errors;
}

export function validateExerciseCatalog(catalog, { mode = 'base' } = {}) {
  const records = Array.isArray(catalog) ? catalog : [];
  const normalizedCatalog = records.map((record) => normalizeExerciseRecord(record, { mode }));
  const errors = [];
  const warnings = [];
  const seenIds = new Set();

  normalizedCatalog.forEach((record, index) => {
    const recordErrors = mode === 'audit'
      ? validateAuditRecord(record, index)
      : validateBaseRecord(record, index);
    errors.push(...recordErrors);

    if (record.id) {
      if (seenIds.has(record.id)) {
        errors.push({ path: `[${index}].id`, message: `ID duplicado: ${record.id}.` });
      }
      seenIds.add(record.id);
    }

    if (record.cues.length < 2) {
      warnings.push({ path: `[${index}].cues`, message: `El ejercicio ${record.id || index} tiene menos de 2 cues.` });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedCatalog,
  };
}

function detectFormat(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'csv';
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(cell);
      const hasContent = row.some((value) => String(value).trim().length > 0);
      if (hasContent) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => String(value).trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function parseCsvCatalog(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const [header, ...body] = rows;
  return body.map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ''])));
}

export function parseExerciseCatalogText(text, { format = 'auto', mode = 'audit' } = {}) {
  const sourceText = String(text || '').trim();
  if (!sourceText) {
    throw new Error('El archivo está vacío.');
  }

  const resolvedFormat = format === 'auto' ? detectFormat(sourceText) : format;
  if (!resolvedFormat) {
    throw new Error('No se pudo detectar el formato del archivo.');
  }

  let records;
  if (resolvedFormat === 'json') {
    const parsed = JSON.parse(sourceText);
    records = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.exercises) ? parsed.exercises : null;
    if (!Array.isArray(records)) {
      throw new Error('El JSON debe contener un array o una propiedad exercises[].');
    }
  } else if (resolvedFormat === 'csv') {
    records = parseCsvCatalog(sourceText);
  } else {
    throw new Error(`Formato no soportado: ${resolvedFormat}.`);
  }

  const validation = validateExerciseCatalog(records, { mode });
  return {
    format: resolvedFormat,
    catalog: validation.normalizedCatalog,
    validation,
  };
}

function escapeCsv(value) {
  const source = String(value ?? '');
  if (!/[",\n\r]/.test(source)) return source;
  return `"${source.replaceAll('"', '""')}"`;
}

function resolveCsvValue(record, column) {
  if (
    column === 'modalities'
    || column === 'sessionTypes'
    || column === 'cues'
    || column === 'primaryMuscles'
    || column === 'secondaryMuscles'
    || column === 'progressions'
    || column === 'regressions'
    || column === 'contraindications'
  ) {
    return (record[column] || []).join('|');
  }
  if (column === 'youtubeQuery') return record.youtubeQuery || '';
  if (column === 'frontRegions') return (record.anatomyRegions?.front || []).join('|');
  if (column === 'backRegions') return (record.anatomyRegions?.back || []).join('|');
  return record[column] ?? '';
}

export function serializeExerciseCatalogAsCsv(catalog, { mode = 'audit' } = {}) {
  const validation = validateExerciseCatalog(catalog, { mode });
  const columns = mode === 'audit' ? EXERCISE_AUDIT_SCHEMA.csvColumns : EXERCISE_BASE_SCHEMA.requiredFields;
  const lines = [columns.join(',')];

  validation.normalizedCatalog.forEach((record) => {
    const row = columns.map((column) => escapeCsv(resolveCsvValue(record, column)));
    lines.push(row.join(','));
  });

  return lines.join('\n');
}
