/* ENDOGYM STUDIO — Pantalla ENTRENO (sesión · semana · vídeos) */
const { useState: useStateTr } = React;

/* ---- Mapa muscular (atlas Endogym recuperado): base + capas recoloreadas por drop-shadow ---- */
function __normMuscle(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// Cada término (ES/EN) -> capas PNG que se iluminan (alineadas 1:1 con la base).
const MUSCLE_LAYERS = [
  [['pecho', 'pectoral', 'chest'], ['front-chest']],
  [['hombro', 'deltoid', 'shoulder'], ['front-front_shoulders', 'back-rear_shoulders']],
  [['triceps'], ['back-triceps']],
  [['biceps'], ['front-biceps']],
  [['espalda alta', 'upper back', 'trapecio', 'trapezius'], ['back-upper_back']],
  [['dorsal', 'dorsales', 'lats', 'lat ', 'espalda'], ['back-lats', 'back-upper_back']],
  [['lumbar', 'low back', 'espalda baja', 'core', 'abdomen', 'abs', 'abdominal'], ['front-abs', 'front-obliques']],
  [['oblicuo', 'oblique'], ['front-obliques']],
  [['lumbar', 'lower back'], ['back-lower_back']],
  [['cuadriceps', 'quadriceps', 'quad', 'pierna', 'leg'], ['front-quadriceps']],
  [['isquio', 'femoral', 'hamstring'], ['back-hamstrings']],
  [['gluteo', 'glute'], ['back-glutes']],
  [['gemelo', 'pantorrilla', 'calf', 'calves'], ['front-calves', 'back-calves']],
  [['antebrazo', 'forearm'], ['front-forearms']],
  [['aductor', 'adductor'], ['front-adductors']],
];
function layersFor(muscles) {
  const set = new Set();
  (muscles || []).forEach((m) => {
    const n = __normMuscle(m);
    MUSCLE_LAYERS.forEach(([terms, layers]) => {
      if (terms.some((t) => n.includes(t.trim()))) layers.forEach((l) => set.add(l));
    });
  });
  return set;
}
function MuscleMap({ primary = [], secondary = [] }) {
  const prim = layersFor(primary);
  const sec = layersFor(secondary);
  sec.forEach((l) => { if (prim.has(l)) sec.delete(l); }); // primario gana
  const all = [...prim, ...sec];
  return (
    <div className="mmap">
      <img className="mmap-base" src="assets/anatomy/vector-muscles-base.png" alt="Mapa muscular" loading="lazy" />
      {all.map((layer) => (
        <img key={layer} className={`mmap-layer ${prim.has(layer) ? 'prim' : 'sec'}`}
          src={`assets/anatomy/vector-layers/${layer}.png`} alt="" aria-hidden="true" loading="lazy" />
      ))}
    </div>
  );
}

function TrainScreen({ initialTab }) {
  const D = window.STUDIO;
  const [tab, setTab] = useStateTr(initialTab || 'sesion');
  const TABS = [{ id: 'sesion', label: 'Sesión' }, { id: 'semana', label: 'Semana' }, { id: 'videos', label: 'Vídeos' }];
  return (
    <div className="page stagger screen-enter">
      <div className="page-head">
        <div>
          <p className="eyebrow">Entrenamiento · Semana 6</p>
          <h1>Entreno</h1>
          <p className="sub">Tu sesión guiada, el plan de la semana y vídeos para perfeccionar la técnica.</p>
        </div>
      </div>
      <SegTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'sesion' && <TrainSession />}
      {tab === 'semana' && <TrainWeek />}
      {tab === 'videos' && <TrainVideos />}
    </div>
  );
}

