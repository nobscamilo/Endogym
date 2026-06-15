// #4 — Inventario de equipo y preferencias del usuario.
// El catálogo guarda `equipment` como texto libre (p. ej. "Barbell + Rack", "Polea o banda",
// "Mancuernas, kettlebells o mochila"). Aquí clasificamos ese texto a categorías para poder
// filtrar el pool por el material que el usuario declara tener, además de excluir ejercicios
// vetados y priorizar favoritos. Salvaguarda clave: NUNCA dejamos el pool vacío (si un filtro
// lo vaciaría, se relaja) para no romper la sesión.

export const EQUIPMENT_OPTIONS = [
  { id: 'barbell', label: 'Barra' },
  { id: 'dumbbells', label: 'Mancuernas' },
  { id: 'cable', label: 'Poleas' },
  { id: 'machine', label: 'Máquinas' },
  { id: 'band', label: 'Bandas' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'bench', label: 'Banco' },
  { id: 'rack', label: 'Rack' },
  { id: 'pullup', label: 'Barra de dominadas' },
  { id: 'trx', label: 'TRX' },
  { id: 'bike', label: 'Bicicleta' },
];

const EQUIPMENT_IDS = new Set(EQUIPMENT_OPTIONS.map((o) => o.id));

// Un token de material → categoría, o null si es "mínimo" (peso corporal, casa, improvisado):
// esos no imponen requisito y por tanto siempre están disponibles.
function partCategory(part) {
  const p = part.toLowerCase();
  if (/barbell|barra/.test(p)) return 'barbell';
  if (/dumbbell|mancuern/.test(p)) return 'dumbbells';
  if (/polea|cable/.test(p)) return 'cable';
  if (/m[aá]quina|leg press|hack|femoral/.test(p)) return 'machine';
  if (/banda|miniband/.test(p)) return 'band';
  if (/kettlebell/.test(p)) return 'kettlebell';
  if (/trx/.test(p)) return 'trx';
  if (/bici|bicicleta/.test(p)) return 'bike';
  if (/dominad|paralel/.test(p)) return 'pullup';
  if (/banco|bench/.test(p)) return 'bench';
  if (/rack/.test(p)) return 'rack';
  return null; // peso corporal, silla, pared, mat, mochila, garrafa, escalón, anclaje, etc.
}

// Devuelve alternativas (OR) de combos (AND de categorías). Ejemplo:
// "Barbell o dumbbells" → [['barbell'], ['dumbbells']]; "Barbell + Rack" → [['barbell','rack']].
function classifyEquipment(equipmentStr) {
  const s = String(equipmentStr || '').toLowerCase().trim();
  if (!s) return [[]];
  const alternatives = s.split(/\s+o\s+|,\s*/).map((x) => x.trim()).filter(Boolean);
  return alternatives.map((alt) => {
    const parts = alt.split(/\s*\+\s*|\s+y\s+|\//).map((x) => x.trim()).filter(Boolean);
    const cats = [];
    for (const part of parts) {
      const cat = partCategory(part);
      if (cat) cats.push(cat);
    }
    return Array.from(new Set(cats));
  });
}

// Disponible si ALGUNA alternativa tiene todas sus categorías cubiertas por el material del usuario.
export function isEquipmentAvailable(equipmentStr, availableSet) {
  if (!availableSet || !availableSet.size) return true;
  return classifyEquipment(equipmentStr).some((cats) => cats.every((c) => availableSet.has(c)));
}

export function sanitizeEquipmentList(list) {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.filter((x) => EQUIPMENT_IDS.has(x)))).slice(0, EQUIPMENT_OPTIONS.length);
}

// Filtra el pool por equipo disponible + ejercicios excluidos y prioriza favoritos.
// Relaja cualquier filtro que dejaría el pool vacío.
export function filterByEquipmentAndPreferences(pool, profile) {
  if (!Array.isArray(pool) || !pool.length) return pool;
  const excluded = new Set((profile?.excludedExercises || []).filter(Boolean));
  const favorites = new Set((profile?.favoriteExercises || []).filter(Boolean));
  const available = new Set(sanitizeEquipmentList(profile?.equipment));

  let out = excluded.size ? pool.filter((e) => !excluded.has(e.id)) : pool.slice();
  if (!out.length) out = pool.slice();

  if (available.size) {
    const byEquip = out.filter((e) => isEquipmentAvailable(e.equipment, available));
    if (byEquip.length) out = byEquip;
  }

  if (favorites.size) {
    out = [...out.filter((e) => favorites.has(e.id)), ...out.filter((e) => !favorites.has(e.id))];
  }
  return out;
}
