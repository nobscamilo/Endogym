/* ENDOGYM STUDIO — Pantalla ENTRENO (sesión · semana · vídeos) */
const { useState: useStateTr } = React;

/* ---- Mapa muscular (atlas Endogym): base limpia + spots con pulso magenta/índigo ---- */
function __normMuscle(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// Centros (top/left) y tamaño de cada región sobre la figura (translate -50%,-50%).
const REGION_COORDS = {
  front: {
    front_shoulders: [{ top: '26%', left: '40%', width: '8%', height: '8%' }, { top: '26%', left: '60%', width: '8%', height: '8%' }],
    chest: [{ top: '30.5%', left: '45%', width: '10%', height: '7%' }, { top: '30.5%', left: '55%', width: '10%', height: '7%' }],
    biceps: [{ top: '35%', left: '38%', width: '7%', height: '9%' }, { top: '35%', left: '62%', width: '7%', height: '9%' }],
    forearms: [{ top: '45%', left: '35%', width: '7%', height: '10%' }, { top: '45%', left: '65%', width: '7%', height: '10%' }],
    abs: [{ top: '39%', left: '50%', width: '12%', height: '14%' }],
    obliques: [{ top: '39%', left: '45%', width: '7%', height: '12%' }, { top: '39%', left: '55%', width: '7%', height: '12%' }],
    quadriceps: [{ top: '57%', left: '45%', width: '11%', height: '17%' }, { top: '57%', left: '55%', width: '11%', height: '17%' }],
    adductors: [{ top: '61%', left: '50%', width: '8%', height: '12%' }],
    calves: [{ top: '77%', left: '46%', width: '8%', height: '12%' }, { top: '77%', left: '54%', width: '8%', height: '12%' }],
  },
  back: {
    rear_shoulders: [{ top: '26%', left: '40%', width: '8%', height: '8%' }, { top: '26%', left: '60%', width: '8%', height: '8%' }],
    upper_back: [{ top: '24%', left: '50%', width: '16%', height: '11%' }],
    lats: [{ top: '35%', left: '44%', width: '8%', height: '14%' }, { top: '35%', left: '56%', width: '8%', height: '14%' }],
    triceps: [{ top: '34%', left: '38%', width: '7%', height: '11%' }, { top: '34%', left: '62%', width: '7%', height: '11%' }],
    lower_back: [{ top: '43%', left: '50%', width: '12%', height: '8%' }],
    glutes: [{ top: '51%', left: '46%', width: '10%', height: '11%' }, { top: '51%', left: '54%', width: '10%', height: '11%' }],
    hamstrings: [{ top: '64%', left: '45%', width: '10%', height: '17%' }, { top: '64%', left: '55%', width: '10%', height: '17%' }],
    calves: [{ top: '78%', left: '45%', width: '8%', height: '12%' }, { top: '78%', left: '55%', width: '8%', height: '12%' }],
  },
};
// Término (ES/EN) -> regiones {front:[], back:[]}.
const MUSCLE_REGIONS = [
  [['pecho', 'pectoral', 'chest'], { front: ['chest'] }],
  [['hombro', 'deltoid', 'shoulder'], { front: ['front_shoulders'], back: ['rear_shoulders'] }],
  [['triceps'], { back: ['triceps'] }],
  [['biceps'], { front: ['biceps'] }],
  [['espalda alta', 'trapecio', 'upper back'], { back: ['upper_back'] }],
  [['dorsal', 'lats', 'espalda'], { back: ['lats', 'upper_back'] }],
  [['core', 'abdomen', 'abs', 'abdominal'], { front: ['abs'] }],
  [['oblicuo', 'oblique'], { front: ['obliques'] }],
  [['lumbar', 'espalda baja', 'lower back'], { back: ['lower_back'] }],
  [['cuadricep', 'quad', 'pierna'], { front: ['quadriceps'] }],
  [['isquio', 'femoral', 'hamstring'], { back: ['hamstrings'] }],
  [['gluteo', 'glute'], { back: ['glutes'] }],
  [['gemelo', 'pantorrilla', 'calf', 'calves'], { front: ['calves'], back: ['calves'] }],
  [['antebrazo', 'forearm'], { front: ['forearms'] }],
  [['aductor', 'adductor'], { front: ['adductors'] }],
];
function regionsFor(muscles) {
  const front = new Set(); const back = new Set();
  (muscles || []).forEach((m) => {
    const n = __normMuscle(m);
    MUSCLE_REGIONS.forEach(([terms, r]) => {
      if (terms.some((t) => n.includes(t))) { (r.front || []).forEach((x) => front.add(x)); (r.back || []).forEach((x) => back.add(x)); }
    });
  });
  return { front, back };
}
function Spots({ view, regions, tone }) {
  const out = [];
  regions.forEach((rg) => {
    (REGION_COORDS[view] && REGION_COORDS[view][rg] || []).forEach((c, i) => {
      out.push(<span key={`${view}-${rg}-${tone}-${i}`} className={`fiber-activation ${tone}`} style={{ top: c.top, left: c.left, width: c.width, height: c.height }} aria-hidden="true" />);
    });
  });
  return out;
}
function MuscleMap({ primary = [], secondary = [] }) {
  const p = regionsFor(primary);
  const s = regionsFor(secondary);
  [...s.front].forEach((x) => { if (p.front.has(x)) s.front.delete(x); });
  [...s.back].forEach((x) => { if (p.back.has(x)) s.back.delete(x); });
  return (
    <div className="muscle-atlas-stage double-view">
      <div className="view-panel">
        <span className="panel-kicker">VISTA FRONTAL</span>
        <div className="anatomy-view-container">
          <img className="muscle-atlas-base-new" src="/anatomy/gray-back.png" alt="Vista frontal" />
          <div className="muscle-atlas-layer-stack">
            <Spots view="front" regions={[...s.front]} tone="secondary" />
            <Spots view="front" regions={[...p.front]} tone="primary" />
          </div>
        </div>
      </div>
      <div className="view-panel">
        <span className="panel-kicker">VISTA POSTERIOR</span>
        <div className="anatomy-view-container">
          <img className="muscle-atlas-base-new" src="/anatomy/gray-front.png" alt="Vista posterior" />
          <div className="muscle-atlas-layer-stack">
            <Spots view="back" regions={[...s.back]} tone="secondary" />
            <Spots view="back" regions={[...p.back]} tone="primary" />
          </div>
        </div>
      </div>
      <div className="muscle-atlas-vignette" aria-hidden="true" />
    </div>
  );
}

function TrainScreen({ initialTab }) {
  const D = window.STUDIO;
  const [tab, setTab] = useStateTr(initialTab || 'sesion');
  const [gen, setGen] = useStateTr(0);
  const [genStatus, setGenStatus] = useStateTr('idle'); // idle|loading|ok|err|noauth
  const TABS = [{ id: 'sesion', label: 'Sesión' }, { id: 'semana', label: 'Semana' }, { id: 'videos', label: 'Vídeos' }];

  async function regenerate() {
    // El bloque de 21 días es estable. Rehacerlo entero requiere confirmación explícita;
    // para cambios pequeños usa "Cambiar sesión" / "Más tiempo" / swaps por ejercicio.
    if (!window.confirm('Tu plan es un bloque de 21 días pensado para seguirse completo. ¿Crear un bloque nuevo desde cero? (Para ajustes pequeños usa "Cambiar sesión").')) return;
    setGenStatus('loading');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setGenStatus('noauth'); return; }
      const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
      const post = await fetch('/api/weekly-plan', { method: 'POST', headers, body: JSON.stringify({ rebuild: true }) });
      if (!post.ok) { setGenStatus('err'); return; }
      // Refrescar sesión/semana reales tras el nuevo plan generado por el coach.
      const r = await fetch('/api/studio-data', { headers: { authorization: 'Bearer ' + token } });
      if (r.ok) {
        const j = await r.json();
        const o = j && j.ok ? j.overrides : null;
        if (o) { if (o.todaySession) D.todaySession = o.todaySession; if (o.week) D.week = o.week; if (o.library) D.library = o.library; }
      }
      setGen((g) => g + 1);
      setGenStatus('ok');
    } catch (e) { setGenStatus('err'); }
  }

  return (
    <div className="page stagger screen-enter">
      <div className="page-head">
        <div>
          <p className="eyebrow">Entrenamiento · Semana 6</p>
          <h1>Entreno</h1>
          <p className="sub">Tu sesión guiada, el plan de la semana y vídeos para perfeccionar la técnica.</p>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
          <button className="btn" onClick={regenerate} disabled={genStatus === 'loading'}>
            <Icon name="sparkles" size={16} /> {genStatus === 'loading' ? 'Creando bloque…' : 'Nuevo bloque (21 días)'}
          </button>
          {genStatus === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo regenerar. Reintenta.</span> : null}
          {genStatus === 'noauth' ? <span className="tiny muted">Inicia sesión para regenerar.</span> : null}
          {genStatus === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Plan actualizado ✨</span> : null}
        </div>
      </div>
      <SegTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'sesion' && <TrainSession key={`s-${gen}`} />}
      {tab === 'semana' && <TrainWeek key={`w-${gen}`} />}
      {tab === 'videos' && <TrainVideos key={`v-${gen}`} />}
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
  const [busy, setBusy] = useStateTr(null); // 'all' | exerciseId | null
  const [reason, setReason] = useStateTr('variety');
  const [moreMin, setMoreMin] = useStateTr('');
  const done = list.filter((x) => x.done).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  const toggle = (i) => setList((p) => p.map((x, idx) => idx === i ? { ...x, done: !x.done } : x));

  async function refreshSession() {
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      const d = await fetch('/api/studio-data', { headers: token ? { authorization: 'Bearer ' + token } : {} });
      if (!d.ok) return;
      const j = await d.json();
      const o = j && j.ok ? j.overrides : null;
      if (o && o.todaySession) { D.todaySession = o.todaySession; setList(o.todaySession.list); }
      if (o) ['week', 'library', 'progress', 'glycemic', 'macroTargets'].forEach((k) => { if (o[k] != null) D[k] = o[k]; });
    } catch (e) { /* noop */ }
  }
  async function swap(scope, exerciseId) {
    setBusy(scope === 'all' ? 'all' : exerciseId);
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setBusy(null); return; }
      const r = await fetch('/api/studio-swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ scope, exerciseId, reason }),
      });
      if (r.ok) await refreshSession();
    } catch (e) { /* noop */ } finally { setBusy(null); }
  }
  async function extend() {
    setBusy('all');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setBusy(null); return; }
      const target = Number(moreMin) || ((s.durationMin || 60) + 30);
      const r = await fetch('/api/studio-swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ scope: 'all', reason: 'more_time', targetMinutes: target }),
      });
      if (r.ok) await refreshSession();
    } catch (e) { /* noop */ } finally { setBusy(null); }
  }
  const adjust = D.coachAdjust;
  const adjustVisible = adjust && Array.isArray(adjust.rules) && adjust.rules.length
    && (adjust.volumeFactor == null || adjust.volumeFactor !== 1);
  return (
    <React.Fragment>
      {/* Ajuste del coach: por qué cambió la carga (FC, fatiga, adherencia…) */}
      {adjustVisible ? (
        <div className="card" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
          <div className="row ac" style={{ gap: 10 }}>
            <span className="pill accent tiny"><Icon name="heart" size={12} /> Ajuste del coach{adjust.volumeFactor != null ? ` · volumen ×${adjust.volumeFactor}` : ''}</span>
          </div>
          <ul className="step-list" style={{ margin: '10px 0 0' }}>
            {adjust.rules.map((r, i) => <li key={i}><strong>{r.reason}</strong> {r.effect ? `— ${r.effect}` : ''}</li>)}
          </ul>
        </div>
      ) : null}

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

      {/* Prescripción de carrera (solo días de carrera) */}
      {s.runPrescription ? (() => {
        const rp = s.runPrescription;
        return (
          <SectionCard title="Tu sesión de carrera" icon="bolt" sub={rp.zoneLabel}>
            <div className="stack" style={{ gap: 12 }}>
              {rp.phaseLabel ? <span className="pill tiny" style={{ alignSelf: 'flex-start' }}>Fase: {rp.phaseLabel}</span> : null}
              {rp.targetPace ? (
                <div className="row ac wrap" style={{ gap: 8 }}>
                  <span className="pill accent"><Icon name="clock" size={13} /> Ritmo objetivo {rp.targetPace}</span>
                  {rp.targetRange ? <span className="pill tiny">{rp.targetRange}</span> : null}
                </div>
              ) : (
                <span className="pill tiny muted">Ritmo por sensación ({rp.zoneLabel}). Añade una marca en Perfil para ritmos en min/km.</span>
              )}
              <p style={{ margin: 0, lineHeight: 1.5, fontWeight: 600 }}>{rp.structure}</p>
              {Array.isArray(rp.drills) && rp.drills.length ? (
                <div>
                  <div className="mb-label">Calentamiento técnico</div>
                  <ul className="step-list">{rp.drills.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              ) : null}
              {rp.note ? <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>{rp.note}</p> : null}
            </div>
          </SectionCard>
        );
      })() : null}

      {/* Lista de ejercicios con vídeo */}
      <SectionCard title="Ejercicios" icon="list" sub="Toca el vídeo para ver la técnica · marca cada serie al terminar"
        action={(
          <div className="row ac wrap" style={{ gap: 6 }}>
            <select className="reason-select" value={reason} onChange={(e) => setReason(e.target.value)} title="Motivo del cambio">
              <option value="variety">Variar</option>
              <option value="time">Menos tiempo</option>
              <option value="more_time">Más tiempo</option>
              <option value="equipment">Otro equipo</option>
            </select>
            {reason === 'more_time' ? (
              <React.Fragment>
                <input className="text-input" type="number" min={(s.durationMin || 60) + 5} max="180" step="5"
                  style={{ width: 78 }} placeholder={`${(s.durationMin || 60) + 30}`}
                  value={moreMin} onChange={(e) => setMoreMin(e.target.value)} title="Minutos totales" />
                <button className="btn ghost sm" disabled={busy === 'all'} onClick={extend}>
                  <Icon name="plus" size={14} /> {busy === 'all' ? 'Ampliando…' : 'Ampliar sesión'}
                </button>
              </React.Fragment>
            ) : (
              <button className="btn ghost sm" disabled={busy === 'all'} onClick={() => swap('all', null)}>
                <Icon name="sparkles" size={14} /> {busy === 'all' ? 'Cambiando…' : 'Cambiar sesión'}
              </button>
            )}
          </div>
        )}>
        <div className="ex-list">
          {list.map((ex, i) => (
            <div key={i} className={`ex-row ${ex.done ? 'done' : ''}`}>
              <button className="ex-thumb" style={{ background: thumbBg(ex) }} onClick={(e) => { e.stopPropagation(); open(ex, e.currentTarget); }}>
                <span className="vid-play sm"><Icon name="play" size={14} /></span>
                <span className="vid-len">{ex.dur}</span>
              </button>
              <div className="ex-main" onClick={() => open(ex, null)} style={{ cursor: 'pointer' }}>
                <strong>{ex.name}</strong>
                <div className="ex-sub">{ex.muscle} · {ex.load}</div>
              </div>
              <div className="ex-sets">
                <span className="ex-scheme">{ex.scheme}</span>
                {ex.id ? (
                  <button className="ex-swap" title="Cambiar ejercicio" disabled={busy === ex.id} onClick={() => swap('one', ex.id)}>
                    <Icon name={busy === ex.id ? 'clock' : 'sparkles'} size={15} />
                  </button>
                ) : null}
                <button className="ex-check" onClick={() => toggle(i)}><Icon name="check" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Calentamiento y enfriamiento */}
      {(Array.isArray(s.warmup) && s.warmup.length) || (Array.isArray(s.cooldown) && s.cooldown.length) ? (
        <div className="grid g-2" style={{ alignItems: 'start' }}>
          {Array.isArray(s.warmup) && s.warmup.length ? (
            <SectionCard title="Calentamiento y movilidad" icon="bolt" sub="Antes de empezar — prepara articulaciones y activa">
              <div className="stack" style={{ gap: 10 }}>
                {s.warmup.map((w, i) => (
                  <div key={i} className="row ac" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <span className="cue-n">{w.min ? `${w.min}'` : '·'}</span>
                    <div><strong style={{ fontSize: '0.9rem' }}>{w.step}</strong>{w.details ? <div className="tiny muted" style={{ lineHeight: 1.4 }}>{w.details}</div> : null}</div>
                  </div>
                ))}
                <p className="tiny muted" style={{ margin: '2px 0 0', lineHeight: 1.5 }}>El calentamiento ya incluye una activación cardiovascular ligera; para un objetivo de fuerza no necesitas cardio adicional salvo que el coach lo indique.</p>
              </div>
            </SectionCard>
          ) : null}
          {Array.isArray(s.cooldown) && s.cooldown.length ? (
            <SectionCard title="Enfriamiento" icon="heart" sub="Al terminar — baja pulsaciones y estira">
              <div className="stack" style={{ gap: 10 }}>
                {s.cooldown.map((w, i) => (
                  <div key={i} className="row ac" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <span className="cue-n">{w.min ? `${w.min}'` : '·'}</span>
                    <div><strong style={{ fontSize: '0.9rem' }}>{w.step}</strong>{w.details ? <div className="tiny muted" style={{ lineHeight: 1.4 }}>{w.details}</div> : null}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}

      {/* Activación muscular */}
      <SectionCard title="Activación muscular" icon="target" sub="Qué trabaja la sesión de hoy">
        <div className="stack" style={{ gap: 14 }}>
          <MuscleMap primary={s.primaryMuscles} secondary={s.secondaryMuscles} />
          <div className="muscle-map-legend-inline" style={{ justifyContent: 'center' }}>
            <span><i className="legend-swatch primary" /> Primario</span>
            <span><i className="legend-swatch secondary" /> Secundario</span>
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