/* ---- Check-in de la sesión de hoy (alimenta el RAG del Coach IA) ---- */
const CHECKIN_SYMPTOMS = [
  { key: 'dyspnea', label: 'Falta de aire' },
  { key: 'jointPain', label: 'Dolor articular' },
  { key: 'dizziness', label: 'Mareo' },
  { key: 'tachycardia', label: 'Palpitaciones' },
];
function Scale10({ value, onChange }) {
  return (
    <div className="scale10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" className={`s10 ${value === n ? 'on' : ''}`} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  );
}
function CheckinCard() {
  const D = window.STUDIO;
  const [completed, setCompleted] = useStateTr(true);
  const [rpe, setRpe] = useStateTr(7);
  const [fatigue, setFatigue] = useStateTr(4);
  const [sleep, setSleep] = useStateTr(7.5);
  const [symptoms, setSymptoms] = useStateTr({ dyspnea: false, jointPain: false, dizziness: false, tachycardia: false });
  const [status, setStatus] = useStateTr('idle'); // idle|saving|ok|err|noauth
  const toggleSym = (k) => setSymptoms((p) => ({ ...p, [k]: !p[k] }));

  async function submit() {
    setStatus('saving');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setStatus('noauth'); return; }
      const today = new Date().toISOString().slice(0, 10);
      const title = (D.todaySession && D.todaySession.title) || 'Sesión';
      const base = { source: 'daily_checkin', dailyCheckinDate: today, performedAt: `${today}T12:00:00.000Z`, symptoms, title, mode: 'studio' };
      const body = completed
        ? { ...base, completed: true, checkinSkipped: false, sessionRpe: Number(rpe), fatigue: Number(fatigue), sleepHours: Number(sleep) }
        : { ...base, completed: false, checkinSkipped: true, sessionRpe: null, fatigue: null, sleepHours: null };
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      setStatus(res.ok ? 'ok' : 'err');
    } catch (e) { setStatus('err'); }
  }

  const alarm = Object.values(symptoms).some(Boolean);
  if (status === 'ok') {
    return (
      <SectionCard title="Check-in de hoy" icon="check" sub="Guardado">
        <div className="checkin-done"><span className="cd-ic"><Icon name="check" size={20} /></span>
          <div><strong>¡Registrado!</strong><div className="tiny muted">El coach usará esto para ajustar tu próximo plan.{alarm ? ' Detectamos síntomas de alarma: priorizaremos seguridad.' : ''}</div></div>
        </div>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Check-in de hoy" icon="bolt" sub="Cuéntale al coach cómo fue — ajusta tu plan">
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <div className="mb-label">¿Completaste la sesión?</div>
          <div className="segc" style={{ alignSelf: 'flex-start', maxWidth: 240 }}>
            <div className="segc-thumb" style={{ left: `calc(4px + ${completed ? 0 : 1} * (100% - 8px) / 2)`, width: 'calc((100% - 8px) / 2)' }} />
            <button className={completed ? 'on' : ''} onClick={() => setCompleted(true)}>Sí</button>
            <button className={!completed ? 'on' : ''} onClick={() => setCompleted(false)}>No</button>
          </div>
        </div>
        {completed && (
          <React.Fragment>
            <div><div className="mb-label">Esfuerzo percibido (RPE) · {rpe}/10</div><Scale10 value={rpe} onChange={setRpe} /></div>
            <div><div className="mb-label">Fatiga · {fatigue}/10</div><Scale10 value={fatigue} onChange={setFatigue} /></div>
            <div className="row ac" style={{ gap: 12 }}>
              <div className="mb-label" style={{ margin: 0 }}>Horas de sueño</div>
              <input type="number" min="0" max="24" step="0.5" value={sleep} onChange={(e) => setSleep(e.target.value)} className="num-input" />
            </div>
          </React.Fragment>
        )}
        <div>
          <div className="mb-label">¿Algún síntoma? (seguridad)</div>
          <div className="chips">
            {CHECKIN_SYMPTOMS.map((s) => (
              <button key={s.key} type="button" className={`pill ${symptoms[s.key] ? 'accent' : ''}`} onClick={() => toggleSym(s.key)}>{s.label}</button>
            ))}
          </div>
          {alarm ? <p className="tiny" style={{ color: 'var(--glu-high)', margin: '8px 0 0' }}>El coach limitará la intensidad y recomendará valoración médica.</p> : null}
        </div>
        <div className="row ac" style={{ gap: 12 }}>
          <button className="btn" onClick={submit} disabled={status === 'saving'}>
            <Icon name="check" size={16} /> {status === 'saving' ? 'Guardando…' : 'Guardar check-in'}
          </button>
          {status === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo guardar. Reintenta.</span> : null}
          {status === 'noauth' ? <span className="tiny muted">Inicia sesión para guardar.</span> : null}
        </div>
      </div>
    </SectionCard>
  );
}

