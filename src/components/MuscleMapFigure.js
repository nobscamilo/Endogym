const REGION_MASKS = {
  front: {
    front_shoulders: [
      'M25.5 36.5 C26.4 31.5 30.7 28.8 35.8 29.7 C39.4 31.1 40.8 35.2 39.2 40.4 C37.7 45.1 33.4 47.4 28.4 45.4 C25.3 43.1 24.4 40.1 25.5 36.5 Z',
      'M74.5 36.5 C73.6 31.5 69.3 28.8 64.2 29.7 C60.6 31.1 59.2 35.2 60.8 40.4 C62.3 45.1 66.6 47.4 71.6 45.4 C74.7 43.1 75.6 40.1 74.5 36.5 Z',
    ],
    chest: [
      'M30.2 43.2 C34.7 37.6 43.7 37.3 49.6 41.3 L49.6 52.8 C43.4 55.1 35.5 53.8 31.1 49.7 C29 47.6 28.5 45.1 30.2 43.2 Z',
      'M69.8 43.2 C65.3 37.6 56.3 37.3 50.4 41.3 L50.4 52.8 C56.6 55.1 64.5 53.8 68.9 49.7 C71 47.6 71.5 45.1 69.8 43.2 Z',
    ],
    biceps: [
      'M21.2 47.6 C25.4 47.8 27.1 53.1 25.8 60.1 C24.8 66.3 21.5 70.1 17.8 68.4 C18.2 61.5 18.9 52.5 21.2 47.6 Z',
      'M78.8 47.6 C74.6 47.8 72.9 53.1 74.2 60.1 C75.2 66.3 78.5 70.1 82.2 68.4 C81.8 61.5 81.1 52.5 78.8 47.6 Z',
    ],
    forearms: [
      'M13.5 66.6 C17.2 67.1 19.2 71.9 18.3 79.8 C17.4 88.5 13.4 96.7 9.6 96.4 C9.8 85.5 10.7 74.3 13.5 66.6 Z',
      'M86.5 66.6 C82.8 67.1 80.8 71.9 81.7 79.8 C82.6 88.5 86.6 96.7 90.4 96.4 C90.2 85.5 89.3 74.3 86.5 66.6 Z',
    ],
    abs: [
      'M42.1 56.2 C44.8 52.9 55.2 52.9 57.9 56.2 C59.2 64.6 58.7 73.2 55.8 79.5 C53.9 83.6 46.1 83.6 44.2 79.5 C41.3 73.2 40.8 64.6 42.1 56.2 Z',
      'M43.6 80.2 C47.7 83.1 52.3 83.1 56.4 80.2 C57.6 87.6 55.2 94.8 50 99.5 C44.8 94.8 42.4 87.6 43.6 80.2 Z',
    ],
    obliques: [
      'M35.2 57.2 C39.1 61.7 40 71.8 38 82.6 C34.1 80.6 31.3 75.1 31.1 68.4 C31.1 63.2 32.5 59.3 35.2 57.2 Z',
      'M64.8 57.2 C60.9 61.7 60 71.8 62 82.6 C65.9 80.6 68.7 75.1 68.9 68.4 C68.9 63.2 67.5 59.3 64.8 57.2 Z',
    ],
    quadriceps: [
      'M36.8 88.3 C43 87.5 47.2 95.3 47.1 107.8 C47 120.1 43.8 131.1 39.5 132.3 C34.8 119.1 33.6 101.3 36.8 88.3 Z',
      'M63.2 88.3 C57 87.5 52.8 95.3 52.9 107.8 C53 120.1 56.2 131.1 60.5 132.3 C65.2 119.1 66.4 101.3 63.2 88.3 Z',
    ],
    adductors: [
      'M48.2 89.6 C50.6 95.3 51.3 109.8 49.8 124.4 C45.2 113.4 44.6 99.1 48.2 89.6 Z',
      'M51.8 89.6 C49.4 95.3 48.7 109.8 50.2 124.4 C54.8 113.4 55.4 99.1 51.8 89.6 Z',
    ],
    calves: [
      'M40.1 120.8 C45.3 125 45.6 140.2 42.3 150.2 C37.5 145.5 36.5 130.4 40.1 120.8 Z',
      'M59.9 120.8 C54.7 125 54.4 140.2 57.7 150.2 C62.5 145.5 63.5 130.4 59.9 120.8 Z',
    ],
  },
  back: {
    rear_shoulders: [
      'M24.4 37.4 C26.2 31.7 31.4 28.9 36.9 30.7 C39.7 33.5 39.4 38.3 36.4 42.3 C32.4 44.2 27.6 43.3 24.4 39.7 Z',
      'M75.6 37.4 C73.8 31.7 68.6 28.9 63.1 30.7 C60.3 33.5 60.6 38.3 63.6 42.3 C67.6 44.2 72.4 43.3 75.6 39.7 Z',
    ],
    upper_back: [
      'M36.2 35.2 C41.6 30.9 58.4 30.9 63.8 35.2 C61.3 44.6 56.9 51.5 50 55.6 C43.1 51.5 38.7 44.6 36.2 35.2 Z',
    ],
    lats: [
      'M35.2 45.8 C42.3 49.2 45.2 59.9 43.1 76.2 C37 74.6 32.1 66.2 31.2 56.5 C30.9 51.5 32.3 47.5 35.2 45.8 Z',
      'M64.8 45.8 C57.7 49.2 54.8 59.9 56.9 76.2 C63 74.6 67.9 66.2 68.8 56.5 C69.1 51.5 67.7 47.5 64.8 45.8 Z',
    ],
    triceps: [
      'M20.1 47.2 C24.8 48.5 27.5 55 26.1 64 C24.9 70.6 21.2 74.8 17.4 73 C17.6 62.9 18.3 53.4 20.1 47.2 Z',
      'M79.9 47.2 C75.2 48.5 72.5 55 73.9 64 C75.1 70.6 78.8 74.8 82.6 73 C82.4 62.9 81.7 53.4 79.9 47.2 Z',
    ],
    lower_back: [
      'M43.4 65.4 C46.5 62.5 53.5 62.5 56.6 65.4 C57 72.9 54.8 80.9 50 87 C45.2 80.9 43 72.9 43.4 65.4 Z',
    ],
    glutes: [
      'M35.3 82.4 C39 76.9 47.7 77.5 50 83.6 C48.8 91.1 43.4 96.1 36.9 95.1 C33.2 91.8 32.6 86.4 35.3 82.4 Z',
      'M64.7 82.4 C61 76.9 52.3 77.5 50 83.6 C51.2 91.1 56.6 96.1 63.1 95.1 C66.8 91.8 67.4 86.4 64.7 82.4 Z',
    ],
    hamstrings: [
      'M37.2 94.2 C43.5 96.5 46.1 106.7 45 121.2 C43.9 132.7 40.5 141.2 36.2 143 C33.4 128.6 33.7 106.4 37.2 94.2 Z',
      'M62.8 94.2 C56.5 96.5 53.9 106.7 55 121.2 C56.1 132.7 59.5 141.2 63.8 143 C66.6 128.6 66.3 106.4 62.8 94.2 Z',
    ],
    calves: [
      'M40.2 119.6 C45.9 124.6 45.2 141.8 41.9 150.7 C37.2 145.5 36.4 128.8 40.2 119.6 Z',
      'M59.8 119.6 C54.1 124.6 54.8 141.8 58.1 150.7 C62.8 145.5 63.6 128.8 59.8 119.6 Z',
    ],
  },
};

