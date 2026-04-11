'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirebaseClient, isFirebaseClientConfigured } from '../lib/firebaseClient.js';

const CONSENT_VERSION = '2026-04-02';

export default function HomePage() {
  const router = useRouter();
  const firebaseClient = useMemo(() => getFirebaseClient(), []);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [signedOutRequested, setSignedOutRequested] = useState(false);

  const [mode, setMode] = useState('login');
  const [registerStep, setRegisterStep] = useState(1);
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
    if (!authReady || !authUser || signedOutRequested) return;
    router.replace('/dashboard');
  }, [authReady, authUser, signedOutRequested, router]);

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

  useEffect(() => {
    if (mode === 'login') {
      setRegisterStep(1);
    }
  }, [mode]);

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
    event.preventDefault();

    if (!authConfigured || !firebaseClient?.auth) {
      setStatus('Firebase Auth no está configurado para esta app.');
      return;
    }

    if (loading) return;
    setLoading(true);
    setStatus(mode === 'login' ? 'Iniciando sesión...' : 'Creando cuenta...');

    try {
      if (mode === 'register') {
        if (registerStep < 2) {
          setRegisterStep(2);
          setStatus('Revisa y acepta los consentimientos para finalizar el registro.');
          return;
        }
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

      setStatus('Autenticación correcta. Redirigiendo...');
      router.push('/dashboard');
    } catch (error) {
      setStatus(`Error: ${error.message}`);
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

      if (mode === 'login' && additionalInfo?.isNewUser) {
        await signOut(firebaseClient.auth);
        throw new Error('No existe cuenta previa con Google. Cambia a Registro y acepta los consentimientos.');
      }

      if (mode === 'register' || additionalInfo?.isNewUser) {
        await upsertInitialProfile(credentials.user);
      }

      setStatus('Autenticación con Google correcta. Redirigiendo...');
      router.push('/dashboard');
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="hero-brand">
          <Image src="/brand/canva/logo-canva-crop.png" alt="Endogym" width={215} height={90} priority />
        </div>
        <p className="eyebrow">Fitness + Nutrición + IA</p>
        <h1>Entrena, come mejor y ajusta con IA.</h1>
        <p>Plan diario visual, nutrición inteligente y seguimiento automático.</p>
        <div className="hero-media" aria-hidden="true">
          <Image src="/brand/canva/hero-canva-clean.png" alt="" width={720} height={268} priority />
        </div>
        <div className="hero-gallery" aria-hidden="true">
          <article>
            <Image src="/brand/canva/dashboard-canva-alt.png" alt="" width={240} height={300} />
          </article>
          <article>
            <Image src="/brand/canva/hero-canva.png" alt="" width={240} height={89} />
          </article>
        </div>
        <div className="hero-stats" aria-label="Capacidades principales">
          <article>
            <strong>180+</strong>
            <span>ejercicios</span>
          </article>
          <article>
            <strong>4</strong>
            <span>vistas clave</span>
          </article>
          <article>
            <strong>24/7</strong>
            <span>IA activa</span>
          </article>
        </div>
        <div className="hero-links">
          <Link href="/legal/terms">Términos y condiciones</Link>
          <Link href="/legal/privacy">Política de privacidad</Link>
          <Link href="/legal/data-protection">Protección de datos (GDPR/LOPDGDD)</Link>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-head">
          <span className="auth-kicker">{mode === 'login' ? 'Acceso seguro' : 'Alta segura'}</span>
          <div className="auth-card-title-row">
            <h2>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</h2>
            <span className="auth-mode-pill">{mode === 'login' ? 'Email + Google' : '2 pasos'}</span>
          </div>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Autenticación">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'active' : 'secondary'}
            onClick={() => setMode('login')}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : 'secondary'}
            onClick={() => setMode('register')}
          >
            Registrarse
          </button>
        </div>

        {!authConfigured ? (
          <div className="notice">
            <strong>Autenticación pendiente</strong>
            <small>Configura `NEXT_PUBLIC_FIREBASE_*` en Vercel para email, Google y sincronización.</small>
          </div>
        ) : null}

        <form className="auth-form" onSubmit={submitAuth}>
          {mode === 'register' ? (
            <div className="register-steps" aria-label="Progreso de registro">
              <span className={registerStep === 1 ? 'active' : ''}>1. Cuenta</span>
              <span className={registerStep === 2 ? 'active' : ''}>2. Consentimientos</span>
            </div>
          ) : null}

          {mode === 'login' || registerStep === 1 ? (
            <>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@email.com"
                />
              </label>

              <label className="field">
                <span>Contraseña</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </label>
            </>
          ) : null}

          {mode === 'register' && registerStep === 1 ? (
            <>
              <label className="field">
                <span>Confirmar contraseña</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary"
                disabled={loading || !authConfigured || !email || !password || !confirmPassword}
                onClick={() => setRegisterStep(2)}
              >
                Siguiente: consentimientos
              </button>
            </>
          ) : null}

          {mode === 'register' && registerStep === 2 ? (
            <>
              <div className="consent-box">
                <label>
                  <input
                    type="checkbox"
                    checked={consentTerms}
                    onChange={(event) => setConsentTerms(event.target.checked)}
                  />
                  Acepto los <Link href="/legal/terms">Términos y condiciones</Link>.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={consentPrivacy}
                    onChange={(event) => setConsentPrivacy(event.target.checked)}
                  />
                  Acepto la <Link href="/legal/privacy">Política de privacidad</Link>.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={consentData}
                    onChange={(event) => setConsentData(event.target.checked)}
                  />
                  Consiento el tratamiento de datos de salud y actividad física para generar mi plan personalizado.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={consentMarketing}
                    onChange={(event) => setConsentMarketing(event.target.checked)}
                  />
                  Acepto comunicaciones informativas (opcional).
                </label>
              </div>
              <div className="inline-actions">
                <button type="button" className="secondary" onClick={() => setRegisterStep(1)} disabled={loading}>
                  Volver
                </button>
                <button type="submit" disabled={loading || !authConfigured}>
                  {loading ? 'Procesando...' : 'Crear cuenta'}
                </button>
              </div>
            </>
          ) : null}

          {mode === 'login' ? (
            <button type="submit" disabled={loading || !authConfigured}>
              {loading ? 'Procesando...' : 'Entrar'}
            </button>
          ) : null}

          <button type="button" className="secondary google-auth-btn" onClick={submitGoogleAuth} disabled={loading || !authConfigured}>
            {mode === 'login' ? 'Entrar con Google' : 'Registrarme con Google'}
          </button>

          <small>{status}</small>
        </form>

        <p className="auth-footnote">
          Uso educativo. No sustituye valoración médica.
        </p>
      </section>
    </main>
  );
}
