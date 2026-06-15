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

const SESSION_FOCUS_CHOICES = [
  { id: 'upper', label: 'Torso' },
  { id: 'push', label: 'Empuje' },
  { id: 'pull', label: 'Tracción' },
  { id: 'lower', label: 'Pierna' },
  { id: 'full_body', label: 'Full body' },
];
// #3 — zonas de molestias/agujetas para el check-in previo al cambio de grupo.
const SORE_AREA_CHOICES = [
  { id: 'leg', label: 'Pierna' },
  { id: 'torso', label: 'Torso' },
  { id: 'shoulder', label: 'Hombro' },
  { id: 'lumbar', label: 'Lumbar' },
];
const SESSION_FOCUS_LABELS = {
  upper: 'Torso',
  push: 'Empuje',
  pull: 'Tracción',
  lower: 'Pierna',
  lower_conditioning: 'Pierna',
  full_body: 'Full body',
  general_resistance: 'Fuerza',
  general_mixed: 'Mixto',
  cardio: 'Cardio',
  cardio_easy: 'Zona 2',
  cardio_long: 'Tirada larga',
  cardio_tempo: 'Tempo',
  cardio_intervals: 'Series',
  cardio_drills: 'Técnica',
  mindbody: 'Movilidad',
  recovery: 'Recuperación',
};
function sessionFocusLabel(value) {
  return SESSION_FOCUS_LABELS[value] || value || 'Sesión';
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
  const [focusTarget, setFocusTarget] = useStateTr('');
  const [focusStatus, setFocusStatus] = useStateTr('idle'); // idle|saving|ok|err
  const [focusError, setFocusError] = useStateTr('');
  // #3 — molestias/agujetas por zona antes de cambiar de grupo (modula la sesión nueva).
  const [soreAreas, setSoreAreas] = useStateTr([]);
  const [soreNote, setSoreNote] = useStateTr('');
  const toggleSore = (a) => setSoreAreas((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]);
  const [logKg, setLogKg] = useStateTr({});
  const [logReps, setLogReps] = useStateTr({});
  const [logStatus, setLogStatus] = useStateTr('idle'); // idle|saving|ok|err
  const [logRpe, setLogRpe] = useStateTr(7);
  const [autoStatus, setAutoStatus] = useStateTr('idle'); // idle|analyzing|done|limited|err
  const [autoAnalysis, setAutoAnalysis] = useStateTr(null); // { analysis, source }
  // Check-in UNIFICADO de la sesión (sustituye a la antigua tarjeta CheckinCard + el bloque
  // de RPE duplicado): completada + cargas + RPE + fatiga + sueño + síntomas en un solo guardado.
  const [completedSession, setCompletedSession] = useStateTr(true);
  const [fatigue, setFatigue] = useStateTr(4);
  const [sleepHours, setSleepHours] = useStateTr(7.5);
  const [symptoms, setSymptoms] = useStateTr({ dyspnea: false, jointPain: false, dizziness: false, tachycardia: false });
  const toggleSym = (k) => setSymptoms((p) => ({ ...p, [k]: !p[k] }));
  // Rehidratación: si HOY ya hay sesión registrada, mostramos el resumen en vez del formulario.
  const [loggedLocal, setLoggedLocal] = useStateTr(Boolean(s.logged));
  const [loggedSummary, setLoggedSummary] = useStateTr(s.loggedSummary || null);
  const [editingLog, setEditingLog] = useStateTr(false);
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
  async function changeFocus() {
    if (!focusTarget) return;
    setBusy('focus');
    setFocusStatus('saving');
    setFocusError('');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setFocusStatus('err'); setFocusError('Inicia sesión para cambiar el grupo.'); return; }
      const r = await fetch('/api/studio-swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ scope: 'focus', sessionFocus: focusTarget, soreAreas }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        await refreshSession();
        setFocusTarget('');
        setSoreNote(j.soreNote || '');
        setFocusStatus('ok');
        setTimeout(() => setFocusStatus('idle'), 2600);
      } else {
        setFocusStatus('err');
        setFocusError(j.error || 'No se pudo cambiar el grupo.');
      }
    } catch (e) {
      setFocusStatus('err');
      setFocusError('No se pudo cambiar el grupo.');
    } finally {
      setBusy(null);
    }
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
  // withCheckin=false → un-tap "Hecho según plan" (solo cargas prescritas).
  // withCheckin=true  → guardado unificado: cargas + RPE + fatiga + sueño + síntomas.
  async function logSession(withCheckin = false) {
    setLogStatus('saving');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setLogStatus('err'); return; }
      const today = new Date().toISOString().slice(0, 10);
      const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
      const exercises = list
        .filter((e) => e.loadKg != null)
        .map((e) => ({
          id: e.id || null,
          name: e.name,
          weightKg: Number(logKg[e.id] ?? e.loadKg) || null,
          // Reps REALES (input del usuario; fallback a las prescritas): habilitan e1RM y
          // detección de estancamiento en el análisis del coach.
          reps: Number(logReps[e.id] ?? e.reps) || null,
          sets: e.sets ?? null,
        }))
        .filter((e) => e.id && e.weightKg);
      const hasLoads = exercises.length > 0;
      // El un-tap exige cargas; el check-in unificado también vale para días sin cargas (carrera).
      if (!withCheckin && !hasLoads) { setLogStatus('err'); return; }

      let manualOk = true;
      let wid = null;
      // 1) Registro de cargas (e1RM/DAPRE + análisis del coach): solo si completada y con cargas.
      if (hasLoads && (!withCheckin || completedSession)) {
        const r = await fetch('/api/workouts', {
          method: 'POST', headers,
          body: JSON.stringify({
            source: 'manual', performedAt: `${today}T12:00:00.000Z`, title: (s.title || 'Sesión'),
            mode: 'studio', completed: true, exercises,
            sessionRpe: Number(logRpe) || null,
            durationMinutes: s.durationMin || null,
          }),
        });
        manualOk = r.ok;
        if (r.ok) { const j = await r.json().catch(() => ({})); wid = j && j.workout && j.workout.id; }
      }

      // 2) Check-in del día (solo en el guardado unificado): registra la sesión y el gate clínico.
      //    La fusión por día del backend colapsa este doc + el manual en UNA sola sesión.
      let checkinOk = true;
      if (withCheckin) {
        const base = { source: 'daily_checkin', dailyCheckinDate: today, performedAt: `${today}T12:00:00.000Z`, symptoms, title: (s.title || 'Sesión'), mode: 'studio' };
        const body = completedSession
          ? { ...base, completed: true, checkinSkipped: false, sessionRpe: Number(logRpe) || null, fatigue: Number(fatigue) || null, sleepHours: Number(sleepHours) || null }
          : { ...base, completed: false, checkinSkipped: true, sessionRpe: null, fatigue: null, sleepHours: null };
        const rc = await fetch('/api/workouts', { method: 'POST', headers, body: JSON.stringify(body) });
        checkinOk = rc.ok;
      }

      const ok = manualOk && checkinOk;
      setLogStatus(ok ? 'ok' : 'err');
      if (ok) {
        // Rehidratación local inmediata: la sesión queda como "registrada" sin recargar.
        setLoggedLocal(true);
        setEditingLog(false);
        setLoggedSummary({
          sources: [hasLoads && (!withCheckin || completedSession) ? 'manual' : null, withCheckin ? 'daily_checkin' : null].filter(Boolean),
          completed: withCheckin ? completedSession : true,
          sessionRpe: (!withCheckin || completedSession) ? (Number(logRpe) || null) : null,
          fatigue: (withCheckin && completedSession) ? (Number(fatigue) || null) : null,
          sleepHours: (withCheckin && completedSession) ? (Number(sleepHours) || null) : null,
          hasAlarmSymptoms: withCheckin ? Object.values(symptoms).some(Boolean) : false,
          lifts: exercises.map((e) => ({ name: e.name, kg: e.weightKg, reps: e.reps, sets: e.sets })),
        });
        if (!withCheckin) setTimeout(() => setLogStatus('idle'), 3000);
        // Análisis automático del coach (no bloquea el registro; cacheado en servidor).
        if (wid) {
          try {
            setAutoStatus('analyzing');
            const ra = await fetch('/api/workout-analysis', { method: 'POST', headers, body: JSON.stringify({ workoutId: wid }) });
            const ja = await ra.json().catch(() => ({}));
            if (ra.ok && ja.analysis) { setAutoAnalysis({ analysis: ja.analysis, source: ja.source }); setAutoStatus('done'); }
            else if (ra.status === 429) setAutoStatus('limited');
            else setAutoStatus('err');
          } catch (e2) { setAutoStatus('err'); }
        }
      }
    } catch (e) { setLogStatus('err'); }
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
  const canChangeSessionFocus = ['resistance', 'mixed'].includes(s.sessionType)
    || (!s.sessionType && !s.runPrescription && Array.isArray(s.list) && s.list.length);
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
            <p style={{ margin: '6px 0 0', opacity: 0.92, fontSize: '0.92rem' }}>{sessionFocusLabel(s.focus)} · {s.durationMin} min · {s.intensity}</p>
          </div>
          <div className="row ac wrap" style={{ gap: 8 }}>
            <button className="btn" style={{ background: '#fff', color: 'var(--accent-deep)', boxShadow: 'none', whiteSpace: 'nowrap' }}
              onClick={() => open(s.list[0], null)}><Icon name="play" size={17} /> Iniciar guiada</button>
            {/* FASE 3.1 — registro con UN TAP: crea el workout con los valores PRESCRITOS
                (kg/reps/duración del plan vigente); abajo solo se editan desviaciones. */}
            {s.sessionType !== 'aerobic' && Array.isArray(s.list) && s.list.some((e) => e.loadKg != null) ? (
              <button className="btn" disabled={logStatus === 'saving'}
                style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: '1px solid rgba(255,255,255,0.45)', boxShadow: 'none', whiteSpace: 'nowrap' }}
                title="Registra la sesión tal y como estaba prescrita (kg, reps y duración del plan). Si cambiaste algo, edítalo abajo antes de pulsar."
                onClick={() => logSession(false)}>
                <Icon name="check" size={16} /> {logStatus === 'saving' ? 'Registrando…' : (logStatus === 'ok' || loggedLocal) ? 'Registrada ✓' : 'Hecho según plan'}
              </button>
            ) : null}
          </div>
        </div>
        <div className="row ac between" style={{ marginTop: 22, marginBottom: 10 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.9, whiteSpace: 'nowrap' }}>{done}/{list.length} completados</span>
          <span className="num" style={{ fontSize: '0.8rem', fontWeight: 700 }}>{pct}%</span>
        </div>
        <div className="bar" style={{ background: 'rgba(255,255,255,0.25)' }}><i style={{ width: pct + '%', background: '#fff' }} /></div>
      </div>

      {canChangeSessionFocus ? (
        <div className="card focus-switch-card">
          <div className="focus-switch-copy">
            <span className="ico"><Icon name="target" size={18} /></span>
            <div>
              <strong>Grupo muscular</strong>
              <span>{sessionFocusLabel(s.focus)}</span>
            </div>
          </div>
          <div className="focus-sore" style={{ flexBasis: '100%', width: '100%', marginTop: 4 }}>
            <div className="mb-label" style={{ marginBottom: 6 }}>¿Molestias o agujetas hoy? <span className="tiny muted">(ajusta la sesión nueva)</span></div>
            <div className="chips">
              {SORE_AREA_CHOICES.map((a) => (
                <button key={a.id} type="button" className={`pill ${soreAreas.includes(a.id) ? 'accent' : ''}`} onClick={() => toggleSore(a.id)}>{a.label}</button>
              ))}
            </div>
          </div>
          <div className="focus-switch-actions">
            <select className="reason-select focus-select" value={focusTarget} onChange={(e) => setFocusTarget(e.target.value)} title="Grupo muscular">
              <option value="">Elegir grupo</option>
              {SESSION_FOCUS_CHOICES.map((option) => (
                <option key={option.id} value={option.id} disabled={option.id === s.focus}>
                  {option.label}{option.id === s.focus ? ' actual' : ''}
                </option>
              ))}
            </select>
            <button className="btn ghost sm" disabled={!focusTarget || busy === 'focus'} onClick={changeFocus}>
              <Icon name="target" size={14} /> {busy === 'focus' ? 'Cambiando…' : 'Cambiar grupo'}
            </button>
          </div>
          {focusStatus === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Sesión ajustada.</span> : null}
          {focusStatus === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>{focusError}</span> : null}
          {soreNote ? <span className="tiny" style={{ color: 'var(--accent)', flexBasis: '100%' }}>{soreNote}</span> : null}
        </div>
      ) : null}

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
              {/* El calentamiento técnico vive en la tarjeta única "Calentamiento y movilidad"
                  (protocolo dinámico por comorbilidades); aquí ya no se duplica. */}
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
                {ex.loadKg != null ? (
                  <React.Fragment>
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title="Carga usada (kg)">
                      <span className="tiny muted" style={{ fontSize: 10, lineHeight: 1 }}>kg</span>
                      <input className="text-input" type="number" min="0" step="2.5" style={{ width: 62 }}
                        placeholder={`${ex.loadKg}`}
                        value={logKg[ex.id] ?? ''} onChange={(e) => setLogKg((p) => ({ ...p, [ex.id]: e.target.value }))} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title="Reps reales por serie">
                      <span className="tiny muted" style={{ fontSize: 10, lineHeight: 1 }}>reps</span>
                      <input className="text-input" type="number" min="1" max="30" style={{ width: 52 }}
                        placeholder={ex.reps != null ? `${ex.reps}` : 'reps'}
                        value={logReps[ex.id] ?? ''} onChange={(e) => setLogReps((p) => ({ ...p, [ex.id]: e.target.value }))} />
                    </label>
                  </React.Fragment>
                ) : null}
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
        <p className="tiny muted" style={{ margin: '12px 0 0', lineHeight: 1.5 }}>Anota la carga real (kg) y las repeticiones de cada ejercicio; abajo, en el check-in, las guardas todas de una vez.</p>
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

      {/* Check-in UNIFICADO de la sesión: 1 solo check-in (sustituye a la antigua CheckinCard
          + el bloque de RPE duplicado). Si hoy ya está registrada, muestra el resumen. */}
      {loggedLocal && !editingLog ? (
        <SectionCard title="Sesión registrada" icon="check" sub="Hoy ya quedó guardada — el coach la usará para ajustar tu plan">
          <div className="stack" style={{ gap: 12 }}>
            <div className="chips">
              {loggedSummary?.completed === false ? <span className="pill">No completada</span> : <span className="pill accent">Completada</span>}
              {loggedSummary?.sessionRpe != null ? <span className="pill">RPE {loggedSummary.sessionRpe}</span> : null}
              {loggedSummary?.fatigue != null ? <span className="pill">Fatiga {loggedSummary.fatigue}</span> : null}
              {loggedSummary?.sleepHours != null ? <span className="pill">{loggedSummary.sleepHours} h sueño</span> : null}
            </div>
            {Array.isArray(loggedSummary?.lifts) && loggedSummary.lifts.length ? (
              <div className="stack" style={{ gap: 6 }}>
                {loggedSummary.lifts.map((lf, i) => (
                  <div key={i} className="row ac between">
                    <strong style={{ fontSize: '0.9rem' }}>{lf.name}</strong>
                    <span className="tiny muted">{lf.kg != null ? `${lf.kg} kg` : 'peso corporal'}{lf.reps != null ? ` × ${lf.reps} reps` : ''}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {loggedSummary?.hasAlarmSymptoms ? <p className="tiny" style={{ color: 'var(--glu-high)', margin: 0 }}>Marcaste síntomas de alarma: el coach priorizará seguridad.</p> : null}
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditingLog(true)}>
              <Icon name="edit" size={14} /> Editar registro
            </button>
            {autoStatus === 'analyzing' ? <span className="tiny muted">El coach está analizando tu sesión…</span> : null}
            {autoAnalysis ? <WorkoutAnalysisBlock analysis={autoAnalysis.analysis} source={autoAnalysis.source} /> : null}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="¿Cómo fue tu sesión?" icon="bolt" sub="Un solo check-in — guarda cargas y cómo te sentiste">
          <div className="stack" style={{ gap: 16 }}>
            <div>
              <div className="mb-label">¿Completaste la sesión?</div>
              <div className="segc" style={{ alignSelf: 'flex-start', maxWidth: 240 }}>
                <div className="segc-thumb" style={{ left: `calc(4px + ${completedSession ? 0 : 1} * (100% - 8px) / 2)`, width: 'calc((100% - 8px) / 2)' }} />
                <button className={completedSession ? 'on' : ''} onClick={() => setCompletedSession(true)}>Sí</button>
                <button className={!completedSession ? 'on' : ''} onClick={() => setCompletedSession(false)}>No</button>
              </div>
            </div>
            {completedSession && (
              <React.Fragment>
                {list.some((e) => e.loadKg != null) ? (
                  <p className="tiny muted" style={{ margin: 0, lineHeight: 1.45 }}>Las cargas (kg) y repeticiones que anotaste arriba en cada ejercicio se guardan con este check-in.</p>
                ) : null}
                <div><div className="mb-label">Esfuerzo percibido (RPE) · {logRpe}/10</div><Scale10 value={logRpe} onChange={setLogRpe} /></div>
                <div><div className="mb-label">Fatiga · {fatigue}/10</div><Scale10 value={fatigue} onChange={setFatigue} /></div>
                <div className="row ac" style={{ gap: 12 }}>
                  <div className="mb-label" style={{ margin: 0 }}>Horas de sueño</div>
                  <input type="number" min="0" max="24" step="0.5" value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} className="num-input" />
                </div>
              </React.Fragment>
            )}
            <div>
              <div className="mb-label">¿Algún síntoma? (seguridad)</div>
              <div className="chips">
                {CHECKIN_SYMPTOMS.map((sy) => (
                  <button key={sy.key} type="button" className={`pill ${symptoms[sy.key] ? 'accent' : ''}`} onClick={() => toggleSym(sy.key)}>{sy.label}</button>
                ))}
              </div>
              {Object.values(symptoms).some(Boolean) ? <p className="tiny" style={{ color: 'var(--glu-high)', margin: '8px 0 0' }}>El coach limitará la intensidad y recomendará valoración médica.</p> : null}
            </div>
            <div className="row ac wrap" style={{ gap: 12 }}>
              <button className="btn" onClick={() => logSession(true)} disabled={logStatus === 'saving'}>
                <Icon name="check" size={16} /> {logStatus === 'saving' ? 'Guardando…' : 'Guardar sesión'}
              </button>
              {logStatus === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo guardar. Reintenta.</span> : null}
            </div>
            {autoStatus === 'analyzing' ? (
              <div className="row ac" style={{ gap: 8 }}>
                <span className="cb-av sm"><Icon name="sparkles" size={13} /></span>
                <span className="tiny muted">El coach está analizando tu sesión…</span>
              </div>
            ) : null}
            {autoStatus === 'limited' ? <span className="tiny muted">Sesión registrada. El análisis del coach estará disponible en Progreso en un rato (límite temporal alcanzado).</span> : null}
            {autoAnalysis ? <WorkoutAnalysisBlock analysis={autoAnalysis.analysis} source={autoAnalysis.source} /> : null}
          </div>
        </SectionCard>
      )}
    </React.Fragment>
  );
}

/* ---------- SEMANA ---------- */
function TrainWeek() {
  const D = window.STUDIO;
  const { week, progress } = D;
  const adjust = D.coachAdjust;
  const adjustRules = adjust && Array.isArray(adjust.rules) ? adjust.rules : [];
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
        {adjustRules.length ? (
          <div className="grid g-2">
            {adjustRules.map((rule, i) => (
              <div key={rule.id || i} className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
                <strong style={{ fontSize: '0.92rem' }}>{rule.reason || rule.id || 'Ajuste aplicado'}</strong>
                <p className="tiny muted" style={{ margin: '6px 0 0', lineHeight: 1.45 }}>{rule.effect || adjust.summary || 'Ajuste automático registrado en el plan.'}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>No hay ajustes automáticos activos esta semana. Cuando el coach reduzca o aumente carga por fatiga, FC o adherencia, verás aquí el motivo.</p>
        )}
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
