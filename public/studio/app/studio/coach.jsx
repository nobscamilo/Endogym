/* ENDOGYM STUDIO — Coach IA contextual y "vivo" */
const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

/* Mensajes del coach según el contexto/pantalla */
const COACH_MSGS = {
  train_session: 'Usa la sesión como guía, registra cómo respondes y ajusta la carga real con margen técnico. El coach afina mejor cuando el dato de entrenamiento es honesto.',
  train_week: 'La semana combina carga, recuperación y adherencia. Si aparece fatiga alta o una señal de alarma, el ajuste real se mostrará con su motivo.',
  nutrition_today: 'Revisa el objetivo del día y reparte proteína, fibra y carbohidratos según tu entrenamiento. Las comidas registradas actualizan el resumen.',
  glucemia: 'La carga glucémica estimada orienta decisiones, pero no sustituye un sensor ni criterio clínico. Prioriza comidas completas y observa tu respuesta.',
  progress: 'Mira tendencias, no solo un día aislado. Peso, sesiones, sueño y cargas registradas son las señales que más ayudan al coach.',
};

/* Reveal tipo "máquina de escribir" (usa timers, fiable aunque el reloj de animación se limite) */
function useTypewriter(text, speed = 16, start = true) {
  const [out, setOut] = useStateC(start ? '' : text);
  const [typing, setTyping] = useStateC(start);
  useEffectC(() => {
    if (!start) { setOut(text); return; }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setOut(text); setTyping(false); return; }
    setOut(''); setTyping(true);
    let i = 0;
    const id = setInterval(() => {
      i += 2; setOut(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setOut(text); setTyping(false); }
    }, speed);
    return () => clearInterval(id);
  }, [text, start, speed]);
  return [out, typing];
}

/* Banner del Coach — contextual, con avatar "vivo" y escritura */
function CoachBanner({ screen, ask = false, onAsk }) {
  const msg = COACH_MSGS[screen] || '';
  const [thinking, setThinking] = useStateC(true);
  const [text, typing] = useTypewriter(msg, 15, !thinking);
  useEffectC(() => { const id = setTimeout(() => setThinking(false), 520); return () => clearTimeout(id); }, [screen]);
  return (
    <div className="coach-banner">
      <span className="cb-av"><Icon name="sparkles" size={17} /><span className="cb-live" /></span>
      <div className="cb-body">
        <div className="cb-head"><strong>Coach Ignios</strong><span className="cb-tag">Guía contextual</span></div>
        {thinking ? (
          <div className="cb-typing"><span /><span /><span /></div>
        ) : (
          <p className="cb-text">{text}{typing ? <span className="cb-caret" /> : null}</p>
        )}
        {ask && !thinking ? (
          <button className="cb-ask" onClick={onAsk}><Icon name="sparkles" size={14} /> Pregúntale al coach</button>
        ) : null}
      </div>
    </div>
  );
}

/* Modal "Pregúntale al coach" — IA real (window.claude.complete) con respaldo */
const COACH_SUGGEST = [
  '¿Cómo voy con mi objetivo?',
  '¿Qué ceno hoy para no subir la glucosa?',
  '¿Debería subir peso en press banca?',
  '¿Por qué bajaste el miércoles?',
];
const COACH_FALLBACK = {
  default: 'Ahora no puedo consultar el motor IA. Usa el plan como referencia, prioriza técnica y seguridad, y registra la sesión para que el próximo ajuste tenga mejores datos.',
};

/* El fallo tiene causa y el usuario puede actuar sobre casi todas: un límite de preguntas
   se espera, una sesión caducada se renueva. Antes las cuatro salían como "no puedo
   consultar el motor IA", que no orienta a ninguna. */
