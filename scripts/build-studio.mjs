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
import { createPortal } from 'react-dom';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';

// --- Integración con el backend (sustituye al shim inline del index.html) ---
let __auth = null;
let __parentToken = null;
let __parentTokenWaiters = [];
window.__createPortal = createPortal;

function __resolveParentToken(token) {
  if (!token || typeof token !== 'string') return;
  __parentToken = token;
  const waiters = __parentTokenWaiters.splice(0);
  waiters.forEach(function (w) {
    clearTimeout(w.timer);
    w.resolve(token);
  });
}

function __requestParentToken() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'IGNIOS_TOKEN_REQUEST' }, window.location.origin);
    }
  } catch (e) { /* noop */ }
}

function __waitForParentToken(timeoutMs) {
  if (__parentToken) return Promise.resolve(__parentToken);
  return new Promise(function (resolve) {
    const waiter = { resolve: resolve, timer: null };
    waiter.timer = setTimeout(function () {
      __parentTokenWaiters = __parentTokenWaiters.filter(function (w) { return w !== waiter; });
      resolve(null);
    }, timeoutMs);
    __parentTokenWaiters.push(waiter);
  });
}

window.addEventListener('message', function (event) {
  if (event.origin !== window.location.origin) return;
  const data = event.data || {};
  if (data.type === 'IGNIOS_AUTH_TOKEN') __resolveParentToken(data.token);
});
__requestParentToken();

const __firebaseReady = fetch('/api/public-config')
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => {
    if (!cfg || !cfg.apiKey) return;
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    __auth = getAuth(app);
    return new Promise((res) => {
      let done = false;
      const unsub = onAuthStateChanged(__auth, () => { if (!done) { done = true; res(); if (unsub) unsub(); } });
      setTimeout(() => { if (!done) { done = true; res(); } }, 4000);
    });
  })
  .catch(() => {});

async function __getIdToken(options) {
  const forceRefresh = Boolean(options && options.forceRefresh);
  try {
    if (__auth && __auth.currentUser) {
      const firebaseToken = await __auth.currentUser.getIdToken(forceRefresh);
      if (firebaseToken) return firebaseToken;
    }
  } catch (e) { /* cae al token del padre */ }
  if (__parentToken) return __parentToken;
  __requestParentToken();
  return await __waitForParentToken(1200);
}
window.__getIdToken = __getIdToken;
window.__signOut = async function () {
  try { if (__auth) await signOut(__auth); } catch (e) { /* noop */ }
  window.location.href = '/';
};

window.claude = {
  // FASE 0.1: se envía SOLO el mensaje del usuario; la persona del coach vive en el servidor.
  complete: async function (message) {
    let token = null;
    try { token = await __getIdToken(); } catch (e) { token = null; }
    const headers = { 'content-type': 'application/json' };
    if (token) headers['authorization'] = 'Bearer ' + token;
    const res = await fetch('/api/coach-chat', { method: 'POST', headers, body: JSON.stringify({ message }) });
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

async function __fetchStudioData(token) {
  const headers = {};
  if (token) headers['authorization'] = 'Bearer ' + token;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch('/api/studio-data', { headers, signal: ctrl.signal });
    clearTimeout(to);
    return r;
  } catch (e) { clearTimeout(to); return null; }
}

async function __mergeRealData() {
  try {
    await __firebaseReady;
    let token = null;
    try { token = await __getIdToken(); } catch (e) { token = null; }
    // La sesión puede estar restaurándose: si aún no hay token, espera un poco y reintenta.
    if (!token) {
      await new Promise((r) => setTimeout(r, 1200));
      try { token = await __getIdToken(); } catch (e) { token = null; }
    }
    let r = await __fetchStudioData(token);
    if (r && r.status === 401) {
      try { token = await __getIdToken({ forceRefresh: true }); } catch (e) { token = null; }
      if (token) r = await __fetchStudioData(token);
    }
    if (!r || !r.ok) {
      await new Promise((res) => setTimeout(res, 800));
      try { token = await __getIdToken({ forceRefresh: r && r.status === 401 }); } catch (e) { /* mantiene token previo */ }
      r = await __fetchStudioData(token);
    }
    if (r && r.ok) {
      const j = await r.json();
      if (j && j.ok && j.overrides && window.STUDIO) __applyOverrides(window.STUDIO, j.overrides);
    }
  } catch (e) { /* datos de muestra (identidad neutra) */ }
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

// Cache-busting: versiona la referencia al bundle en index.html con un hash de su contenido,
// para que el navegador/CDN nunca sirva un bundle viejo tras un deploy.
const crypto = await import('node:crypto');
const buf = fs.readFileSync(outFile);
const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 10);
const idxPath = path.join(repoRoot, 'public', 'studio', 'app', 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
html = html.replace(/studio\.bundle\.js(\?v=[a-f0-9]+)?/g, `studio.bundle.js?v=${hash}`);
fs.writeFileSync(idxPath, html);

const kb = Math.round(fs.statSync(outFile).size / 1024);
console.log(`✔ studio.bundle.js generado (${kb} KB) · v=${hash}`);
