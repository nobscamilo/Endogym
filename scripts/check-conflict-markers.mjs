import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const markerPattern = /^(<<<<<<< .+|=======|>>>>>>> .+)$/m;
const trackedFiles = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const conflicts = [];

for (const file of trackedFiles) {
  // `--others` incluye rutas no rastreadas; un enlace simbólico a directorio (p. ej. dentro de un
  // subproyecto como sites/) hacía fallar el script con EISDIR. Solo interesan ficheros.
  let contents;
  try {
    contents = readFileSync(file);
  } catch (error) {
    if (error?.code === 'EISDIR' || error?.code === 'ENOENT') continue;
    throw error;
  }
  if (contents.includes(0)) continue;

  const text = contents.toString('utf8');
  if (markerPattern.test(text)) {
    conflicts.push(file);
  }
}

if (conflicts.length) {
  console.error('Se encontraron marcadores de conflicto Git sin resolver:');
  conflicts.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log(`Sin marcadores de conflicto Git en ${trackedFiles.length} archivos versionados o pendientes de añadir.`);
