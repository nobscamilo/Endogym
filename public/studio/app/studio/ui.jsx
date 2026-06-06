/* ENDOGYM STUDIO — componentes compartidos + reproductor de vídeo (shared element) */
const { useState: useStateU, useEffect: useEffectU, useRef: useRefU, useLayoutEffect, createContext, useContext, useCallback } = React;

/* ---------- SectionCard ---------- */
function SectionCard({ title, icon, sub, action, children, className = '', style }) {
  return (
    <section className={`card ${className}`} style={style}>
      <header className="ctitle">
        {icon ? <span className="ico"><Icon name={icon} size={19} /></span> : null}
        <h3>{title}</h3>
        {action ? <div className="more">{action}</div> : null}
      </header>
      {sub ? <p className="csub">{sub}</p> : null}
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

/* ---------- MacroLine ---------- */
function MacroLine({ label, v, t, u, color }) {
  const pct = Math.min(100, Math.round((v / t) * 100));
  return (
    <div className="macro-line">
      <div className="ml-head"><strong>{label}</strong><span className="num muted">{v} / {t} {u}</span></div>
      <div className="bar"><i style={{ width: pct + '%', background: color }} /></div>
    </div>
  );
}

/* ---------- Stat ---------- */
function Stat({ num, unit, label, color }) {
  return (
    <div className="stat">
      <div className="s-num num" style={color ? { color } : null}>{num}{unit ? <span className="u">{unit}</span> : null}</div>
      <div className="s-lbl">{label}</div>
    </div>
  );
}

/* ========== VÍDEO ========== */
const VideoCtx = createContext({ open: () => {} });
function useVideo() { return useContext(VideoCtx); }

function videoGrad(hue) {
  return `linear-gradient(140deg, oklch(0.62 0.16 ${hue}), oklch(0.42 0.13 ${(hue + 30) % 360}))`;
}

/* Miniatura de vídeo — clic dispara el reproductor con transición shared-element */
function VideoThumb({ item, variant = 'card' }) {
  const { open } = useVideo();
  const ref = useRefU(null);
  const onClick = () => open(item, ref.current);
  if (variant === 'row') {
    return (
      <button className="vid-row" onClick={onClick}>
        <span className="vid-row-thumb" ref={ref} style={{ background: videoGrad(item.hue) }}>
          <span className="vid-play sm"><Icon name="play" size={15} /></span>
          <span className="vid-len">{item.len || item.dur}</span>
        </span>
        <span className="vid-row-meta">
          <strong>{item.title || item.name}</strong>
          <span className="faint tiny">{item.author || item.muscle}{item.views ? ` · ${item.views} vistas` : ''}</span>
        </span>
        <Icon name="chevronRight" size={18} style={{ color: 'var(--ink-3)', flex: 'none' }} />
      </button>
    );
  }
  return (
    <button className="vid-card" onClick={onClick}>
      <span className="vid-thumb" ref={ref} style={{ background: videoGrad(item.hue) }}>
        <span className="vid-noise" />
        <span className="vid-play"><Icon name="play" size={20} /></span>
        <span className="vid-len">{item.len || item.dur}</span>
        {item.tag ? <span className="vid-tag">{item.tag}</span> : null}
      </span>
      <span className="vid-meta">
        <strong>{item.title || item.name}</strong>
        <span className="faint tiny">{item.author || item.muscle}{item.views ? ` · ${item.views} vistas` : ''}</span>
      </span>
    </button>
  );
}

/* Reproductor a pantalla (overlay) con FLIP desde la miniatura */
function VideoPlayer({ state, onClose }) {
  const stageRef = useRefU(null);
  const cardRef = useRefU(null);
  const [playing, setPlaying] = useStateU(true);
  const [prog, setProg] = useStateU(0);
  const [closing, setClosing] = useStateU(false);
  const [embedded, setEmbedded] = useStateU(false);

  // FLIP de entrada (con respaldo por si el reloj de animación está limitado)
  useLayoutEffect(() => {
    if (!state || !cardRef.current) return;
    const card = cardRef.current;
    if (!state.rect) { card.style.transform = 'none'; card.style.opacity = '1'; return; }
    const target = card.getBoundingClientRect();
    const r = state.rect;
    const sx = r.width / target.width, sy = r.height / target.height;
    const tx = r.left + r.width / 2 - (target.left + target.width / 2);
    const ty = r.top + r.height / 2 - (target.top + target.height / 2);
    card.style.transition = 'none';
    card.style.transformOrigin = 'center center';
    card.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
    card.style.opacity = '0.6';
    card.getBoundingClientRect();
    let played = false;
    const play = (instant) => {
      if (played) return; played = true;
      card.style.transition = instant ? 'none' : 'transform 0.5s var(--ease), opacity 0.3s ease';
      card.style.transform = 'none';
      card.style.opacity = '1';
    };
    requestAnimationFrame(() => play(false));
    const fb = setTimeout(() => play(true), 200);
    return () => clearTimeout(fb);
  }, [state]);

  // playback simulado (solo cuando no hay vídeo de YouTube embebido)
  useEffectU(() => {
    if (!state || !playing || closing || embedded) return;
    const id = setInterval(() => setProg((p) => (p >= 100 ? 0 : p + 0.6)), 80);
    return () => clearInterval(id);
  }, [state, playing, closing, embedded]);

  // reset al abrir
  useEffectU(() => { if (state) { setProg(0); setPlaying(true); setClosing(false); setEmbedded(false); } }, [state]);

  const doClose = () => {
    const card = cardRef.current;
    if (card && state && state.rect) {
      const target = card.getBoundingClientRect();
      const r = state.rect;
      const sx = r.width / target.width, sy = r.height / target.height;
      const tx = r.left + r.width / 2 - (target.left + target.width / 2);
      const ty = r.top + r.height / 2 - (target.top + target.height / 2);
      card.style.transition = 'transform 0.42s var(--ease), opacity 0.42s ease';
      card.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
      card.style.opacity = '0';
    }
    setClosing(true);
    setTimeout(onClose, 380);
  };

  if (!state) return null;
  const it = state.item;
  const mins = Math.floor(prog / 100 * 5);
  const secs = Math.floor((prog / 100 * 5 - mins) * 60);
  const cues = it.cues || [];
  const hasYt = !!it.yt;
  return (
    <div className={`player-scrim ${closing ? 'out' : ''}`} onClick={doClose}>
      <div className="player-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="player-stage" ref={stageRef} style={{ background: videoGrad(it.hue) }}>
          {embedded && hasYt ? (
            <iframe className="player-iframe" src={`https://www.youtube-nocookie.com/embed/${it.yt}?autoplay=1&rel=0&modestbranding=1`}
              title={it.title || it.name} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
          ) : (
            <React.Fragment>
              <div className="vid-noise" />
              <div className="player-toplabel"><span className="yt-dot" /> {hasYt ? 'YouTube' : 'Vídeo'} · {it.author || 'Ignios'}</div>
              {hasYt ? <div className="player-yt-badge"><span className="yt-dot" /> Vídeo real</div> : null}
              <button className="player-close" onClick={doClose}><Icon name="close" size={20} /></button>
              <button className="player-bigplay" onClick={() => hasYt ? setEmbedded(true) : setPlaying((p) => !p)}>
                <Icon name={playing && !hasYt ? 'pause' : 'play'} size={30} />
              </button>
              <div className="player-controls" onClick={(e) => e.stopPropagation()}>
                <button className="pc-btn" onClick={() => hasYt ? setEmbedded(true) : setPlaying((p) => !p)}><Icon name={playing && !hasYt ? 'pause' : 'play'} size={16} /></button>
                <span className="pc-time num">{mins}:{String(secs).padStart(2, '0')}</span>
                <div className="pc-track" onClick={(e) => { if (hasYt) { setEmbedded(true); return; } const r = e.currentTarget.getBoundingClientRect(); setProg(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))); }}>
                  <div className="pc-fill" style={{ width: (hasYt ? 0 : prog) + '%' }} />
                </div>
                <span className="pc-time num faint">{it.len || it.dur || '5:00'}</span>
              </div>
            </React.Fragment>
          )}
          {embedded ? <button className="player-close" onClick={doClose}><Icon name="close" size={20} /></button> : null}
        </div>
        <div className="player-body">
          <h3>{it.title || it.name}</h3>
          <div className="row ac wrap" style={{ gap: 8, marginTop: 8 }}>
            {it.tag ? <span className="pill accent tiny">{it.tag}</span> : null}
            {it.muscle ? <span className="pill tiny">{it.muscle}</span> : null}
            {it.scheme ? <span className="pill tiny">{it.scheme}{it.load ? ` · ${it.load}` : ''}</span> : null}
            {it.views ? <span className="pill tiny">{it.views} vistas</span> : null}
          </div>
          {cues.length ? (
            <div style={{ marginTop: 16 }}>
              <div className="mb-label">Claves de técnica</div>
              <ul className="cue-list">{cues.map((c, i) => <li key={i}><span className="cue-n">{i + 1}</span>{c}</li>)}</ul>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 12, lineHeight: 1.5, fontSize: '0.92rem' }}>
              {hasYt ? 'Pulsa play para ver el vídeo de YouTube. En la app real se abre con marcas de tiempo por serie.'
                : 'Reproducción guiada. En la app real este reproductor carga el vídeo de YouTube correspondiente con marcas de tiempo por serie.'}
            </p>
          )}
          <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
            <button className="btn sm"><Icon name="check" size={15} /> Marcar como vista</button>
            <button className="btn ghost sm"><Icon name="share" size={15} /> Compartir</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Provider — se monta en App */
function VideoProvider({ children }) {
  const [state, setState] = useStateU(null);
  const open = useCallback((item, el) => {
    const rect = el ? el.getBoundingClientRect() : null;
    setState({ item, rect });
  }, []);
  useEffectU(() => {
    const onKey = (e) => { if (e.key === 'Escape') setState(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <VideoCtx.Provider value={{ open }}>
      {children}
      <VideoPlayer state={state} onClose={() => setState(null)} />
    </VideoCtx.Provider>
  );
}

/* ---------- Bottom sheet (mobile quick add) ---------- */
function Sheet({ open, onClose, children, title }) {
  return (
    <React.Fragment>
      <div className={`scrim ${open ? 'open' : ''}`} style={{ zIndex: 120 }} onClick={onClose} />
      <div className={`sheet ${open ? 'open' : ''}`}>
        <div className="sheet-grab" />
        {title ? <h3 style={{ marginBottom: 4 }}>{title}</h3> : null}
        {children}
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { SectionCard, MacroLine, Stat, VideoThumb, VideoPlayer, VideoProvider, VideoCtx, useVideo, videoGrad, Sheet });
