/* ENDOGYM STUDIO — Pantalla HOY (hub) + variaciones de Inicio */
const { useState: useStateT } = React;

/* FASE 1.3 — Check-in de reentrada (≥7 días sin entrenar): 1 pregunta + sesión puente.
   La respuesta alimenta las reglas REENTRY_* del ajuste adaptativo (server-side). */
function ReentryCard() {
  const D = window.STUDIO;
  const re = D.reentry;
  const [sent, setSent] = useStateT(false);
  const [reason, setReason] = useStateT(null);
  const [busy, setBusy] = useStateT(false);
  if (!re || (!re.needsCheckin && !re.bridgeSession && !re.planStale)) return null;
  const answer = async (value) => {
    if (busy) return;
    setBusy(true);
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (token) {
        await fetch('/api/studio-availability', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify({ reentryReason: value, reentryDaysOut: re.daysSinceLastDone }),
        });
      }
      setReason(value); setSent(true);
      if (D.reentry) D.reentry.needsCheckin = false;
    } catch (e) { /* el plan sigue siendo conservador aunque falle el guardado */ }
    setBusy(false);
  };
  const opts = [['vacaciones', 'Vacaciones'], ['enfermedad', 'Enfermedad'], ['motivacion', 'Motivación'], ['otro', 'Otro']];
  return (
    <SectionCard title={`Has vuelto tras ${re.daysSinceLastDone} días sin entrenar`} icon="sparkles">
      {re.needsCheckin && !sent ? (
        <div>
          <p className="muted" style={{ margin: '0 0 10px' }}>Para adaptar tu vuelta con seguridad: ¿por qué paraste?</p>
          <div className="chips">
            {opts.map(([v, l]) => (
              <button key={v} className="btn soft sm" disabled={busy} onClick={() => answer(v)}>{l}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          {reason === 'enfermedad'
            ? 'Como el parón fue por enfermedad, las próximas 2 semanas serán extra suaves. Si fue con fiebre o respiratoria, reevalúa tu cribado en Perfil antes de apretar.'
            : 'Gracias. El plan se adapta a tu vuelta: progresión suave esta semana.'}
        </p>
      )}
      {re.bridgeSession ? (
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Hoy: sesión puente de 20-30 min suaves (técnica y movilidad), sin buscar cargas.
        </p>
      ) : null}
      {re.planStale ? (
        <p className="tiny" style={{ marginTop: 6 }}>
          Tu plan quedó desactualizado tras el parón: regenera el plan (Perfil → Regenerar plan con IA) para empezar con una rampa suave de 1-2 semanas.
        </p>
      ) : null}
    </SectionCard>
  );
}

function TodayHub({ go, variant }) {
  const D = window.STUDIO;
  const user = D.user || {};
  const s = D.todaySession || null;
  const mt = D.macroTargets || {};
  const me = D.macroEaten || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const progress = D.progress || {};
  const nowParts = window.__studioDateParts ? window.__studioDateParts() : { hour: new Date().getHours() };
  const fecha = window.__studioDateLabel ? window.__studioDateLabel() : '';
  const hour = Number(nowParts.hour);
  const saludo = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const rec = Number.isFinite(progress.recovery) ? progress.recovery : null;
  const ws = Array.isArray(progress.weightSeries) ? progress.weightSeries : [];
  // Contenido real y contextual: solo ejercicios de la sesión actual con embed verificado.
  // No usar un feed editorial ficticio ni fabricar autores, vistas o duraciones.
  const learningVideos = Array.isArray(s?.list)
    ? s.list.filter((exercise) => exercise?.yt).slice(0, 3)
    : [];
  return (
    <div className="page stagger screen-enter">
      <div className="page-head">
        <div>
          <p className="eyebrow" style={{ textTransform: 'capitalize' }}>{fecha}</p>
          <h1>{saludo}, {user.name}</h1>
          <p className="sub">{s ? `Hoy: ${s.title}${s.focus ? ` · ${s.focus}` : ''}.` : (D.planStatus === 'stale' ? 'Tu bloque terminó: genera uno nuevo para volver a tener una sesión de hoy.' : 'Aún no hay una sesión planificada para hoy.')}{rec != null ? ` Tu disposición está al ${rec}%.` : ''}</p>
        </div>
      </div>

      {D.dataStatus === 'error' ? <div className="card"><div className="empty">No pudimos cargar tus datos. Reintenta recargando la aplicación; no mostraremos datos de muestra en tu sesión.</div></div> : null}

      {variant === 'resumen' ? <HeroResumen go={go} /> : variant === 'editorial' ? <HeroEditorial go={go} /> : <HeroAnillos go={go} />}

      <ReentryCard />

      {/* Coach + sesión */}
      <div className="grid g-2" style={{ gridTemplateColumns: '0.95fr 1.05fr' }}>
        <CoachCard go={go} />
        <SectionCard title="Sesión de hoy" icon="train"
          action={<button className="btn soft sm" onClick={() => go('train')}>Empezar</button>}>
          {s ? <React.Fragment><div className="row between" style={{ marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.18rem', letterSpacing: '-0.02em' }}>{s.title}</div>
              <div className="muted tiny" style={{ marginTop: 2 }}>{s.focus}</div>
            </div>
            <span className="pill accent">{s.intensity}</span>
          </div>
          <div className="tiles">
            <div className="tile"><div className="t-num num">{s.list.length}</div><div className="t-lbl">Ejercicios</div></div>
            <div className="tile"><div className="t-num num">{s.durationMin || '—'}'</div><div className="t-lbl">Duración</div></div>
            <div className="tile"><div className="t-num num">{s.intensity || '—'}</div><div className="t-lbl">Intensidad</div></div>
          </div>
          <div className="chips" style={{ marginTop: 14 }}>
            {(s.primaryMuscles || []).map((m) => <span key={m} className="pill tiny">{m}</span>)}
          </div>
          </React.Fragment> : <div className="empty">{D.planStatus === 'stale' ? 'El bloque anterior ya no corresponde a la fecha actual.' : 'Genera tu bloque para ver aquí la sesión del día.'}</div>}
        </SectionCard>
      </div>

      {/* Nutrición glance + peso */}
      <div className="grid g-2">
        <SectionCard title="Nutrición de hoy" icon="nutrition"
          action={<button className="btn soft sm" onClick={() => go('nutrition')}>Ver plan</button>}>
          <div className="macro-bars" style={{ marginTop: 2 }}>
            <MacroLine label="Calorías" v={me.kcal} t={mt.kcal} u="kcal" color="var(--accent)" />
            <MacroLine label="Proteína" v={me.protein} t={mt.protein} u="g" color="var(--protein)" />
            <MacroLine label="Carbohidratos" v={me.carbs} t={mt.carbs} u="g" color="var(--carbs)" />
          </div>
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="row between">
            <span className="muted tiny">{mt.kcal ? `${me.kcal} de ${mt.kcal} kcal hoy` : 'Sin objetivo nutricional activo'}</span>
            {D.glycemic && D.glycemic.dayClass ? <span className={`pill ${D.glycemic.dayClass} tiny`}><span className="dot" /> Carga estimada {D.glycemic.dayClass === 'good' ? 'baja' : D.glycemic.dayClass === 'mid' ? 'moderada' : 'alta'}</span> : null}
          </div>
        </SectionCard>

        <SectionCard title="Progreso de peso" icon="scale"
          action={progress.weightDelta6w != null ? <span className="pill tiny">{progress.weightDelta6w} kg · 6 sem</span> : null}>
          {ws.length >= 2 ? (
            <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
              <Stat num={String(progress.weightNow).replace('.', ',')} unit="kg" label={progress.weightDeltaWk != null ? `${progress.weightDeltaWk <= 0 ? '↓' : '↑'} ${Math.abs(progress.weightDeltaWk)} kg esta semana` : 'Tu evolución'} color="var(--glu-good)" />
              <div style={{ flex: 1, maxWidth: 320 }}><Spark data={ws} color="var(--accent)" height={70} /></div>
            </div>
          ) : (
            <div className="empty" style={{ marginBottom: 8 }}>Registra tu peso para ver tu evolución.</div>
          )}
          <button className="btn ghost sm block" onClick={() => go('progress')}><Icon name="progress" size={15} /> Ver progreso completo</button>
        </SectionCard>
      </div>

      {/* Técnica real de la sesión: nunca feed editorial de muestra. */}
      {learningVideos.length ? <SectionCard title="Sigue aprendiendo" icon="play"
        sub="Vídeos de técnica verificados para los ejercicios de hoy">
        <div className="vid-rail">
          {learningVideos.map((exercise, i) => <VideoThumb key={exercise.id || i} item={exercise} />)}
        </div>
      </SectionCard> : null}
    </div>
  );
}

/* ---- Hero variante A: anillos ---- */
function HeroAnillos({ go }) {
  const D = window.STUDIO;
  const mt = D.macroTargets || {};
  const me = D.macroEaten || { kcal: 0 };
  const progress = D.progress || {};
  const rec = Number.isFinite(progress.recovery) ? progress.recovery : null;
  const done = Number.isFinite(progress.sessionsDone) ? progress.sessionsDone : 0;
  const plan = Number.isFinite(progress.sessionsPlan) ? progress.sessionsPlan : 0;
  const kcalPct = mt.kcal ? Math.round((me.kcal / mt.kcal) * 100) : 0;
  const rings = [
    { value: done, max: plan || 1, color: 'var(--d-move)', label: 'Entreno' },
    { value: me.kcal, max: mt.kcal || 1, color: 'var(--d-nutri)', label: 'Nutrición' },
    { value: rec != null ? rec : 0, max: 100, color: 'var(--d-recover)', label: 'Recuperación' },
  ];
  return (
    <div className="card lg hero-card">
      <div className="ctitle"><span className="ico"><Icon name="today" size={19} /></span><h3>Tu día en anillos</h3><span className="pill tiny" style={{ marginLeft: 'auto' }}>Hoy</span></div>
      <div className="readiness-wrap" style={{ marginTop: 16, gridTemplateColumns: 'auto 1fr' }}>
        <TripleRing rings={rings} size={168} />
        <div className="readiness-metrics">
          <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-move)' }}><Icon name="train" size={18} /></span>
            <div><strong className="num">{done} / {plan}</strong><div className="rm-sub">sesiones esta semana</div></div></div>
          <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-nutri)' }}><Icon name="nutrition" size={18} /></span>
            <div><strong className="num">{mt.kcal ? `${me.kcal} / ${mt.kcal}` : '—'}</strong><div className="rm-sub">{mt.kcal ? `kcal · ${kcalPct}% del objetivo` : 'sin objetivo nutricional'}</div></div></div>
          <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-recover)' }}><Icon name="heart" size={18} /></span>
            <div><strong className="num">{rec != null ? rec + '%' : '—'}</strong><div className="rm-sub">{rec != null ? 'recuperación' : 'haz tu check-in en Entreno'}</div></div></div>
        </div>
      </div>
    </div>
  );
}

/* ---- Hero variante B: resumen (arco + tiles) ---- */
function HeroResumen({ go }) {
  const D = window.STUDIO;
  const progress = D.progress || {};
  const rec = Number.isFinite(progress.recovery) ? progress.recovery : null;
  return (
    <div className="card lg hero-card">
      <div className="readiness-wrap">
        <Arc value={rec || 0} max={100} size={240} stroke={20} color="var(--accent)">
          <div><div className="a-num num">{rec != null ? rec : '—'}</div><div className="a-lbl">Disposición</div></div>
        </Arc>
        <div className="stack" style={{ gap: 14, width: '100%' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.5 }}>
            {rec != null ? 'Estimación basada en el último sueño y fatiga que registraste.' : 'Haz el check-in de Entreno para calcular tu disposición sin inventar valores.'}
          </p>
          <div className="tiles">
            <div className="tile"><div className="t-num num">{rec != null ? `${rec}%` : '—'}</div><div className="t-lbl">Recuperación</div></div>
            <div className="tile"><div className="t-num num">{progress.sessionsDone ?? 0}</div><div className="t-lbl">Sesiones hechas</div></div>
            <div className="tile"><div className="t-num num">{progress.adherence != null ? `${progress.adherence}%` : '—'}</div><div className="t-lbl">Adherencia</div></div>
          </div>
          <button className="btn block" onClick={() => go('train')}>Ver sesión de hoy <Icon name="arrowRight" size={17} /></button>
        </div>
      </div>
    </div>
  );
}

/* ---- Hero variante C: editorial ---- */
function HeroEditorial({ go }) {
  const D = window.STUDIO;
  const progress = D.progress || {};
  const rec = Number.isFinite(progress.recovery) ? progress.recovery : null;
  return (
    <div className="card flush hero-card editorial">
      <div className="ed-left">
        <p className="eyebrow">Disposición de hoy</p>
        <div className="ed-num num">{rec != null ? rec : '—'}<span style={{ fontSize: '0.32em', color: 'var(--ink-3)', letterSpacing: 0 }}>/100</span></div>
        <p className="muted" style={{ margin: 0, fontSize: '0.96rem', lineHeight: 1.5, maxWidth: '40ch' }}>
          {rec != null ? 'Esta disposición se calcula con el sueño y la fatiga de tu último check-in.' : 'Todavía no hay sueño ni fatiga registrados para estimar tu disposición.'}
        </p>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('train')}>Empezar sesión <Icon name="arrowRight" size={17} /></button>
      </div>
      <div className="ed-right">
        <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-recover)' }}><Icon name="moon" size={17} /></span>
          <div><strong className="num">{progress.sessionsDone ?? 0}</strong><div className="rm-sub">sesiones hechas</div></div></div>
        <div className="divider" />
        <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-heart)' }}><Icon name="heart" size={17} /></span>
          <div><strong className="num">{progress.adherence != null ? `${progress.adherence}%` : '—'}</strong><div className="rm-sub">adherencia</div></div></div>
        <div className="divider" />
        <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-nutri)' }}><Icon name="target" size={17} /></span>
          <div><strong className="num">{Number.isFinite(progress.recovery) ? progress.recovery : '—'}%</strong><div className="rm-sub">recuperación</div></div></div>
      </div>
    </div>
  );
}

