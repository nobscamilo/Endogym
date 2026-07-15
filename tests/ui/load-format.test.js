import { describe, expect, it } from 'vitest';
import { classifyEquipment, describeLoad, DEFAULT_BAR_KG } from '../../public/studio/app/studio/load-format.js';

describe('classifyEquipment', () => {
  it('clasifica barra (español e inglés, con extras)', () => {
    expect(classifyEquipment('Barbell')).toBe('barbell');
    expect(classifyEquipment('Barbell + Rack')).toBe('barbell');
    expect(classifyEquipment('Barbell + Bench')).toBe('barbell');
    expect(classifyEquipment('Barra + banda')).toBe('barbell');
    expect(classifyEquipment('Barbell o dumbbells')).toBe('barbell');
  });

  it('NO trata "Barra baja o mesa estable" (remo invertido, peso corporal) como barra', () => {
    expect(classifyEquipment('Barra baja o mesa estable')).not.toBe('barbell');
  });

  it('clasifica mancuernas, máquinas y poleas', () => {
    expect(classifyEquipment('Mancuernas')).toBe('dumbbell');
    expect(classifyEquipment('Dumbbells + Bench')).toBe('dumbbell');
    expect(classifyEquipment('Banco inclinado + mancuernas')).toBe('dumbbell');
    expect(classifyEquipment('Máquina leg press')).toBe('machine');
    expect(classifyEquipment('Máquina hack squat')).toBe('machine');
    expect(classifyEquipment('Polea')).toBe('machine');
    expect(classifyEquipment('Poleas')).toBe('machine');
  });

  it('lo demás es other (bandas, TRX, peso corporal, vacío)', () => {
    expect(classifyEquipment('Banda elástica')).toBe('other');
    expect(classifyEquipment('TRX')).toBe('other');
    expect(classifyEquipment('Peso corporal')).toBe('other');
    expect(classifyEquipment('')).toBe('other');
    expect(classifyEquipment(null)).toBe('other');
  });
});

describe('describeLoad', () => {
  it('barra: total incluye la barra y desglosa discos por lado', () => {
    const d = describeLoad({ loadKg: 50, equipment: 'Barbell + Rack', barKg: 20 });
    expect(d.kind).toBe('barbell');
    expect(d.text).toContain('50 kg totales');
    expect(d.text).toContain('barra 20 kg');
    expect(d.text).toContain('15 kg por lado');
  });

  it('barra: usa el peso de barra del perfil (15 kg)', () => {
    const d = describeLoad({ loadKg: 50, equipment: 'Barbell', barKg: 15 });
    expect(d.text).toContain('barra 15 kg');
    expect(d.text).toContain('17.5 kg por lado');
  });

  it('barra: sin barKg usa la olímpica de 20 kg por defecto', () => {
    expect(DEFAULT_BAR_KG).toBe(20);
    const d = describeLoad({ loadKg: 60, equipment: 'Barbell' });
    expect(d.text).toContain('barra 20 kg');
    expect(d.text).toContain('20 kg por lado');
  });

  it('barra: carga por debajo del peso de la barra → aviso honesto, sin discos negativos', () => {
    const d = describeLoad({ loadKg: 12.5, equipment: 'Barbell', barKg: 20 });
    expect(d.text).toMatch(/menos que tu barra/);
    expect(d.text).not.toMatch(/-\d/);
  });

  it('barra: total igual a la barra → "solo la barra"', () => {
    const d = describeLoad({ loadKg: 20, equipment: 'Barbell', barKg: 20 });
    expect(d.text).toMatch(/solo la barra/);
  });

  it('redondea el lado a discos reales (múltiplos de 0,25 kg)', () => {
    // (47.5 - 20) / 2 = 13.75 → ya es múltiplo de 0.25
    const d = describeLoad({ loadKg: 47.5, equipment: 'Barbell', barKg: 20 });
    expect(d.text).toContain('13.75 kg por lado');
  });

  it('mancuernas: el número es POR mancuerna', () => {
    const d = describeLoad({ loadKg: 22.5, equipment: 'Mancuernas' });
    expect(d.kind).toBe('dumbbell');
    expect(d.text).toContain('22.5 kg por mancuerna');
  });

  it('máquina: es la placa/selector', () => {
    const d = describeLoad({ loadKg: 70, equipment: 'Máquina leg press' });
    expect(d.kind).toBe('machine');
    expect(d.text).toMatch(/placa\/selector/);
  });

  it('sin carga o implemento no cargable → null', () => {
    expect(describeLoad({ loadKg: null, equipment: 'Barbell' })).toBeNull();
    expect(describeLoad({ loadKg: 0, equipment: 'Barbell' })).toBeNull();
    expect(describeLoad({ loadKg: 40, equipment: 'TRX' })).toBeNull();
    expect(describeLoad({ loadKg: 40, equipment: 'Banda elástica' })).toBeNull();
  });
});
