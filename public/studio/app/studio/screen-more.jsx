/* ENDOGYM STUDIO — Pantallas PROGRESO + PERFIL */
const { useState: useStateP, useEffect: useEffectP } = React;

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
const AV_EQUIP = [['full_gym', 'Gimnasio'], ['hybrid_run_gym', 'Correr + Gym'], ['mixed', 'Mixto'], ['trx', 'TRX'], ['home', 'Casa']];
const RUN_GOALS = [['health', 'Salud'], ['race_5k', '5K'], ['race_10k', '10K'], ['race_21k', '21K'], ['race_42k', '42K']];
const RUN_REF_DIST = [['', '—'], ['5000', '5K'], ['10000', '10K'], ['21097', '21K'], ['42195', '42K']];
function secsToMMSS(s) { const n = Number(s); if (!Number.isFinite(n) || n <= 0) return ''; const m = Math.floor(n / 60); const r = Math.round(n % 60); return `${m}:${String(r).padStart(2, '0')}`; }
function mmssToSecs(str) { const m = /^(\d{1,3}):([0-5]?\d)$/.exec(String(str || '').trim()); if (!m) return null; return Number(m[1]) * 60 + Number(m[2]); }
function AvailabilitySurvey() {
  const D = window.STUDIO;
  const u = D.user || {};
  const [goal, setGoal] = useStateP(u.goalRaw || 'recomposition');
  const [equip, setEquip] = useStateP(u.modalityRaw || 'full_gym');
  const [raceGoal, setRaceGoal] = useStateP(u.runRaceGoal || 'health');
  const [refDist, setRefDist] = useStateP(u.runRefDistanceMeters != null ? String(u.runRefDistanceMeters) : '');
  const [refTime, setRefTime] = useStateP(secsToMMSS(u.runRefTimeSeconds));
  const [raceDate, setRaceDate] = useStateP(u.raceDate || '');
  const [sex, setSex] = useStateP(u.sex || 'male');
  const [age, setAge] = useStateP(u.age != null ? u.age : 30);
  const [weight, setWeight] = useStateP(u.weightKg != null ? u.weightKg : 75);
  const [height, setHeight] = useStateP(u.heightCm != null ? u.heightCm : 170);
  const [mins, setMins] = useStateP(u.sessionMinutes != null ? u.sessionMinutes : 60);
  const [days, setDays] = useStateP(u.daysPerWeek != null ? u.daysPerWeek : 5);
  const [meals, setMeals] = useStateP(u.mealsPerDay != null ? u.mealsPerDay : 4);
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
        body: JSON.stringify({
          goal, trainingModality: equip, sex,
          age: Number(age), weightKg: Number(weight), heightCm: Number(height),
          sessionMinutes: Number(mins), daysPerWeek: Number(days), mealsPerDay: Number(meals), resurveyWeeks: Number(weeks),
          // Carrera: objetivo + marca de referencia (para ritmos numéricos).
          runRaceGoal: raceGoal,
          runRefDistanceMeters: refDist ? Number(refDist) : null,
          runRefTimeSeconds: mmssToSecs(refTime),
          raceDate: raceDate || null,
        }),
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
    <SectionCard title="Tu perfil y disponibilidad" icon="settings" sub="Tus datos y tu tiempo/equipo. Al guardar, reajustamos tu plan y comidas.">
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div className="mb-label">Objetivo</div>
          <div className="chips">{AV_GOALS.map(([v, l]) => <button key={v} type="button" className={`pill ${goal === v ? 'accent' : ''}`} onClick={() => setGoal(v)}>{l}</button>)}</div>
        </div>
        <div>
          <div className="mb-label">Equipo disponible</div>
          <div className="chips">{AV_EQUIP.map(([v, l]) => <button key={v} type="button" className={`pill ${equip === v ? 'accent' : ''}`} onClick={() => setEquip(v)}>{l}</button>)}</div>
        </div>
        <div>
          <div className="mb-label">Sexo</div>
          <div className="chips">{[['male', 'Hombre'], ['female', 'Mujer']].map(([v, l]) => <button key={v} type="button" className={`pill ${sex === v ? 'accent' : ''}`} onClick={() => setSex(v)}>{l}</button>)}</div>
        </div>

        {equip === 'hybrid_run_gym' ? (
          <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent', padding: 14 }}>
            <div className="mb-label">Objetivo de carrera</div>
            <div className="chips">{RUN_GOALS.map(([v, l]) => <button key={v} type="button" className={`pill ${raceGoal === v ? 'accent' : ''}`} onClick={() => setRaceGoal(v)}>{l}</button>)}</div>
            <div className="field" style={{ marginTop: 12 }}><label>Fecha de carrera (opcional → periodización)</label>
              <input className="text-input" type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} />
            </div>
            <div className="mb-label" style={{ marginTop: 12 }}>Marca reciente (opcional → ritmos numéricos)</div>
            <div className="row ac" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}><label>Distancia</label>
                <select className="text-input" value={refDist} onChange={(e) => setRefDist(e.target.value)}>
                  {RUN_REF_DIST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}><label>Tiempo (m:ss)</label>
                <input className="text-input" type="text" inputMode="numeric" placeholder="25:00" value={refTime} onChange={(e) => setRefTime(e.target.value)} />
              </div>
            </div>
            <p className="tiny muted" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>Sin marca, los ritmos se dan por zona (zona 2, umbral, intervalo). Con marca, calculamos tu ritmo objetivo en min/km.</p>
          </div>
        ) : null}
        <div className="grid g-4" style={{ gap: 10 }}>
          <div className="field"><label>Edad</label><input className="text-input" type="number" min="12" max="100" value={age} onChange={(e) => setAge(e.target.value)} /></div>
          <div className="field"><label>Peso (kg)</label><input className="text-input" type="number" min="30" max="300" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
          <div className="field"><label>Altura (cm)</label><input className="text-input" type="number" min="120" max="230" value={height} onChange={(e) => setHeight(e.target.value)} /></div>
          <div className="field"><label>Comidas/día</label><input className="text-input" type="number" min="3" max="6" value={meals} onChange={(e) => setMeals(e.target.value)} /></div>
        </div>
        <div className="grid g-4" style={{ gap: 10 }}>
          <div className="field"><label>Min/sesión</label><input className="text-input" type="number" min="20" max="150" step="5" value={mins} onChange={(e) => setMins(e.target.value)} /></div>
          <div className="field"><label>Días/semana</label><input className="text-input" type="number" min="1" max="7" value={days} onChange={(e) => setDays(e.target.value)} /></div>
          <div className="field"><label>Re-encuesta (sem)</label><input className="text-input" type="number" min="1" max="26" value={weeks} onChange={(e) => setWeeks(e.target.value)} /></div>
        </div>
        <div className="row ac" style={{ gap: 12 }}>
          <button className="btn" onClick={save} disabled={status === 'saving'}><Icon name="check" size={16} /> {status === 'saving' ? 'Guardando y reajustando…' : 'Guardar cambios'}</button>
          {status === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Guardado y plan reajustado ✨</span> : null}
          {status === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo guardar. Reintenta.</span> : null}
          {status === 'noauth' ? <span className="tiny muted">Inicia sesión para guardar.</span> : null}
        </div>
        <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>Al guardar, tus datos se conservan y regeneramos tu plan de entreno y tus macros según tu objetivo, equipo y tiempo.</p>
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

  async function token() { return window.__getIdToken ? window.__getIdToken() : Promise.resolve(null); }

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

Object.assign(window, { ProgressScreen, ProfileScreen });