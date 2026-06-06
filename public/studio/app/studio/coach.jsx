/* ENDOGYM STUDIO — Coach IA contextual y "vivo" */
const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

/* Mensajes del coach según el contexto/pantalla */
const COACH_MSGS = {
  train_session: 'Tu volumen de empuje va equilibrado esta semana. El jueves toca tracción para compensar la espalda — hoy puedes apretar sin miedo.',
  train_week: 'Bajé el miércoles a movilidad porque tu fatiga acumulada estaba alta, y sumé una serie el viernes: tu adherencia (82%) da margen.',
  nutrition_today: 'Tu reparto de hoy está bien: te quedan 740 kcal y vas sobrada de proteína. Deja los carbohidratos más densos para después de entrenar.',
  glucemia: 'Carga glucémica del día baja-moderada. Tu cena de salmón y boniato mantiene la curva plana antes de dormir — buena elección.',
  progress: 'Vas −1,6 kg en 6 semanas perdiendo sobre todo grasa: tu fuerza sube en los tres básicos. El ritmo es sostenible, mantén la proteína alta.',
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
        <div className="cb-head"><strong>Coach Ignios</strong><span className="cb-tag">IA · ahora</span></div>
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
  default: 'Vas muy bien: −1,6 kg en 6 semanas perdiendo grasa y subiendo fuerza. Mantén la proteína sobre 145 g, prioriza técnica antes que carga y descansa esta noche 7-8 h. Mañana, a por la pierna.',
};

function AskCoach({ open, onClose }) {
  const [q, setQ] = useStateC('');
  const [log, setLog] = useStateC([]); // {role, text}
  const [busy, setBusy] = useStateC(false);
  const scrollRef = useRefC(null);

  useEffectC(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [log, busy]);
  useEffectC(() => { if (!open) { setLog([]); setQ(''); setBusy(false); } }, [open]);

  const send = async (text) => {
    const question = (text || q).trim();
    if (!question || busy) return;
    setQ(''); setLog((l) => [...l, { role: 'user', text: question }]); setBusy(true);
    const sys = 'Eres el Coach IA de Ignios, una app de fitness y nutrición. Responde en español de España, breve (2-4 frases), cercano, motivador y práctico. Escribe en texto plano, sin markdown ni asteriscos. No des consejo médico ni diagnósticos. Usa el contexto del usuario que se te proporcione (perfil, objetivo y plan); si no hay contexto, responde de forma general.';
    let answer = '';
    try {
      if (window.claude && window.claude.complete) {
        answer = await window.claude.complete(`${sys}\n\nPregunta del usuario: ${question}`);
      }
    } catch (e) { answer = ''; }
    if (!answer) answer = COACH_FALLBACK.default;
    setLog((l) => [...l, { role: 'coach', text: answer }]);
    setBusy(false);
  };

  if (!open) return null;
  return (
    <div className="ask-scrim" onClick={onClose}>
      <div className="ask-card" onClick={(e) => e.stopPropagation()}>
        <div className="ask-head">
          <span className="cb-av"><Icon name="sparkles" size={18} /><span className="cb-live" /></span>
          <div><strong style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Coach Ignios</strong><div className="tiny faint">Pregúntale lo que quieras</div></div>
          <button className="icon-btn" style={{ marginLeft: 'auto', width: 36, height: 36 }} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="ask-log" ref={scrollRef}>
          {log.length === 0 ? (
            <div className="ask-empty">
              <p className="muted" style={{ margin: '0 0 14px', lineHeight: 1.5 }}>Soy tu coach. Te conozco: tu plan, tu nutrición y tu glucemia. ¿Qué quieres saber?</p>
              <div className="ask-suggest">{COACH_SUGGEST.map((s, i) => <button key={i} onClick={() => send(s)}>{s}</button>)}</div>
            </div>
          ) : log.map((m, i) => (
            <div key={i} className={`ask-msg ${m.role}`}>
              {m.role === 'coach' ? <span className="cb-av sm"><Icon name="sparkles" size={13} /></span> : null}
              <div className="ask-bubble">{m.text}</div>
            </div>
          ))}
          {busy ? <div className="ask-msg coach"><span className="cb-av sm"><Icon name="sparkles" size={13} /></span><div className="ask-bubble"><div className="cb-typing"><span /><span /><span /></div></div></div> : null}
        </div>
        <form className="ask-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe tu pregunta…" />
          <button type="submit" className="btn icon-only" disabled={busy || !q.trim()}><Icon name="arrowRight" size={18} /></button>
        </form>
      </div>
    </div>
  );
}

Object.assign(window, { CoachBanner, AskCoach, useTypewriter, COACH_MSGS });
