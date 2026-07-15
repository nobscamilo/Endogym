// Desglose de cargas por implemento (presentación, NO cambia la semántica del dato).
// Convención del producto (decisión del usuario, 15 jul 2026):
//  - `loadKg` SIEMPRE es el peso TOTAL levantado. En barra INCLUYE la barra.
//  - Mancuernas: kg POR MANCUERNA. Máquinas/poleas: lo que marca la placa/selector.
// Este módulo solo TRADUCE ese total a lo que el usuario monta en el gym
// ("barra 20 kg + 15 kg por lado"). barKg viene del perfil (default 20 kg olímpica).

export const DEFAULT_BAR_KG = 20;

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Clasifica el campo libre `equipment` del catálogo en un implemento de carga.
// El campo es texto libre ("Barbell + Rack", "Mancuernas o polea", "Máquina leg press"…),
// así que el orden de los checks importa: barra > mancuerna > máquina/polea > kettlebell.
export function classifyEquipment(equipment) {
  const e = norm(equipment);
  if (!e) return 'other';
  // "Barra baja o mesa estable" es remo invertido (peso corporal): no es carga de barra.
  const isBodyweightBar = e.includes('barra baja');
  if (!isBodyweightBar && (e.includes('barbell') || /(^|\s|\+)barra(\s|$|\s*\+)/.test(e) || e.startsWith('barra'))) {
    return 'barbell';
  }
  if (e.includes('mancuerna') || e.includes('dumbbell')) return 'dumbbell';
  if (e.includes('kettlebell') || e.includes('pesa rusa')) return 'kettlebell';
  if (e.includes('maquina') || e.includes('machine') || e.includes('polea') || e.includes('cable')
    || e.includes('leg press') || e.includes('hack')) {
    return 'machine';
  }
  return 'other';
}

// Redondeo a combinaciones reales de discos (mínimo 0,25 kg por lado = discos de 0,25/0,5/1,25/2,5…).
function roundPerSide(v) {
  return Math.round(v * 4) / 4;
}

// Devuelve { kind, text } o null si no hay nada útil que desglosar.
// `text` es una frase corta lista para pintar bajo la carga.
export function describeLoad({ loadKg, equipment, barKg } = {}) {
  const total = Number(loadKg);
  if (!Number.isFinite(total) || total <= 0) return null;
  const kind = classifyEquipment(equipment);
  if (kind === 'barbell') {
    const bar = Number.isFinite(Number(barKg)) && Number(barKg) > 0 ? Number(barKg) : DEFAULT_BAR_KG;
    if (total < bar) {
      return { kind, text: `${total} kg totales: menos que tu barra (${bar} kg) — usa una barra más ligera o mancuernas.` };
    }
    const perSide = roundPerSide((total - bar) / 2);
    if (perSide <= 0) return { kind, text: `${total} kg totales: solo la barra (${bar} kg), sin discos.` };
    return { kind, text: `${total} kg totales: barra ${bar} kg + ${perSide} kg por lado.` };
  }
  if (kind === 'dumbbell') return { kind, text: `${total} kg por mancuerna.` };
  if (kind === 'kettlebell') return { kind, text: `${total} kg la pesa.` };
  if (kind === 'machine') return { kind, text: `${total} kg en la placa/selector de la máquina.` };
  return null;
}