const VIEW_CONFIG = {
  front: {
    label: 'Frontal',
    src: '/anatomy/gray-front.png',
    width: 791,
    height: 1342,
  },
  back: {
    label: 'Posterior',
    src: '/anatomy/gray-back.png',
    width: 978,
    height: 1297,
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

function renderRegionMasks(view, regionNames, tone) {
  return regionNames.flatMap((regionName) => {
    const masks = REGION_MASKS[view][regionName] || [];
    return masks.map((path, index) => (
      <path
        key={`${view}-${regionName}-${tone}-${index}`}
        className={`atlas-region-mask ${tone}`}
        d={path}
      />
    ));
  });
}

function AtlasFigure({ view, primaryRegions = [], secondaryRegions = [] }) {
  const viewConfig = VIEW_CONFIG[view];
  const viewLabel = viewConfig.label;
  const primaryRegionSet = new Set(primaryRegions);
  const secondaryOnlyRegions = secondaryRegions.filter((regionName) => !primaryRegionSet.has(regionName));
  const activeLabels = toUniqueLabels([...primaryRegions, ...secondaryOnlyRegions]);
  const maskScale = `${viewConfig.width / 100}, ${viewConfig.height / 160}`;

  return (
    <article
      className={`muscle-atlas-card ${activeLabels.length ? 'is-active' : 'is-muted'}`}
      style={{ '--atlas-ratio': `${viewConfig.width} / ${viewConfig.height}` }}
    >
      <div className="muscle-atlas-stage" role="img" aria-label={`Vista ${viewLabel.toLowerCase()} del mapa muscular`}>
        <img className="muscle-atlas-base" src={viewConfig.src} alt="" aria-hidden="true" />
        <svg
          className="muscle-atlas-overlay"
          viewBox={`0 0 ${viewConfig.width} ${viewConfig.height}`}
          aria-hidden="true"
        >
          <g transform={`scale(${maskScale})`}>
            {renderRegionMasks(view, secondaryOnlyRegions, 'secondary')}
            {renderRegionMasks(view, primaryRegions, 'primary')}
          </g>
        </svg>
        <div className="muscle-atlas-vignette" aria-hidden="true" />
      </div>
      <div className="muscle-atlas-footer">
        <span>{viewLabel}</span>
        <strong>{activeLabels.length || 0}</strong>
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
  const primaryRegionSet = new Set([...(anatomyRegions.front || []), ...(anatomyRegions.back || [])]);
  const primaryRegionLabels = toUniqueLabels([
    ...(anatomyRegions.front || []),
    ...(anatomyRegions.back || []),
  ]);
  const secondaryRegionLabels = toUniqueLabels([
    ...(inferredSecondaryRegions.front || []).filter((regionName) => !primaryRegionSet.has(regionName)),
    ...(inferredSecondaryRegions.back || []).filter((regionName) => !primaryRegionSet.has(regionName)),
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

      <div className="muscle-map-insights" aria-label="Resumen de grupos musculares">
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
