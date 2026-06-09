/* ENDOGYM STUDIO — Pantalla NUTRICIÓN (qué comer · compra · glucemia) + variaciones */
const { useState: useStateN, useEffect: useEffectN } = React;

/* ---- Añadir producto consumido (manual o por código de barras) → /api/meals ---- */
function AddFood({ onAdded }) {
  const [open, setOpen] = useStateN(false);
  const [f, setF] = useStateN({ name: '', calories: '', proteinGrams: '', carbsGrams: '', fatGrams: '' });
  const [code, setCode] = useStateN('');
  const [status, setStatus] = useStateN('idle'); // idle|looking|saving|ok|err|noauth|notfound
  const [photoStatus, setPhotoStatus] = useStateN('idle'); // idle|analyzing|ok|err|noauth|big
  const fileRef = React.useRef(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function authToken() {
    return (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
  }

  // Foto del plato → /api/analyze-plate (Gemini Vision estima macros + carga glucémica y
  // registra la comida en el servidor). Aquí solo sumamos los totales al resumen del día.
  async function analyzePhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setPhotoStatus('big'); return; }
    setPhotoStatus('analyzing');
    try {
      const token = await authToken();
      if (!token) { setPhotoStatus('noauth'); return; }
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      const r = await fetch('/api/analyze-plate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ imageBase64: dataUrl }),
      });
      if (!r.ok) { setPhotoStatus('err'); return; }
      const j = await r.json();
      const t = j && j.analysis && j.analysis.totals;
      if (!t) { setPhotoStatus('err'); return; }
      if (onAdded) onAdded({ calories: t.calories, proteinGrams: t.proteinGrams, carbsGrams: t.carbsGrams, fatGrams: t.fatGrams, glycemicLoad: t.glycemicLoad });
      setPhotoStatus('ok');
      setTimeout(() => setPhotoStatus('idle'), 3000);
    } catch (err) { setPhotoStatus('err'); }
  }

  async function lookup(barcode) {
    const bc = (barcode || code).trim();
    if (!bc) return;
    setStatus('looking');
    try {
      const token = await authToken();
      const headers = token ? { authorization: 'Bearer ' + token } : {};
      const r = await fetch('/api/products/barcode?code=' + encodeURIComponent(bc), { headers });
      if (!r.ok) { setStatus('notfound'); return; }
      const j = await r.json();
      const p = j.product || {};
      setF({
        name: p.name || 'Producto',
        calories: p.calories ?? '',
        proteinGrams: p.proteinGrams ?? '',
        carbsGrams: p.carbsGrams ?? '',
        fatGrams: p.fatGrams ?? '',
      });
      setStatus('idle');
    } catch (e) { setStatus('notfound'); }
  }

  async function scan() {
    try {
      if (!('BarcodeDetector' in window)) { setStatus('err'); return; }
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream; await video.play();
      let tries = 0;
      const tick = async () => {
        tries += 1;
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length) {
            stream.getTracks().forEach((t) => t.stop());
            setCode(codes[0].rawValue);
            lookup(codes[0].rawValue);
            return;
          }
        } catch (e) { /* sigue intentando */ }
        if (tries < 80) requestAnimationFrame(tick); else { stream.getTracks().forEach((t) => t.stop()); }
      };
      tick();
    } catch (e) { setStatus('err'); }
  }

  async function save() {
    const calories = Number(f.calories) || 0;
    if (!f.name.trim() || calories <= 0) { setStatus('err'); return; }
    setStatus('saving');
    try {
      const token = await authToken();
      if (!token) { setStatus('noauth'); return; }
      const food = {
        name: f.name.trim().slice(0, 200),
        calories,
        proteinGrams: Number(f.proteinGrams) || 0,
        carbsGrams: Number(f.carbsGrams) || 0,
        fatGrams: Number(f.fatGrams) || 0,
      };
      // Estima la carga glucémica (GL ≈ carbohidratos × IG/100, IG medio ~55) para que sume al día.
      const glycemicLoad = Math.round(food.carbsGrams * 0.55);
      const totals = { calories: food.calories, proteinGrams: food.proteinGrams, carbsGrams: food.carbsGrams, fatGrams: food.fatGrams, glycemicLoad };
      const r = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ foods: [food], totals, eatenAt: new Date().toISOString() }),
      });
      if (!r.ok) { setStatus('err'); return; }
      if (onAdded) onAdded(totals);
      setF({ name: '', calories: '', proteinGrams: '', carbsGrams: '', fatGrams: '' });
      setCode('');
      setStatus('ok');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (e) { setStatus('err'); }
  }

  if (!open) {
    return (
      <button className="btn block" style={{ marginTop: 2 }} onClick={() => setOpen(true)}>
        <Icon name="plus" size={17} /> Añadir alimento consumido
      </button>
    );
  }
  return (
    <SectionCard title="Añadir alimento" icon="plus" sub="Escanea un código de barras o introdúcelo a mano"
      action={<button className="btn ghost sm" onClick={() => setOpen(false)}><Icon name="close" size={15} /></button>}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row ac" style={{ gap: 8 }}>
          <div className="search-field" style={{ flex: 1 }}>
            <span className="s-ico"><Icon name="barcode" size={18} /></span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de barras…" inputMode="numeric" />
          </div>
          <button className="btn soft sm" onClick={() => lookup()} disabled={status === 'looking'}>{status === 'looking' ? 'Buscando…' : 'Buscar'}</button>
          <button className="btn ghost sm" onClick={scan} title="Escanear con cámara"><Icon name="camera" size={16} /></button>
        </div>
        {status === 'notfound' ? <p className="tiny muted" style={{ margin: 0 }}>Producto no encontrado. Introduce los datos a mano.</p> : null}

        {/* Foto del plato: la IA estima macros y carga glucémica y registra la comida. */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={analyzePhoto} style={{ display: 'none' }} />
        <button className="btn soft" onClick={() => fileRef.current && fileRef.current.click()} disabled={photoStatus === 'analyzing'}>
          <Icon name="camera" size={16} /> {photoStatus === 'analyzing' ? 'Analizando foto…' : 'Foto del plato (IA)'}
        </button>
        {photoStatus === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Plato analizado y añadido a hoy ✨</span> : null}
        {photoStatus === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo analizar la foto. Reintenta o añade a mano.</span> : null}
        {photoStatus === 'noauth' ? <span className="tiny muted">Inicia sesión para analizar fotos.</span> : null}
        {photoStatus === 'big' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>La imagen supera 5 MB. Usa una más ligera.</span> : null}
        <input className="text-input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre del alimento" />
        <div className="grid g-4" style={{ gap: 8 }}>
          <input className="text-input" type="number" value={f.calories} onChange={(e) => set('calories', e.target.value)} placeholder="kcal" />
          <input className="text-input" type="number" value={f.proteinGrams} onChange={(e) => set('proteinGrams', e.target.value)} placeholder="Proteína g" />
          <input className="text-input" type="number" value={f.carbsGrams} onChange={(e) => set('carbsGrams', e.target.value)} placeholder="Carbs g" />
          <input className="text-input" type="number" value={f.fatGrams} onChange={(e) => set('fatGrams', e.target.value)} placeholder="Grasa g" />
        </div>
        <div className="row ac" style={{ gap: 12 }}>
          <button className="btn" onClick={save} disabled={status === 'saving'}><Icon name="check" size={16} /> {status === 'saving' ? 'Guardando…' : 'Añadir a hoy'}</button>
          {status === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>¡Añadido!</span> : null}
          {status === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>Revisa nombre y kcal.</span> : null}
          {status === 'noauth' ? <span className="tiny muted">Inicia sesión para guardar.</span> : null}
        </div>
      </div>
    </SectionCard>
  );
}

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Normaliza una lista de comidas a los campos que espera el diseño (emoji/hue/done/time…).
function normMeals(arr) {
  const palette = [55, 78, 18, 162, 232, 300];
  return (arr || []).map((m, i) => ({
    done: false, hue: palette[i % palette.length], emoji: m.emoji || '🍽️', time: m.time || '',
    glClass: m.glClass || 'good', gl: m.gl ?? 0, ii: m.ii ?? 0, mins: m.mins ?? 10,
    ingredients: m.ingredients || [], steps: m.steps || [], serving: m.serving || '',
    ...m,
  }));
}

