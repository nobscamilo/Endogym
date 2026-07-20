// Acceso a la colección raíz `exerciseLibrary` (873 ejercicios de free-exercise-db,
// dominio público, ingeridos y traducidos por scripts/ingest_exercise_library.mjs).
// Es contenido ESTÁTICO tras la ingesta → caché en módulo con TTL para no releer
// 873 docs de Firestore en cada petición (best-effort por instancia serverless).
import { getAdminServices } from '../lib/firebaseAdmin.js';

export const EXERCISE_MEDIA_BASE = `https://storage.googleapis.com/${process.env.EXERCISE_MEDIA_BUCKET || 'endogym-vtety8-exercise-media'}/exercise-media`;

const INDEX_TTL_MS = 60 * 60 * 1000; // 1 h
let indexCache = { at: 0, data: null };

// Índice COMPACTO para el buscador de la Biblioteca (la UI filtra en cliente y deriva
// las URLs de las fotos del id). ~873 entradas pequeñas.
export async function listExerciseLibraryIndex() {
  if (indexCache.data && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.data;
  const { db } = await getAdminServices();
  const snap = await db.collection('exerciseLibrary')
    .select('nameEs', 'nameEn', 'primaryMuscles', 'equipment', 'level', 'category', 'imagesUploaded')
    .get();
  const data = snap.docs
    .filter((d) => d.data().imagesUploaded)
    .map((d) => {
      const o = d.data();
      return {
        id: d.id,
        n: o.nameEs || o.nameEn,
        en: o.nameEn || null,
        m: (Array.isArray(o.primaryMuscles) && o.primaryMuscles[0]) || null,
        eq: o.equipment || null,
        lvl: o.level || null,
        cat: o.category || null,
      };
    })
    .sort((a, b) => String(a.n).localeCompare(String(b.n), 'es'));
  indexCache = { at: Date.now(), data };
  return data;
}

// Ficha completa de un ejercicio (pasos en español con fallback al inglés).
export async function getExerciseLibraryEntry(id) {
  const clean = String(id || '').replace(/[^A-Za-z0-9_'\-]/g, '').slice(0, 120);
  if (!clean) return null;
  const { db } = await getAdminServices();
  const doc = await db.collection('exerciseLibrary').doc(clean).get();
  if (!doc.exists) return null;
  const o = doc.data();
  return {
    id: doc.id,
    name: o.nameEs || o.nameEn,
    nameEn: o.nameEn || null,
    level: o.level || null,
    category: o.category || null,
    mechanic: o.mechanic || null,
    force: o.force || null,
    equipment: o.equipment || null,
    primaryMuscles: o.primaryMuscles || [],
    secondaryMuscles: o.secondaryMuscles || [],
    steps: (Array.isArray(o.instructionsEs) && o.instructionsEs.length ? o.instructionsEs : o.instructionsEn) || [],
    images: [0, 1].map((n) => `${EXERCISE_MEDIA_BASE}/${doc.id}/${n}.jpg`),
    license: o.license || 'public-domain-unlicense',
  };
}

// Solo para tests: resetear la caché del índice.
export function __resetExerciseLibraryCache() {
  indexCache = { at: 0, data: null };
}