function coachErrorMessage(err) {
  const status = err && err.status;
  // Freno de gasto diario (lib/aiBudget.js): el servidor ya manda un texto pensado para
  // leerse tal cual y distingue si el tope es tuyo o de todo el sistema. No lo reescribimos.
  if (err && (err.reason === 'user_daily_budget' || err.reason === 'global_daily_budget')) {
    return err.message;
  }
  if (status === 429) {
    const secs = Number(err.retryAfterSeconds);
    const mins = Number.isFinite(secs) && secs > 0 ? Math.ceil(secs / 60) : null;
    return 'Has hecho muchas preguntas seguidas y he llegado al límite por hora.'
      + (mins ? ` Vuelve a preguntarme en ${mins} min.` : ' Inténtalo un poco más tarde.')
      + ' Mientras tanto, el plan y el análisis de Progreso siguen disponibles.';
  }
  if (status === 401) return 'Tu sesión ha caducado. Vuelve a entrar y te sigo contando.';
  if (status === 503) return 'El coach IA no está disponible ahora mismo (falta configuración del servidor). Es cosa nuestra, no tuya: inténtalo más tarde.';
  if (status === 422) return 'No puedo responder a eso. Prueba a reformular la pregunta con lo que quieres saber de tu entrenamiento o tu nutrición.';
  if (status === 413) return 'Ese mensaje es demasiado largo. Resúmelo un poco y te respondo.';
  return COACH_FALLBACK.default;
}

/* FASE 3.4 — Feedback 👍👎 por respuesta del coach (chat y análisis). Solo guarda
   endpoint + rating + hash corto del texto (nunca el contenido). */
function coachFeedbackHash(text) {
  let h = 5381; const str = String(text || '');
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
function CoachFeedback({ endpoint, text }) {
  const [sent, setSent] = useStateC(null);
  const vote = async (rating) => {
    if (sent) return;
    setSent(rating);
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) return;
      await fetch('/api/coach-feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ endpoint, rating, contextHash: coachFeedbackHash(text) }),
      });
    } catch (e) { /* el feedback nunca molesta */ }
  };
  return (
    <span className="row ac" style={{ gap: 4, marginTop: 6 }}>
      <button type="button" className="icon-btn" style={{ width: 26, height: 26, fontSize: '0.78rem', opacity: sent && sent !== 'up' ? 0.25 : 1 }} disabled={!!sent} onClick={() => vote('up')} title="Respuesta útil">👍</button>
      <button type="button" className="icon-btn" style={{ width: 26, height: 26, fontSize: '0.78rem', opacity: sent && sent !== 'down' ? 0.25 : 1 }} disabled={!!sent} onClick={() => vote('down')} title="Respuesta poco útil">👎</button>
      {sent ? <span className="tiny muted">Gracias por el feedback</span> : null}
    </span>
  );
}

