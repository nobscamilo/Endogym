let appPromise = null;
let servicesPromise = null;

function getPrivateKey() {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) return undefined;
  return key.replace(/\\n/g, '\n');
}

async function getFirebaseApp() {
  if (appPromise) return appPromise;

  appPromise = (async () => {
    const { cert, getApps, initializeApp } = await import('firebase-admin/app');

    if (getApps().length) {
      return getApps()[0];
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = getPrivateKey();

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase Admin no está configurado. Revisa FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.');
    }

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  })();

  return appPromise;
}

export async function getAdminServices() {
  if (servicesPromise) return servicesPromise;

  servicesPromise = (async () => {
    const [app, authModule, firestoreModule, storageModule] = await Promise.all([
      getFirebaseApp(),
      import('firebase-admin/auth'),
      import('firebase-admin/firestore'),
      import('firebase-admin/storage'),
    ]);

    return {
      auth: authModule.getAuth(app),
      db: firestoreModule.getFirestore(app),
      storage: storageModule.getStorage(app),
    };
  })();

  return servicesPromise;
}
