'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirebaseClient, isFirebaseClientConfigured } from '../lib/firebaseClient.js';

const CONSENT_VERSION = '2026-04-02';

// Traduce los códigos de error de Firebase Auth a mensajes claros en español.
function friendlyAuthError(error) {
  const code = (error && (error.code || '')) || '';
  const map = {
    'auth/invalid-credential': 'Email o contraseña incorrectos, o la cuenta no existe.',
    'auth/wrong-password': 'Email o contraseña incorrectos.',
    'auth/user-not-found': 'No existe ninguna cuenta con ese email. Cambia a Registro para crearla.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Inicia sesión.',
    'auth/invalid-email': 'El email no tiene un formato válido.',
    'auth/weak-password': 'La contraseña debe tener al menos 8 caracteres.',
    'auth/missing-password': 'Escribe tu contraseña.',
    'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
    'auth/cancelled-popup-request': 'Se canceló el acceso con Google. Inténtalo de nuevo.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes.',
    'auth/account-exists-with-different-credential': 'Ya existe una cuenta con ese email usando otro método de acceso (prueba con email y contraseña).',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication.',
    'auth/operation-not-allowed': 'Ese método de acceso no está habilitado en Firebase.',
    'auth/network-request-failed': 'Problema de red. Revisa tu conexión e inténtalo otra vez.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  };
  return map[code] || (error && error.message) || 'No se pudo completar la operación.';
}

export default function HomePage() {
  const firebaseClient = useMemo(() => getFirebaseClient(), []);
  const studioFrameRef = useRef(null);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [studioToken, setStudioToken] = useState(null);
  const [signedOutRequested, setSignedOutRequested] = useState(false);

  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentData, setConsentData] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);

  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const authConfigured = isFirebaseClientConfigured();

  useEffect(() => {
    if (!firebaseClient?.auth) {
      setAuthReady(true);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(firebaseClient.auth, (nextUser) => {
      setAuthUser(nextUser);
      setAuthReady(true);
    });

    return unsubscribe;
  }, [firebaseClient]);

  useEffect(() => {
    let active = true;
    let refreshTimer = null;

    async function refreshStudioToken(forceRefresh = false) {
      if (!authUser) {
        if (active) setStudioToken(null);
        return;
      }
      try {
        const token = await authUser.getIdToken(forceRefresh);
        if (active) setStudioToken(token || null);
      } catch {
        if (active) setStudioToken(null);
      }
    }

    refreshStudioToken(false);
    if (authUser) {
      refreshTimer = window.setInterval(() => refreshStudioToken(true), 45 * 60 * 1000);
    }

    return () => {
      active = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, [authUser]);

  const postStudioToken = useCallback(async (targetWindow) => {
    if (typeof window === 'undefined') return;
    let token = studioToken;
    if (!token && authUser) {
      try {
        token = await authUser.getIdToken();
        if (token) setStudioToken(token);
      } catch {
        token = null;
      }
    }
    if (!token) return;
    const frameWindow = targetWindow || studioFrameRef.current?.contentWindow;
    if (!frameWindow) return;
    try {
      frameWindow.postMessage({ type: 'IGNIOS_AUTH_TOKEN', token }, window.location.origin);
    } catch {
      // El iframe puede haberse desmontado durante el refresh del token.
    }
  }, [authUser, studioToken]);

  useEffect(() => {
    postStudioToken();
  }, [postStudioToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function handleStudioMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'IGNIOS_TOKEN_REQUEST') {
        postStudioToken(event.source);
      }
    }
    window.addEventListener('message', handleStudioMessage);
    return () => window.removeEventListener('message', handleStudioMessage);
  }, [postStudioToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('signedOut') === '1') {
      setSignedOutRequested(true);
    }
  }, []);

  useEffect(() => {
    if (!signedOutRequested || !authReady || !firebaseClient?.auth) return;
    signOut(firebaseClient.auth).finally(() => {
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
      setSignedOutRequested(false);
    });
  }, [signedOutRequested, authReady, firebaseClient]);


  async function upsertInitialProfile(user) {
    const token = await user.getIdToken();
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        legalConsents: {
          termsAccepted: true,
          privacyAccepted: true,
          dataProcessingAccepted: true,
          marketingAccepted: consentMarketing,
          consentVersion: CONSENT_VERSION,
          acceptedAt: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      let detail = 'No se pudo guardar el consentimiento legal.';
      try {
        const payload = await response.json();
        detail = payload.error || detail;
      } catch {
        // ignore non-json error payloads
      }
      throw new Error(detail);
    }
  }

  async function submitAuth(event) {
    if (event) event.preventDefault();

    if (!authConfigured || !firebaseClient?.auth) {
      setStatus('Firebase Auth no está configurado para esta app.');
      return;
    }

    if (loading) return;
    setLoading(true);
    setStatus(mode === 'login' ? 'Iniciando sesión...' : 'Creando cuenta...');

    try {
      if (mode === 'register') {
        if (password !== confirmPassword) {
          throw new Error('Las contraseñas no coinciden.');
        }
        if (!consentTerms || !consentPrivacy || !consentData) {
          throw new Error('Debes aceptar términos, privacidad y tratamiento de datos para continuar.');
        }

        const credentials = await createUserWithEmailAndPassword(firebaseClient.auth, email, password);
        await upsertInitialProfile(credentials.user);
      } else {
        await signInWithEmailAndPassword(firebaseClient.auth, email, password);
      }

      setStatus('Autenticación correcta. Abriendo tu Studio...');
      // Sin redirección: al detectar sesión, esta misma página renderiza el Studio en "/".
    } catch (error) {
      setStatus(`Error: ${friendlyAuthError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitGoogleAuth() {
    if (!authConfigured || !firebaseClient?.auth) {
      setStatus('Firebase Auth no está configurado para esta app.');
      return;
    }

    if (loading) return;
    if (mode === 'register' && (!consentTerms || !consentPrivacy || !consentData)) {
      setStatus('Para registrarte con Google debes aceptar términos, privacidad y tratamiento de datos.');
      return;
    }

    setLoading(true);
    setStatus('Conectando con Google...');

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credentials = await signInWithPopup(firebaseClient.auth, provider);
      const additionalInfo = getAdditionalUserInfo(credentials);

      // Primer acceso con Google = se crea la cuenta automáticamente (también desde "Iniciar
      // sesión"). Al crearla se registran los consentimientos legales (versión vigente).
      if (additionalInfo?.isNewUser || mode === 'register') {
        await upsertInitialProfile(credentials.user);
      }

      setStatus('Autenticación con Google correcta. Abriendo tu Studio...');
      // Sin redirección: al detectar sesión, esta misma página renderiza el Studio en "/".
    } catch (error) {
      setStatus(`Error: ${friendlyAuthError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordReset() {
    if (!authConfigured || !firebaseClient?.auth) {
      setStatus('Firebase Auth no está configurado para esta app.');
      return;
    }
    if (!email) {
      setStatus('Error: escribe tu email para solicitar el enlace de recuperación.');
      return;
    }
    if (loading) return;

    setLoading(true);
    setStatus('Solicitando enlace de recuperación...');
    try {
      await sendPasswordResetEmail(firebaseClient.auth, email);
      setStatus('Te hemos enviado un enlace de recuperación si la cuenta existe.');
    } catch (error) {
      setStatus(`Error: ${friendlyAuthError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  // App oficial en la raíz "/": si hay sesión activa, esta página ES el Studio (iframe aislado).
  // Si no hay sesión (o se acaba de cerrar), se muestra el landing + login de abajo.
  const showApp = authReady && !signedOutRequested && (authUser || !authConfigured);
  if (showApp) {
    return (
      <iframe
        ref={studioFrameRef}
        src="/studio/app/index.html"
        title="Ignios"
        allow="camera; fullscreen"
        onLoad={() => postStudioToken()}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          margin: 0,
          padding: 0,
          background: '#1a1714',
          zIndex: 50,
        }}
      />
    );
  }

  return (
    <div className="landing-shell">
      {/* TopAppBar */}
      <header className="landing-header">
        <div className="landing-header-container">
          <Link href="/" className="landing-logo">
            Ignios
          </Link>
          <nav className="landing-nav">
            <a className="landing-nav-link active" href="#acceso">Acceso</a>
            <a className="landing-nav-link" href="#capacidades">Capacidades</a>
            <Link className="landing-nav-link" href="/legal/privacy">Privacidad</Link>
            <Link className="landing-nav-link" href="/legal/terms">Términos</Link>
          </nav>
          <div className="landing-header-actions">
            <Link className="landing-nav-link active" href="/legal/privacy">Protección de datos</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section with Login Card */}
        <section className="landing-hero-section">
          <div className="landing-hero-bg">
            <Image
              alt="Entrenamiento de fuerza en Ignios"
              src="/brand/canva/hero-canva-clean.png"
              fill
              priority
              sizes="100vw"
            />
            <div className="landing-hero-overlay"></div>
          </div>
          <div className="landing-hero-glow"></div>

          <div id="acceso" className="landing-hero-container">
            {/* Left Copy Panel */}
            <div className="landing-copy-block">
              <h1 className="landing-title">
                Tu plan de fuerza y nutrición, personalizado y con base científica
              </h1>
              <p className="landing-subtitle">
                Responde una breve encuesta y te creamos un bloque de 21 días y tus comidas, adaptados a tu objetivo, tu salud y tu material. Registra y el coach ajusta. Ignios es una herramienta educativa y no sustituye atención médica.
              </p>
              <div className="landing-athlete-banner">
                <span className="landing-athlete-text">Plan periodizado · Nutrición y glucemia · Check-in de sesión · Biometría · Coach IA con citas</span>
              </div>
            </div>

            {/* Right Login/Register Card */}
            <div className="flex justify-center lg:justify-end">
              <div className="landing-card-frosted">
                <div className="landing-card-header">
                  {mode === 'login' ? (
                    <>
                      <h2>Bienvenido de nuevo</h2>
                      <p>Ingresa tus credenciales para acceder</p>
                    </>
                  ) : (
                    <>
                      <h2>Crear tu Cuenta</h2>
                      <p>Únete a la precisión deportiva de Ignios</p>
                    </>
                  )}
                </div>

                {!authConfigured ? (
                  <div className="notice" style={{ marginBottom: '1.2rem', padding: '0.8rem', borderRadius: '12px', background: 'rgba(231, 76, 60, 0.15)', border: '1px solid #e74c3c', color: '#f8f9ff', fontSize: '0.8rem' }}>
                    <strong>Autenticación pendiente:</strong> Configura `NEXT_PUBLIC_FIREBASE_*` en variables de entorno.
                  </div>
                ) : null}

                <form className="landing-form" onSubmit={submitAuth}>
                  {/* Email + contraseña (ambos modos) */}
                  <div className="landing-field-group">
                    <label className="landing-label" htmlFor="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="landing-input"
                      placeholder="tu@email.com"
                    />
                  </div>

                  <div className="landing-field-group">
                    <div className="landing-label-row">
                      <label className="landing-label" htmlFor="password">Contraseña</label>
                      {mode === 'login' && (
                        <button type="button" className="landing-link-forgot" onClick={submitPasswordReset} disabled={loading}>
                          ¿Olvidaste tu contraseña?
                        </button>
                      )}
                    </div>
                    <input
                      id="password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="landing-input"
                      placeholder="••••••••"
                    />
                  </div>

                  {/* Registro: confirmar contraseña + consentimientos en una sola pantalla */}
                  {mode === 'register' && (
                    <>
                      <div className="landing-field-group">
                        <label className="landing-label" htmlFor="confirmPassword">Confirmar contraseña</label>
                        <input
                          id="confirmPassword"
                          type="password"
                          required
                          minLength={8}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="landing-input"
                          placeholder="••••••••"
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', background: 'rgba(255, 255, 255, 0.04)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>Para crear tu cuenta (con email o con Google) acepta:</p>
                        <label style={{ display: 'flex', gap: '0.6rem', color: '#f8f9ff', fontSize: '0.8rem', cursor: 'pointer', lineHeight: '1.4' }}>
                          <input
                            type="checkbox"
                            checked={consentTerms}
                            onChange={(e) => setConsentTerms(e.target.checked)}
                            style={{ marginTop: '2px' }}
                          />
                          <span>Acepto los <Link href="/legal/terms" target="_blank" style={{ color: '#a9c7ff', fontWeight: 'bold' }}>Términos y condiciones</Link>.</span>
                        </label>
                        <label style={{ display: 'flex', gap: '0.6rem', color: '#f8f9ff', fontSize: '0.8rem', cursor: 'pointer', lineHeight: '1.4' }}>
                          <input
                            type="checkbox"
                            checked={consentPrivacy}
                            onChange={(e) => setConsentPrivacy(e.target.checked)}
                            style={{ marginTop: '2px' }}
                          />
                          <span>Acepto la <Link href="/legal/privacy" target="_blank" style={{ color: '#a9c7ff', fontWeight: 'bold' }}>Política de privacidad</Link>.</span>
                        </label>
                        <label style={{ display: 'flex', gap: '0.6rem', color: '#f8f9ff', fontSize: '0.8rem', cursor: 'pointer', lineHeight: '1.4' }}>
                          <input
                            type="checkbox"
                            checked={consentData}
                            onChange={(e) => setConsentData(e.target.checked)}
                            style={{ marginTop: '2px' }}
                          />
                          <span>Consiento el tratamiento de datos de salud y actividad física para generar mi plan personalizado.</span>
                        </label>
                        <label style={{ display: 'flex', gap: '0.6rem', color: '#f8f9ff', fontSize: '0.8rem', cursor: 'pointer', lineHeight: '1.4' }}>
                          <input
                            type="checkbox"
                            checked={consentMarketing}
                            onChange={(e) => setConsentMarketing(e.target.checked)}
                            style={{ marginTop: '2px' }}
                          />
                          <span>Acepto comunicaciones informativas (opcional).</span>
                        </label>
                      </div>

                      <button
                        type="submit"
                        className="landing-btn-submit"
                        disabled={loading || !authConfigured}
                      >
                        {loading ? 'Creando...' : 'Crear cuenta'}
                      </button>
                    </>
                  )}

                  {/* Submission actions */}
                  {mode === 'login' && (
                    <button type="submit" className="landing-btn-submit" disabled={loading || !authConfigured}>
                      {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                    </button>
                  )}

                  {/* Google Authenticator */}
                  <button
                    type="button"
                    className="landing-btn-google"
                    onClick={submitGoogleAuth}
                    disabled={loading || !authConfigured}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>{mode === 'login' ? 'Entrar con Google' : 'Registrarme con Google'}</span>
                  </button>

                  {status && (
                    <p style={{ margin: '0.5rem 0 0 0', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: status.includes('Error') || status.includes('falló') ? '#e74c3c' : '#2ecc71' }}>
                      {status}
                    </p>
                  )}
                </form>

                <div className="landing-card-footer">
                  {mode === 'login' ? (
                    <p>
                      ¿Nuevo en Ignios?{' '}
                      <button type="button" onClick={() => setMode('register')}>
                        Crea una cuenta
                      </button>
                    </p>
                  ) : (
                    <p>
                      ¿Ya tienes cuenta?{' '}
                      <button type="button" onClick={() => setMode('login')}>
                        Inicia sesión
                      </button>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Product scope strip */}
        <section className="landing-partners-section">
          <div className="landing-partners-container">
            <p className="landing-partners-title">QUÉ INCLUYE ENDOGYM</p>
            <div className="landing-partners-grid">
              <div className="landing-partner-item">PLAN SEMANAL</div>
              <div className="landing-partner-item">NUTRICIÓN</div>
              <div className="landing-partner-item">CHECK-IN DIARIO</div>
              <div className="landing-partner-item">ATLAS MUSCULAR</div>
              <div className="landing-partner-item">PRIVACIDAD</div>
            </div>
          </div>
        </section>

        {/* Bento Grid Features Showcase */}
        <section id="capacidades" className="landing-features-section">
          <div className="landing-features-container">
            <div className="landing-section-header">
              <span className="landing-badge">CAPACIDADES DEL MVP</span>
              <h2 className="landing-section-title">Datos útiles para sostener el hábito</h2>
            </div>
            <div className="landing-bento-grid">
              {/* Feature 1 */}
              <div className="landing-bento-card">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">fitness_center</span>
                </div>
                <h3>Planificación adaptativa</h3>
                <p>
                  El próximo plan puede ajustar volumen e intensidad usando adherencia, fatiga, esfuerzo percibido y señales de seguridad registradas.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="landing-bento-card active">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">monitoring</span>
                </div>
                <h3>Registro nutricional educativo</h3>
                <p>
                  Guarda comidas manualmente o con asistencia de análisis de plato y consulta estimaciones nutricionales y glucémicas orientativas.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="landing-bento-card">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">groups</span>
                </div>
                <h3>Historial personal</h3>
                <p>
                  Conserva tus métricas, sesiones y preferencias en tu cuenta. Puedes exportar tus datos o solicitar su eliminación desde la app.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="landing-bento-card">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">psychology</span>
                </div>
                <h3>Coach IA con citas</h3>
                <p>
                  Te explica el porqué de tu prescripción y puede mostrar las fuentes de su biblioteca médica realmente recuperadas, sin inventar referencias.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="landing-bento-card">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">straighten</span>
                </div>
                <h3>Biometría y riesgo</h3>
                <p>
                  Registra tu perímetro abdominal y sigue tu índice cintura/altura, tu banda de riesgo cardiometabólico y, si quieres, una estimación de % grasa.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="landing-bento-card">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">task_alt</span>
                </div>
                <h3>Check-in de sesión</h3>
                <p>
                  Anota cargas, repeticiones y cómo te sentiste en un solo paso; tus datos afinan la progresión y los avisos de seguridad del coach.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Cómo funciona — 3 pasos */}
        <section className="landing-features-section">
          <div className="landing-features-container">
            <div className="landing-section-header">
              <span className="landing-badge">CÓMO FUNCIONA</span>
              <h2 className="landing-section-title">De la encuesta a tu plan en 3 pasos</h2>
            </div>
            <div className="landing-bento-grid">
              <div className="landing-bento-card">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">assignment</span>
                </div>
                <h3>1 · Encuesta inicial</h3>
                <p>Tu objetivo, salud, material, días y biometría. Es lo primero que haces al crear tu cuenta.</p>
              </div>
              <div className="landing-bento-card active">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">calendar_month</span>
                </div>
                <h3>2 · Tu plan y comidas</h3>
                <p>Generamos tu bloque de 21 días y tu nutrición, adaptados a lo que nos contaste.</p>
              </div>
              <div className="landing-bento-card">
                <div className="landing-bento-icon-wrapper">
                  <span className="material-symbols-outlined">trending_up</span>
                </div>
                <h3>3 · Registra y ajusta</h3>
                <p>Con tus sesiones y métricas reales, el coach afina la progresión semana a semana.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Banner Section */}
        <section className="landing-cta-section">
          <div className="landing-cta-container">
            <div className="landing-cta-glow"></div>
            <div className="landing-cta-content">
              <h2>Empieza con una cuenta</h2>
              <p>Configura tu perfil, revisa el cribado de seguridad y genera tu primer plan semanal.</p>
            </div>
            <div className="landing-cta-btn-wrapper">
              <button
                className="landing-cta-btn"
                onClick={() => {
                  setMode('register');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Crear cuenta
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-container">
          <div className="landing-footer-brand">
            <div className="landing-footer-logo">Ignios</div>
            <p>© 2026 Ignios. Herramienta educativa de seguimiento deportivo.</p>
            <p style={{ marginTop: '0.2rem', fontStyle: 'italic', fontSize: '0.78rem' }}>Uso educativo. No sustituye valoración ni prescripción médica profesional.</p>
          </div>
          <nav className="landing-footer-nav">
            <Link href="/legal/privacy" className="landing-footer-link">Política de Privacidad</Link>
            <Link href="/legal/terms" className="landing-footer-link">Términos de Servicio</Link>
            <Link href="/legal/privacy" className="landing-footer-link">Protección de Datos</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
