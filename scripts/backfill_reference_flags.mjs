/**
 * BACKFILL: etiqueta cada pasaje de `guideline_passages` con `isReference` (¿es una lista de
 * referencias/bibliografía?) y `refScore` (densidad de señales de cita), usando el MISMO
 * detector que la ingesta y el retriever (referenceScore en guidelinesRetriever.js).
 *
 * Solución de fondo (12 jul 2026): la ingesta original no separó las secciones de referencias
 * (~23% de los pasajes). Con el flag en los DATOS, el retriever excluye bibliografía sin
 * heurística por request, y el etiquetado queda auditable en Firestore.
 *
 * Idempotente y resumable: por defecto solo procesa pasajes SIN flag; --force re-etiqueta todo
 * (necesario si se recalibra el detector). No toca `embedding` ni `text` (merge parcial).
 *
 * Uso:  node --env-file=.env.local scripts/backfill_reference_flags.mjs [--force] [--dry-run]
 */
import { getAdminServices } from '../src/lib/firebaseAdmin.js';
import { referenceScore, isBibliographyPassage } from '../src/services/guidelinesRetriever.js';

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const COLLECTION = 'guideline_passages';
const PAGE_SIZE = 400; // lecturas por página
const WRITE_BATCH = 400; // updates por batch (límite Firestore: 500 ops)

const { db } = await getAdminServices();

let processed = 0;
let flagged = 0;
let skipped = 0;
let lastDoc = null;
const flaggedByFile = new Map();

for (;;) {
  let q = db.collection(COLLECTION).select('text', 'fileName', 'isReference').orderBy('__name__').limit(PAGE_SIZE);
  if (lastDoc) q = q.startAfter(lastDoc);
  const snap = await q.get();
  if (snap.empty) break;
  lastDoc = snap.docs[snap.docs.length - 1];

  const updates = [];
  for (const d of snap.docs) {
    const p = d.data();
    if (!FORCE && typeof p.isReference === 'boolean') { skipped += 1; continue; }
    const isRef = isBibliographyPassage(p.text);
    const score = Math.round(referenceScore(p.text) * 10) / 10;
    updates.push({ ref: d.ref, isRef, score });
    if (isRef) {
      flagged += 1;
      flaggedByFile.set(p.fileName, (flaggedByFile.get(p.fileName) || 0) + 1);
    }
  }

  if (!DRY_RUN) {
    for (let i = 0; i < updates.length; i += WRITE_BATCH) {
      const writer = db.batch();
      updates.slice(i, i + WRITE_BATCH).forEach((u) => {
        writer.update(u.ref, { isReference: u.isRef, refScore: u.score });
      });
      await writer.commit();
    }
  }
  processed += updates.length;
  console.log(`Progreso: ${processed} etiquetados · ${skipped} ya tenían flag · ${flagged} marcados como bibliografía`);
}

console.log(`\n=== RESUMEN ${DRY_RUN ? '(DRY RUN, sin escrituras)' : ''} ===`);
console.log(`Etiquetados: ${processed} · Omitidos (ya con flag): ${skipped} · Bibliografía: ${flagged} (${processed ? Math.round((flagged / processed) * 100) : 0}%)`);
console.log('\nTop documentos con más bibliografía:');
[...flaggedByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([f, n]) => console.log(`  ${n}\t${f}`));
process.exit(0);
