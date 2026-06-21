/* ENDOGYM STUDIO — iconos, logo y primitivas de visualización */
const { useState, useEffect, useRef } = React;

const ICONS = {
  today:    'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  train:    'M6.5 6.5l11 11M4 9l2-2 3 3-2 2zM15 20l2-2-3-3-2 2zM2 11l2 2M20 11l2 2',
  nutrition:'M12 21c-4 0-7-3-7-8 0-3 2-5 4-5 1.2 0 2.2.6 3 1.6C16 8.6 17 8 18 8c1.4 0 2.5 1.2 2.5 3M12 8c0-2 1-4 4-5-.2 2-1.4 3.6-4 5z',
  progress: 'M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7M20 16v-3',
  profile:  'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0',
  play:     'M8 5.5v13l11-6.5z',
  pause:    'M8 5h3v14H8zM13 5h3v14h-3z',
  plus:     'M12 5v14M5 12h14',
  check:    'M5 12.5l4.5 4.5L19 7',
  menu:     'M4 6h16M4 12h16M4 18h16',
  close:    'M6 6l12 12M18 6 6 18',
  chevronLeft:  'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown:  'M6 9l6 6 6-6',
  bell:     'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0',
  flame:    'M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1-.5-2-1-2.5C16 9 17 11 17 13a5 5 0 0 1-10 0c0-3 2.5-4.5 3-7 .3-1.5 1.5-2.5 2-3z',
  drop:     'M12 3c3.5 4 6 7 6 10.5a6 6 0 1 1-12 0C6 10 8.5 7 12 3z',
  heart:    'M12 20s-7-4.5-9.5-9C1 8 2.5 4.5 6 4.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 15.5 12 20 12 20z',
  clock:    'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  sun:      'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon:     'M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z',
  sparkles: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z',
  search:   'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  externalLink: 'M14 4h6v6M20 4l-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  edit:     'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4L17 7a7.6 7.6 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5A7.6 7.6 0 0 0 9 7L6.6 6.1l-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4L9 17a7.6 7.6 0 0 0 1.7 1l.3 2.5h4l.3-2.5A7.6 7.6 0 0 0 17 17l2.4.9 2-3.4z',
  scale:    'M12 4a2 2 0 1 0 0-.01M5 8h14l2.5 9a2 2 0 0 1-2 2.5H4.5a2 2 0 0 1-2-2.5zM9 12l3-4 3 4',
  cart:     'M3 4h2l2.4 12.4a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.78L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  pot:      'M5 10h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM3 10h18M8 10V7a4 4 0 0 1 8 0v3',
  camera:   'M4 8a2 2 0 0 1 2-2h2l1.2-2h5.6L18 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  barcode:  'M3 5v14M6 5v14M9 5v10M12 5v14M15 5v10M18 5v14M21 5v14',
  calc:     'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h4',
  bolt:     'M13 2 4.5 13.5H11l-1 8.5L20 10h-6.5z',
  target:   'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  share:    'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14',
  filter:   'M3 5h18l-7 8v6l-4-2v-4z',
  sliders:  'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5M14 4v4M6 10v4M11 16v4',
  dumbbell: 'M6.5 6.5l11 11M4 9l2-2 3 3-2 2zM15 20l2-2-3-3-2 2zM2 11l2 2M20 11l2 2',
  zap:      'M11 3 4 14h6l-1 7 8-12h-6z',
  list:     'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  leaf:     'M5 20c0-8 6-14 15-15-.5 9-6.5 15-15 15zM5 20c2-5 5-8 9-10',
  back:     'M19 12H5M11 18l-6-6 6-6',
};

function Icon({ name, size = 22, stroke = 2, fill = 'none', style }) {
  const d = ICONS[name];
  if (!d) return null;
  const solid = name === 'play' || name === 'pause' || name === 'bolt' || name === 'zap';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={solid ? 'currentColor' : fill} stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ---- Logo Ignios (marca nueva: llama / ignición) ---- */
function Logo({ size = 34 }) {
  const id = 'ig' + size;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="22" y1="10" x2="42" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent-2)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="18" fill="var(--accent-soft)" />
      <path d="M34.5 10c.5 9.5 10.5 13.5 10.5 25.5a13 13 0 0 1-26 0c0-6.2 3.2-10.4 7.2-14.4-.2 4 1.8 6.2 4.8 6.2 3.2 0 4.6-3 2.6-7.2-2.4-5.2-2.2-10.4-1.9-16z" fill={`url(#${id})`} />
      <path d="M32 33c.3 4.6 5.6 6 4.4 11.2A6.2 6.2 0 0 1 24 43c0-3 1.6-5 3.8-7.2.1 1.8 1.1 2.8 2.2 2.8 1.4 0 2.2-1.6 1.4-3.4-.6-1.4-.4-2.8.6-2.2z" fill="var(--accent-soft)" opacity="0.5" />
    </svg>
  );
}