/* Sub-tabs animadas reutilizables */
function SegTabs({ tabs, value, onChange }) {
  const idx = Math.max(0, tabs.findIndex((t) => t.id === value));
  return (
    <div className="segc" style={{ alignSelf: 'flex-start' }}>
      <div className="segc-thumb" style={{ left: `calc(4px + ${idx} * (100% - 8px) / ${tabs.length})`, width: `calc((100% - 8px) / ${tabs.length})` }} />
      {tabs.map((t) => <button key={t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

/* ---------- SESIÓN ---------- */
function TrainSession() {
  const D = window.STUDIO;
  const s = D.todaySession;
  const { open } = useVideo();
  const [list, setList] = useStateTr(s.list);
  const done = list.filter((x) => x.done).length;
  const pct = Math.round((done / list.length) * 100);
  const toggle = (i) => setList((p) => p.map((x, idx) => idx === i ? { ...x, done: !x.done } : x));
  return (
    <React.Fragment>
      {/* Banner sesión */}
      <div className="card lg" style={{ background: 'linear-gradient(150deg, var(--accent), var(--accent-deep))', color: 'var(--on-accent)', border: 0, overflow: 'hidden' }}>
        <div className="row between wrap" style={{ gap: 16 }}>
          <div>
            <p className="eyebrow" style={{ color: 'rgba(255,255,255,0.85)' }}>Sesión de hoy</p>
            <h2 style={{ fontSize: '1.7rem', margin: '6px 0 0' }}>{s.title}</h2>
            <p style={{ margin: '6px 0 0', opacity: 0.92, fontSize: '0.92rem' }}>{s.focus} · {s.durationMin} min · {s.intensity}</p>
          </div>
          <button className="btn" style={{ background: '#fff', color: 'var(--accent-deep)', boxShadow: 'none', whiteSpace: 'nowrap' }}
            onClick={() => open(s.list[0], null)}><Icon name="play" size={17} /> Iniciar guiada</button>
        </div>
        <div className="row ac between" style={{ marginTop: 22, marginBottom: 10 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.9, whiteSpace: 'nowrap' }}>{done}/{list.length} completados</span>
          <span className="num" style={{ fontSize: '0.8rem', fontWeight: 700 }}>{pct}%</span>
        </div>
        <div className="bar" style={{ background: 'rgba(255,255,255,0.25)' }}><i style={{ width: pct + '%', background: '#fff' }} /></div>
      </div>

      {/* Lista de ejercicios con vídeo */}
      <SectionCard title="Ejercicios" icon="list" sub="Toca el vídeo para ver la técnica · marca cada serie al terminar">
        <div className="ex-list">
          {list.map((ex, i) => (
            <div key={i} className={`ex-row ${ex.done ? 'done' : ''}`}>
              <button className="ex-thumb" style={{ background: videoGrad(ex.hue) }} onClick={(e) => { e.stopPropagation(); open(ex, e.currentTarget); }}>
                <span className="vid-play sm"><Icon name="play" size={14} /></span>
                <span className="vid-len">{ex.dur}</span>
              </button>
              <div className="ex-main" onClick={() => open(ex, null)} style={{ cursor: 'pointer' }}>
                <strong>{ex.name}</strong>
                <div className="ex-sub">{ex.muscle} · {ex.load}</div>
              </div>
              <div className="ex-sets">
                <span className="ex-scheme">{ex.scheme}</span>
                <button className="ex-check" onClick={() => toggle(i)}><Icon name="check" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Activación muscular */}
      <SectionCard title="Activación muscular" icon="target" sub="Qué trabaja la sesión de hoy">
        <div className="stack" style={{ gap: 14 }}>
          <MuscleMap primary={s.primaryMuscles} secondary={s.secondaryMuscles} />
          <div className="mmap-legend">
            <span><i className="mll prim" /> Primarios</span>
            <span><i className="mll sec" /> Secundarios</span>
          </div>
          <div>
            <div className="mb-label">Primarios</div>
            <div className="chips">{s.primaryMuscles.map((m) => <span key={m} className="pill accent">{m}</span>)}</div>
          </div>
          <div>
            <div className="mb-label">Secundarios</div>
            <div className="chips">{s.secondaryMuscles.map((m) => <span key={m} className="pill">{m}</span>)}</div>
          </div>
          <CoachBanner screen="train_session" />
        </div>
      </SectionCard>

      {/* Check-in de la sesión (datos para el RAG del coach) */}
      <CheckinCard />
    </React.Fragment>
  );
}

/* ---------- SEMANA ---------- */
function TrainWeek() {
  const D = window.STUDIO;
  const { week, progress } = D;
  return (
    <React.Fragment>
      <div className="grid g-4">
        <div className="card"><Stat num={progress.sessionsPlan} label="Sesiones" /></div>
        <div className="card"><Stat num="3,8" unit="h" label="Volumen semanal" /></div>
        <div className="card"><Stat num={`${progress.sessionsDone}/${progress.sessionsPlan}`} label="Completadas" /></div>
        <div className="card"><Stat num={`${progress.adherence}%`} label="Adherencia" color="var(--glu-good)" /></div>
      </div>

      <SectionCard title="Carga de la semana" icon="bolt" sub="Intensidad planificada por día">
        <div className="week-strip">
          {week.map((d, i) => (
            <div key={i} className={`wcol ${d.today ? 'today' : ''} ${d.rest ? 'rest' : ''}`}>
              <span className="wc-day">{d.day}</span>
              <div className="wc-bar"><i style={{ height: Math.max(6, d.load * 100) + '%' }} /></div>
              <span className="wc-focus">{d.focus}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <CoachBanner screen="train_week" />

      <SectionCard title="Ajustes del coach" icon="sparkles" sub="Cambios automáticos según tu fatiga y adherencia">
        <div className="grid g-2">
          <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
            <strong style={{ fontSize: '0.92rem' }}>Miércoles más suave</strong>
            <p className="tiny muted" style={{ margin: '6px 0 0', lineHeight: 1.45 }}>Cambié fuerza por movilidad + cardio Z2: tu fatiga acumulada estaba alta.</p>
          </div>
          <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
            <strong style={{ fontSize: '0.92rem' }}>+1 serie el viernes</strong>
            <p className="tiny muted" style={{ margin: '6px 0 0', lineHeight: 1.45 }}>Tu adherencia es del 82%, hay margen para subir volumen en full body.</p>
          </div>
        </div>
      </SectionCard>
    </React.Fragment>
  );
}

/* ---------- VÍDEOS (descubrir + biblioteca) ---------- */
function TrainVideos() {
  const D = window.STUDIO;
  const [q, setQ] = useStateTr('');
  const [filter, setFilter] = useStateTr('Todos');
  const muscles = ['Todos', 'Pecho', 'Hombro', 'Dorsales', 'Cuádriceps', 'Glúteo', 'Bíceps', 'Core'];
  const lib = D.library.filter((x) => (filter === 'Todos' || x.muscle === filter) && x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <React.Fragment>
      {D.discover.map((sec, i) => (
        <SectionCard key={i} title={sec.cat} icon={i === 0 ? 'sparkles' : i === 1 ? 'train' : 'heart'}>
          <div className="vid-rail">{sec.items.map((v, k) => <VideoThumb key={k} item={v} />)}</div>
        </SectionCard>
      ))}

      <SectionCard title="Biblioteca de ejercicios" icon="library" sub="Técnica, progresiones y músculos implicados">
        <div className="search-field" style={{ marginBottom: 12 }}>
          <span className="s-ico"><Icon name="search" size={18} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ejercicio…" />
        </div>
        <div className="chips" style={{ marginBottom: 16 }}>
          {muscles.map((m) => <button key={m} className={`pill ${filter === m ? 'accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFilter(m)}>{m}</button>)}
        </div>
        <div className="lib-grid">
          {lib.map((x, i) => <VideoThumb key={i} item={x} />)}
          {!lib.length ? <div className="empty">Sin resultados para «{q}».</div> : null}
        </div>
      </SectionCard>
    </React.Fragment>
  );
}

Object.assign(window, { TrainScreen, SegTabs });
