/**
 * Genera embeddings semánticos del corpus de directrices y los sube a la colección
 * Firestore `guideline_passages` para búsqueda vectorial (findNearest).
 *
 * Pipeline:
 *   1. Lee los JSON ya parseados en docs/guidelines-json/.
 *   2. Sub-chunkea cada documento en pasajes de ~800 tokens (~3200 chars) con solape.
 *   3. Embebe cada pasaje con gemini-embedding-001 (768 dims, L2-normalizado).
 *   4. Sube a `guideline_passages` con el vector como FieldValue.vector().
 *
 * Resumable e idempotente: al inicio carga los IDs ya presentes en Firestore y los omite.
 * Diseñado para correr en background (nohup) porque procesa miles de pasajes.
 *
 * Uso:  node --env-file=.env.local scripts/embed_guidelines.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminServices } from '../src/lib/firebaseAdmin.js';
import { requestGoogleEmbeddings, EMBEDDING_DIMENSIONS } from '../src/services/googleGenAiTransport.js';
import { FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceDir = path.dirname(__dirname);
const jsonDir = path.join(workspaceDir, 'docs', 'guidelines-json');

const COLLECTION = 'guideline_passages';
const CHARS_PER_PASSAGE = 3200; // ~800 tokens
const OVERLAP_CHARS = 320; // ~80 tokens de solape
const BATCH_SIZE = 100; // pasajes por llamada batchEmbedContents (menos peticiones = menos 429)
const MIN_PASSAGE_CHARS = 200; // descartar fragmentos triviales

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

/** Concatena páginas registrando el offset de inicio de cada página para mapear rangos. */
function buildText(doc) {
  const pages = doc.pages || [];
  let text = '';
  const pageOffsets = []; // { pageNumber, start }
  for (const p of pages) {
    const t = (p && p.text) ? String(p.text) : '';
    pageOffsets.push({ pageNumber: p.pageNumber ?? null, start: text.length });
    text += t + '\n';
  }
  return { text, pageOffsets };
}

function pageAt(pageOffsets, offset) {
  let pageNumber = pageOffsets.length ? pageOffsets[0].pageNumber : null;
  for (const po of pageOffsets) {
    if (po.start <= offset) pageNumber = po.pageNumber;
    else break;
  }
  return pageNumber;
}

/** Trocea un documento en pasajes con solape. */
function chunkDoc(doc, relativePath) {
  const parentId = doc.id || slugify(relativePath);
  const fileName = doc.source?.fileName || relativePath;
  const originalFileName = doc.source?.originalFileName || fileName;
  const { text, pageOffsets } = buildText(doc);
  const clean = text.replace(/\s+\n/g, '\n');
  const passages = [];
  let idx = 0;
  for (let start = 0; start < clean.length; start += (CHARS_PER_PASSAGE - OVERLAP_CHARS)) {
    const end = Math.min(start + CHARS_PER_PASSAGE, clean.length);
    const slice = clean.slice(start, end).trim();
    if (slice.length >= MIN_PASSAGE_CHARS) {
      passages.push({
        id: `${parentId}__p${idx}`,
        parentId,
        fileName,
        originalFileName,
        pageStart: pageAt(pageOffsets, start),
        pageEnd: pageAt(pageOffsets, end),
        text: slice,
      });
      idx += 1;
    }
    if (end >= clean.length) break;
  }
  return passages;
}

function collectAllPassages() {
  const all = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(prefix, entry.name);
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.name.toLowerCase().endsWith('.json')) {
        try {
          const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
          all.push(...chunkDoc(doc, rel));
        } catch (e) {
          console.error(`✖ No se pudo leer ${rel}: ${e.message}`);
        }
      }
    }
  }
  walk(jsonDir);
  return all;
}

async function loadExistingIds(db) {
  const ids = new Set();
  const snap = await db.collection(COLLECTION).select().get();
  snap.docs.forEach((d) => ids.add(d.id));
  return ids;
}

async function main() {
  console.log('Sub-chunkeando corpus...');
  const passages = collectAllPassages();
  console.log(`Pasajes totales generados: ${passages.length}`);

  const { db } = await getAdminServices();
  const existing = await loadExistingIds(db);
  console.log(`Ya presentes en Firestore: ${existing.size}`);

  const pending = passages.filter((p) => !existing.has(p.id));
  console.log(`Pendientes de embeber: ${pending.length}`);
  if (pending.length === 0) {
    console.log('Nada que hacer. Corpus completamente embebido.');
    process.exit(0);
  }

  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    let vectors;
    try {
      vectors = await requestGoogleEmbeddings({
        texts: batch.map((p) => p.text),
        taskType: 'RETRIEVAL_DOCUMENT',
        timeoutMs: 60000,
      });
    } catch (e) {
      console.error(`✖ Falló batch en offset ${i}: ${e.message}. Reintentando en 5s...`);
      await new Promise((r) => setTimeout(r, 5000));
      i -= BATCH_SIZE; // reintentar el mismo batch
      continue;
    }

    if (vectors.length !== batch.length) {
      console.error(`⚠️ Batch ${i}: recibidos ${vectors.length} vectores para ${batch.length} textos. Omitido.`);
      continue;
    }

    const writer = db.batch();
    batch.forEach((p, j) => {
      const v = vectors[j];
      if (!v || v.length !== EMBEDDING_DIMENSIONS) return;
      const ref = db.collection(COLLECTION).doc(p.id);
      writer.set(ref, {
        parentId: p.parentId,
        fileName: p.fileName,
        originalFileName: p.originalFileName,
        pageStart: p.pageStart,
        pageEnd: p.pageEnd,
        text: p.text,
        embedding: FieldValue.vector(v),
      });
    });
    await writer.commit();
    done += batch.length;
    console.log(`Progreso: ${done}/${pending.length} (${Math.round((done / pending.length) * 100)}%)`);
    await new Promise((r) => setTimeout(r, 200)); // suavizar rate limit
  }

  console.log(`\nListo. Embebidos ${done} pasajes nuevos en '${COLLECTION}'.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