// Números de día (del mes) de la semana ACTUAL, empezando en lunes — calendario real.
function weekDateNumbers() {
  const now = new Date();
  const js = now.getDay(); // 0=Dom … 6=Sáb
  const toMonday = js === 0 ? -6 : 1 - js;
  const monday = new Date(now);
  monday.setDate(now.getDate() + toMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.getDate();
  });
}

// Índice del día de hoy dentro de la semana (Lun=0 … Dom=6).
function todayDowIndex(D) {
  const flagged = (D.nutritionDays || []).findIndex((d) => d.today);
  if (flagged >= 0) return flagged;
  const js = new Date().getDay(); // 0=Dom … 6=Sáb
  return js === 0 ? 6 : js - 1;
}

function NutritionScreen({ layout }) {
  const D = window.STUDIO;
  const [tab, setTab] = useStateN('hoy');
  const tIdx = todayDowIndex(D);
  const [dayIdx, setDayIdx] = useStateN(tIdx);
  const [gen, setGen] = useStateN(0);
  const [genStatus, setGenStatus] = useStateN('idle'); // idle|loading|ok|err|noauth
  const TABS = [{ id: 'hoy', label: 'Qué comer hoy' }, { id: 'compra', label: 'Compra & Batch' }, { id: 'glu', label: 'Glucemia' }];

  // Muestra las comidas del día seleccionado (D.meals se mantiene sincronizado con la selección).
  function showDay(i) {
    setDayIdx(i);
    if (D.mealWeek && D.mealWeek[i]) {
      D.meals = D.mealWeek[i].meals;
      D.currentMealDay = D.mealWeek[i].day; // para "Cambiar comida" (swap por día+slot)
      setGen((g) => g + 1);
    }
  }

  // Vuelca un plan (días + compra + batch) en window.STUDIO y refresca la vista.
  function applyNutrition(n) {
    if (!n) return false;
    if (Array.isArray(n.days) && n.days.length) {
      const week = n.days.map((d, i) => ({ day: d.day || DOW_LABELS[i] || ('D' + i), meals: normMeals(d.meals) }));
      D.mealWeek = week;
      const dateNums = weekDateNumbers();
      D.nutritionDays = week.map((d, i) => ({
        day: d.day,
        date: dateNums[i],
        kcal: d.meals.reduce((a, m) => a + (Number(m.kcal) || 0), 0),
        today: i === tIdx,
      }));
      const sel = week[Math.min(dayIdx, week.length - 1)] || week[0];
      D.meals = sel.meals;
      D.currentMealDay = sel.day;
    } else if (Array.isArray(n.meals) && n.meals.length) {
      // Compatibilidad con la forma antigua (un solo día).
      const single = normMeals(n.meals);
      D.mealWeek = [{ day: DOW_LABELS[tIdx], meals: single }];
      D.meals = single;
    } else {
      return false;
    }
    if (Array.isArray(n.shopping) && n.shopping.length) D.shopping = n.shopping.map((c) => ({ icon: '🛒', ...c }));
    if (Array.isArray(n.batch) && n.batch.length) D.batch = n.batch.map((b) => ({ emoji: '🍳', ...b }));
    setGen((g) => g + 1);
    return true;
  }
  // Expuesto para que "Cambiar comida" (MealDetail) pueda refrescar la vista con el plan guardado.
  window.__applyNutrition = applyNutrition;

  // Genera (o regenera) el plan semanal con IA y lo guarda en el servidor (POST).
  async function generate() {
    setGenStatus('loading');
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setGenStatus('noauth'); return; }
      const r = await fetch('/api/studio-nutrition', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token } });
      if (!r.ok) { setGenStatus('err'); return; }
      const j = await r.json();
      if (!j || !j.ok || !applyNutrition(j.nutrition)) { setGenStatus('err'); return; }
      setGenStatus('ok');
    } catch (e) { setGenStatus('err'); }
  }

  // Carga el plan ya guardado de esta semana (GET, sin gastar IA). Devuelve true si había uno.
  async function loadCached() {
    try {
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) return false;
      const r = await fetch('/api/studio-nutrition', { headers: { authorization: 'Bearer ' + token } });
      if (!r.ok) return false;
      const j = await r.json();
      if (j && j.ok && j.nutrition) return applyNutrition(j.nutrition);
      return false;
    } catch (e) { return false; }
  }

  // Al abrir Nutrición (una vez por sesión): primero intenta cargar el plan guardado de la
  // semana; si no hay, lo genera con IA una sola vez. Así no se regenera en cada visita.
  useEffectN(() => {
    if (window.__studioNutriAuto) return;
    window.__studioNutriAuto = true;
    (async () => {
      setGenStatus('loading');
      const had = await loadCached();
      if (had) { setGenStatus('ok'); return; }
      await generate();
    })();
  }, []);

  return (
    <div className="page stagger screen-enter">
      <div className="page-head">
        <div>
          <p className="eyebrow">Nutrición</p>
          <h1>Tu plan de comidas</h1>
          <p className="sub">Tu plan semanal: elige el día para ver su menú, la lista de la compra lista para el súper y cómo responde tu glucosa.</p>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
          <button className="btn" onClick={generate} disabled={genStatus === 'loading'}>
            <Icon name="sparkles" size={16} /> {genStatus === 'loading' ? 'Generando semana…' : 'Generar mi plan con IA'}
          </button>
          {genStatus === 'loading' ? <span className="tiny muted">Preparando 7 días de comidas, puede tardar un poco…</span> : null}
          {genStatus === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo generar. Reintenta.</span> : null}
          {genStatus === 'noauth' ? <span className="tiny muted">Inicia sesión para generar.</span> : null}
          {genStatus === 'ok' ? <span className="tiny" style={{ color: 'var(--glu-good)' }}>Plan semanal generado ✨</span> : null}
        </div>
      </div>

      <div className="day-rail">
        {D.nutritionDays.map((d, i) => (
          <button key={i} className={`day-pill ${dayIdx === i ? 'active' : ''}`} onClick={() => showDay(i)}>
            <div className="dp-day">{d.day}</div>
            <div className="dp-date num">{d.date}</div>
            <div className="dp-kcal num">{d.kcal} kcal</div>
          </button>
        ))}
      </div>

      <SegTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'hoy' && <NutritionToday key={`hoy-${dayIdx}-${gen}`} layout={layout} />}
      {tab === 'compra' && <NutritionShop key={`shop-${gen}`} />}
      {tab === 'glu' && <NutritionGlu key={`glu-${dayIdx}-${gen}`} />}
    </div>
  );
}