/* ---- Coach card (compartida) ---- */
function CoachCard({ go }) {
  const D = window.STUDIO;
  const s = D.todaySession || {};
  const rec = Number.isFinite(D.progress && D.progress.recovery) ? D.progress.recovery : null;
  return (
    <div className="card lg coach stack" style={{ justifyContent: 'space-between' }}>
      <div>
        <div className="coach-head">
          <span className="coach-av"><Icon name="sparkles" size={20} /></span>
          <div><strong>Coach Ignios</strong><span>Tu plan de hoy</span></div>
        </div>
        <h3>{s.title ? `Hoy: ${s.title}.` : 'Tu plan, ajustado a ti.'}</h3>
        <p>El coach adapta tu entrenamiento y nutrición a tus datos. Abre tu sesión, regístrala con el check-in o pregúntale lo que quieras en Progreso.</p>
        <div className="coach-chips">
          {rec != null ? <span><Icon name="target" size={14} /> Disposición {rec}%</span> : null}
          {s.intensity ? <span><Icon name="bolt" size={14} /> {s.intensity}</span> : null}
          {s.focus ? <span><Icon name="train" size={14} /> {s.focus}</span> : null}
        </div>
      </div>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('train')}>Ver sesión de hoy <Icon name="arrowRight" size={17} /></button>
    </div>
  );
}

Object.assign(window, { TodayHub });
