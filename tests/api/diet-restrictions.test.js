import { describe, expect, it, vi } from 'vitest';

// La ruta de nutrición arrastra Firestore y Gemini: se anulan para poder probar el redactado
// de restricciones, que es lo único que interesa aquí.
vi.mock('../../src/lib/firebaseAdmin.js', () => ({ getAdminServices: async () => ({ db: {} }) }));

const { describeDietRestrictions } = await import('../../src/app/api/studio-nutrition/route.js');

// El menú semanal con IA leía `profile.dietaryRestrictions` y `profile.allergies`, campos que
// NO existen en el modelo (las preferencias viven en `nutritionPreferences`), así que el prompt
// decía siempre "ninguna declarada". Con alergias eso no es un fallo de calidad: es un riesgo.

describe('restricciones alimentarias en el prompt de nutrición', () => {
  it('la alergia se escribe como prohibición absoluta, no como preferencia', () => {
    const t = describeDietRestrictions({ allergies: ['frutos secos'], intolerances: [], dislikedFoods: [] });
    expect(t).toMatch(/ALERGIAS/);
    expect(t).toMatch(/prohibido en absoluto/i);
    expect(t).toContain('frutos secos');
  });

  it('separa gravedades: alergia, intolerancia y lo que no gusta no pesan igual', () => {
    const t = describeDietRestrictions({
      allergies: ['marisco'], intolerances: ['lactosa'], dislikedFoods: ['brócoli'],
    });
    const iAlergia = t.indexOf('marisco');
    const iIntol = t.indexOf('lactosa');
    const iGusto = t.indexOf('brócoli');
    expect(iAlergia).toBeGreaterThan(-1);
    expect(iIntol).toBeGreaterThan(iAlergia);
    expect(iGusto).toBeGreaterThan(iIntol);
    // Cada una con su verbo: la intolerancia se evita, el gusto simplemente no se usa.
    expect(t).toMatch(/Intolerancias \(evítalas/);
    expect(t).toMatch(/No le gustan/);
  });

  it('exige cambiar la receta si el plato típico lleva lo vetado', () => {
    const t = describeDietRestrictions({ allergies: ['huevo'], intolerances: [], dislikedFoods: [] });
    expect(t).toMatch(/cámbiala por otra/i);
  });

  it('sin restricciones lo dice explícitamente, no deja el hueco en blanco', () => {
    const t = describeDietRestrictions({ allergies: [], intolerances: [], dislikedFoods: [] });
    expect(t).toMatch(/Sin alergias/i);
  });
});