/* ---------- QUÉ COMER HOY ---------- */
function NutritionToday({ layout }) {
  const D = window.STUDIO;
  const { macroTargets: mt, meals } = D;
  const [me, setMe] = useStateN(D.macroEaten);
  const onAdded = (t) => setMe((p) => ({
    kcal: p.kcal + Math.round(Number(t.calories) || 0),
    protein: p.protein + Math.round(Number(t.proteinGrams) || 0),
    carbs: p.carbs + Math.round(Number(t.carbsGrams) || 0),
    fat: p.fat + Math.round(Number(t.fatGrams) || 0),
  }));
  // "Toca ahora": la próxima comida según la hora actual (avanza durante el día).
  const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 9999; };
  const next = meals.find((m) => !m.done && toMin(m.time) >= nowMin)
    || meals.find((m) => toMin(m.time) >= nowMin)
    || meals.find((m) => !m.done)
    || meals[meals.length - 1] || meals[0];
  return (
    <React.Fragment>
      {/* "Toca ahora" — qué comer de un vistazo */}
      <div className="card lg" style={{ background: 'linear-gradient(145deg, var(--accent-soft), var(--surface))', borderColor: 'transparent' }}>
        <div className="row ac" style={{ gap: 16 }}>
          <div className="meal-thumb" style={{ background: videoGrad(next.hue), color: '#fff', width: 64, height: 64, fontSize: '1.8rem' }}>{next.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="eyebrow">Toca ahora · {next.slot} {next.time}</p>
            <h2 style={{ fontSize: '1.4rem', margin: '4px 0 0', lineHeight: 1.1 }}>{next.dish}</h2>
            <div className="row ac wrap" style={{ gap: 8, marginTop: 10 }}>
              <span className="pill tiny num">{next.kcal} kcal</span>
              <span className="pill tiny num">P {next.p} · C {next.c} · G {next.f}</span>
              <span className="pill tiny"><Icon name="clock" size={12} /> {next.mins} min</span>
              <span className={`pill tiny ${next.glClass}`}><span className="dot" /> Carga baja</span>
            </div>
          </div>
        </div>
      </div>

      {/* Banda de macros */}
      <div className="card lg">
        <div className="macro-band">
          <Ring value={me.kcal} max={mt.kcal} size={150} stroke={16} color="var(--accent)">
            <div><div className="rc-num num">{mt.kcal - me.kcal}</div><div className="rc-lbl">kcal restan</div></div>
          </Ring>
          <div className="macro-bars">
            <MacroLine label="Proteína" v={me.protein} t={mt.protein} u="g" color="var(--protein)" />
            <MacroLine label="Carbohidratos" v={me.carbs} t={mt.carbs} u="g" color="var(--carbs)" />
            <MacroLine label="Grasas" v={me.fat} t={mt.fat} u="g" color="var(--fat)" />
            <div className="row between" style={{ marginTop: 2 }}>
              <span className="muted tiny num">{me.kcal} de {mt.kcal} kcal consumidas</span>
              <span className="pill good tiny"><span className="dot" /> Vas bien</span>
            </div>
          </div>
        </div>
      </div>

      {/* Añadir alimento consumido (manual o por código de barras) */}
      <AddFood onAdded={onAdded} />

      {/* Comidas — según variante */}
      <CoachBanner screen="nutrition_today" />
      {layout === 'tarjetas' && <MealsCards meals={meals} />}
      {layout === 'timeline' && <MealsTimeline meals={meals} />}
      {layout === 'plato' && <MealsPlate meals={meals} />}
    </React.Fragment>
  );
}

