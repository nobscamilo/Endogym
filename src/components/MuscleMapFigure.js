import Image from 'next/image';

const REGION_HOTSPOTS = {
  front: {
    front_shoulders: [
      { cx: 52, cy: 88, rx: 16, ry: 21, rotate: -22 },
      { cx: 128, cy: 88, rx: 16, ry: 21, rotate: 22 },
    ],
    chest: [
      { cx: 72, cy: 114, rx: 23, ry: 21, rotate: -10 },
      { cx: 108, cy: 114, rx: 23, ry: 21, rotate: 10 },
    ],
    biceps: [
      { cx: 39, cy: 149, rx: 12, ry: 20, rotate: -10 },
      { cx: 141, cy: 149, rx: 12, ry: 20, rotate: 10 },
    ],
    forearms: [
      { cx: 32, cy: 198, rx: 11, ry: 24, rotate: -12 },
      { cx: 148, cy: 198, rx: 11, ry: 24, rotate: 12 },
    ],
    abs: [
      { cx: 90, cy: 147, rx: 22, ry: 31, rotate: 0 },
      { cx: 90, cy: 190, rx: 19, ry: 26, rotate: 0 },
    ],
    obliques: [
      { cx: 62, cy: 170, rx: 13, ry: 29, rotate: -8 },
      { cx: 118, cy: 170, rx: 13, ry: 29, rotate: 8 },
    ],
    quadriceps: [
      { cx: 75, cy: 280, rx: 16, ry: 42, rotate: -4 },
      { cx: 105, cy: 280, rx: 16, ry: 42, rotate: 4 },
    ],
    adductors: [
      { cx: 90, cy: 274, rx: 12, ry: 34, rotate: 0 },
    ],
    calves: [
      { cx: 76, cy: 340, rx: 12, ry: 22, rotate: 0 },
      { cx: 104, cy: 340, rx: 12, ry: 22, rotate: 0 },
    ],
  },
  back: {
    rear_shoulders: [
      { cx: 52, cy: 88, rx: 16, ry: 21, rotate: -22 },
      { cx: 128, cy: 88, rx: 16, ry: 21, rotate: 22 },
    ],
    upper_back: [
      { cx: 90, cy: 116, rx: 26, ry: 24, rotate: 0 },
    ],
    lats: [
      { cx: 61, cy: 154, rx: 17, ry: 34, rotate: -8 },
      { cx: 119, cy: 154, rx: 17, ry: 34, rotate: 8 },
    ],
    triceps: [
      { cx: 39, cy: 149, rx: 12, ry: 20, rotate: -10 },
      { cx: 141, cy: 149, rx: 12, ry: 20, rotate: 10 },
    ],
    lower_back: [
      { cx: 90, cy: 187, rx: 16, ry: 24, rotate: 0 },
    ],
    glutes: [
      { cx: 74, cy: 234, rx: 18, ry: 20, rotate: -4 },
      { cx: 106, cy: 234, rx: 18, ry: 20, rotate: 4 },
    ],
    hamstrings: [
      { cx: 75, cy: 286, rx: 15, ry: 39, rotate: -3 },
      { cx: 105, cy: 286, rx: 15, ry: 39, rotate: 3 },
    ],
    calves: [
      { cx: 76, cy: 340, rx: 12, ry: 22, rotate: 0 },
      { cx: 104, cy: 340, rx: 12, ry: 22, rotate: 0 },
    ],
  },
};

const REGION_LABELS = {
  front_shoulders: 'Hombro anterior',
  chest: 'Pecho',
  biceps: 'Bíceps',
  forearms: 'Antebrazo',
  abs: 'Core anterior',
  obliques: 'Oblicuos',
  quadriceps: 'Cuadríceps',
  adductors: 'Aductores',
  calves: 'Pantorrillas',
  rear_shoulders: 'Hombro posterior',
  upper_back: 'Espalda alta',
  lats: 'Dorsales',
  triceps: 'Tríceps',
  lower_back: 'Zona lumbar',
  glutes: 'Glúteos',
  hamstrings: 'Isquios',
};

const SECONDARY_REGION_RULES = [
  { tokens: ['pectoral', 'chest'], front: ['chest'] },
  { tokens: ['deltoides anterior', 'hombro anterior', 'front deltoid'], front: ['front_shoulders'] },
  { tokens: ['deltoides lateral', 'deltoides medio', 'hombro lateral'], front: ['front_shoulders'], back: ['rear_shoulders'] },
  { tokens: ['deltoides posterior', 'rear delt', 'hombro posterior'], back: ['rear_shoulders'] },
  { tokens: ['biceps'], front: ['biceps'] },
  { tokens: ['triceps'], back: ['triceps'] },
  { tokens: ['antebrazo', 'forearm', 'agarre'], front: ['forearms'] },
  { tokens: ['dorsal', 'lat'], back: ['lats'] },
  { tokens: ['trapecio', 'romboides', 'escap'], back: ['upper_back'] },
  { tokens: ['lumbar', 'erector', 'lower back'], back: ['lower_back'] },
  { tokens: ['core', 'abdominal', 'recto abdominal'], front: ['abs'] },
  { tokens: ['oblic'], front: ['obliques'] },
  { tokens: ['glute'], back: ['glutes'] },
  { tokens: ['isquio', 'femoral', 'hamstring'], back: ['hamstrings'] },
  { tokens: ['cuadricep', 'quad'], front: ['quadriceps'] },
  { tokens: ['aductor'], front: ['adductors'] },
  { tokens: ['gemelo', 'soleo', 'pantorrilla', 'calf', 'tobillo'], front: ['calves'], back: ['calves'] },
];

