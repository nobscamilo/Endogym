import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_COLLECTIONS } from '../../src/lib/repositories/firestoreRepository.js';

// Borrar el documento users/{uid} NO borra sus subcolecciones (semántica de Firestore): lo
// que no esté en ACCOUNT_COLLECTIONS sobrevive a "eliminar mi cuenta". Este test recorre el
// código en busca de subcolecciones de usuario y falla si alguna no está registrada, para
// que añadir una nueva y olvidarse del borrado deje de ser posible en silencio.

const root = process.cwd();
const SOURCES = [
  'src/lib/repositories/firestoreRepository.js',
  'src/lib/rateLimit.js',
];

// users/{uid}/<sub> — capta doc(userId)/doc(uid)/doc(user.uid) y el userRef del repositorio.
const SUBCOLLECTION_RE = /(?:doc\((?:userId|uid|user\.uid)\)|userRef)\s*\n?\s*\.collection\('([a-zA-Z]+)'\)/g;

function subcollectionsUsedIn(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const found = new Set();
  for (const match of source.matchAll(SUBCOLLECTION_RE)) found.add(match[1]);
  return found;
}

describe('borrado de cuenta — cobertura de subcolecciones', () => {
  it('ACCOUNT_COLLECTIONS incluye todas las subcolecciones que la app escribe', () => {
    const used = new Set();
    for (const file of SOURCES) {
      for (const name of subcollectionsUsedIn(file)) used.add(name);
    }
    // Red de seguridad del propio test: si el regex deja de captar, esto lo delata.
    expect(used.size).toBeGreaterThanOrEqual(10);

    const missing = [...used].filter((name) => !ACCOUNT_COLLECTIONS.includes(name)).sort();
    expect(missing).toEqual([]);
  });

  it('registra explícitamente los datos del coach y las integraciones', () => {
    // Estas siete faltaban (25-jul-2026): la memoria del chat guarda los mensajes que
    // escribió la persona, e integrations guarda credenciales OAuth de Strava.
    for (const name of ['coachChat', 'coachReports', 'coachFeedback', 'coachRecommendations',
      'workoutAnalyses', 'studioNutrition', 'integrations']) {
      expect(ACCOUNT_COLLECTIONS).toContain(name);
    }
  });

  it('no registra colecciones inexistentes (la lista no se infla con nombres muertos)', () => {
    const used = new Set();
    for (const file of SOURCES) {
      for (const name of subcollectionsUsedIn(file)) used.add(name);
    }
    const dead = ACCOUNT_COLLECTIONS.filter((name) => !used.has(name));
    expect(dead).toEqual([]);
  });
});
