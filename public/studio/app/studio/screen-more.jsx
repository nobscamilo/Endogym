/* ENDOGYM STUDIO — Pantallas PROGRESO + PERFIL */
const { useState: useStateP } = React;

/* ============ PROGRESO ============ */
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
const AV_GOALS = [['recomposition', 'Recomposición'], ['weight_loss', 'Bajar peso'], ['hypertrophy', 'Hipertrofia'], ['strength', 'Fuerza'], ['endurance', 'Resistencia'], ['glycemic_control', 'Glucémico']];
const AV_EQUIP = [['full_gym', 'Gimnasio'], ['mixed', 'Mixto'], ['trx', 'TRX'], ['home', 'Casa']];
function AvailabilitySurvey() {
  const D = window.STUDIO;
  const [goal, setGoal] = useStateP('recomposition');
  const [equip, setEquip] = useStateP('full_gym');
  const [mins, setMins] = useStateP(60);
  const [days, setDays] = useStateP(5);
  const [meals, setMeals] = useStateP(4);
  const [weeks, setWeeks] = useStateP(4);
  const [status, setStatus] = useStateP('idle'); // idle|saving|ok|err|noauth

  async function save() {
    setStatus('saving');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setStatus('noauth'); return; }
      const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
      const r = await fetch('/api/studio-availability', {
        method: 'POST', headers,
        body: JSON.stringify({ goal, trainingModality: equip, sessionMinutes: Number(mins), daysPerWeek: Number(days), mealsPerDay: Number(meals), resurveyWeeks: Number(weeks) }),
      });
      if (!r.ok) { setStatus('err'); return; }
      await fetch('/api/weekly-plan', { method: 'POST', headers, body: '{}' }).catch(() => {});
      try {
        const d = await fetch('/api/studio-data', { headers: { authorization: 'Bearer ' + token } });
        if (d.ok) {
          const j = await d.json();
          const o = j && j.ok ? j.overrides : null;
          if (o) ['user', 'todaySession', 'week', 'library', 'macroTargets', 'macroEaten', 'progress', 'glycemic'].forEach((k) => { if (o[k] != null) D[k] = o[k]; });
        }
      } catch (e) { /* noop */ }
      setStatus('ok'); setTimeout(() => setStatus('idle'), 3500);
    } catch (e) { setStatus('err'); }
  }

  return (
    <SectionCard title="Disponibilidad y ajuste" icon="settings" sub="Adapta tu plan y comidas a tu tiempo y equipo. Repítela cada cierto tiempo.">
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div className="mb-label">Objetivo</div>
          <div className="chips">{AV_GOALS.map(([v, l]) => <button key={v} type="button" className={`pill ${goal === v ? 'accent' : ''}`} onClick={() => setGoal(v)}>{l}</button>)}</div>
        </div>
        <div>
          <div className="mb-label">Equipo disponible</div>
          <div className="chips">{AV_EQUIP.map(([v, l]) => <button key={v} type="button" className={`pill ${equip === v ? 'accent' : ''}`} onClick={() => setEquip(v)}>{l}</button>)}</div>
        </div>
        <div className="grid g-4" style={{ gap: 10 }}>
          <div className="field"><label>Min/sesión</label><input className="text-input" type="number" min="20" max="150" step="5" value={mins} onChange={(e) => setMins(e.target.value)} /></div>
          <div className="field"><label>Días/semana</label><input className="text-input" type="number" min="1" max="7" value={days} onChange={(e) => setDays(e.target.value)} /></div>
          <div className="field"><label>Comidas/día</label><input className="text-input" type="number" min="3" max="6" value={meals} onChange={(e) => setMeals(e.target.value)} /></div>
          <div className="field"><label>Re-encuesta (sem)</label><input className="text-input" type="number" min="1" max="26" value={weeks} onChange={(e) => setWeeks(e.target.value)} /></div>
        </div>
        <div className="row ac" style={{ gap: 12 }}>
          <button className="btn" onClick={save} disabled={status === 'saving'}><Icon name="sparkles" size={16} /> {status === 'saving' ? 'Ajustando plan…' : 'Guardar y reajustar plan'}</button>
          {status === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Plan y comidas reajustados ✨</span> : null}
          {status === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo guardar. Reintenta.</span> : null}
          {status === 'noauth' ? <span className="tiny muted">Inicia sesión para guardar.</span> : null}
        </div>
        <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>Al guardar, regeneramos tu plan de entreno y tus macros según tu objetivo, equipo y tiempo. Los días/semana se guardan para tu seguimiento.</p>
      </div>
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
            <div className="muted">{u.plan}</div>
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="pill accent tiny"><Icon name="target" size={12} /> {u.goalShort}</span>
              <span className="pill tiny"><Icon name="train" size={12} /> {u.modality}</span>
              <span className="pill tiny"><Icon name="flame" size={12} /> Racha {u.streak}</span>
            </div>
          </div>
          <button className="btn ghost"><Icon name="edit" size={16} /> Editar</button>
        </div>
      </div>

      <AvailabilitySurvey />

      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <SectionCard title="Datos y objetivo" icon="profile">
          <div className="grid g-2" style={{ gap: 14 }}>
            <div className="field"><label>Edad</label><input defaultValue="31" /></div>
            <div className="field"><label>Peso (kg)</label><input defaultValue="74.8" /></div>
            <div className="field"><label>Altura (cm)</label><input defaultValue="168" /></div>
            <div className="field"><label>Comidas/día</label><input defaultValue="4" /></div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Objetivo principal</label>
            <div className="segc" style={{ width: '100%' }}>
              <div className="segc-thumb" style={{ left: `calc(4px + ${gi} * (100% - 8px) / 4)`, width: `calc((100% - 8px) / 4)` }} />
              {goals.map((g) => <button key={g} className={goal === g ? 'on' : ''} style={{ flex: 1 }} onClick={() => setGoal(g)}>{g}</button>)}
            </div>
          </div>
        </SectionCard>

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
            <div><strong style={{ fontSize: '0.92rem' }}>Sincronizar wearable</strong><div className="tiny muted">Apple Health · Garmin</div></div>
            <button className="btn ghost sm">Conectar</button>
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

Object.assign(window, { ProgressScreen, ProfileScreen });