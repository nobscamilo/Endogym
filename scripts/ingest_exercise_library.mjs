// Ingesta de free-exercise-db (dominio público, https://github.com/yuhonas/free-exercise-db)
// a Firestore + Storage para las guías visuales y la futura biblioteca navegable.
//
// - Traduce nombre + instrucciones al español (Gemini, lotes de 20, UNA sola vez).
// - Sube las 2 fotos (inicio/fin) a Storage en exercise-media/{id}/{0,1}.jpg y las hace
//   públicas (makePublic; si el bucket lo impide, lo registra para servirlas vía regla pública).
// - Escribe users-agnóstico en la colección raíz `exerciseLibrary/{id}`.
// - RESUMABLE: se salta docs con translatedAt e imágenes ya subidas; se puede relanzar.
//
// Uso: node --env-file=.env.local scripts/ingest_exercise_library.mjs [--dir /tmp/fed] [--limit N] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { getAdminServices } from '../src/lib/firebaseAdmin.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const DIR = flag('--dir', '/tmp/fed');
const LIMIT = Number(flag('--limit', '0')) || 0;
const DRY = args.includes('--dry-run');
const EX_DIR = path.join(DIR, 'exercises');

if (!fs.existsSync(EX_DIR)) {
  console.error(`No existe ${EX_DIR}. Clona antes: git clone --depth 1 https://github.com/yuhonas/free-exercise-db ${DIR}`);
  process.exit(1);
}

const ids = fs.readdirSync(EX_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
console.log(`free-exercise-db: ${ids.length} ejercicios en ${EX_DIR}`);

const { db } = await getAdminServices();
const { getStorage } = await import('firebase-admin/storage');
// Bucket PÚBLICO dedicado a las guías (IAM allUsers objectViewer), separado del bucket
// privado de platos. Creado el 20-jul-2026 vía gcloud (la service account no puede crear buckets).
const MEDIA_BUCKET = process.env.EXERCISE_MEDIA_BUCKET || 'endogym-vtety8-exercise-media';
const bucket = getStorage().bucket(MEDIA_BUCKET);
console.log('bucket:', bucket.name);

// Estado actual en Firestore para ser resumable.
const existing = new Map();
const snap = await db.collection('exerciseLibrary').select('translatedAt', 'imagesUploaded').get();
for (const d of snap.docs) existing.set(d.id, d.data());
console.log('ya en Firestore:', existing.size);

const pending = ids.filter((id) => !existing.get(id)?.translatedAt || !existing.get(id)?.imagesUploaded);
const work = LIMIT ? pending.slice(0, LIMIT) : pending;
console.log('pendientes:', pending.length, LIMIT ? `(procesando ${work.length})` : '');
if (DRY || !work.length) process.exit(0);

async function translateBatch(batch) {
  // batch: [{id, name, instructions}] → { id: { nameEs, instructionsEs } }
  const listado = batch.map((e) => `${e.id}\nNombre: ${e.name}\nPasos: ${JSON.stringify(e.instructions)}`).join('\n---\n');
  const prompt = `Eres traductor especializado en entrenamiento de fuerza (español de España, terminología de gimnasio natural, imperativo).
Traduce el nombre y los pasos de cada ejercicio. Mantén nombres propios asentados (Curl, Press, Hip Thrust) si son el uso común en gimnasios de España.
Devuelve SOLO JSON: {"items":[{"id":"...","nameEs":"...","instructionsEs":["..."]}]} con TODOS los ids.
---
${listado}`;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 8000, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').trim();
  const parsed = JSON.parse(text);
  const out = {};
  for (const it of parsed.items || []) {
    if (it?.id && typeof it.nameEs === 'string' && Array.isArray(it.instructionsEs)) out[it.id] = it;
  }
  return out;
}

async function uploadImages(id) {
  const urls = [];
  for (const n of [0, 1]) {
    const local = path.join(EX_DIR, id, `${n}.jpg`);
    if (!fs.existsSync(local)) continue;
    const dest = `exercise-media/${id}/${n}.jpg`;
    const file = bucket.file(dest);
    const [exists] = await file.exists();
    if (!exists) await bucket.upload(local, { destination: dest, metadata: { cacheControl: 'public, max-age=31536000, immutable', contentType: 'image/jpeg' } });
    // El bucket es público a nivel de IAM: URL directa de GCS, sin tokens ni reglas.
    urls.push(`https://storage.googleapis.com/${bucket.name}/${dest}`);
  }
  return urls;
}

const BATCH = 20;
let done = 0;
for (let i = 0; i < work.length; i += BATCH) {
  const slice = work.slice(i, i + BATCH);
  const raws = slice.map((id) => ({ id, ...JSON.parse(fs.readFileSync(path.join(EX_DIR, `${id}.json`), 'utf8')) }));
  const needTranslate = raws.filter((e) => !existing.get(e.id)?.translatedAt);
  let translations = {};
  for (let attempt = 1; attempt <= 2 && needTranslate.length; attempt += 1) {
    try {
      translations = await translateBatch(needTranslate.map((e) => ({ id: e.id, name: e.name, instructions: e.instructions || [] })));
      break;
    } catch (e) {
      console.warn(`traducción lote ${i / BATCH} intento ${attempt} falló:`, e.message);
      if (attempt === 2) translations = {};
    }
  }
  for (const e of raws) {
    try {
      const urls = await uploadImages(e.id);
      const tr = translations[e.id];
      const prev = existing.get(e.id) || {};
      const doc = {
        nameEn: e.name,
        level: e.level || null,
        category: e.category || null,
        mechanic: e.mechanic || null,
        force: e.force || null,
        equipment: e.equipment || null,
        primaryMuscles: e.primaryMuscles || [],
        secondaryMuscles: e.secondaryMuscles || [],
        instructionsEn: e.instructions || [],
        images: urls,
        imagesUploaded: urls.length > 0,
        source: 'free-exercise-db',
        license: 'public-domain-unlicense',
        ...(tr ? { nameEs: tr.nameEs, instructionsEs: tr.instructionsEs, translatedAt: new Date().toISOString() } : {}),
        ...(prev.translatedAt && !tr ? {} : {}),
        updatedAt: new Date().toISOString(),
      };
      await db.collection('exerciseLibrary').doc(e.id).set(doc, { merge: true });
      done += 1;
      if (done % 25 === 0) console.log(`progreso: ${done}/${work.length}`);
    } catch (err) {
      console.warn('fallo en', e.id, ':', err.message);
    }
  }
}
console.log(`HECHO: ${done}/${work.length} procesados. Relanza para completar pendientes si quedan.`);
process.exit(0);
