import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Studio — barreras contra datos simulados en sesiones reales', () => {
  it('reemplaza secciones completas y crea una base autenticada vacía antes de cargar', () => {
    const source = read('scripts/build-studio.mjs');
    expect(source).toContain("mode: 'authenticated'");
    expect(source).toContain("__setAuthenticatedBase('loading')");
    expect(source).toContain('base[k] = v');
    expect(source).not.toContain('Object.assign(base[k], v)');
  });

  it('no conserva fechas ni afirmaciones personales del prototipo en la UI real', () => {
    const app = read('public/studio/app/studio/app.jsx');
    const today = read('public/studio/app/studio/screen-today.jsx');
    expect(app).not.toContain('Lunes · 2 jun');
    expect(today).not.toContain('Tu cuerpo está listo para entrenar fuerte');
    expect(today).not.toContain('Listo para empujar fuerte');
  });

  it('no estima carga glucémica manual con un IG universal ni marca todo en verde', () => {
    const nutrition = read('public/studio/app/studio/screen-nutrition.jsx');
    expect(nutrition).not.toContain('food.carbsGrams * 0.55');
    expect(nutrition).not.toContain('label="Carga baja-moderada"');
    expect(nutrition).toContain("g.dayClass === 'high'");
  });

  it('el dashboard legacy tampoco presenta métricas o perfiles de muestra como reales', () => {
    const dashboard = read('src/components/DashboardPage.js');
    for (const sample of ['David', '1842', '1420', '88%', 'HOY, 18:00', 'Pecho & Tríceps', 'HIIT Metabólico']) {
      expect(dashboard).not.toContain(sample);
    }
    expect(dashboard).not.toContain("weightKg: 75");
    expect(dashboard).not.toContain("heightCm: 175");
  });

  it('no muestra un feed editorial ficticio ni simula reproducción de vídeos inexistentes', () => {
    const data = read('public/studio/app/studio/data.js');
    const today = read('public/studio/app/studio/screen-today.jsx');
    const train = read('public/studio/app/studio/screen-train.jsx');
    const ui = read('public/studio/app/studio/ui.jsx');

    expect(data).not.toContain('const discover =');
    expect(data).not.toContain('Ignios Coaches');
    expect(data).not.toContain("views: '");
    expect(today).not.toContain('D.discover');
    expect(today).toContain("s.list.filter((exercise) => exercise?.yt)");
    expect(train).not.toContain('D.discover');
    expect(ui).not.toContain('playback simulado');
    expect(ui).not.toContain('Reproducción guiada');
    expect(ui).not.toContain('En la app real');
    expect(ui).toContain('Abrir en YouTube');
    expect(ui).toContain("target: '_blank'");
  });
});
