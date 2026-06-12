/* ENDOGYM STUDIO — Pantallas PROGRESO + PERFIL */
const { useState: useStateP, useEffect: useEffectP } = React;

/* ============ PROGRESO ============ */

/* ---- Historial de entrenos: paginado, con detalle y análisis del coach por sesión ---- */
const RW_SOURCE = { app: 'App', checkin: 'Check-in', strava: 'Strava' };

function WorkoutAnalysisBlock({ analysis, source }) {
  return (
    <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent', padding: 12, marginTop: 8 }}>
      <div className="row between ac" style={{ marginBottom: 6 }}>
        <strong style={{ fontSize: '0.85rem' }}>Análisis del coach</strong>
        <span className="pill tiny">{source === 'heuristic' ? 'Resumen automático (sin IA)' : 'Coach IA'}</span>
      </div>
      <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.55 }}>{analysis.session}</p>
      {analysis.progression ? <p style={{ margin: '8px 0 0', fontSize: '0.88rem', lineHeight: 1.55 }}>{analysis.progression}</p> : null}
      {Array.isArray(analysis.tips) && analysis.tips.length ? (
        <div className="stack" style={{ gap: 4, marginTop: 8 }}>
          {analysis.tips.map((t, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent)', marginTop: 2 }}><Icon name="check" size={13} /></span>
              <span style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{t}</span>
            </div>
          ))}
        </div>
      ) : null}
      {analysis.warning ? <p className="tiny" style={{ margin: '8px 0 0', color: 'var(--glu-high)', lineHeight: 1.5 }}>{analysis.warning}</p> : null}
    </div>
  );
}