/* ---- Activity ring ---- */
function Ring({ value = 0, max = 100, size = 120, stroke = 13, color = 'var(--accent)', track, children, delay = 0 }) {
  const v = Math.max(0, Math.min(1, value / max));
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track || 'var(--surface-3)'} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      {children ? <div className="ring-center">{children}</div> : null}
    </div>
  );
}

function TripleRing({ rings, size = 150 }) {
  const gap = 6, stroke = 13;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      {rings.map((ring, i) => {
        const s = size - i * (stroke + gap) * 2;
        return (
          <div key={i} style={{ position: 'absolute', inset: i * (stroke + gap), display: 'grid', placeItems: 'center' }}>
            <Ring value={ring.value} max={ring.max} size={s} stroke={stroke} color={ring.color} track={ring.track} delay={i * 140} />
          </div>
        );
      })}
    </div>
  );
}

/* ---- Arc gauge (semicircular, estilo Whoop/Oura) ---- */
function Arc({ value = 0, max = 100, size = 200, stroke = 16, color = 'var(--accent)', children }) {
  const v = Math.max(0, Math.min(1, value / max));
  const r = (size - stroke) / 2;
  const cy = size / 2;
  const arc = Math.PI * r; // semicircle length
  const h = size / 2 + stroke / 2 + 4;
  return (
    <div className="arc-wrap" style={{ width: size, height: h }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
        <path d={`M${stroke / 2},${cy} A${r},${r} 0 0 1 ${size - stroke / 2},${cy}`} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} strokeLinecap="round" />
        <path d={`M${stroke / 2},${cy} A${r},${r} 0 0 1 ${size - stroke / 2},${cy}`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={arc} strokeDashoffset={arc * (1 - v)} />
      </svg>
      {children ? <div className="arc-center">{children}</div> : null}
    </div>
  );
}

/* ---- Sparkline ---- */
function Spark({ data = [], color = 'var(--accent)', height = 64, fill = true }) {
  const ref = useRef(null);
  const [w, setW] = useState(300);
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver((e) => setW(e[0].contentRect.width)); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  // Sin datos suficientes: línea base (evita romper con arrays vacíos/de 1 punto).
  if (!Array.isArray(data) || data.length < 2) {
    return (
      <div ref={ref} style={{ width: '100%', height, display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '100%', borderTop: '2px dashed var(--line)', opacity: 0.7 }} />
      </div>
    );
  }
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1, pad = 6;
  const pts = data.map((d, i) => [pad + (i / (data.length - 1)) * (w - pad * 2), pad + (1 - (d - min) / span) * (height - pad * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const gid = 'sp' + Math.round(min * 100) + Math.round(w);
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height, width: '100%', display: 'block' }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.30" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {fill ? <path d={area} fill={`url(#${gid})`} /> : null}
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={color} stroke="var(--surface)" strokeWidth="2" />
      </svg>
    </div>
  );
}

/* ---- Mini bar chart (carga semanal / strain) ---- */
function Bars({ data = [], color = 'var(--accent)', height = 90, labels = [], activeIdx = -1 }) {
  const max = Math.max(...data, 0.001);
  return (
    <div className="bars" style={{ height: height + (labels.length ? 18 : 0) }}>
      <div className="bars-row" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="bar-col" title={labels[i] || ''}>
            <div className="bar-fill" style={{ height: Math.max(4, (d / max) * 100) + '%', background: i === activeIdx ? color : 'color-mix(in oklch, ' + color + ' 42%, var(--surface-3))', animationDelay: (i * 0.05) + 's' }} />
          </div>
        ))}
      </div>
      {labels.length ? <div className="bars-labels">{labels.map((l, i) => <span key={i} className={i === activeIdx ? 'on' : ''}>{l}</span>)}</div> : null}
    </div>
  );
}

Object.assign(window, { Icon, ICONS, Logo, Ring, TripleRing, Arc, Spark, Bars });
