const REGION_HOTSPOTS = {
  front: {
    front_shoulders: [
      { cx: 34, cy: 34, rx: 8, ry: 10, rotate: -24 },
      { cx: 66, cy: 34, rx: 8, ry: 10, rotate: 24 },
    ],
    chest: [
      { cx: 39, cy: 44, rx: 11, ry: 9, rotate: -10 },
      { cx: 61, cy: 44, rx: 11, ry: 9, rotate: 10 },
    ],
    biceps: [
      { cx: 24, cy: 53, rx: 5, ry: 12, rotate: -14 },
      { cx: 76, cy: 53, rx: 5, ry: 12, rotate: 14 },
    ],
    forearms: [
      { cx: 15, cy: 73, rx: 5, ry: 14, rotate: -18 },
      { cx: 85, cy: 73, rx: 5, ry: 14, rotate: 18 },
    ],
    abs: [
      { cx: 50, cy: 60, rx: 11, ry: 16, rotate: 0 },
      { cx: 50, cy: 76, rx: 9, ry: 12, rotate: 0 },
    ],
    obliques: [
      { cx: 39, cy: 62, rx: 6, ry: 14, rotate: -8 },
      { cx: 61, cy: 62, rx: 6, ry: 14, rotate: 8 },
    ],
    quadriceps: [
      { cx: 42, cy: 101, rx: 7, ry: 21, rotate: -3 },
      { cx: 58, cy: 101, rx: 7, ry: 21, rotate: 3 },
    ],
    adductors: [
      { cx: 50, cy: 99, rx: 6, ry: 17, rotate: 0 },
    ],
    calves: [
      { cx: 43, cy: 129, rx: 6, ry: 14, rotate: 0 },
      { cx: 57, cy: 129, rx: 6, ry: 14, rotate: 0 },
    ],
  },
  back: {
    rear_shoulders: [
      { cx: 32, cy: 36, rx: 8, ry: 10, rotate: -20 },
      { cx: 68, cy: 36, rx: 8, ry: 10, rotate: 20 },
    ],
    upper_back: [
      { cx: 50, cy: 41, rx: 15, ry: 13, rotate: 0 },
    ],
    lats: [
      { cx: 39, cy: 52, rx: 8, ry: 17, rotate: -9 },
      { cx: 61, cy: 52, rx: 8, ry: 17, rotate: 9 },
    ],
    triceps: [
      { cx: 24, cy: 57, rx: 5, ry: 12, rotate: -14 },
      { cx: 76, cy: 57, rx: 5, ry: 12, rotate: 14 },
    ],
    lower_back: [
      { cx: 50, cy: 70, rx: 8, ry: 13, rotate: 0 },
    ],
    glutes: [
      { cx: 42, cy: 84, rx: 8, ry: 10, rotate: -3 },
      { cx: 58, cy: 84, rx: 8, ry: 10, rotate: 3 },
    ],
    hamstrings: [
      { cx: 42, cy: 108, rx: 7, ry: 20, rotate: -3 },
      { cx: 58, cy: 108, rx: 7, ry: 20, rotate: 3 },
    ],
    calves: [
      { cx: 43, cy: 130, rx: 6, ry: 14, rotate: 0 },
      { cx: 57, cy: 130, rx: 6, ry: 14, rotate: 0 },
    ],
  },
};

const VIEW_CONFIG = {
  front: {
    label: 'Frontal',
    src: '/anatomy/gray-front.png',
  },
  back: {
    label: 'Posterior',
    src: '/anatomy/gray-back.png',
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
          rx={spot.rx * 1.45}
          ry={spot.ry * 1.45}
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
  const viewConfig = VIEW_CONFIG[view];
  const viewLabel = viewConfig.label;
  const activeLabels = toUniqueLabels([...primaryRegions, ...secondaryRegions]);

  return (
    <article className="muscle-atlas-card">
      <div className="muscle-atlas-stage" role="img" aria-label={`Vista ${viewLabel.toLowerCase()} del mapa muscular`}>
        <img className="muscle-atlas-base" src={viewConfig.src} alt="" aria-hidden="true" />
        <svg className="muscle-atlas-overlay" viewBox="0 0 100 160" aria-hidden="true">
          <defs>
            <filter id={`atlas-blur-${view}`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.8" />
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
        <div className="muscle-atlas-vignette" aria-hidden="true" />
      </div>
      <div className="muscle-atlas-footer">
        <span>{viewLabel}</span>
        {activeLabels.length > 0 && <p>{activeLabels.join(' · ')}</p>}
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
          <h5>Activación muscular</h5>
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
          {primaryRegionLabels.length > 0 && (
            <div className="muscle-region-chip-row">
              {primaryRegionLabels.map((label) => (
                <span key={label} className="muscle-region-chip primary">{label}</span>
              ))}
            </div>
          )}
        </article>

        <article className="muscle-legend-item">
          <span className="legend-swatch secondary" />
          <strong>Secundarios</strong>
          <p>{secondaryMuscles.length ? secondaryMuscles.join(', ') : 'Sin datos'}</p>
          {secondaryRegionLabels.length > 0 && (
            <div className="muscle-region-chip-row">
              {secondaryRegionLabels.map((label) => (
                <span key={label} className="muscle-region-chip secondary">{label}</span>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
