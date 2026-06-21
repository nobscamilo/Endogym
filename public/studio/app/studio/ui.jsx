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
  const hasTarget = Number.isFinite(Number(t)) && Number(t) > 0;
  const value = Number.isFinite(Number(v)) ? Number(v) : 0;
  const pct = hasTarget ? Math.min(100, Math.round((value / Number(t)) * 100)) : 0;
  return (
    <div className="macro-line">
      <div className="ml-head"><strong>{label}</strong><span className="num muted">{hasTarget ? `${value} / ${t} ${u}` : 'Sin objetivo'}</span></div>
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

/* Fondo de miniatura: imagen real de YouTube si hay vídeo, si no el gradiente. */
function thumbBg(item) {
  if (item && item.yt) {
    return `linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.42)), url(https://i.ytimg.com/vi/${item.yt}/hqdefault.jpg) center/cover no-repeat`;
  }
  return videoGrad(item && item.hue);
}

/* Vídeo verificado → reproductor real. Sin embed exacto → enlace de búsqueda honesto.
   Nunca simular playback ni presentar un placeholder como si fuera un vídeo. */
function VideoThumb({ item, variant = 'card' }) {
  const { open } = useVideo();
  const ref = useRefU(null);
  const hasVideo = Boolean(item?.yt);
  const searchUrl = !hasVideo && item?.videoUrl ? item.videoUrl : null;
  const Container = hasVideo ? 'button' : searchUrl ? 'a' : 'div';
  const interactionProps = hasVideo
    ? { type: 'button', onClick: () => open(item, ref.current) }
    : searchUrl
      ? { href: searchUrl, target: '_blank', rel: 'noreferrer noopener' }
      : { 'aria-disabled': true };
  const detail = item?.author || item?.muscle || (hasVideo ? 'YouTube' : searchUrl ? 'Buscar técnica en YouTube' : 'Sin vídeo verificado');
  const duration = item?.len || item?.dur;
  if (variant === 'row') {
    return (
      <Container className="vid-row" {...interactionProps}>
        <span className="vid-row-thumb" ref={ref} style={{ background: thumbBg(item) }}>
          <span className="vid-play sm"><Icon name={hasVideo ? 'play' : 'search'} size={15} /></span>
          {duration ? <span className="vid-len">{duration}</span> : null}
        </span>
        <span className="vid-row-meta">
          <strong>{item.title || item.name}</strong>
          <span className="faint tiny">{detail}</span>
        </span>
        <Icon name={searchUrl ? 'externalLink' : 'chevronRight'} size={18} style={{ color: 'var(--ink-3)', flex: 'none' }} />
      </Container>
    );
  }
  return (
    <Container className="vid-card" {...interactionProps}>
      <span className="vid-thumb" ref={ref} style={{ background: thumbBg(item) }}>
        <span className="vid-noise" />
        <span className="vid-play"><Icon name={hasVideo ? 'play' : 'search'} size={20} /></span>
        {duration ? <span className="vid-len">{duration}</span> : null}
        {item.tag ? <span className="vid-tag">{item.tag}</span> : null}
      </span>
      <span className="vid-meta">
        <strong>{item.title || item.name}</strong>
        <span className="faint tiny">{detail}</span>
      </span>
    </Container>
  );
}

/* #4 — Excluir / marcar favorito un ejercicio desde su modal. Persiste en el perfil
   (excludedExercises/favoriteExercises) vía studio-availability; se aplica en próximas
   sesiones y cambios de ejercicio. */
function ExercisePrefActions({ item }) {
  const id = item && item.id;
  const u = (window.STUDIO && window.STUDIO.user) || {};
  const [excluded, setExcluded] = useStateU(Array.isArray(u.excludedExercises) && u.excludedExercises.includes(id));
  const [fav, setFav] = useStateU(Array.isArray(u.favoriteExercises) && u.favoriteExercises.includes(id));
  const [busy, setBusy] = useStateU(false);
  if (!id) return null;
  async function persist(nextExcluded, nextFav) {
    setBusy(true);
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setBusy(false); return; }
      const cur = (window.STUDIO && window.STUDIO.user) || {};
      const exSet = new Set(cur.excludedExercises || []);
      const favSet = new Set(cur.favoriteExercises || []);
      if (nextExcluded) exSet.add(id); else exSet.delete(id);
      if (nextFav) favSet.add(id); else favSet.delete(id);
      const excludedExercises = Array.from(exSet);
      const favoriteExercises = Array.from(favSet);
      const r = await fetch('/api/studio-availability', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ excludedExercises, favoriteExercises }),
      });
      if (r.ok && window.STUDIO) window.STUDIO.user = { ...cur, excludedExercises, favoriteExercises };
    } catch (e) { /* noop */ } finally { setBusy(false); }
  }
  return (
    <React.Fragment>
      <button className={`btn ghost sm ${fav ? 'on' : ''}`} disabled={busy} title="Priorizar este ejercicio en tus sesiones"
        onClick={() => { const n = !fav; setFav(n); if (n) setExcluded(false); persist(n ? false : excluded, n); }}>
        <Icon name="heart" size={15} /> {fav ? 'Favorito ✓' : 'Favorito'}
      </button>
      <button className={`btn ghost sm ${excluded ? 'on' : ''}`} disabled={busy} title="No volver a proponer este ejercicio"
        onClick={() => { const n = !excluded; setExcluded(n); if (n) setFav(false); persist(n, n ? false : fav); }}>
        <Icon name="close" size={15} /> {excluded ? 'Excluido ✓' : 'Excluir'}
      </button>
    </React.Fragment>
  );
}

/* Reproductor a pantalla (overlay) con FLIP desde la miniatura */
function VideoPlayer({ state, onClose }) {
  const cardRef = useRefU(null);
  const [closing, setClosing] = useStateU(false);

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

  useEffectU(() => { if (state) setClosing(false); }, [state]);

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

  if (!state?.item?.yt) return null;
  const it = state.item;
  const cues = it.cues || [];
  return (
    <div className={`player-scrim ${closing ? 'out' : ''}`} onClick={doClose}>
      <div className="player-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="player-stage" style={{ background: videoGrad(it.hue) }}>
          <iframe className="player-iframe" src={`https://www.youtube-nocookie.com/embed/${it.yt}?autoplay=1&rel=0&modestbranding=1`}
            title={it.title || it.name} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
          <button className="player-close" onClick={doClose}><Icon name="close" size={20} /></button>
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
              Demostración externa de YouTube asociada al ejercicio exacto.
            </p>
          )}
          <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
            <ExercisePrefActions item={it} />
            <a className="btn ghost sm" href={`https://www.youtube.com/watch?v=${it.yt}`} target="_blank" rel="noreferrer noopener">
              <Icon name="externalLink" size={15} /> Abrir en YouTube
            </a>
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
    if (!item?.yt) return;
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

Object.assign(window, { SectionCard, MacroLine, Stat, VideoThumb, VideoPlayer, VideoProvider, VideoCtx, useVideo, videoGrad, thumbBg, Sheet });