/* Detalle compartido de una comida */
function MealDetail({ m }) {
  const [sw, setSw] = useStateN('idle'); // idle|busy|err
  // Cambia ESTA comida por otra equivalente (IA): el servidor regenera solo este slot,
  // mantiene kcal/proteína del día y guarda el plan actualizado.
  async function swapThisMeal() {
    setSw('busy');
    try {
      const D = window.STUDIO;
      const token = await (window.__getIdToken ? window.__getIdToken() : Promise.resolve(null));
      if (!token) { setSw('err'); return; }
      const day = D.currentMealDay || (D.mealWeek && D.mealWeek[0] && D.mealWeek[0].day) || 'Lun';
      const r = await fetch('/api/studio-nutrition', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ swapMeal: { day, slot: m.slot } }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok && j.nutrition && window.__applyNutrition) { window.__applyNutrition(j.nutrition); return; }
      setSw('err');
    } catch (e) { setSw('err'); }
  }
  return (
    <div className="meal-body-pad">
      <div>
        <div className="mb-label">Ingredientes</div>
        <div className="ingredient-pills">{m.ingredients.map((x, k) => <span key={k}>{x}</span>)}</div>
      </div>
      <div className="meal-body-cols">
        <div>
          <div className="mb-label">Preparación · {m.mins} min</div>
          <ol className="step-list">{m.steps.map((x, k) => <li key={k}>{x}</li>)}</ol>
        </div>
        <div>
          <div className="mb-label">Servicio</div>
          <p className="tiny" style={{ margin: 0, lineHeight: 1.5 }}>{m.serving}</p>
          <div className="chips" style={{ marginTop: 10 }}>
            <span className={`pill tiny ${m.glClass}`}><span className="dot" /> Carga {m.glClass === 'good' ? 'baja' : m.glClass === 'mid' ? 'media' : 'alta'}</span>
            <span className="pill tiny"><Icon name="drop" size={12} /> II {m.ii}</span>
          </div>
        </div>
      </div>
      <div className="row wrap ac" style={{ gap: 8 }}>
        <button className="btn soft sm"><Icon name="check" size={15} /> Marcar como hecha</button>
        <button className="btn ghost sm" onClick={swapThisMeal} disabled={sw === 'busy'}>
          <Icon name="sparkles" size={15} /> {sw === 'busy' ? 'Buscando alternativa…' : 'Cambiar comida'}
        </button>
        {sw === 'err' ? <span className="tiny" style={{ color: 'var(--glu-high)' }}>No se pudo cambiar. Reintenta.</span> : null}
      </div>
    </div>
  );
}

