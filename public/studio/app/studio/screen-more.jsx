/* ENDOGYM STUDIO — Pantallas PROGRESO + PERFIL */
const { useState: useStateP } = React;

/* ============ PROGRESO ============ */
function ProgressScreen() {
  const D = window.STUDIO;
  const p = D.progress;
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const [ask, setAsk] = useStateP(false);
  return (
    <div className="page stagger screen-enter" data-comment-anchor="891f2ca371-div-10-5">
      <div className="page-head">
        <div>
          <p className="eyebrow">Progreso · Semana 6</p>
          <h1>Tu evolución</h1>
          <p className="sub">Recuperación, carga y fuerza en un mismo sitio. Los datos que mueven tu plan.</p>
        </div>
      </div>

      <CoachBanner screen="progress" ask onAsk={() => setAsk(true)} />

      {/* Recuperación + carga */}
      <div className="grid g-2" style={{ gridTemplateColumns: '0.85fr 1.15fr' }}>
        <div className="card lg" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="mb-label" style={{ alignSelf: 'flex-start' }}>Recuperación hoy</div>
          <Arc value={p.recovery} max={100} size={220} stroke={18} color="var(--d-recover)">
            <div><div className="a-num num">{p.recovery}<span style={{ fontSize: '0.4em', color: 'var(--ink-3)' }}>%</span></div><div className="a-lbl">Buena</div></div>
          </Arc>
          <p className="muted tiny" style={{ textAlign: 'center', margin: '4px 0 0', lineHeight: 1.5 }}>Tu sistema nervioso está recuperado. Buen día para entrenar con intensidad.</p>
        </div>

        <SectionCard title="Carga semanal" icon="bolt" sub="Esfuerzo acumulado por día (escala 0–10)">
          <div style={{ marginTop: 8 }}>
            <Bars data={p.strain} color="var(--d-move)" height={150} labels={days} activeIdx={0} />
          </div>
          <div className="row between" style={{ marginTop: 14 }}>
            <Stat num="34,7" label="Carga total semana" />
            <Stat num="4,9" label="Media diaria" color="var(--d-move)" />
          </div>
        </SectionCard>
      </div>

      {/* Peso */}
      <SectionCard title="Peso corporal" icon="scale"
      action={<span className="pill tiny num">{p.weightDelta6w} kg · 6 sem</span>}>
        <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
          <Stat num="74,8" unit="kg" label={`↓ ${Math.abs(p.weightDeltaWk)} kg esta semana`} color="var(--glu-good)" />
          <div style={{ flex: 1, maxWidth: 480 }}><Spark data={p.weightSeries} color="var(--accent)" height={96} /></div>
        </div>
      </SectionCard>

      {/* Volumen por músculo + PRs */}
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <SectionCard title="Volumen por grupo" icon="target" sub="Equilibrio de tu semana">
          <div className="stack" style={{ marginTop: 4 }}>
            {p.muscleVolume.map((m, i) =>
            <div key={i} className="vol-row">
                <span className="vol-name">{m.m}</span>
                <div className="vol-bar"><i style={{ width: m.v * 100 + '%' }} /></div>
                <span className="vol-pct num">{Math.round(m.v * 100)}%</span>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Récords recientes" icon="flame" sub="Tus mejores marcas este mes">
          <div className="stack">
            {p.pr.map((r, i) =>
            <div key={i} className="pr-row">
                <span className="pr-lift">{r.lift}</span>
                <span className="pr-val">{r.val}</span>
                <span className="pill good tiny num">{r.delta}</span>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <AskCoach open={ask} onClose={() => setAsk(false)} />
    </div>);

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