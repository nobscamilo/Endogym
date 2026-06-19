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
// (CheckinCard retirada: el check-in unificado de la sesión vive ahora inline en TrainToday;
// se conservan Scale10 y CHECKIN_SYMPTOMS, que ese check-in reutiliza.)

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
  const [focusWarning, setFocusWarning] = useStateTr(''); // aviso clínico al convertir un día no-fuerza
  // #3 — molestias/agujetas por zona antes de cambiar de grupo (modula la sesión nueva).
  const [soreAreas, setSoreAreas] = useStateTr([]);
  const [soreNote, setSoreNote] = useStateTr('');
  const toggleSore = (a) => setSoreAreas((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]);
  const [logKg, setLogKg] = useStateTr({});
  const [logReps, setLogReps] = useStateTr({});
  // #5 — registro por serie (modo detallado opcional; el modo rápido por defecto = 1 valor/ejercicio).
  const [setMode, setSetMode] = useStateTr({}); // exId -> bool (detallado)
  const [setLogs, setSetLogs] = useStateTr({}); // exId -> [{ kg, reps, rir }]
  const toggleSetMode = (ex) => {
    const id = ex.id;
    if (!id) return;
    setSetLogs((sl) => (sl[id] ? sl : { ...sl, [id]: Array.from({ length: Math.max(1, Number(ex.sets) || 3) }, () => ({ kg: ex.loadKg != null ? String(ex.loadKg) : '', reps: ex.reps != null ? String(ex.reps) : '', rir: '' })) }));
    setSetMode((p) => ({ ...p, [id]: !p[id] }));
  };
  const updateSet = (id, i, field, val) => setSetLogs((sl) => {
    const arr = (sl[id] || []).slice();
    arr[i] = { ...(arr[i] || {}), [field]: val };
    return { ...sl, [id]: arr };
  });
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
        setFocusWarning(j.warning || '');
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
  // #2 — reprograma por intercambio: para un grupo bloqueado por adyacencia que el backend marca
  // como reprogramable, intercambia el foco con el día vecino (validado server-side).
  async function rescheduleFocus() {
    if (!focusTarget) return;
    setBusy('focus');
    setFocusStatus('saving');
    setFocusError('');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setFocusStatus('err'); setFocusError('Inicia sesión para reprogramar.'); return; }
      const r = await fetch('/api/studio-swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ scope: 'focus', action: 'reschedule', sessionFocus: focusTarget, soreAreas }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        await refreshSession();
        setFocusTarget('');
        setSoreNote([j.note, j.soreNote].filter(Boolean).join(' '));
        setFocusStatus('ok');
        setTimeout(() => setFocusStatus('idle'), 3500);
      } else {
        setFocusStatus('err');
        setFocusError(j.error || 'No se pudo reprogramar.');
      }
    } catch (e) {
      setFocusStatus('err');
      setFocusError('No se pudo reprogramar.');
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
        .filter((e) => e.loadKg != null && e.id)
        .map((e) => {
          // #5 — modo por serie: kg/reps/RIR por set → serie principal (top set) + setLogs + RPE
          // derivado del RIR (alimenta DAPRE/e1RM y detección de estancamiento).
          const detailed = setMode[e.id] && Array.isArray(setLogs[e.id]);
          if (detailed) {
            const logs = setLogs[e.id]
              .map((sx) => ({ weightKg: Number(sx.kg) || null, reps: Number(sx.reps) || null, rir: sx.rir === '' || sx.rir == null ? null : Number(sx.rir) }))
              .filter((sx) => sx.weightKg || sx.reps);
            if (logs.length) {
              const top = logs.reduce((a, b) => ((b.weightKg || 0) > (a.weightKg || 0) ? b : a), logs[0]);
              return {
                id: e.id, name: e.name,
                weightKg: top.weightKg, reps: top.reps, sets: logs.length,
                setLogs: logs, rir: top.rir,
                rpe: top.rir != null ? Math.max(1, Math.min(10, 10 - top.rir)) : (Number(logRpe) || null),
              };
            }
          }
          return {
            id: e.id, name: e.name,
            // Reps REALES (input del usuario; fallback a las prescritas).
            weightKg: Number(logKg[e.id] ?? e.loadKg) || null,
            reps: Number(logReps[e.id] ?? e.reps) || null,
            sets: e.sets ?? null,
          };
        })
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
  // El cambio de grupo se ofrece en CUALQUIER día con sesión: en días de fuerza/mixto cambia el
  // grupo; en días de cardio/carrera/recuperación CONVIERTE el día en una sesión de fuerza (con aviso).
  const canChangeSessionFocus = Array.isArray(s.list) && s.list.length > 0;
  const isFocusConversion = Boolean(s.focusConversion)
    || Boolean(s.runPrescription)
    || (s.sessionType && !['resistance', 'mixed'].includes(s.sessionType));
  // #1 — matriz de grupos disponibles/bloqueados (con motivo). Si el backend no la trae (datos
  // antiguos), caemos a las opciones simples marcando solo el foco actual.
  const focusOpts = (Array.isArray(s.focusOptions) && s.focusOptions.length)
    ? s.focusOptions
    : SESSION_FOCUS_CHOICES.map((c) => ({ id: c.id, label: c.label, current: c.id === s.focus, available: c.id !== s.focus, reason: c.id === s.focus ? 'Foco actual.' : null }));
  const focusBlocked = focusOpts.filter((o) => !o.current && o.available === false);
  const selectedFocusOpt = focusOpts.find((o) => o.id === focusTarget) || null;
  const selectedReschedule = Boolean(selectedFocusOpt && !selectedFocusOpt.current && selectedFocusOpt.available === false && selectedFocusOpt.canReschedule);
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
          {isFocusConversion ? (
            <p className="tiny" style={{ flexBasis: '100%', width: '100%', margin: '2px 0 0', color: 'var(--accent)', lineHeight: 1.45 }}>
              Hoy no es un día de fuerza. Elegir un grupo <strong>convertirá esta sesión en fuerza</strong>; puede afectar tu trabajo de cardio/carrera o tu recuperación de la semana.
            </p>
          ) : null}
          <div className="focus-sore" style={{ flexBasis: '100%', width: '100%', marginTop: 4 }}>
            <div className="mb-label" style={{ marginBottom: 6 }}>¿Molestias o agujetas hoy? <span className="tiny muted">(ajusta la sesión nueva)</span></div>
            <div className="chips">
              {SORE_AREA_CHOICES.map((a) => (
                <button key={a.id} type="button" className={`pill ${soreAreas.includes(a.id) ? 'accent' : ''}`} onClick={() => toggleSore(a.id)}>{a.label}</button>
              ))}
            </div>
          </div>
          <div className="focus-groups" style={{ flexBasis: '100%', width: '100%' }}>
            <div className="mb-label" style={{ marginBottom: 6 }}>Elegir grupo</div>
            <div className="chips">
              {focusOpts.map((opt) => {
                const blocked = !opt.current && opt.available === false;
                const reschedulable = blocked && opt.canReschedule;
                const disabled = opt.current || (blocked && !reschedulable);
                return (
                  <button key={opt.id} type="button"
                    className={`pill ${focusTarget === opt.id ? 'accent' : ''}`}
                    disabled={disabled}
                    style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : null}
                    title={opt.reason || opt.compatibilityNote || ''}
                    onClick={() => setFocusTarget(opt.id)}>
                    {opt.label}{opt.current ? ' · actual' : (reschedulable ? ' 🔁' : (blocked ? ' 🔒' : ''))}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="focus-switch-actions">
            {selectedReschedule ? (
              <button className="btn ghost sm" disabled={busy === 'focus'} onClick={rescheduleFocus}>
                <Icon name="sparkles" size={14} /> {busy === 'focus' ? 'Reprogramando…' : `Reprogramar (intercambiar con ${selectedFocusOpt.rescheduleWith || 'la sesión vecina'})`}
              </button>
            ) : (
              <button className="btn ghost sm" disabled={!focusTarget || busy === 'focus' || (selectedFocusOpt && selectedFocusOpt.available === false)} onClick={changeFocus}>
                <Icon name="target" size={14} /> {busy === 'focus' ? 'Cambiando…' : 'Cambiar grupo'}
              </button>
            )}
          </div>
          {focusBlocked.length ? (
            <div className="stack" style={{ gap: 2, marginTop: 2, flexBasis: '100%' }}>
              {focusBlocked.map((o) => (
                <span key={o.id} className="tiny muted">
                  {o.canReschedule ? '🔁' : '🔒'} {o.label}: {o.reason || 'no disponible esta semana'}{o.canReschedule ? ` — puedes reprogramar con ${o.rescheduleWith || 'la vecina'}` : ''}
                </span>
              ))}
            </div>
          ) : null}
          {focusStatus === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Sesión ajustada.</span> : null}
          {focusStatus === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>{focusError}</span> : null}
          {focusWarning ? <span className="tiny" style={{ color: 'var(--accent)', flexBasis: '100%' }}>{focusWarning}</span> : null}
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
          {list.map((ex, i) => {
            const detailed = ex.id && setMode[ex.id];
            return (
            <React.Fragment key={i}>
            <div className={`ex-row ${ex.done ? 'done' : ''}`}>
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
                {ex.loadKg != null && !detailed ? (
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
                {ex.loadKg != null && ex.id ? (
                  <button className="ex-swap" title={detailed ? 'Volver a modo rápido' : 'Registrar por serie (kg · reps · RIR)'}
                    style={detailed ? { color: 'var(--accent)' } : null} onClick={() => toggleSetMode(ex)}>
                    <Icon name="list" size={15} />
                  </button>
                ) : null}
                {ex.id ? (
                  <button className="ex-swap" title="Cambiar ejercicio" disabled={busy === ex.id} onClick={() => swap('one', ex.id)}>
                    <Icon name={busy === ex.id ? 'clock' : 'sparkles'} size={15} />
                  </button>
                ) : null}
                <button className="ex-check" onClick={() => toggle(i)}><Icon name="check" size={16} /></button>
              </div>
            </div>
            {detailed && Array.isArray(setLogs[ex.id]) ? (
              <div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 10, margin: '0 0 8px' }}>
                <div className="row ac between" style={{ marginBottom: 6 }}>
                  <span className="tiny muted">Por serie · kg · reps · RIR (reps en reserva)</span>
                </div>
                {setLogs[ex.id].map((st, si) => (
                  <div key={si} className="row ac" style={{ gap: 8, marginBottom: 6 }}>
                    <span className="tiny muted" style={{ width: 54 }}>Serie {si + 1}</span>
                    <input className="text-input" type="number" min="0" step="2.5" style={{ width: 64 }} placeholder="kg" title="kg" value={st.kg} onChange={(e) => updateSet(ex.id, si, 'kg', e.target.value)} />
                    <input className="text-input" type="number" min="0" max="50" style={{ width: 52 }} placeholder="reps" title="reps" value={st.reps} onChange={(e) => updateSet(ex.id, si, 'reps', e.target.value)} />
                    <input className="text-input" type="number" min="0" max="10" style={{ width: 52 }} placeholder="RIR" title="Reps en reserva (RIR)" value={st.rir} onChange={(e) => updateSet(ex.id, si, 'rir', e.target.value)} />
                  </div>
                ))}
                <button className="btn ghost sm" onClick={() => setSetLogs((sl) => ({ ...sl, [ex.id]: [...(sl[ex.id] || []), { kg: '', reps: '', rir: '' }] }))}>
                  <Icon name="plus" size={12} /> Añadir serie
                </button>
              </div>
            ) : null}
            </React.Fragment>
            );
          })}
        </div>
        <p className="tiny muted" style={{ margin: '12px 0 0', lineHeight: 1.5 }}>Anota la carga real (kg) y las reps de cada ejercicio. Toca <Icon name="list" size={12} /> para registrar <strong>por serie</strong> (kg · reps · RIR) y afinar la progresión; abajo, en el check-in, lo guardas todo de una vez.</p>
      </SectionCard>

      {/* #6 — Por qué de tu sesión (explicación determinista; base científica vía coach) */}
      {s.rationale ? (
        <SectionCard title="Por qué de tu sesión" icon="sparkles" sub="Cómo decidimos volumen, carga y selección con tus datos">
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><span className="pill tiny" style={{ flexShrink: 0 }}>Volumen</span><span className="tiny" style={{ lineHeight: 1.5 }}>{s.rationale.volume}</span></div>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><span className="pill tiny" style={{ flexShrink: 0 }}>Carga</span><span className="tiny" style={{ lineHeight: 1.5 }}>{s.rationale.load}</span></div>
            {s.rationale.selection ? <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}><span className="pill tiny" style={{ flexShrink: 0 }}>Selección</span><span className="tiny" style={{ lineHeight: 1.5 }}>{s.rationale.selection}</span></div> : null}
            {s.rationale.note ? <p className="tiny muted" style={{ margin: '2px 0 0', lineHeight: 1.5 }}>{s.rationale.note}</p> : null}
            <RationaleSources />
          </div>
        </SectionCard>
      ) : null}

      {/* Recomendaciones pre/post entreno (deterministas, con límites clínicos) */}
      {s.nutritionAround ? (
        <SectionCard title="Antes y después de entrenar" icon="nutrition" sub="Cómo alimentarte alrededor de la sesión">
          <div className="grid g-2" style={{ alignItems: 'start', gap: 12 }}>
            <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
              <span className="pill tiny accent" style={{ marginBottom: 8 }}>Antes</span>
              <ul className="step-list" style={{ margin: 0 }}>
                {s.nutritionAround.pre.items.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
              {s.nutritionAround.pre.caution ? <p className="tiny" style={{ color: 'var(--glu-high)', margin: '8px 0 0', lineHeight: 1.45 }}>{s.nutritionAround.pre.caution}</p> : null}
            </div>
            <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
              <span className="pill tiny accent" style={{ marginBottom: 8 }}>Después</span>
              <ul className="step-list" style={{ margin: 0 }}>
                {s.nutritionAround.post.items.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
              {s.nutritionAround.post.caution ? <p className="tiny" style={{ color: 'var(--glu-high)', margin: '8px 0 0', lineHeight: 1.45 }}>{s.nutritionAround.post.caution}</p> : null}
            </div>
          </div>
          {s.nutritionAround.note ? <p className="tiny muted" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>{s.nutritionAround.note}</p> : null}
        </SectionCard>
      ) : null}

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

      {/* Registro retroactivo: registrar/editar la sesión de un día previo (hasta 14 días),
          partiendo del plan prescrito de ese día. Independiente de Strava. */}
      <PastSessionLogger />
    </React.Fragment>
  );
}

/* ---------- REGISTRAR OTRO DÍA (registro retroactivo) ---------- */
// Permite registrar o editar la sesión de un día pasado (hasta 14 días) sin tocar el flujo del
// día actual: trae el plan prescrito de esa fecha (GET /api/session-for-date), prefija las cargas
// del plan (o del registro existente si ya hay) y guarda con la fecha correcta. El doc manual usa
// id determinista `manual-{fecha}` → reeditar reemplaza en vez de duplicar; la fusión por día del
// backend lo une con lo de Strava/check-in.
const PAST_MAX_BACK_DAYS = 14;
function backlogDateOptions(maxBack = PAST_MAX_BACK_DAYS) {
  const opts = [];
  for (let i = 1; i <= maxBack; i++) {
    const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const d = new Date(key + 'T12:00:00.000Z');
    const long = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const cap = long.charAt(0).toUpperCase() + long.slice(1);
    opts.push({ value: key, label: i === 1 ? `Ayer · ${cap}` : cap });
  }
  return opts;
}

function PastSessionLogger() {
  const [open, setOpen] = useStateTr(false);
  const [dateOpts] = useStateTr(() => backlogDateOptions());
  const [date, setDate] = useStateTr(dateOpts[0].value);
  const [load, setLoad] = useStateTr('idle'); // idle|loading|loaded|err
  const [session, setSession] = useStateTr(null);
  const [isTraining, setIsTraining] = useStateTr(false);
  const [existing, setExisting] = useStateTr(null);
  const [rows, setRows] = useStateTr([]); // [{id,name,sets,loadKg,kg,reps}]
  const [completed, setCompleted] = useStateTr(true);
  const [rpe, setRpe] = useStateTr(7);
  const [fatigue, setFatigue] = useStateTr(4);
  const [sleepHours, setSleepHours] = useStateTr(7.5);
  const [symptoms, setSymptoms] = useStateTr({ dyspnea: false, jointPain: false, dizziness: false, tachycardia: false });
  const [save, setSave] = useStateTr('idle'); // idle|saving|ok|err
  const [err, setErr] = useStateTr('');
  const toggleSym = (k) => setSymptoms((p) => ({ ...p, [k]: !p[k] }));
  const updateRow = (i, field, val) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));

  async function loadDate(d) {
    setLoad('loading'); setErr(''); setSave('idle');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setLoad('err'); setErr('Inicia sesión para registrar.'); return; }
      const r = await fetch('/api/session-for-date?date=' + encodeURIComponent(d), { headers: { authorization: 'Bearer ' + token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setLoad('err'); setErr(j.error || 'No se pudo cargar la sesión de esa fecha.'); return; }
      const sess = j.session || null;
      const planEx = sess && Array.isArray(sess.list) ? sess.list : [];
      const loggedLifts = j.logged && Array.isArray(j.logged.lifts) ? j.logged.lifts : [];
      const findLog = (it) => loggedLifts.find((l) => (it.id && l.id === it.id) || l.name === it.name) || null;
      const newRows = planEx.map((it) => {
        const lg = findLog(it);
        return {
          id: it.id || null, name: it.name, sets: it.sets ?? null, loadKg: it.loadKg ?? null,
          kg: lg && lg.kg != null ? String(lg.kg) : (it.loadKg != null ? String(it.loadKg) : ''),
          reps: lg && lg.reps != null ? String(lg.reps) : (it.reps != null ? String(it.reps) : ''),
        };
      });
      // Cargas registradas que no estén en el plan de ese día (p. ej. ejercicios libres) → se conservan.
      loggedLifts.forEach((l) => {
        if (!newRows.some((rw) => (l.id && rw.id === l.id) || rw.name === l.name)) {
          newRows.push({ id: l.id || null, name: l.name, sets: l.sets ?? null, loadKg: null, kg: l.kg != null ? String(l.kg) : '', reps: l.reps != null ? String(l.reps) : '' });
        }
      });
      setSession(sess); setIsTraining(Boolean(j.isTrainingDay)); setExisting(j.logged || null); setRows(newRows);
      if (j.logged) {
        setCompleted(j.logged.completed !== false);
        setRpe(j.logged.sessionRpe != null ? j.logged.sessionRpe : 7);
        setFatigue(j.logged.fatigue != null ? j.logged.fatigue : 4);
        setSleepHours(j.logged.sleepHours != null ? j.logged.sleepHours : 7.5);
        const sy = j.logged.symptoms || {};
        setSymptoms({ dyspnea: !!sy.dyspnea, jointPain: !!sy.jointPain, dizziness: !!sy.dizziness, tachycardia: !!sy.tachycardia });
      } else {
        setCompleted(true); setRpe(7); setFatigue(4); setSleepHours(7.5);
        setSymptoms({ dyspnea: false, jointPain: false, dizziness: false, tachycardia: false });
      }
      setLoad('loaded');
    } catch (e) { setLoad('err'); setErr('No se pudo cargar la sesión de esa fecha.'); }
  }

  function expand() { setOpen(true); if (load === 'idle') loadDate(date); }
  function onPickDate(d) { setDate(d); loadDate(d); }

  async function logPast() {
    setSave('saving'); setErr('');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setSave('err'); setErr('Inicia sesión para registrar.'); return; }
      const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
      const performedAt = date + 'T12:00:00.000Z';
      const title = (session && session.title) || 'Sesión';
      const exercises = rows
        .map((rw) => {
          const ex = { name: rw.name, weightKg: Number(rw.kg) || null, reps: Number(rw.reps) || null, sets: rw.sets ?? null };
          if (rw.id) ex.id = rw.id;
          return ex;
        })
        .filter((e) => e.name && e.weightKg);
      // 1) Cargas (manual idempotente por día) — solo si completada y con cargas.
      let okManual = true;
      if (completed && exercises.length) {
        const r = await fetch('/api/workouts', {
          method: 'POST', headers,
          body: JSON.stringify({
            id: 'manual-' + date, source: 'manual', performedAt, title, mode: 'studio', completed: true,
            exercises, sessionRpe: Number(rpe) || null, durationMinutes: (session && session.durationMin) || null,
          }),
        });
        okManual = r.ok;
      }
      // 2) Check-in del día (idempotente por `daily-{fecha}`).
      const base = { source: 'daily_checkin', dailyCheckinDate: date, performedAt, symptoms, title, mode: 'studio' };
      const body = completed
        ? { ...base, completed: true, checkinSkipped: false, sessionRpe: Number(rpe) || null, fatigue: Number(fatigue) || null, sleepHours: Number(sleepHours) || null }
        : { ...base, completed: false, checkinSkipped: true, sessionRpe: null, fatigue: null, sleepHours: null };
      const rc = await fetch('/api/workouts', { method: 'POST', headers, body: JSON.stringify(body) });
      const ok = okManual && rc.ok;
      if (ok) { setSave('ok'); await loadDate(date); setSave('ok'); }
      else { setSave('err'); setErr('No se pudo guardar. Reintenta.'); }
    } catch (e) { setSave('err'); setErr('No se pudo guardar. Reintenta.'); }
  }

  const selectedLabel = (dateOpts.find((o) => o.value === date) || {}).label || date;

  return (
    <SectionCard title="Registrar otro día" icon="today" sub="¿Olvidaste registrar una sesión? Regístrala o edítala (hasta 14 días atrás)">
      {!open ? (
        <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={expand}>
          <Icon name="edit" size={14} /> Registrar un día pasado
        </button>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div>
            <div className="mb-label">Fecha</div>
            <select className="num-input" style={{ width: '100%', maxWidth: 320 }} value={date} onChange={(e) => onPickDate(e.target.value)}>
              {dateOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {load === 'loading' ? <span className="tiny muted">Cargando el plan de {selectedLabel}…</span> : null}
          {load === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>{err || 'No se pudo cargar.'}</span> : null}

          {load === 'loaded' ? (
            <React.Fragment>
              {existing ? <span className="pill accent" style={{ alignSelf: 'flex-start' }}>Editando el registro de ese día</span> : null}
              {isTraining && session ? (
                <p className="tiny muted" style={{ margin: 0 }}>Plan de ese día: <strong>{session.title}</strong>{session.durationMin ? ` · ${session.durationMin} min` : ''}. Ajusta las cargas reales si difieren.</p>
              ) : (
                <p className="tiny muted" style={{ margin: 0 }}>Ese día no tenía sesión de fuerza en tu plan. Puedes registrar el check-in (y las cargas si hiciste algo de fuerza).</p>
              )}

              {rows.length ? (
                <div className="stack" style={{ gap: 10 }}>
                  {rows.map((rw, i) => (
                    <div key={(rw.id || rw.name) + i} className="row ac between wrap" style={{ gap: 8 }}>
                      <strong style={{ fontSize: '0.9rem', flex: '1 1 140px' }}>{rw.name}</strong>
                      <div className="row ac" style={{ gap: 6 }}>
                        <input type="number" min="0" step="0.5" className="num-input" style={{ width: 78 }} placeholder="kg" value={rw.kg} onChange={(e) => updateRow(i, 'kg', e.target.value)} />
                        <span className="tiny muted">kg</span>
                        <input type="number" min="0" step="1" className="num-input" style={{ width: 64 }} placeholder="reps" value={rw.reps} onChange={(e) => updateRow(i, 'reps', e.target.value)} />
                        <span className="tiny muted">reps</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div>
                <div className="mb-label">¿Completaste la sesión?</div>
                <div className="segc" style={{ alignSelf: 'flex-start', maxWidth: 240 }}>
                  <div className="segc-thumb" style={{ left: `calc(4px + ${completed ? 0 : 1} * (100% - 8px) / 2)`, width: 'calc((100% - 8px) / 2)' }} />
                  <button className={completed ? 'on' : ''} onClick={() => setCompleted(true)}>Sí</button>
                  <button className={!completed ? 'on' : ''} onClick={() => setCompleted(false)}>No</button>
                </div>
              </div>
              {completed ? (
                <React.Fragment>
                  <div><div className="mb-label">Esfuerzo percibido (RPE) · {rpe}/10</div><Scale10 value={rpe} onChange={setRpe} /></div>
                  <div><div className="mb-label">Fatiga · {fatigue}/10</div><Scale10 value={fatigue} onChange={setFatigue} /></div>
                  <div className="row ac" style={{ gap: 12 }}>
                    <div className="mb-label" style={{ margin: 0 }}>Horas de sueño</div>
                    <input type="number" min="0" max="24" step="0.5" value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} className="num-input" />
                  </div>
                </React.Fragment>
              ) : null}
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
                <button className="btn" onClick={logPast} disabled={save === 'saving'}>
                  <Icon name="check" size={16} /> {save === 'saving' ? 'Guardando…' : (save === 'ok' ? 'Guardado ✓' : (existing ? 'Actualizar día' : 'Registrar día'))}
                </button>
                <button className="btn ghost sm" onClick={() => setOpen(false)}>Cerrar</button>
                {save === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>{err || 'No se pudo guardar. Reintenta.'}</span> : null}
              </div>
            </React.Fragment>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

/* ---------- SEMANA ---------- */
// #6 — Citas RAG reales bajo demanda para el "por qué". Pulsa para recuperar las fuentes de la
// biblioteca médica realmente usadas; si no hay, remite al coach (no inventa citas).
function RationaleSources() {
  const [state, setState] = useStateTr('idle'); // idle|loading|done|err
  const [sources, setSources] = useStateTr([]);
  async function load() {
    setState('loading');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      const r = await fetch('/api/session-rationale', { headers: token ? { authorization: 'Bearer ' + token } : {} });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { setSources(Array.isArray(j.sources) ? j.sources : []); setState('done'); }
      else setState('err');
    } catch (e) { setState('err'); }
  }
  return (
    <div style={{ marginTop: 4 }}>
      {state === 'idle' ? (
        <button className="btn ghost sm" onClick={load}><Icon name="list" size={14} /> Ver base científica (fuentes)</button>
      ) : null}
      {state === 'loading' ? <span className="tiny muted">Buscando fuentes en la biblioteca médica…</span> : null}
      {state === 'done' && sources.length ? (
        <div className="stack" style={{ gap: 2 }}>
          <span className="tiny muted">Fuentes recuperadas para tu prescripción:</span>
          {sources.map((src, i) => <span key={i} className="tiny" style={{ lineHeight: 1.4 }}>· {src}</span>)}
          <span className="tiny muted" style={{ marginTop: 2 }}>Para la justificación detallada con estas referencias, pregúntale al coach.</span>
        </div>
      ) : null}
      {state === 'done' && !sources.length ? <span className="tiny muted">No hay citas recuperables ahora mismo; pregúntale al coach para la justificación con referencias.</span> : null}
      {state === 'err' ? <span className="tiny muted">No se pudieron cargar las fuentes. Pregúntale al coach para la base científica.</span> : null}
    </div>
  );
}

// #7 — Revisión del mesociclo: si el bloque acumuló señales (muchos cambios de foco, edad,
// molestias/fatiga repetidas), propone regenerarlo en vez de seguir parcheándolo.
function MesocycleReviewCard({ review }) {
  const [status, setStatus] = useStateTr('idle'); // idle|loading|ok|err|noauth
  async function regen() {
    if (!window.confirm('Tu bloque acumuló varios ajustes. ¿Regenerarlo desde cero con tus datos actuales? (Para cambios pequeños usa "Cambiar sesión").')) return;
    setStatus('loading');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setStatus('noauth'); return; }
      const r = await fetch('/api/weekly-plan', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ rebuild: true }) });
      if (!r.ok) { setStatus('err'); return; }
      setStatus('ok');
      setTimeout(() => window.location.reload(), 700);
    } catch (e) { setStatus('err'); }
  }
  return (
    <div className="card" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
      <div className="row ac" style={{ gap: 10, marginBottom: 8 }}>
        <span className="pill accent tiny"><Icon name="sparkles" size={12} /> Revisión del bloque</span>
      </div>
      <p className="tiny" style={{ margin: '0 0 8px', lineHeight: 1.5 }}>Tu bloque acumuló señales de que conviene regenerarlo en vez de seguir parcheándolo:</p>
      <ul className="step-list" style={{ margin: '0 0 10px' }}>
        {review.reasons.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
      <div className="row ac wrap" style={{ gap: 10 }}>
        <button className="btn" onClick={regen} disabled={status === 'loading'}>
          <Icon name="sparkles" size={16} /> {status === 'loading' ? 'Regenerando…' : 'Regenerar bloque (21 días)'}
        </button>
        {status === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Plan actualizado ✨</span> : null}
        {status === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo. Reintenta.</span> : null}
        {status === 'noauth' ? <span className="tiny muted">Inicia sesión.</span> : null}
      </div>
    </div>
  );
}

function TrainWeek() {
  const D = window.STUDIO;
  const { week, progress } = D;
  const adjust = D.coachAdjust;
  const adjustRules = adjust && Array.isArray(adjust.rules) ? adjust.rules : [];
  const review = D.mesocycleReview;
  return (
    <React.Fragment>
      {review && Array.isArray(review.reasons) && review.reasons.length ? <MesocycleReviewCard review={review} /> : null}
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
