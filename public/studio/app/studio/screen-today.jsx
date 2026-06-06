/* ENDOGYM STUDIO — Pantalla HOY (hub) + variaciones de Inicio */
const { useState: useStateT } = React;

function TodayHub({ go, variant }) {
  const D = window.STUDIO;
  const { user, todaySession: s, macroTargets: mt, macroEaten: me, progress } = D;
  return (
    <div className="page stagger screen-enter">
      <div className="page-head">
        <div>
          <p className="eyebrow">Lunes · 2 de junio</p>
          <h1>Buenos días, {user.name}</h1>
          <p className="sub">Vas {user.streak} días cumpliendo tu plan. Hoy toca empuje y tu cuerpo está al {s.readiness}% de disposición.</p>
        </div>
        <span className="pill accent"><Icon name="flame" size={15} /> Racha {user.streak}</span>
      </div>

      {variant === 'anillos' && <HeroAnillos go={go} />}
      {variant === 'resumen' && <HeroResumen go={go} />}
      {variant === 'editorial' && <HeroEditorial go={go} />}

      {/* Coach + sesión */}
      <div className="grid g-2" style={{ gridTemplateColumns: '0.95fr 1.05fr' }}>
        <CoachCard go={go} />
        <SectionCard title="Sesión de hoy" icon="train"
          action={<button className="btn soft sm" onClick={() => go('train')}>Empezar</button>}>
          <div className="row between" style={{ marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.18rem', letterSpacing: '-0.02em' }}>{s.title}</div>
              <div className="muted tiny" style={{ marginTop: 2 }}>{s.focus}</div>
            </div>
            <span className="pill accent">{s.intensity}</span>
          </div>
          <div className="tiles">
            <div className="tile"><div className="t-num num">{s.list.length}</div><div className="t-lbl">Ejercicios</div></div>
            <div className="tile"><div className="t-num num">{s.durationMin}'</div><div className="t-lbl">Duración</div></div>
            <div className="tile"><div className="t-num num">{s.kcal}</div><div className="t-lbl">kcal aprox</div></div>
          </div>
          <div className="chips" style={{ marginTop: 14 }}>
            {s.primaryMuscles.map((m) => <span key={m} className="pill tiny">{m}</span>)}
          </div>
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
            <span className="muted tiny">Próxima: Merienda · 17:30</span>
            <span className="pill good"><span className="dot" /> Glucemia en rango</span>
          </div>
        </SectionCard>

        <SectionCard title="Progreso de peso" icon="scale"
          action={<span className="pill tiny">{progress.weightDelta6w} kg · 6 sem</span>}>
          <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
            <Stat num="74,8" unit="kg" label={`↓ ${Math.abs(progress.weightDeltaWk)} kg esta semana`} color="var(--glu-good)" />
            <div style={{ flex: 1, maxWidth: 320 }}><Spark data={progress.weightSeries} color="var(--accent)" height={70} /></div>
          </div>
          <button className="btn ghost sm block" onClick={() => go('progress')}><Icon name="progress" size={15} /> Ver progreso completo</button>
        </SectionCard>
      </div>

      {/* Continuar viendo */}
      <SectionCard title="Sigue aprendiendo" icon="play"
        action={<button className="btn ghost sm" onClick={() => go('train')}>Explorar <Icon name="arrowRight" size={14} /></button>}>
        <div className="vid-rail">
          {D.discover[0].items.map((v, i) => <VideoThumb key={i} item={v} />)}
        </div>
      </SectionCard>
    </div>
  );
}

/* ---- Hero variante A: anillos ---- */
function HeroAnillos({ go }) {
  const D = window.STUDIO;
  const { macroTargets: mt, macroEaten: me, progress, user } = D;
  const rings = [
    { value: 2, max: 5, color: 'var(--d-move)', label: 'Entreno' },
    { value: me.kcal, max: mt.kcal, color: 'var(--d-nutri)', label: 'Nutrición' },
    { value: progress.recovery, max: 100, color: 'var(--d-recover)', label: 'Recuperación' },
  ];
  return (
    <div className="card lg hero-card">
      <div className="ctitle"><span className="ico"><Icon name="today" size={19} /></span><h3>Tu día en anillos</h3><span className="pill tiny" style={{ marginLeft: 'auto' }}>Hoy</span></div>
      <div className="readiness-wrap" style={{ marginTop: 16, gridTemplateColumns: 'auto 1fr' }}>
        <TripleRing rings={rings} size={168} />
        <div className="readiness-metrics">
          <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-move)' }}><Icon name="train" size={18} /></span>
            <div><strong className="num">2 / 5</strong><div className="rm-sub">sesiones esta semana</div></div></div>
          <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-nutri)' }}><Icon name="nutrition" size={18} /></span>
            <div><strong className="num">{me.kcal} / {mt.kcal}</strong><div className="rm-sub">kcal · 63% del objetivo</div></div></div>
          <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-recover)' }}><Icon name="heart" size={18} /></span>
            <div><strong className="num">{progress.recovery}%</strong><div className="rm-sub">recuperación · dormiste {user.sleep} h</div></div></div>
        </div>
      </div>
    </div>
  );
}