/* Variante A — tarjetas expandibles */
function MealsCards({ meals }) {
  const [open, setOpen] = useStateN(null);
  return (
    <div className="grid" style={{ gap: 13 }}>
      {meals.map((m, i) => (
        <div key={i} className={`card flush meal-card ${open === i ? 'open' : ''}`}>
          <div className="meal-head" onClick={() => setOpen(open === i ? null : i)}>
            <div className="meal-thumb" style={{ background: videoGrad(m.hue), color: '#fff' }}>{m.emoji}</div>
            <div className="meal-info">
              <div className="ms-slot">{m.slot} · {m.time}</div>
              <strong>{m.dish}</strong>
              <div className="ms-macros">P {m.p} · C {m.c} · G {m.f} · <span className="faint">GL {m.gl}</span></div>
            </div>
            <div className="meal-kcal"><div className="mk-num num">{m.kcal}</div><div className="mk-u">kcal</div></div>
            {m.done ? <span className="ex-check" style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', width: 26, height: 26 }}><Icon name="check" size={14} /></span>
              : <span className="meal-chev"><Icon name="chevronDown" size={20} /></span>}
          </div>
          <div className="meal-body"><div className="meal-body-inner"><MealDetail m={m} /></div></div>
        </div>
      ))}
    </div>
  );
}

