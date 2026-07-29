// Relectura de actividades de Strava ya importadas, para rellenar los campos que antes se
// tiraban: esfuerzo (RPE reportado o estimado por FC), carga (Relative Effort), desnivel y
// tipo de sesión.
//
// Por qué hace falta: el sync normal solo trae actividades NUEVAS (desde `lastSyncEpoch`),
// así que las ya importadas se quedaron sin esos campos aunque el código ya los guarde.
//
// SEGURIDAD: por defecto SIMULA (--dry-run implícito). Solo escribe con --apply. La escritura
// es un merge sobre el documento existente: no se toca nada que no esté en la lista de campos
// de abajo, así que un check-in manual con RPE reportado NO se pisa.
//
// Uso:
//   node --env-file=.env.local scripts/strava_backfill.mjs <uid>            (simula)
//   node --env-file=.env.local scripts/strava_backfill.mjs <uid> --apply    (escribe)
//   ... --days=365   ventana a releer (por defecto 180)

import { getAdminServices } from '../src/lib/firebaseAdmin.js';
import { getStravaConnection, getUserProfile } from '../src/lib/repositories/firestoreRepository.js';
import { ensureFreshToken, getActivities, mapActivityToWorkout } from '../src/services/stravaClient.js';
import { resolveHrMax } from '../src/core/running.js';

const uid = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const apply = process.argv.includes('--apply');
const days = Number((process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1]) || 180;

if (!uid) {
  console.error('Falta el uid.  node --env-file=.env.local scripts/strava_backfill.mjs <uid> [--apply] [--days=180]');
  process.exit(1);
}

// SOLO estos campos se escriben. Deliberadamente NO incluye `sessionRpe`: si la persona
// reportó su esfuerzo (check-in o RPE puesto en Strava), ese dato manda y no se sobrescribe.
const CAMPOS = ['relativeEffort', 'elevationGainM', 'sessionRpeEstimated', 'rpeSource', 'stravaWorkoutType', 'avgPaceSecPerKm'];

const conn = await getStravaConnection(uid);
if (!conn?.refreshToken) {
  console.error('Ese usuario no tiene Strava conectado.');
  process.exit(1);
}

const profile = await getUserProfile(uid);
const hr = resolveHrMax({ profile: profile || {} });
console.log(`FCmáx usada para estimar esfuerzo: ${hr?.hrMax ?? '—'} (${hr?.source ?? 'sin dato'})`);
if (!hr?.hrMax) console.log('AVISO: sin FCmáx no se puede estimar el esfuerzo; solo se rellenarán carga y desnivel.');

const { accessToken } = await ensureFreshToken(conn);
const afterEpoch = Math.floor((Date.now() - days * 864e5) / 1000);

// Paginación: la API devuelve como mucho `per_page` por página.
const actividades = [];
for (let page = 1; page <= 10; page += 1) {
  const lote = await getActivities(accessToken, { afterEpoch, perPage: 100, page });
  if (!Array.isArray(lote) || !lote.length) break;
  actividades.push(...lote);
  if (lote.length < 100) break;
}
console.log(`Actividades leídas de Strava (${days} días): ${actividades.length}`);

const { db } = await getAdminServices();
const col = db.collection('users').doc(uid).collection('workouts');

let existen = 0;
let cambian = 0;
let sinCambios = 0;
let noImportadas = 0;
const muestra = [];

for (const a of actividades) {
  const ref = col.doc(`strava-${a.id}`);
  const snap = await ref.get();
  if (!snap.exists) { noImportadas += 1; continue; }
  existen += 1;

  const actual = snap.data();
  const nuevo = mapActivityToWorkout(a, { hrMax: hr?.hrMax ?? null });

  const patch = {};
  for (const campo of CAMPOS) {
    const valorNuevo = nuevo[campo] ?? null;
    if (valorNuevo == null) continue;                 // no se borra nada que ya hubiera
    if ((actual[campo] ?? null) === valorNuevo) continue;
    patch[campo] = valorNuevo;
  }

  if (!Object.keys(patch).length) { sinCambios += 1; continue; }
  cambian += 1;
  if (muestra.length < 8) {
    muestra.push({ fecha: String(nuevo.performedAt).slice(0, 10), titulo: nuevo.title.slice(0, 26), patch });
  }
  if (apply) await ref.set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

console.log('');
console.log(`ya importadas en la app : ${existen}`);
console.log(`  cambiarían           : ${cambian}`);
console.log(`  ya estaban al día    : ${sinCambios}`);
console.log(`en Strava pero no importadas (las trae un sync normal): ${noImportadas}`);
console.log('');
console.log('MUESTRA de lo que se escribiría:');
for (const m of muestra) console.log('  ', m.fecha, m.titulo.padEnd(28), JSON.stringify(m.patch));

console.log('');
console.log(apply
  ? `ESCRITO: ${cambian} entrenos actualizados.`
  : 'SIMULACIÓN: no se ha escrito nada. Añade --apply para aplicarlo.');
process.exit(0);