function HistoryItem({ w, onAnalyzed }) {
  const [open, setOpen] = useStateP(false);
  const [busy, setBusy] = useStateP(false);
  const [err, setErr] = useStateP(null);

  async function analyze() {
    if (!w.workoutId) return;
    setBusy(true); setErr(null);
    try {
      const t = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!t) { setErr('Inicia sesión.'); setBusy(false); return; }
      const r = await fetch('/api/workout-analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t },
        body: JSON.stringify({ workoutId: w.workoutId }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.analysis) onAnalyzed(w.workoutId, j.analysis, j.source);
      else if (r.status === 429) setErr('Límite de análisis alcanzado. Vuelve en un rato.');
      else setErr('No se pudo analizar. Reintenta.');
    } catch (e) { setErr('No se pudo analizar. Reintenta.'); }
    setBusy(false);
  }

  return (
    <div style={{ padding: '10px 4px', borderBottom: '1px solid var(--line)' }}>
      <div className="row between" style={{ gap: 10, cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: '0.9rem' }}>{w.title}</strong>
          <div className="tiny muted num">
            {w.date}{w.durationMin ? ` · ${w.durationMin} min` : ''}{w.distanceKm ? ` · ${w.distanceKm} km` : ''}{w.avgHr ? ` · FC ${w.avgHr}` : ''}{w.rpe != null ? ` · RPE ${w.rpe}` : ''}
          </div>
        </div>
        <div className="row ac" style={{ gap: 6 }}>
          {w.analysis ? <span className="pill tiny" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}><Icon name="sparkles" size={11} /> Analizada</span> : null}
          <span className="pill tiny">{RW_SOURCE[w.source] || w.source}</span>
        </div>
      </div>
      {open ? (
        <div style={{ marginTop: 6 }}>
          {Array.isArray(w.lifts) && w.lifts.length ? (
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              {w.lifts.map((l) => `${l.name} ${l.kg} kg${l.sets ? ` ×${l.sets}` : ''}`).join(' · ')}
            </div>
          ) : null}
          {(w.fatigue != null || w.sleepHours != null) ? (
            <div className="tiny muted num" style={{ marginTop: 4 }}>
              {w.fatigue != null ? `Fatiga ${w.fatigue}/10` : ''}{w.fatigue != null && w.sleepHours != null ? ' · ' : ''}{w.sleepHours != null ? `Sueño ${w.sleepHours} h` : ''}
            </div>
          ) : null}
          {w.analysis ? (
            <WorkoutAnalysisBlock analysis={w.analysis} source={w.analysisSource} />
          ) : w.workoutId ? (
            <div className="row ac wrap" style={{ gap: 10, marginTop: 8 }}>
              <button className="btn soft sm" onClick={(e) => { e.stopPropagation(); analyze(); }} disabled={busy}>
                <Icon name="sparkles" size={14} /> {busy ? 'Analizando…' : 'Analizar esta sesión'}
              </button>
              {err ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>{err}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RecentWorkoutsCard() {
  const D = window.STUDIO;
  // Placeholder instantáneo con lo que ya trae studio-data; el fetch lo sustituye con
  // workoutId + análisis cacheados y habilita la paginación.
  const seed = (Array.isArray(D.recentWorkouts) ? D.recentWorkouts : []).map((w) => ({ ...w, workoutId: null }));
  const [items, setItems] = useStateP(seed);
  const [hasMore, setHasMore] = useStateP(false);
  const [nextBefore, setNextBefore] = useStateP(null);
  const [loading, setLoading] = useStateP(false);

  async function token() { return window.__getIdToken ? window.__getIdToken() : Promise.resolve(null); }

  async function fetchPage(before) {
    const t = await token(); if (!t) return null;
    const qs = new URLSearchParams({ limit: '15' });
    if (before) qs.set('before', before);
    const r = await fetch('/api/workout-history?' + qs.toString(), { headers: { authorization: 'Bearer ' + t } });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  }

  useEffectP(() => {
    (async () => {
      const j = await fetchPage(null);
      if (j) { setItems(j.items); setHasMore(j.hasMore); setNextBefore(j.nextBefore); }
    })();
  }, []);

  async function loadMore() {
    setLoading(true);
    const j = await fetchPage(nextBefore);
    if (j) { setItems((p) => p.concat(j.items)); setHasMore(j.hasMore); setNextBefore(j.nextBefore); }
    setLoading(false);
  }

  function onAnalyzed(workoutId, analysis, source) {
    setItems((p) => p.map((w) => (w.workoutId === workoutId ? { ...w, analysis, analysisSource: source } : w)));
  }

  return (
    <SectionCard title="Historial de entrenos" icon="train" sub="Todas tus sesiones guardadas. Toca una para ver el detalle y pedir análisis del coach.">
      {items.length ? (
        <div className="stack" style={{ gap: 0 }}>
          {items.map((w, i) => <HistoryItem key={w.workoutId || `${w.date}-${i}`} w={w} onAnalyzed={onAnalyzed} />)}
          {hasMore ? (
            <button className="btn ghost sm" style={{ alignSelf: 'center', marginTop: 10 }} onClick={loadMore} disabled={loading}>
              {loading ? 'Cargando…' : 'Cargar más'}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="empty">Aún no hay entrenos registrados. Usa "Registrar sesión hecha" en Entreno o conecta Strava.</div>
      )}
    </SectionCard>
  );
}

/* ---- Análisis del coach: último entreno, tendencia y próximos ajustes ---- */
function CoachAnalysisCard() {
  const [state, setState] = useStateP({ phase: 'loading', report: null, source: null, stale: false, generatedAt: null });
  const [busy, setBusy] = useStateP(false);

  async function token() { return window.__getIdToken ? window.__getIdToken() : Promise.resolve(null); }

  async function load() {
    try {
      const t = await token(); if (!t) { setState((s) => ({ ...s, phase: 'noauth' })); return; }
      const r = await fetch('/api/coach-analysis', { headers: { authorization: 'Bearer ' + t } });
      if (!r.ok) { setState((s) => ({ ...s, phase: 'err' })); return; }
      const j = await r.json();
      if (j.empty || !j.report) { setState({ phase: 'empty', report: null, source: null, stale: false, generatedAt: null }); return; }
      setState({ phase: 'ready', report: j.report, source: j.source, stale: Boolean(j.stale), generatedAt: j.generatedAt });
    } catch (e) { setState((s) => ({ ...s, phase: 'err' })); }
  }

  async function generate() {
    setBusy(true);
    try {
      const t = await token(); if (!t) { setBusy(false); return; }
      const r = await fetch('/api/coach-analysis', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t } });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.report) setState({ phase: 'ready', report: j.report, source: j.source, stale: false, generatedAt: j.generatedAt });
      else if (r.ok && j.empty) setState({ phase: 'empty', report: null, source: null, stale: false, generatedAt: null });
      else setState((s) => ({ ...s, phase: s.report ? 'ready' : 'err' }));
    } catch (e) { setState((s) => ({ ...s, phase: s.report ? 'ready' : 'err' })); }
    setBusy(false);
  }

  useEffectP(() => { load(); }, []);

  const rep = state.report;
  const srcLabel = state.source === 'heuristic' ? 'Resumen automático (sin IA)' : 'Coach IA';
  return (
    <SectionCard title="Análisis del coach" icon="sparkles"
      sub="Qué dice el coach de tu último entreno y cómo ajustará los siguientes"
      action={rep ? <span className="pill tiny">{srcLabel}</span> : null}>
      {state.phase === 'loading' ? <div className="empty">Cargando análisis…</div> : null}
      {state.phase === 'noauth' ? <div className="empty">Inicia sesión para ver tu análisis.</div> : null}
      {state.phase === 'err' && !rep ? <div className="empty">No se pudo cargar el análisis. Reintenta más tarde.</div> : null}
      {state.phase === 'empty' ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="empty">Aún no hay análisis. Cuando registres un entreno (o sincronices Strava), el coach lo analizará aquí.</div>
          <button className="btn" onClick={generate} disabled={busy}><Icon name="sparkles" size={16} /> {busy ? 'Analizando…' : 'Analizar mis entrenos'}</button>
        </div>
      ) : null}
      {rep ? (
        <div className="stack" style={{ gap: 14 }}>
          {state.stale ? (
            <div className="row ac wrap" style={{ gap: 10 }}>
              <span className="tiny" style={{ color: 'var(--glu-mid)' }}>Tienes entrenos nuevos sin analizar.</span>
              <button className="btn soft sm" onClick={generate} disabled={busy}><Icon name="sparkles" size={14} /> {busy ? 'Analizando…' : 'Actualizar análisis'}</button>
            </div>
          ) : null}
          <div>
            <div className="mb-label">Tu último entreno</div>
            <p style={{ margin: 0, lineHeight: 1.55, fontSize: '0.92rem' }}>{rep.lastSession}</p>
          </div>
          {rep.history ? (
            <div>
              <div className="mb-label">Cómo vas (últimas semanas)</div>
              <p style={{ margin: 0, lineHeight: 1.55, fontSize: '0.92rem' }}>{rep.history}</p>
            </div>
          ) : null}
          {Array.isArray(rep.adjustments) && rep.adjustments.length ? (
            <div>
              <div className="mb-label">Próximas sesiones: qué voy a ajustar</div>
              <div className="stack" style={{ gap: 6 }}>
                {rep.adjustments.map((a, i) => (
                  <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--accent)', marginTop: 2 }}><Icon name="check" size={14} /></span>
                    <span style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {rep.warning ? (
            <p className="tiny" style={{ margin: 0, color: 'var(--glu-high)', lineHeight: 1.5 }}>{rep.warning}</p>
          ) : null}
          <div className="row ac wrap between" style={{ gap: 10 }}>
            <span className="tiny muted">{state.generatedAt ? `Generado: ${String(state.generatedAt).slice(0, 16).replace('T', ' ')}` : ''}</span>
            <span className="row ac" style={{ gap: 8 }}>
              {/* FASE 3.4 — feedback del análisis (clave por contenido del informe) */}
              <CoachFeedback key={state.generatedAt || 'fb'} endpoint="coach-analysis" text={`${rep.lastSession || ''}|${rep.history || ''}`} />
              {!state.stale ? <button className="btn ghost sm" onClick={generate} disabled={busy}><Icon name="sparkles" size={14} /> {busy ? 'Analizando…' : 'Re-analizar'}</button> : null}
            </span>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

/* Objetivo SMART: meta + fecha + predicción determinista (override D.goalProgress) */
function GoalProgressCard() {
  const gp = window.STUDIO.goalProgress;
  if (!gp || gp.targetValue == null) return null;
  return (
    <SectionCard title="Tu objetivo" icon="target" sub={gp.label}>
      <div className="tiles">
        <div className="tile"><div className="t-num num">{gp.targetValue}</div><div className="t-lbl">Meta ({gp.unit})</div></div>
        <div className="tile"><div className="t-num num">{gp.currentValue != null ? gp.currentValue : '—'}</div><div className="t-lbl">Actual</div></div>
        <div className="tile"><div className="t-num num">{gp.trendPerWeek != null ? `${gp.trendPerWeek > 0 ? '+' : ''}${gp.trendPerWeek}` : '—'}</div><div className="t-lbl">{gp.unit}/sem</div></div>
      </div>
      <div className="row ac" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {gp.targetDate ? <span className="pill tiny">Fecha: {gp.targetDate}</span> : null}
        {gp.predictedDate ? <span className="pill tiny">A este ritmo: {gp.predictedDate}</span> : null}
        {gp.onTrack != null ? <span className={`pill tiny ${gp.onTrack ? 'good' : ''}`}>{gp.onTrack ? 'En camino ✅' : 'Por detrás de tu fecha'}</span> : null}
      </div>
      {gp.note ? <p className="tiny muted" style={{ marginTop: 8 }}>{gp.note}</p> : null}
    </SectionCard>
  );
}

function ProgressScreen() {
  const D = window.STUDIO;
  const p = D.progress || {};
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const [ask, setAsk] = useStateP(false);

  const rec = Number.isFinite(p.recovery) ? p.recovery : null;
  const strain = Array.isArray(p.strain) ? p.strain : [];
  const hasStrain = strain.some((v) => v > 0);
  const strainTotal = strain.reduce((a, b) => a + (Number(b) || 0), 0);
  const strainDays = strain.filter((v) => v > 0).length;
  const ws = Array.isArray(p.weightSeries) ? p.weightSeries : [];
  const mv = (Array.isArray(p.muscleVolume) ? p.muscleVolume : []).filter((m) => m.v > 0);
  const pr = Array.isArray(p.pr) ? p.pr : [];
  const fmt = (n) => (n == null ? '—' : String(n).replace('.', ','));

  return (
    <div className="page stagger screen-enter">
      <div className="page-head">
        <div>
          <p className="eyebrow">Progreso</p>
          <h1>Tu evolución</h1>
          <p className="sub">Recuperación, carga y fuerza en un mismo sitio. Los datos que mueven tu plan.</p>
        </div>
      </div>

      <CoachBanner screen="progress" ask onAsk={() => setAsk(true)} />

      {/* Objetivo SMART: meta, actual, tendencia y predicción */}
      <GoalProgressCard />

      {/* Análisis del coach: último entreno, tendencia y próximos ajustes */}
      <CoachAnalysisCard />

      {/* Historial visible de entrenos realizados */}
      <RecentWorkoutsCard />

      {/* Forma aeróbica (corredores): eficiencia ritmo/FC y predicción de carrera */}
      {D.runFitness ? (
        <SectionCard title="Forma aeróbica" icon="heart" sub="Calculada con tus carreras reales de Strava (ritmo y FC)">
          <div className="row wrap" style={{ gap: 18 }}>
            {D.runFitness.efficiency ? (
              <div>
                <div className="mb-label">Eficiencia (m/min por ppm)</div>
                <Stat num={String(D.runFitness.efficiency.recentEf).replace('.', ',')}
                  label={`${D.runFitness.efficiency.trendPct >= 0 ? '↑ +' : '↓ '}${String(D.runFitness.efficiency.trendPct).replace('.', ',')}% vs tu base (${D.runFitness.efficiency.runsUsed} carreras)`}
                  color={D.runFitness.efficiency.trendPct >= 0 ? 'var(--glu-good)' : 'var(--glu-mid)'} />
                <p className="tiny muted" style={{ margin: '6px 0 0', maxWidth: 320, lineHeight: 1.45 }}>Si corres igual de rápido con menos pulso, tu base aeróbica mejora.</p>
              </div>
            ) : null}
            {D.runFitness.prediction ? (
              <div>
                <div className="mb-label">Predicción {D.runFitness.prediction.goal}</div>
                <Stat num={D.runFitness.prediction.time} label={`Basada en tu ${D.runFitness.prediction.basedOn.distanceKm} km del ${D.runFitness.prediction.basedOn.date}`} color="var(--accent)" />
                <p className="tiny muted" style={{ margin: '6px 0 0', maxWidth: 320, lineHeight: 1.45 }}>Fórmula de Riegel sobre tu mejor esfuerzo reciente; mejora con cada carrera de calidad que registres.</p>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {/* Validación de zonas (corredores con Strava) */}
      {D.runZones && Array.isArray(D.runZones.items) && D.runZones.items.length ? (
        <SectionCard title="Validación de zonas" icon="heart" sub={`Comparo tu FC real con la zona prescrita · FCmáx ~${D.runZones.hrMax} ppm`}>
          <div className="stack" style={{ gap: 8 }}>
            {D.runZones.items.map((r, i) => {
              const color = r.verdict === 'too_hard' ? 'var(--glu-high)' : r.verdict === 'too_easy' ? 'var(--glu-mid)' : 'var(--glu-good)';
              return (
                <div key={i} className="row between" style={{ padding: '10px 4px', borderBottom: i < D.runZones.items.length - 1 ? '1px solid var(--line)' : 'none', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: '0.9rem' }}>{r.title}</strong>
                    <div className="tiny muted num">{r.date} · {r.avgHr} ppm{r.target ? ` · objetivo ${r.target}` : ''}</div>
                    {r.message ? <div className="tiny" style={{ marginTop: 4, lineHeight: 1.45, color }}>{r.message}</div> : null}
                  </div>
                  {r.zone ? <span className="pill tiny" style={{ borderColor: color, color }}>Z{r.zone}{r.pct ? ` · ${r.pct}%` : ''}</span> : null}
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      {/* Recuperación + carga */}
      <div className="grid g-2" style={{ gridTemplateColumns: '0.85fr 1.15fr' }}>
        <div className="card lg" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="mb-label" style={{ alignSelf: 'flex-start' }}>Recuperación hoy</div>
          {rec != null ? (
            <React.Fragment>
              <Arc value={rec} max={100} size={220} stroke={18} color="var(--d-recover)">
                <div><div className="a-num num">{rec}<span style={{ fontSize: '0.4em', color: 'var(--ink-3)' }}>%</span></div><div className="a-lbl">{rec >= 66 ? 'Buena' : rec >= 40 ? 'Media' : 'Baja'}</div></div>
              </Arc>
              <p className="muted tiny" style={{ textAlign: 'center', margin: '4px 0 0', lineHeight: 1.5 }}>Estimación a partir de tu último check-in (sueño y fatiga).</p>
            </React.Fragment>
          ) : (
            <div className="empty" style={{ padding: '40px 10px' }}>Haz tu check-in diario en Entreno para estimar tu recuperación.</div>
          )}
        </div>

        <SectionCard title="Carga semanal" icon="bolt" sub="Esfuerzo (RPE) por día de tus check-ins">
          {hasStrain ? (
            <React.Fragment>
              <div style={{ marginTop: 8 }}>
                <Bars data={strain} color="var(--d-move)" height={150} labels={days} activeIdx={6} />
              </div>
              <div className="row between" style={{ marginTop: 14 }}>
                <Stat num={fmt(Number(strainTotal.toFixed(1)))} label="Carga total semana" />
                <Stat num={fmt(strainDays ? Number((strainTotal / strainDays).toFixed(1)) : 0)} label="Media por sesión" color="var(--d-move)" />
              </div>
            </React.Fragment>
          ) : (
            <div className="empty">Registra tus sesiones con el check-in para ver tu carga semanal.</div>
          )}
        </SectionCard>
      </div>

      {/* Peso */}
      <SectionCard title="Peso corporal" icon="scale"
        action={p.weightDelta6w != null ? <span className="pill tiny num">{p.weightDelta6w} kg · 6 sem</span> : null}>
        {ws.length >= 2 ? (
          <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
            <Stat num={fmt(p.weightNow)} unit="kg" label={p.weightDeltaWk != null ? `${p.weightDeltaWk <= 0 ? '↓' : '↑'} ${Math.abs(p.weightDeltaWk)} kg esta semana` : 'Tu evolución'} color="var(--glu-good)" />
            <div style={{ flex: 1, maxWidth: 480 }}><Spark data={ws} color="var(--accent)" height={96} /></div>
          </div>
        ) : (
          <div className="empty">Registra tu peso para ver tu evolución.</div>
        )}
      </SectionCard>

      {/* Volumen por músculo + PRs */}
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <SectionCard title="Volumen por grupo" icon="target" sub="Reparto de tu plan actual">
          {mv.length ? (
            <div className="stack" style={{ marginTop: 4 }}>
              {mv.map((m, i) => (
                <div key={i} className="vol-row">
                  <span className="vol-name">{m.m}</span>
                  <div className="vol-bar"><i style={{ width: m.v * 100 + '%' }} /></div>
                  <span className="vol-pct num">{Math.round(m.v * 100)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Genera un plan de entreno para ver el volumen por grupo.</div>
          )}
        </SectionCard>

        <SectionCard title="Récords recientes" icon="flame" sub="Tus mejores marcas">
          {pr.length ? (
            <div className="stack">
              {pr.map((r, i) => (
                <div key={i} className="pr-row">
                  <span className="pr-lift">{r.lift}</span>
                  <span className="pr-val">{r.val}</span>
                  {r.delta ? <span className="pill good tiny num">{r.delta}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Aún sin récords. Registra entrenos con carga para verlos aquí.</div>
          )}
        </SectionCard>
      </div>

      <AskCoach open={ask} onClose={() => setAsk(false)} />
    </div>);
}

/* ---- Encuesta de disponibilidad: ajusta plan y comidas ---- */
// Objetivos en lenguaje de RESULTADO (los valores internos no cambian: sin migración).
const AV_GOALS = [
  { value: 'weight_loss', title: 'Perder grasa', icon: 'flame', detail: 'Déficit moderado + fuerza', targetLabel: 'Peso objetivo (kg)' },
  { value: 'hypertrophy', title: 'Ganar músculo', icon: 'dumbbell', detail: 'Volumen + proteína', targetLabel: 'Peso objetivo (kg)' },
  { value: 'strength', title: 'Más fuerza', icon: 'bolt', detail: 'Básicos, e1RM y DAPRE', targetLabel: 'e1RM objetivo (kg)' },
  { value: 'recomposition', title: 'Tonificar', icon: 'scale', detail: 'Fuerza + control de grasa', targetLabel: 'Peso objetivo (kg)' },
  { value: 'endurance', title: 'Más resistencia', icon: 'heart', detail: 'Base aeróbica y ritmos' },
  { value: 'glycemic_control', title: 'Controlar glucosa', icon: 'drop', detail: 'Timing, fibra y Z2' },
];
const GOALS_WITH_TARGET = AV_GOALS.filter((g) => g.targetLabel).map((g) => g.value);
const AV_EQUIP = [
  { value: 'full_gym', title: 'Gimnasio', icon: 'dumbbell', detail: 'Máquinas, poleas y básicos' },
  { value: 'hybrid_run_gym', title: 'Correr + gym', icon: 'heart', detail: 'Fuerza y carrera concurrente' },
  { value: 'mixed', title: 'Flexible', icon: 'sliders', detail: 'Gym, casa y TRX' },
  { value: 'trx', title: 'TRX', icon: 'zap', detail: 'Suspensión y peso corporal' },
  { value: 'home', title: 'Casa', icon: 'profile', detail: 'Mínimo material' },
];
const RUN_GOALS = [['health', 'Salud'], ['race_5k', '5K'], ['race_10k', '10K'], ['race_21k', '21K'], ['race_42k', '42K']];
const RUN_REF_DIST = [['', '—'], ['5000', '5K'], ['10000', '10K'], ['21097', '21K'], ['42195', '42K']];
function findChoice(list, value) { return list.find((item) => item.value === value) || list[0]; }
function secsToMMSS(s) { const n = Number(s); if (!Number.isFinite(n) || n <= 0) return ''; const m = Math.floor(n / 60); const r = Math.round(n % 60); return `${m}:${String(r).padStart(2, '0')}`; }
function mmssToSecs(str) { const m = /^(\d{1,3}):([0-5]?\d)$/.exec(String(str || '').trim()); if (!m) return null; return Number(m[1]) * 60 + Number(m[2]); }
function AvailabilitySurvey() {
  const D = window.STUDIO;
  const u = D.user || {};
  const [goal, setGoal] = useStateP(u.goalRaw || 'recomposition');
  // Comorbilidades estructuradas (checkboxes): adaptan calentamiento, retorno,
  // selección de ejercicios y avisos del coach. Complementan al texto libre.
  const [conds, setConds] = useStateP(u.conditions || { hypertension: false, diabetes: false, osteoarthritis: false, osteoporosis: false, injuryZones: [] });
  const toggleCond = (k) => setConds((c) => ({ ...c, [k]: !c[k] }));
  const toggleZone = (z) => setConds((c) => ({ ...c, injuryZones: (c.injuryZones || []).includes(z) ? c.injuryZones.filter((x) => x !== z) : [...(c.injuryZones || []), z] }));
  // Objetivo SMART: meta numérica + fecha (como el objetivo de carrera).
  const [goalValue, setGoalValue] = useStateP(u.goalTargetValue != null ? String(u.goalTargetValue) : '');
  const [goalDate, setGoalDate] = useStateP(u.goalTargetDate || '');
  const [equip, setEquip] = useStateP(u.modalityRaw || 'full_gym');
  const [raceGoal, setRaceGoal] = useStateP(u.runRaceGoal || 'health');
  const [refDist, setRefDist] = useStateP(u.runRefDistanceMeters != null ? String(u.runRefDistanceMeters) : '');
  const [refTime, setRefTime] = useStateP(secsToMMSS(u.runRefTimeSeconds));
  const [raceDate, setRaceDate] = useStateP(u.raceDate || '');
  const [sex, setSex] = useStateP(u.sex || 'male');
  const [age, setAge] = useStateP(u.age != null ? u.age : 30);
  const [weight, setWeight] = useStateP(u.weightKg != null ? u.weightKg : 75);
  const [height, setHeight] = useStateP(u.heightCm != null ? u.heightCm : 170);
  const [hrMax, setHrMax] = useStateP(u.hrMaxBpm != null ? String(u.hrMaxBpm) : '');
  const [mins, setMins] = useStateP(u.sessionMinutes != null ? u.sessionMinutes : 60);
  const [days, setDays] = useStateP(u.daysPerWeek != null ? u.daysPerWeek : 5);
  const [meals, setMeals] = useStateP(u.mealsPerDay != null ? u.mealsPerDay : 4);
  const [weeks, setWeeks] = useStateP(4);
  const [status, setStatus] = useStateP('idle'); // idle|saving|ok|err|noauth
  const selectedGoal = findChoice(AV_GOALS, goal);
  const selectedModality = findChoice(AV_EQUIP, equip);
  const targetEnabled = GOALS_WITH_TARGET.includes(goal);
  const usesRace = equip === 'hybrid_run_gym';
  const raceLabel = (RUN_GOALS.find(([v]) => v === raceGoal) || [null, 'Salud'])[1];
  const keyDate = usesRace && raceDate ? raceDate : (targetEnabled && goalDate ? goalDate : null);

  async function save() {
    setStatus('saving');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setStatus('noauth'); return; }
      const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
      const r = await fetch('/api/studio-availability', {
        method: 'POST', headers,
        body: JSON.stringify({
          goal, trainingModality: equip, sex,
          age: Number(age), weightKg: Number(weight), heightCm: Number(height),
          sessionMinutes: Number(mins), daysPerWeek: Number(days), mealsPerDay: Number(meals), resurveyWeeks: Number(weeks),
          // Carrera: objetivo + marca de referencia (para ritmos numéricos).
          runRaceGoal: usesRace ? raceGoal : 'health',
          runRefDistanceMeters: usesRace && refDist ? Number(refDist) : null,
          runRefTimeSeconds: usesRace ? mmssToSecs(refTime) : null,
          raceDate: usesRace ? (raceDate || null) : null,
          // FCmáx medida (opcional): prevalece sobre la estimación por edad en zonas y coach.
          hrMaxBpm: hrMax ? Number(hrMax) : null,
          // Comorbilidades estructuradas (checkboxes de salud).
          conditions: conds,
          // Objetivo SMART medible (meta + fecha); null borra el objetivo.
          goalTargetValue: targetEnabled && goalValue ? Number(goalValue) : null,
          goalTargetDate: targetEnabled ? (goalDate || null) : null,
        }),
      });
      if (!r.ok) { setStatus('err'); return; }
      // Cambió el perfil/disponibilidad → reconstruye el bloque de 21 días.
      await fetch('/api/weekly-plan', { method: 'POST', headers, body: JSON.stringify({ rebuild: true }) }).catch(() => {});
      try {
        const d = await fetch('/api/studio-data', { headers: { authorization: 'Bearer ' + token } });
        if (d.ok) {
          const j = await d.json();
          const o = j && j.ok ? j.overrides : null;
          if (o) ['user', 'todaySession', 'week', 'library', 'macroTargets', 'macroEaten', 'progress', 'glycemic', 'goalProgress', 'runFitness', 'runZones', 'coachAdjust', 'reentry'].forEach((k) => { if (o[k] != null) D[k] = o[k]; });
        }
      } catch (e) { /* noop */ }
      setStatus('ok'); setTimeout(() => setStatus('idle'), 3500);
    } catch (e) { setStatus('err'); }
  }

  return (
    <SectionCard title="Tu perfil y disponibilidad" icon="settings" sub="Objetivo, modalidad y calendario del bloque. Al guardar, reajustamos tu plan y comidas.">
      <div className="availability-flow">
        <section className="profile-step">
          <div className="profile-step-head">
            <div>
              <div className="mb-label">Objetivo principal</div>
              <h4>{selectedGoal.title}</h4>
            </div>
            <span className="pill tiny accent">Resultado</span>
          </div>
          <div className="profile-choice-grid goals">
            {AV_GOALS.map((g) => (
              <button key={g.value} type="button" className={`choice-tile ${goal === g.value ? 'on' : ''}`} aria-pressed={goal === g.value} onClick={() => setGoal(g.value)}>
                <span className="choice-head"><span className="choice-icon"><Icon name={g.icon} size={16} /></span><strong>{g.title}</strong></span>
                <span className="choice-detail">{g.detail}</span>
              </button>
            ))}
          </div>
          {targetEnabled ? (
            <div className="profile-target-panel">
              <div className="field">
                <label>{selectedGoal.targetLabel}</label>
                <input className="text-input" type="number" min={goal === 'strength' ? 10 : 30} max={goal === 'strength' ? 500 : 300} step="0.5" placeholder="opcional" value={goalValue} onChange={(e) => setGoalValue(e.target.value)} />
              </div>
              <div className="field">
                <label>Fecha meta</label>
                <input className="text-input" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
              </div>
              <p className="tiny muted">La meta alimenta Progreso y el coach; si no hay datos suficientes, no se inventa predicción.</p>
            </div>
          ) : null}
        </section>

        <section className="profile-step">
          <div className="profile-step-head">
            <div>
              <div className="mb-label">Dónde y cómo entrenas</div>
              <h4>{selectedModality.title}</h4>
            </div>
            <span className="pill tiny">Modalidad</span>
          </div>
          <div className="profile-choice-grid modes">
            {AV_EQUIP.map((m) => (
              <button key={m.value} type="button" className={`choice-tile ${equip === m.value ? 'on' : ''}`} aria-pressed={equip === m.value} onClick={() => setEquip(m.value)}>
                <span className="choice-head"><span className="choice-icon"><Icon name={m.icon} size={16} /></span><strong>{m.title}</strong></span>
                <span className="choice-detail">{m.detail}</span>
              </button>
            ))}
          </div>
        </section>

        {usesRace ? (
          <section className="runner-panel">
            <div className="profile-step-head">
              <div>
                <div className="mb-label">Carrera</div>
                <h4>{raceLabel}</h4>
              </div>
              <span className="pill tiny accent">Subobjetivo</span>
            </div>
            <div className="chips run-goals">{RUN_GOALS.map(([v, l]) => <button key={v} type="button" className={`pill ${raceGoal === v ? 'accent' : ''}`} onClick={() => setRaceGoal(v)}>{l}</button>)}</div>
            <div className="runner-grid">
              <div className="field"><label>Fecha de carrera</label>
                <input className="text-input" type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} />
              </div>
              <div className="field"><label>Marca reciente</label>
                <select className="text-input" value={refDist} onChange={(e) => setRefDist(e.target.value)}>
                  {RUN_REF_DIST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field"><label>Tiempo (m:ss)</label>
                <input className="text-input" type="text" inputMode="numeric" placeholder="25:00" value={refTime} onChange={(e) => setRefTime(e.target.value)} />
              </div>
            </div>
            <p className="tiny muted">Con fecha se periodiza la carrera; con marca se calculan ritmos. Sin marca, el bloque usa zonas.</p>
          </section>
        ) : null}

        <section className="plan-summary-band">
          <div className="plan-summary-main">
            <div className="mb-label">Bloque resultante</div>
            <strong>{selectedGoal.title} · {selectedModality.title}</strong>
          </div>
          <div className="plan-summary-grid">
            <span><b>Microciclo</b><em>{days} días/sem · {mins} min</em></span>
            <span><b>Mesociclo</b><em>Bloque de 21 días</em></span>
            <span><b>Revisión</b><em>Cada {weeks} sem</em></span>
            <span><b>Fecha clave</b><em>{keyDate || 'Sin fecha'}</em></span>
          </div>
        </section>

        <section className="profile-step compact">
          <div className="mb-label">Datos personales</div>
          <div className="chips">{[['male', 'Hombre'], ['female', 'Mujer']].map(([v, l]) => <button key={v} type="button" className={`pill ${sex === v ? 'accent' : ''}`} onClick={() => setSex(v)}>{l}</button>)}</div>

          <div style={{ marginTop: 14 }}>
            <div className="mb-label">Salud (opcional — adapta tu plan con seguridad)</div>
          <div className="chips">
            {[['hypertension', 'Hipertensión'], ['diabetes', 'Diabetes'], ['osteoarthritis', 'Artrosis'], ['osteoporosis', 'Osteoporosis']].map(([k, l]) => (
              <button key={k} type="button" className={`pill ${conds[k] ? 'accent' : ''}`} onClick={() => toggleCond(k)}>{l}</button>
            ))}
          </div>
          <div className="mb-label" style={{ marginTop: 10 }}>Zonas sensibles o con lesión previa</div>
          <div className="chips">
            {['lumbar', 'rodilla', 'hombro', 'tobillo', 'cadera', 'cervical', 'muñeca'].map((z) => (
              <button key={z} type="button" className={`pill ${((conds.injuryZones || []).includes(z)) ? 'accent' : ''}`} onClick={() => toggleZone(z)} style={{ textTransform: 'capitalize' }}>{z}</button>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>Con esto el calentamiento, la vuelta a la calma y la selección de ejercicios se adaptan automáticamente (p. ej. sin saltos con artrosis, sin flexión espinal cargada con osteoporosis). Es educativo, no diagnóstico.</p>
          </div>

          <div className="grid g-4" style={{ gap: 10, marginTop: 12 }}>
            <div className="field"><label>Edad</label><input className="text-input" type="number" min="12" max="100" value={age} onChange={(e) => setAge(e.target.value)} /></div>
            <div className="field"><label>Peso (kg)</label><input className="text-input" type="number" min="30" max="300" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            <div className="field"><label>Altura (cm)</label><input className="text-input" type="number" min="120" max="230" value={height} onChange={(e) => setHeight(e.target.value)} /></div>
            <div className="field"><label>Comidas/día</label><input className="text-input" type="number" min="3" max="6" value={meals} onChange={(e) => setMeals(e.target.value)} /></div>
          </div>
          <div className="grid g-4" style={{ gap: 10, marginTop: 10 }}>
            <div className="field"><label>Min/sesión</label><input className="text-input" type="number" min="20" max="150" step="5" value={mins} onChange={(e) => setMins(e.target.value)} /></div>
            <div className="field"><label>Días/semana</label><input className="text-input" type="number" min="1" max="7" value={days} onChange={(e) => setDays(e.target.value)} /></div>
            <div className="field"><label>Re-encuesta (sem)</label><input className="text-input" type="number" min="1" max="26" value={weeks} onChange={(e) => setWeeks(e.target.value)} /></div>
            <div className="field"><label>FCmáx (ppm)</label><input className="text-input" type="number" min="120" max="230" placeholder="auto" title="Si la conoces (prueba de esfuerzo o máxima real vista en tu reloj), prevalece sobre la estimación por edad" value={hrMax} onChange={(e) => setHrMax(e.target.value)} /></div>
          </div>
        </section>

        <div className="row ac wrap" style={{ gap: 12 }}>
          <button className="btn" onClick={save} disabled={status === 'saving'}><Icon name="check" size={16} /> {status === 'saving' ? 'Guardando y reajustando...' : 'Guardar cambios'}</button>
          {status === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Guardado y plan reajustado.</span> : null}
          {status === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo guardar. Reintenta.</span> : null}
          {status === 'noauth' ? <span className="tiny muted">Inicia sesión para guardar.</span> : null}
        </div>
      </div>
    </SectionCard>
  );
}

/* ---- Conexión con Strava (importa entrenos con FC) ---- */
function StravaCard() {
  const D = window.STUDIO;
  const s = D.strava || { connected: false, recent: [] };
  const [status, setStatus] = useStateP('idle'); // idle|connecting|syncing|ok|err
  const [info, setInfo] = useStateP(null);
  const [hook, setHook] = useStateP('idle'); // idle|setting|ok|err

  async function token() { return window.__getIdToken ? window.__getIdToken() : Promise.resolve(null); }

  async function setupHook() {
    setHook('setting');
    try {
      const t = await token(); if (!t) { setHook('err'); return; }
      const r = await fetch('/api/strava/webhook-setup', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t } });
      const j = await r.json().catch(() => ({}));
      setHook(j && (j.ok || (j.detail && JSON.stringify(j.detail).includes('already'))) ? 'ok' : 'err');
    } catch (e) { setHook('err'); }
  }

  async function sync() {
    setStatus('syncing');
    try {
      const t = await token(); if (!t) { setStatus('err'); return; }
      const r = await fetch('/api/strava/sync', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t } });
      if (!r.ok) { setStatus('err'); return; }
      setInfo(await r.json());
      const d = await fetch('/api/studio-data', { headers: { authorization: 'Bearer ' + t } });
      if (d.ok) { const o = (await d.json()).overrides; if (o && o.strava) D.strava = o.strava; if (o && o.progress) D.progress = o.progress; }
      setStatus('ok');
    } catch (e) { setStatus('err'); }
  }

  async function connect() {
    setStatus('connecting');
    try {
      const t = await token(); if (!t) { setStatus('err'); return; }
      const r = await fetch('/api/strava/connect', { headers: { authorization: 'Bearer ' + t } });
      const j = await r.json();
      if (j && j.url) { (window.top || window).location.href = j.url; } else setStatus('err');
    } catch (e) { setStatus('err'); }
  }

  // Al volver del OAuth (?strava=ok) sincroniza automáticamente y limpia la URL.
  useEffectP(() => {
    try {
      const w = window.top || window;
      if (/[?&]strava=ok\b/.test(w.location.search)) {
        sync();
        try { w.history.replaceState({}, '', w.location.pathname); } catch (e) { /* noop */ }
      }
    } catch (e) { /* noop */ }
  }, []);

  return (
    <SectionCard title="Strava · FC y entrenos" icon="bolt" sub={s.connected ? 'Conectado' : 'Importa ritmo, distancia y frecuencia cardiaca'}>
      {!s.connected ? (
        <div className="stack" style={{ gap: 10 }}>
          <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>Conecta Strava para traer tus carreras con FC. Tu Apple Watch sincroniza a Strava y nosotros leemos de ahí.</p>
          <button className="btn" onClick={connect} disabled={status === 'connecting'}><Icon name="bolt" size={16} /> {status === 'connecting' ? 'Abriendo Strava…' : 'Conectar Strava'}</button>
          {status === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo conectar. Reintenta más tarde.</span> : null}
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="row ac wrap" style={{ gap: 12 }}>
            <button className="btn soft" onClick={sync} disabled={status === 'syncing'}><Icon name="sparkles" size={15} /> {status === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
            {s.lastSyncAt ? <span className="tiny muted">Último: {String(s.lastSyncAt).slice(0, 10)}</span> : null}
            {status === 'ok' && info ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Importadas {info.imported} ({info.withHeartRate} con FC) ✨</span> : null}
            {status === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo sincronizar.</span> : null}
          </div>
          <div className="row ac wrap" style={{ gap: 10 }}>
            <button className="btn ghost sm" onClick={setupHook} disabled={hook === 'setting'}><Icon name="bolt" size={14} /> {hook === 'setting' ? 'Activando…' : 'Activar sync automático'}</button>
            {hook === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Sync automático activado ✓</span> : null}
            {hook === 'err' ? <span className="tiny muted">No se pudo activar (puede que ya esté activo).</span> : null}
          </div>
          {Array.isArray(s.recent) && s.recent.length ? (
            <div className="stack" style={{ gap: 6 }}>
              {s.recent.map((w, i) => (
                <div key={i} className="row between" style={{ padding: '8px 4px', borderBottom: i < s.recent.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ minWidth: 0 }}><strong style={{ fontSize: '0.9rem' }}>{w.title}</strong><div className="tiny muted num">{w.date}{w.distanceKm ? ` · ${w.distanceKm} km` : ''}{w.pace ? ` · ${w.pace}` : ''}</div></div>
                  <div className="row ac" style={{ gap: 6 }}>
                    {w.avgHr ? <span className="pill tiny"><Icon name="heart" size={12} /> {w.avgHr}</span> : null}
                    {w.maxHr ? <span className="pill tiny">máx {w.maxHr}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="tiny muted" style={{ margin: 0 }}>Aún no hay actividades. Pulsa "Sincronizar ahora".</p>}
        </div>
      )}
    </SectionCard>
  );
}

/* ============ PERFIL ============ */
function ProfileScreen({ theme, setTheme, notif, setNotif }) {
  const D = window.STUDIO;
  const u = D.user;
  const [goal, setGoal] = useStateP('Recomposición');
  const goals = ['Bajar peso', 'Recomposición', 'Hipertrofia', 'Glucémico'];
  const gi = goals.indexOf(goal);
  return (
    <div className="page stagger screen-enter">
      <div className="page-head"><div><p className="eyebrow">Perfil</p><h1>Tu cuenta</h1></div></div>

      <div className="card lg">
        <div className="profile-hero">
          <div className="avatar">{u.initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.02em' }}>{u.name} {u.last}</div>
            <div className="muted">{[u.goalShort, u.modality].filter(Boolean).join(' · ') || 'Tu plan'}</div>
            <div className="chips" style={{ marginTop: 10 }}>
              {u.goalShort ? <span className="pill accent tiny"><Icon name="target" size={12} /> {u.goalShort}</span> : null}
              {u.modality ? <span className="pill tiny"><Icon name="train" size={12} /> {u.modality}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <AvailabilitySurvey />

      <StravaCard />

      <div>
        <SectionCard title="Apariencia y avisos" icon="settings">
          <div className="set-row">
            <div><strong style={{ fontSize: '0.92rem' }}>Tema</strong><div className="tiny muted">Claro u oscuro</div></div>
            <div className="segc">
              <div className="segc-thumb" style={{ left: theme === 'light' ? '4px' : 'calc(50% + 0px)', width: 'calc(50% - 6px)' }} />
              <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}><Icon name="sun" size={15} /> Claro</button>
              <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}><Icon name="moon" size={15} /> Oscuro</button>
            </div>
          </div>
          <div className="set-row">
            <div><strong style={{ fontSize: '0.92rem' }}>Recordatorios de comida</strong><div className="tiny muted">Avisos antes de cada comida</div></div>
            <div className={`switch ${notif ? 'on' : ''}`} onClick={() => setNotif(!notif)}><i /></div>
          </div>
          <div className="set-row">
            <div><strong style={{ fontSize: '0.92rem' }}>Wearable</strong><div className="tiny muted">Conecta Strava arriba (Apple Watch → Strava → Ignios)</div></div>
          </div>
          <div className="set-row">
            <div><strong style={{ fontSize: '0.92rem' }}>Sesión</strong><div className="tiny muted">Cierra tu sesión en este dispositivo</div></div>
            <button className="btn ghost sm" onClick={() => { if (window.__signOut) window.__signOut(); }}><Icon name="arrowRight" size={15} /> Cerrar sesión</button>
          </div>
        </SectionCard>
      </div>

      <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
        <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Ignios ofrece estimaciones educativas de nutrición, glucemia y entrenamiento. No sustituye diagnóstico ni seguimiento médico.
        </p>
      </div>
    </div>);

}

Object.assign(window, { ProgressScreen, ProfileScreen, WorkoutAnalysisBlock });
