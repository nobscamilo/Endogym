import { getAdminServices } from './firebaseAdmin.js';

export async function getAuthenticatedUser(request) {
  if (process.env.AUTH_DISABLED === 'true') {
    return {
      uid: request.headers.get('x-dev-user-id') || 'dev-user',
      email: 'dev@endogym.local',
      dev: true,
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    throw new Error('No se encontró token de autenticación.');
  }

  const { auth } = getAdminServices();
  return auth.verifyIdToken(token);
}