function normalizeMuscleLabel(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function inferSecondaryRegions(muscles = []) {
  const front = new Set();
  const back = new Set();

  muscles.forEach((muscle) => {
    const normalized = normalizeMuscleLabel(muscle);

    SECONDARY_REGION_RULES.forEach((rule) => {
      if (rule.tokens.some((token) => normalized.includes(token))) {
        (rule.front || []).forEach((region) => front.add(region));
        (rule.back || []).forEach((region) => back.add(region));
      }
    });
  });

  return {
    front: Array.from(front),
    back: Array.from(back),
  };
}

function toUniqueLabels(regionNames = []) {
  return Array.from(
    new Set(regionNames.map((regionName) => REGION_LABELS[regionName] || regionName).filter(Boolean))
  );
}

function renderHotspots(view, regionNames, tone) {
  return regionNames.flatMap((regionName) => {
    const hotspots = REGION_HOTSPOTS[view][regionName] || [];
    return hotspots.map((spot, index) => (
      <g
        key={`${view}-${regionName}-${tone}-${index}`}
        transform={`rotate(${spot.rotate || 0} ${spot.cx} ${spot.cy})`}
      >
        <ellipse
          className={`atlas-spot-glow ${tone}`}
          cx={spot.cx}
          cy={spot.cy}
          rx={spot.rx * 1.28}
          ry={spot.ry * 1.28}
        />
        <ellipse
          className={`atlas-spot-core ${tone}`}
          cx={spot.cx}
          cy={spot.cy}
          rx={spot.rx}
          ry={spot.ry}
        />
        <ellipse
          className={`atlas-spot-ring ${tone}`}
          cx={spot.cx}
          cy={spot.cy}
          rx={spot.rx + 2}
          ry={spot.ry + 2}
        />
      </g>
    ));
  });
}

function AtlasFigure({ view, primaryRegions = [], secondaryRegions = [] }) {
  const imageHref = view === 'front' ? '/anatomy/gymbro-front-base.png' : '/anatomy/gymbro-back-base.png';
  const viewLabel = view === 'front' ? 'Frontal' : 'Posterior';
  const activeLabels = toUniqueLabels([...primaryRegions, ...secondaryRegions]);

  return (
    <article className="muscle-atlas-card">
      <div className="muscle-atlas-stage" role="img" aria-label={`Vista ${viewLabel.toLowerCase()} del mapa muscular`}>
        <div className="muscle-atlas-stage-glow" aria-hidden="true" />
        <Image
          src={imageHref}
          alt=""
          width={180}
          height={380}
          className={`anatomy-base-image is-${view}`}
          priority
        />
        <svg viewBox="0 0 180 380" aria-hidden="true">
          <defs>
            <filter id={`atlas-blur-${view}`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>
          <g filter={`url(#atlas-blur-${view})`}>
            {renderHotspots(view, secondaryRegions, 'secondary')}
            {renderHotspots(view, primaryRegions, 'primary')}
          </g>
          <g>
            {renderHotspots(view, secondaryRegions, 'secondary')}
            {renderHotspots(view, primaryRegions, 'primary')}
          </g>
        </svg>
      </div>
      <div className="muscle-atlas-footer">
        <span>{viewLabel}</span>
        <p>{activeLabels.length ? activeLabels.join(' · ') : 'Sin regiones destacadas'}</p>
      </div>
    </article>
  );
}

export default function MuscleMapFigure({
  anatomyRegions = { front: [], back: [] },
  primaryMuscles = [],
  secondaryMuscles = [],
}) {
  const inferredSecondaryRegions = inferSecondaryRegions(secondaryMuscles);
  const primaryRegionLabels = toUniqueLabels([
    ...(anatomyRegions.front || []),
    ...(anatomyRegions.back || []),
  ]);
  const secondaryRegionLabels = toUniqueLabels([
    ...(inferredSecondaryRegions.front || []),
    ...(inferredSecondaryRegions.back || []),
  ]);

  return (
    <section className="muscle-map-shell">
      <div className="muscle-map-header">
        <div>
          <p className="muscle-map-kicker">Atlas muscular</p>
          <h5>Activación anatómica</h5>
          <p className="muscle-map-subtitle">Vista técnica con focos primarios y apoyo secundario.</p>
        </div>
        <div className="muscle-map-legend-inline">
          <span><i className="legend-swatch primary" /> Primario</span>
          <span><i className="legend-swatch secondary" /> Secundario</span>
        </div>
      </div>

      <div className="muscle-atlas-grid">
        <AtlasFigure
          view="front"
          primaryRegions={anatomyRegions.front || []}
          secondaryRegions={inferredSecondaryRegions.front}
        />
        <AtlasFigure
          view="back"
          primaryRegions={anatomyRegions.back || []}
          secondaryRegions={inferredSecondaryRegions.back}
        />
      </div>

      <div className="muscle-map-insights">
        <article className="muscle-legend-item emphasis">
          <span className="legend-swatch primary" />
          <strong>Primarios</strong>
          <p>{primaryMuscles.length ? primaryMuscles.join(', ') : 'Sin datos'}</p>
          {primaryRegionLabels.length ? (
            <div className="muscle-region-chip-row">
              {primaryRegionLabels.map((label) => (
                <span key={label} className="muscle-region-chip primary">{label}</span>
              ))}
            </div>
          ) : null}
        </article>

        <article className="muscle-legend-item">
          <span className="legend-swatch secondary" />
          <strong>Secundarios</strong>
          <p>{secondaryMuscles.length ? secondaryMuscles.join(', ') : 'Sin datos'}</p>
          {secondaryRegionLabels.length ? (
            <div className="muscle-region-chip-row">
              {secondaryRegionLabels.map((label) => (
                <span key={label} className="muscle-region-chip secondary">{label}</span>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
