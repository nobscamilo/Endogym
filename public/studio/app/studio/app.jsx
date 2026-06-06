/* ENDOGYM STUDIO — App shell: nav, transiciones, responsive, tweaks */
const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

const NAV = [
  { id: 'today', label: 'Hoy', icon: 'today' },
  { id: 'train', label: 'Entreno', icon: 'train' },
  { id: 'nutrition', label: 'Nutrición', icon: 'nutrition', badge: '2' },
  { id: 'progress', label: 'Progreso', icon: 'progress' },
  { id: 'profile', label: 'Perfil', icon: 'profile' },
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "ambar",
  "density": "Cómoda",
  "radius": 1,
  "homeLayout": "anillos",
  "nutriLayout": "tarjetas",
  "coach": "Gradiente"
}/*EDITMODE-END*/;

const ACCENTS = [
  { id: 'ambar', hex: '#e8843f' },
  { id: 'cian', hex: '#3aa0e8' },
  { id: 'bosque', hex: '#2bb985' },
  { id: 'violeta', hex: '#a674e6' },
];
const HEX_BY_ACCENT = Object.fromEntries(ACCENTS.map((a) => [a.id, a.hex]));
const ACCENT_BY_HEX = Object.fromEntries(ACCENTS.map((a) => [a.hex, a.id]));

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useStateA('today');
  const [device, setDevice] = useStateA('desktop');
  const [mini, setMini] = useStateA(false);
  const [sheet, setSheet] = useStateA(false);
  const mainRef = useRefA(null);

  const theme = t.theme, accent = t.accent;
  const setTheme = (v) => setTweak('theme', v);
  const [notif, setNotif] = useStateA(true);

  // Usuario real (lo rellena /api/studio-data tras login); fallback a muestra en modo demo.
  const u = (window.STUDIO && window.STUDIO.user) || {};
  const userName = `${u.name || ''} ${u.last || ''}`.trim() || 'Tu perfil';
  const userInitials = u.initials || (u.name ? u.name[0].toUpperCase() : 'U');
  const userPlan = u.plan || (u.goalShort ? u.goalShort : 'Plan personalizado');

  useEffectA(() => {
    const r = document.documentElement;
    r.setAttribute('data-theme', t.theme);
    r.setAttribute('data-accent', t.accent);
    r.setAttribute('data-density', t.density === 'Compacta' ? 'compacta' : 'comoda');
    r.setAttribute('data-coach', t.coach === 'Sutil' ? 'sutil' : 'gradiente');
    r.style.setProperty('--rs', t.radius);
  }, [t.theme, t.accent, t.density, t.coach, t.radius]);

  const isMobile = device === 'mobile';
  const go = (id) => { setView(id); setSheet(false); if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'auto' }); };

  const screen = (() => {
    switch (view) {
      case 'today': return <TodayHub go={go} variant={t.homeLayout} />;
      case 'train': return <TrainScreen />;
      case 'nutrition': return <NutritionScreen layout={t.nutriLayout} />;
      case 'progress': return <ProgressScreen />;
      case 'profile': return <ProfileScreen theme={theme} setTheme={setTheme} notif={notif} setNotif={setNotif} />;
      default: return <TodayHub go={go} variant={t.homeLayout} />;
    }
  })();

  const navIdx = Math.max(0, NAV.findIndex((n) => n.id === view));

  return (
    <VideoProvider>
      <div className="stage">
        {/* Barra demo */}
        <div className="topbar">
          <span className="brand"><Logo size={26} /> Ignios <small>Studio</small></span>
          <span className="spacer" />
          <span className="lbl">Vista</span>
          <div className="seg">
            <div className="seg-thumb" style={{ left: isMobile ? 'calc(50%)' : '3px', width: 'calc(50% - 3px)' }} />
            <button className={!isMobile ? 'on' : ''} onClick={() => setDevice('desktop')}>Ordenador</button>
            <button className={isMobile ? 'on' : ''} onClick={() => setDevice('mobile')}>Móvil</button>
          </div>
          <div className="seg">
            <div className="seg-thumb accent" style={{ left: theme === 'light' ? '3px' : 'calc(50%)', width: 'calc(50% - 3px)' }} />
            <button className={theme === 'light' ? 'on solid' : ''} onClick={() => setTheme('light')}><Icon name="sun" size={15} /></button>
            <button className={theme === 'dark' ? 'on solid' : ''} onClick={() => setTheme('dark')}><Icon name="moon" size={15} /></button>
          </div>
        </div>

        {/* Viewport */}
        <div className={`viewport ${isMobile ? 'phone' : ''}`}>
          <div className="device">
            <div className={`app ${isMobile ? 'mobile' : ''}`}>
              {!isMobile ? (
                <aside className={`rail ${mini ? 'mini' : ''}`}>
                  <div className="rail-top">
                    <span className="rail-logo"><Logo size={34} /></span>
                    <span className="rail-word">Ignios</span>
                    <button className="rail-collapse" onClick={() => setMini(!mini)}><Icon name={mini ? 'chevronRight' : 'chevronLeft'} size={17} /></button>
                  </div>
                  <div className="nav-group">
                    <div className="nav-lbl">Menú</div>
                    {NAV.map((n) => (
                      <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} onClick={() => go(n.id)} title={n.label}>
                        <span className="nav-ico"><Icon name={n.icon} size={21} /></span>
                        <span className="nav-txt">{n.label}</span>
                        {n.badge && !mini ? <span className="nav-badge">{n.badge}</span> : null}
                      </button>
                    ))}
                  </div>
                  <div className="rail-foot">
                    {!mini ? <button className="btn block" onClick={() => setSheet(true)}><Icon name="plus" size={17} /> Registro rápido</button>
                      : <button className="btn icon-only" onClick={() => setSheet(true)} title="Registro rápido"><Icon name="plus" size={20} /></button>}
                    <div className="user-card" onClick={() => go('profile')}>
                      <span className="avatar">{userInitials}</span>
                      <div className="user-meta"><strong>{userName}</strong><span>{userPlan}</span></div>
                    </div>
                  </div>
                </aside>
              ) : (
                <div className="mbar">
                  <div>
                    <div className="m-hi">{view === 'today' ? 'Lunes · 2 jun' : 'Ignios'}</div>
                    <div className="m-title">{(NAV.find((n) => n.id === view) || { label: 'Hoy' }).label}</div>
                  </div>
                  <span className="m-spacer" />
                  <button className="icon-btn"><Icon name="bell" size={19} /><span className="ib-dot" /></button>
                  <button className="icon-btn" onClick={() => go('profile')}><Icon name="profile" size={19} /></button>
                </div>
              )}

              <main className="main" ref={mainRef}>
                <div key={view}>{screen}</div>
              </main>

              {/* Bottom tab bar (mobile) */}
              {isMobile ? (
                <nav className="tabbar">
                  <div className="tab-thumb" style={{ left: `calc(7px + ${navIdx} * 58px)`, width: '56px' }} />
                  {NAV.map((n) => (
                    <button key={n.id} className={`tab ${view === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
                      <span className="tab-ico"><Icon name={n.icon} size={21} /></span>
                      <span className="tab-txt">{n.label}</span>
                    </button>
                  ))}
                </nav>
              ) : null}

              {/* Quick add sheet */}
              <Sheet open={sheet} onClose={() => setSheet(false)} title="Registro rápido">
                <p className="tiny muted" style={{ margin: '0 0 16px' }}>¿Qué quieres añadir?</p>
                <div className="stack" style={{ gap: 10 }}>
                  {[
                    { ico: 'camera', t: 'Foto del plato', d: 'IA estima macros y glucemia', go: 'nutrition' },
                    { ico: 'barcode', t: 'Escanear producto', d: 'Código de barras', go: 'nutrition' },
                    { ico: 'calc', t: 'Calculadora', d: 'Introducir a mano', go: 'nutrition' },
                    { ico: 'train', t: 'Registrar entreno', d: 'Marcar sesión hecha', go: 'train' },
                  ].map((o, i) => (
                    <button key={i} className="sheet-opt" onClick={() => go(o.go)}>
                      <span className="so-ico"><Icon name={o.ico} size={20} /></span>
                      <div style={{ flex: 1 }}><strong style={{ fontSize: '0.94rem' }}>{o.t}</strong><div className="tiny muted">{o.d}</div></div>
                      <Icon name="chevronRight" size={18} style={{ color: 'var(--ink-3)' }} />
                    </button>
                  ))}
                </div>
              </Sheet>
            </div>
          </div>
        </div>

        {/* Tweaks */}
        <TweaksPanel title="Tweaks">
          <TweakSection label="Tema" />
          <TweakToggle label="Modo oscuro" value={t.theme === 'dark'} onChange={(v) => setTweak('theme', v ? 'dark' : 'light')} />
          <TweakColor label="Acento" value={HEX_BY_ACCENT[t.accent] || ACCENTS[0].hex}
            options={ACCENTS.map((a) => a.hex)} onChange={(hex) => setTweak('accent', ACCENT_BY_HEX[hex] || 'ambar')} />
          <TweakRadio label="Tarjeta del coach" value={t.coach} options={['Gradiente', 'Sutil']} onChange={(v) => setTweak('coach', v)} />

          <TweakSection label="Variaciones de Inicio" />
          <TweakRadio label="Inicio" value={t.homeLayout} options={[{ value: 'anillos', label: 'Anillos' }, { value: 'resumen', label: 'Resumen' }, { value: 'editorial', label: 'Editorial' }]} onChange={(v) => setTweak('homeLayout', v)} />

          <TweakSection label="Variaciones de Nutrición" />
          <TweakRadio label="Comidas" value={t.nutriLayout} options={[{ value: 'tarjetas', label: 'Tarjetas' }, { value: 'timeline', label: 'Timeline' }, { value: 'plato', label: 'Plato' }]} onChange={(v) => setTweak('nutriLayout', v)} />

          <TweakSection label="Disposición" />
          <TweakRadio label="Densidad" value={t.density} options={['Cómoda', 'Compacta']} onChange={(v) => setTweak('density', v)} />
          <TweakSlider label="Esquinas" value={t.radius} min={0.7} max={1.35} step={0.05} unit="×" onChange={(v) => setTweak('radius', v)} />
        </TweaksPanel>
      </div>
    </VideoProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
