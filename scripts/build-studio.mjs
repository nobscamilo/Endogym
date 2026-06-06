/**
 * Compila el bundle de Ignios Studio a un único JS de producción.
 *
 * Toma el MISMO código JSX del prototipo (public/studio/app/studio/*) y lo empaqueta
 * con esbuild + React de producción + Firebase (modular), eliminando:
 *   - Babel-in-browser (y por tanto la necesidad de 'unsafe-eval' en la CSP)
 *   - React en versión development desde CDN (unpkg)
 *   - Firebase desde CDN (gstatic)
 *
 * Salida: public/studio/app/studio.bundle.js  (lo carga index.html con un solo <script>).
 * Se ejecuta en `prebuild` para que `npm run build` siempre regenere el bundle.
 *
 * Uso: node scripts/build-studio.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// esbuild es una herramienta SOLO de mantenedor para regenerar el bundle. NO es una
// dependencia del proyecto (el bundle compilado, public/studio/app/studio.bundle.js, se
// commitea como artefacto). Se carga de forma dinámica para dar un mensaje claro si falta
// o si es de otra plataforma (node_modules es compartido entre macOS y el sandbox Linux).
let esbuild;
try {
  esbuild = await import('esbuild');
} catch (err) {
  console.error('\n[build-studio] esbuild no está disponible para esta plataforma.');
  console.error('Este script es solo para regenerar el bundle (mantenedor). El bundle ya está');
  console.error('compilado y commiteado en public/studio/app/studio.bundle.js, así que la app');
  console.error('NO necesita esbuild para `npm install` ni `npm run build`.');
  console.error('Si necesitas regenerarlo en tu plataforma: `npm i -D esbuild` (no lo dejes en');
  console.error('el lockfile compartido) y vuelve a ejecutar este script.\n');
  console.error('Detalle:', err && err.message ? err.message : err);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(__dirname);
const studioDir = path.join(repoRoot, 'public', 'studio', 'app', 'studio');
const outFile = path.join(repoRoot, 'public', 'studio', 'app', 'studio.bundle.js');

// Orden idéntico al de los <script> del prototipo (importa por las refs const cross-file).
const FILES = [
  'data.js',
  'icons.jsx',
  'ui.jsx',
  'coach.jsx',
  'tweaks-panel.jsx',
  'screen-today.jsx',
  'screen-train.jsx',
  'screen-nutrition.jsx',
  'screen-more.jsx',
  'app.jsx',
];

const PREAMBLE = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// --- Integración con el backend (sustituye al shim inline del index.html) ---
let __auth = null;
const __firebaseReady = fetch('/api/public-config')
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => {
    if (!cfg || !cfg.apiKey) return;
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    __auth = getAuth(app);
    return new Promise((res) => {
      let done = false;
      const unsub = onAuthStateChanged(__auth, () => { if (!done) { done = true; res(); if (unsub) unsub(); } });
      setTimeout(() => { if (!done) { done = true; res(); } }, 1500);
    });
  })
  .catch(() => {});

async function __getIdToken() {
  try { return __auth && __auth.currentUser ? await __auth.currentUser.getIdToken() : null; } catch (e) { return null; }
}
window.__getIdToken = __getIdToken;

window.claude = {
  complete: async function (prompt) {
    let token = null;
    try { token = await __getIdToken(); } catch (e) { token = null; }
    const headers = { 'content-type': 'application/json' };
    if (token) headers['authorization'] = 'Bearer ' + token;
    const res = await fetch('/api/coach-chat', { method: 'POST', headers, body: JSON.stringify({ prompt }) });
    if (!res.ok) throw new Error('coach-chat HTTP ' + res.status);
    const data = await res.json();
    return data && typeof data.text === 'string' ? data.text : '';
  },
};

function __applyOverrides(base, ov) {
  if (!base || !ov) return;
  Object.keys(ov).forEach(function (k) {
    const v = ov[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      Object.assign(base[k], v);
    } else if (k !== 'todaySessionTitle') {
      base[k] = v;
    }
  });
  if (ov.todaySessionTitle && base.todaySession) base.todaySession.title = ov.todaySessionTitle;
}

async function __mergeRealData() {
  try {
    await __firebaseReady;
    let token = null;
    try { token = await __getIdToken(); } catch (e) { token = null; }
    const headers = {};
    if (token) headers['authorization'] = 'Bearer ' + token;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch('/api/studio-data', { headers, signal: ctrl.signal });
    clearTimeout(to);
    if (r.ok) {
      const j = await r.json();
      if (j && j.ok && j.overrides && window.STUDIO) __applyOverrides(window.STUDIO, j.overrides);
    }
  } catch (e) { /* datos de muestra */ }
}
`;

const POSTAMBLE = `
(async function __boot() {
  try { await __mergeRealData(); } catch (e) {}
  createRoot(document.getElementById('root')).render(React.createElement(App));
})();
`;

function readStudioFile(name) {
  let code = fs.readFileSync(path.join(studioDir, name), 'utf8');
  if (name === 'app.jsx') {
    // El render lo hace el POSTAMBLE (tras fusionar datos reales).
    code = code.replace(/ReactDOM\.createRoot\([^;]*\);?/s, '');
  }
  return `\n/* ===== ${name} ===== */\n${code}\n`;
}

const combined = PREAMBLE + FILES.map(readStudioFile).join('\n') + POSTAMBLE;

await esbuild.build({
  stdin: { contents: combined, resolveDir: repoRoot, loader: 'jsx', sourcefile: 'studio.entry.jsx' },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: outFile,
});

const kb = Math.round(fs.statSync(outFile).size / 1024);
console.log(`✔ studio.bundle.js generado (${kb} KB)`);
