import { getAdminServices } from './firebaseAdmin.js';

export class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export async function getAuthenticatedUser(request) {
  if (process.env.AUTH_DISABLED === 'true') {
    if (process.env.NODE_ENV !== 'development') {
      throw new AuthenticationError('Autenticación no disponible en este entorno.');
    }

    return {
      uid: 'dev-user',
      email: 'dev@endogym.local',
      dev: true,
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    throw new AuthenticationError('No se encontró token de autenticación.');
  }

  const { auth } = getAdminServices();
  try {
    return await auth.verifyIdToken(token);
  } catch {
    throw new AuthenticationError('Token de autenticación inválido o expirado.');
  }
}