/* Variante B — timeline del día */
function MealsTimeline({ meals }) {
  const [open, setOpen] = useStateN(null);
  return (
    <div className="card lg">
      <div className="timeline">
        {meals.map((m, i) => (
          <div key={i} className={`tl-item ${m.done ? 'done' : ''}`}>
            <span className="tl-dot">{m.done ? <Icon name="check" size={13} /> : m.emoji}</span>
            <div className="card flush meal-card" style={{ border: '1px solid var(--line)' }}>
              <div className="meal-head" style={{ padding: '13px 15px' }} onClick={() => setOpen(open === i ? null : i)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tl-time">{m.time} · {m.slot}</div>
                  <strong style={{ display: 'block', fontSize: '0.96rem', fontWeight: 700, marginTop: 2 }}>{m.dish}</strong>
                  <div className="ms-macros">{m.kcal} kcal · P {m.p} · C {m.c} · G {m.f}</div>
                </div>
                <span className={`pill tiny ${m.glClass}`}>GL {m.gl}</span>
                <span className="meal-chev" style={{ transform: open === i ? 'rotate(180deg)' : 'none' }}><Icon name="chevronDown" size={18} /></span>
              </div>
              <div className="meal-body" style={{ gridTemplateRows: open === i ? '1fr' : '0fr' }}><div className="meal-body-inner"><MealDetail m={m} /></div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Variante C — plato con donut por comida */
function MealsPlate({ meals }) {
  const { open } = useVideo();
  return (
    <div className="plate-grid">
      {meals.map((m, i) => (
        <div key={i} className="card plate-card hover tap">
          <Ring value={m.kcal} max={650} size={92} stroke={11} color={`oklch(0.72 0.14 ${m.hue})`}>
            <div><div className="rc-num num" style={{ fontSize: '1.05rem' }}>{m.kcal}</div><div className="rc-lbl">kcal</div></div>
          </Ring>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ms-slot">{m.slot} · {m.time}</div>
            <strong style={{ display: 'block', fontSize: '0.98rem', fontWeight: 700, margin: '2px 0 6px', lineHeight: 1.2 }}>{m.dish}</strong>
            <div className="row ac wrap" style={{ gap: 6 }}>
              <span className="pill tiny num">P {m.p}</span>
              <span className="pill tiny num">C {m.c}</span>
              <span className="pill tiny num">G {m.f}</span>
              <span className={`pill tiny ${m.glClass}`}>GL {m.gl}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- COMPRA & BATCH ---------- */
function NutritionShop() {
  const D = window.STUDIO;
  const [cats, setCats] = useStateN(D.shopping);
  const toggle = (ci, ii) => setCats((p) => p.map((c, x) => x !== ci ? c : { ...c, items: c.items.map((it, y) => y !== ii ? it : { ...it, checked: !it.checked }) }));
  const total = cats.reduce((a, c) => a + c.items.length, 0);
  const checked = cats.reduce((a, c) => a + c.items.filter((i) => i.checked).length, 0);
  return (
    <div className="grid g-2" style={{ gridTemplateColumns: '1.05fr 0.95fr', alignItems: 'start' }}>
      <SectionCard title="Lista de la compra" icon="cart" sub={`${checked} de ${total} en el carro`}
        action={<button className="btn ghost sm"><Icon name="share" size={15} /> Compartir</button>}>
        <div className="bar" style={{ marginBottom: 16 }}><i style={{ width: (checked / total * 100) + '%' }} /></div>
        {cats.map((c, ci) => (
          <div key={ci} className="shop-cat">
            <div className="shop-cat-head"><span className="sc-ico">{c.icon}</span><h4>{c.cat}</h4><span className="sc-count num">{c.items.filter((i) => i.checked).length}/{c.items.length}</span></div>
            {c.items.map((it, ii) => (
              <div key={ii} className={`shop-item ${it.checked ? 'checked' : ''}`} onClick={() => toggle(ci, ii)}>
                <span className="shop-box"><Icon name="check" size={15} /></span>
                <span className="si-name">{it.name}</span>
                <span className="si-qty">{it.qty}</span>
              </div>
            ))}
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Batch cooking del domingo" icon="pot" sub="Cocina una vez, come toda la semana.">
        <div className="grid" style={{ gap: 12 }}>
          {D.batch.map((b, i) => (
            <div key={i} className="card batch-card">
              <div className="batch-emoji">{b.emoji}</div>
              <div style={{ flex: 1 }}>
                <div className="row between" style={{ alignItems: 'baseline' }}>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem' }}>{b.title}</strong>
                  <span className="pill tiny"><Icon name="clock" size={12} /> {b.time}</span>
                </div>
                <p className="tiny muted" style={{ margin: '6px 0 0', lineHeight: 1.45 }}>{b.desc}</p>
                <span className="tiny" style={{ color: 'var(--accent-on-soft)', fontWeight: 700 }}>{b.day}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* ---------- GLUCEMIA ---------- */
function NutritionGlu() {
  const D = window.STUDIO;
  const g = D.glycemic, meals = D.meals;
  const needle = Math.min(96, Math.max(4, g.dayLoad));
  return (
    <React.Fragment>
      <div className="grid g-2">
        <SectionCard title="Carga glucémica del día" icon="drop" sub="Cuánto eleva tu glucosa lo que comes hoy">
          <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 18 }}>
            <Stat num={g.dayLoad} unit="GL" label="Carga baja-moderada" color="var(--glu-good)" />
            <span className="pill good"><span className="dot" /> En rango</span>
          </div>
          <div className="glu-gauge">
            <div className="glu-track"><div className="glu-needle" style={{ left: needle + '%' }} /></div>
            <div className="glu-scale"><span>Baja</span><span>Moderada</span><span>Alta</span></div>
          </div>
          <div style={{ marginTop: 16 }}><CoachBanner screen="glucemia" /></div>
        </SectionCard>

        <SectionCard title="Respuesta a lo largo del día" icon="heart"
          action={g.insulinIndex != null ? <span className="pill tiny"><Icon name="drop" size={12} /> II medio {g.insulinIndex}</span> : null}>
          {Array.isArray(g.points) && g.points.length ? (
            <React.Fragment>
              <div style={{ marginTop: 10 }}><Spark data={g.points} color="var(--glu-mid)" height={130} /></div>
              <div className="glu-scale" style={{ marginTop: 6 }}><span>08h</span><span>12h</span><span>16h</span><span>21h</span></div>
            </React.Fragment>
          ) : (
            <div className="empty" style={{ lineHeight: 1.5 }}>La curva continua necesita un sensor de glucosa (CGM). Mostramos tu <strong>carga estimada</strong> por comidas e impacto por plato.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Impacto por comida" icon="nutrition" sub="Ordenadas por carga glucémica">
        <div className="stack">
          {[...meals].sort((a, b) => b.gl - a.gl).map((m, i) => (
            <div key={i} className="row between" style={{ padding: '12px 4px', borderBottom: i < meals.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div className="row ac" style={{ gap: 12 }}>
                <span style={{ fontSize: '1.4rem' }}>{m.emoji}</span>
                <div><strong style={{ fontSize: '0.92rem' }}>{m.dish}</strong><div className="tiny muted num">{m.slot} · {m.kcal} kcal</div></div>
              </div>
              <div className="glu-impact">
                <div className="glu-bar"><i style={{ width: Math.min(100, m.gl * 5) + '%', background: m.glClass === 'good' ? 'var(--glu-good)' : m.glClass === 'mid' ? 'var(--glu-mid)' : 'var(--glu-high)' }} /></div>
                <span className={`pill tiny ${m.glClass}`} style={{ minWidth: 52, justifyContent: 'center' }}>GL {m.gl}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </React.Fragment>
  );
}

Object.assign(window, { NutritionScreen });
