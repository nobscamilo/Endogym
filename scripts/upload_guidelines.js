import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminServices } from '../src/lib/firebaseAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceDir = path.dirname(__dirname);

const guidelinesJsonDir = path.join(workspaceDir, 'docs', 'guidelines-json');

async function uploadFileToFirestore(db, filePath, relativePath) {
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const docData = JSON.parse(rawData);

    if (!docData.id) {
      console.warn(`⚠️ Omitido: El archivo ${relativePath} no tiene un campo 'id'.`);
      return false;
    }

    // Agregar la ruta relativa en el origen para facilitar depuración/visualización
    docData.source.relativePath = relativePath;
    
    // Subir a la colección 'guidelines' en Firestore
    const docRef = db.collection('guidelines').doc(docData.id);
    await docRef.set(docData);
    
    console.log(`✔ Subido a Firestore: ${relativePath} -> ID: ${docData.id}`);
    return true;
  } catch (error) {
    console.error(`✖ Error subiendo ${relativePath}:`, error.message);
    return false;
  }
}

async function walkAndUpload(db, currentDir, relativePrefix = '') {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const relPath = path.join(relativePrefix, entry.name);
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      count += await walkAndUpload(db, fullPath, relPath);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      const success = await uploadFileToFirestore(db, fullPath, relPath);
      if (success) count++;
    }
  }

  return count;
}

async function main() {
  console.log('Iniciando carga de libros parseados a Firestore...');
  
  if (!fs.existsSync(guidelinesJsonDir)) {
    console.error(`Error: El directorio de JSONs no existe en ${guidelinesJsonDir}`);
    process.exit(1);
  }

  try {
    const { db } = await getAdminServices();
    console.log('Conexión con Firebase Admin SDK establecida correctamente.');

    const totalUploaded = await walkAndUpload(db, guidelinesJsonDir);
    console.log(`\nCarga completada con éxito. Se subieron ${totalUploaded} capítulos/libros a la colección 'guidelines' de Firestore.`);
    process.exit(0);
  } catch (error) {
    console.error('Fatal: Falló la inicialización de Firebase Admin SDK:', error.message);
    process.exit(1);
  }
}

main();