function AskCoach({ open, onClose }) {
  const [q, setQ] = useStateC('');
  const [log, setLog] = useStateC([]); // {role, text, failed?, redFlag?}
  const [busy, setBusy] = useStateC(false);
  const [loadingLog, setLoadingLog] = useStateC(false);
  const scrollRef = useRefC(null);
  const inputRef = useRefC(null);

  useEffectC(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [log, busy]);
  useEffectC(() => { if (!open) { setLog([]); setQ(''); setBusy(false); } }, [open]);

  /* El servidor recuerda el hilo hasta 7 días. Sin esto el modal se abría en blanco y el
     coach respondía referenciando una conversación que el usuario ya no veía. */
  useEffectC(() => {
    if (!open) return undefined;
    let active = true;
    setLoadingLog(true);
    (async () => {
      let turns = [];
      try {
        if (window.claude && window.claude.history) turns = await window.claude.history();
      } catch (e) { turns = []; }
      if (!active) return;
      setLog(turns.map((t) => ({ role: t.role === 'user' ? 'user' : 'coach', text: t.text })));
      setLoadingLog(false);
    })();
    return () => { active = false; };
  }, [open]);

  const clearHistory = async () => {
    if (busy) return;
    setLog([]); setQ('');
    try {
      if (window.claude && window.claude.clearHistory) await window.claude.clearHistory();
    } catch (e) { /* el hilo ya está vacío en pantalla; el próximo turno lo reescribe */ }
  };
  useEffectC(() => {
    if (!open) return undefined;
    const body = document.body;
    const main = document.querySelector('.main');
    const prevBodyOverflow = body.style.overflow;
    const prevMainOverflow = main ? main.style.overflowY : '';
    body.style.overflow = 'hidden';
    if (main) main.style.overflowY = 'hidden';
    const id = setTimeout(() => {
      if (inputRef.current) inputRef.current.focus({ preventScroll: true });
    }, 80);
    return () => {
      clearTimeout(id);
      body.style.overflow = prevBodyOverflow;
      if (main) main.style.overflowY = prevMainOverflow;
    };
  }, [open]);

  const send = async (text) => {
    const question = (text || q).trim();
    if (!question || busy) return;
    setQ(''); setLog((l) => [...l, { role: 'user', text: question }]); setBusy(true);
    // FASE 0.1: la persona/reglas del coach viven en el SERVIDOR (coachPersona.js).
    // El cliente envía solo el mensaje del usuario.
    let answer = '';
    let failed = false;
    let redFlag = false;
    try {
      if (window.claude && window.claude.complete) {
        const res = await window.claude.complete(question);
        answer = res && res.text ? res.text : '';
        redFlag = Boolean(res && res.redFlag);
      }
    } catch (e) { answer = coachErrorMessage(e); failed = true; }
    if (!answer) { answer = COACH_FALLBACK.default; failed = true; }
    // `failed` marca la burbuja como aviso del sistema y `redFlag` como aviso de seguridad:
    // ninguna de las dos es una respuesta del coach, así que no se vota con 👍👎.
    setLog((l) => [...l, { role: 'coach', text: answer, failed, redFlag }]);
    setBusy(false);
  };

  if (!open) return null;
  const isMobileSheet = typeof window !== 'undefined'
    && (window.matchMedia('(max-width: 700px)').matches || Boolean(document.querySelector('.app.mobile')));
  const modal = (
    <div className={`ask-scrim${isMobileSheet ? ' mobile' : ''}`} onClick={onClose}>
      <div className="ask-card" onClick={(e) => e.stopPropagation()}>
        <div className="ask-head">
          <span className="cb-av"><Icon name="sparkles" size={18} /><span className="cb-live" /></span>
          <div><strong style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Coach Ignios</strong><div className="tiny faint">Pregúntale lo que quieras</div></div>
          {log.length ? (
            <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={clearHistory} disabled={busy}
              title="El coach deja de recordar esta conversación">Borrar conversación</button>
          ) : null}
          <button className="icon-btn" style={{ marginLeft: log.length ? 0 : 'auto', width: 36, height: 36 }} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="ask-log" ref={scrollRef}>
          {loadingLog && log.length === 0 ? (
            <div className="ask-empty"><p className="muted" style={{ margin: 0 }}>Recuperando vuestra conversación…</p></div>
          ) : log.length === 0 ? (
            <div className="ask-empty">
              <p className="muted" style={{ margin: '0 0 14px', lineHeight: 1.5 }}>Soy tu coach. Te conozco: tu plan, tu nutrición y tu glucemia. ¿Qué quieres saber?</p>
              <div className="ask-suggest">{COACH_SUGGEST.map((s, i) => <button key={i} onClick={() => send(s)}>{s}</button>)}</div>
            </div>
          ) : log.map((m, i) => (
            <div key={i} className={`ask-msg ${m.role}`}>
              {m.role === 'coach' ? <span className="cb-av sm"><Icon name={m.redFlag ? 'heart' : 'sparkles'} size={13} /></span> : null}
              <div className={`ask-bubble${m.redFlag ? ' alert' : ''}`}>{m.text}{m.role === 'coach' && !m.failed && !m.redFlag ? <CoachFeedback endpoint="coach-chat" text={m.text} /> : null}</div>
            </div>
          ))}
          {busy ? <div className="ask-msg coach"><span className="cb-av sm"><Icon name="sparkles" size={13} /></span><div className="ask-bubble"><div className="cb-typing"><span /><span /><span /></div></div></div> : null}
        </div>
        <form className="ask-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe tu pregunta…" />
          <button type="submit" className="btn icon-only" disabled={busy || !q.trim()}><Icon name="arrowRight" size={18} /></button>
        </form>
      </div>
    </div>
  );
  const createPortal = typeof window !== 'undefined' ? window.__createPortal : null;
  return createPortal && document.body ? createPortal(modal, document.body) : modal;
}

Object.assign(window, { CoachBanner, AskCoach, useTypewriter, COACH_MSGS, CoachFeedback, coachErrorMessage });