/* ---- Hero variante B: resumen (arco + tiles) ---- */
function HeroResumen({ go }) {
  const D = window.STUDIO;
  const { user, progress } = D;
  return (
    <div className="card lg hero-card">
      <div className="readiness-wrap">
        <Arc value={user.readiness} max={100} size={240} stroke={20} color="var(--accent)">
          <div><div className="a-num num">{user.readiness}</div><div className="a-lbl">Disposición</div></div>
        </Arc>
        <div className="stack" style={{ gap: 14, width: '100%' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.5 }}>
            Tu cuerpo está listo para entrenar fuerte. Sueño y fatiga en verde.
          </p>
          <div className="tiles">
            <div className="tile"><div className="t-num num">{user.sleep}h</div><div className="t-lbl">Sueño</div></div>
            <div className="tile"><div className="t-num num">{user.restHr}</div><div className="t-lbl">FC reposo</div></div>
            <div className="tile"><div className="t-num num">{progress.recovery}%</div><div className="t-lbl">Recuperación</div></div>
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
  const { user, progress } = D;
  return (
    <div className="card flush hero-card editorial">
      <div className="ed-left">
        <p className="eyebrow">Disposición de hoy</p>
        <div className="ed-num num">{user.readiness}<span style={{ fontSize: '0.32em', color: 'var(--ink-3)', letterSpacing: 0 }}>/100</span></div>
        <p className="muted" style={{ margin: 0, fontSize: '0.96rem', lineHeight: 1.5, maxWidth: '40ch' }}>
          Listo para empujar fuerte. Dormiste {user.sleep} h y tu fatiga es baja — el día perfecto para subir una repetición.
        </p>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('train')}>Empezar sesión <Icon name="arrowRight" size={17} /></button>
      </div>
      <div className="ed-right">
        <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-recover)' }}><Icon name="moon" size={17} /></span>
          <div><strong className="num">{user.sleep} h</strong><div className="rm-sub">sueño</div></div></div>
        <div className="divider" />
        <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-heart)' }}><Icon name="heart" size={17} /></span>
          <div><strong className="num">{user.restHr} ppm</strong><div className="rm-sub">FC en reposo</div></div></div>
        <div className="divider" />
        <div className="rm-line"><span className="rm-ico" style={{ color: 'var(--d-nutri)' }}><Icon name="target" size={17} /></span>
          <div><strong className="num">{progress.recovery}%</strong><div className="rm-sub">recuperación</div></div></div>
      </div>
    </div>
  );
}

/* ---- Coach card (compartida) ---- */
function CoachCard({ go }) {
  return (
    <div className="card lg coach stack" style={{ justifyContent: 'space-between' }}>
      <div>
        <div className="coach-head">
          <span className="coach-av"><Icon name="sparkles" size={20} /></span>
          <div><strong>Coach Ignios</strong><span>Recomendación de hoy · ahora</span></div>
        </div>
        <h3>Hoy prioriza la técnica, no la carga.</h3>
        <p>Dormiste 7 h y tu fatiga es baja. Mantén el press a 22 kg y sube una repetición si la última serie sale limpia.</p>
        <div className="coach-chips">
          <span><Icon name="moon" size={14} /> Sueño 7 h</span>
          <span><Icon name="heart" size={14} /> Fatiga baja</span>
          <span><Icon name="target" size={14} /> Disposición 82%</span>
        </div>
      </div>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('train')}>Ver sesión de hoy <Icon name="arrowRight" size={17} /></button>
    </div>
  );
}

Object.assign(window, { TodayHub });
