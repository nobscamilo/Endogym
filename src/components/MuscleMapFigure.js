const REGION_COORDINATES = {
  front: {
    front_shoulders: [
      { top: '26%', left: '40%', width: '8%', height: '8%' },
      { top: '26%', left: '60%', width: '8%', height: '8%' }
    ],
    chest: [
      { top: '30.5%', left: '45%', width: '10%', height: '7%' },
      { top: '30.5%', left: '55%', width: '10%', height: '7%' }
    ],
    biceps: [
      { top: '35%', left: '38%', width: '7%', height: '9%' },
      { top: '35%', left: '62%', width: '7%', height: '9%' }
    ],
    forearms: [
      { top: '45%', left: '35%', width: '7%', height: '10%' },
      { top: '45%', left: '65%', width: '7%', height: '10%' }
    ],
    abs: [
      { top: '39%', left: '50%', width: '12%', height: '14%' }
    ],
    obliques: [
      { top: '39%', left: '45%', width: '7%', height: '12%' },
      { top: '39%', left: '55%', width: '7%', height: '12%' }
    ],
    quadriceps: [
      { top: '57%', left: '45%', width: '11%', height: '17%' },
      { top: '57%', left: '55%', width: '11%', height: '17%' }
    ],
    adductors: [
      { top: '61%', left: '50%', width: '8%', height: '12%' }
    ],
    calves: [
      { top: '77%', left: '46%', width: '8%', height: '12%' },
      { top: '77%', left: '54%', width: '8%', height: '12%' }
    ]
  },
  back: {
    rear_shoulders: [
      { top: '26%', left: '40%', width: '8%', height: '8%' },
      { top: '26%', left: '60%', width: '8%', height: '8%' }
    ],
    upper_back: [
      { top: '24%', left: '50%', width: '16%', height: '11%' }
    ],
    lats: [
      { top: '35%', left: '44%', width: '8%', height: '14%' },
      { top: '35%', left: '56%', width: '8%', height: '14%' }
    ],
    triceps: [
      { top: '34%', left: '38%', width: '7%', height: '11%' },
      { top: '34%', left: '62%', width: '7%', height: '11%' }
    ],
    lower_back: [
      { top: '43%', left: '50%', width: '12%', height: '8%' }
    ],
    glutes: [
      { top: '51%', left: '46%', width: '10%', height: '11%' },
      { top: '51%', left: '54%', width: '10%', height: '11%' }
    ],
    hamstrings: [
      { top: '64%', left: '45%', width: '10%', height: '17%' },
      { top: '64%', left: '55%', width: '10%', height: '17%' }
    ],
    calves: [
      { top: '78%', left: '45%', width: '8%', height: '12%' },
      { top: '78%', left: '55%', width: '8%', height: '12%' }
    ]
  }
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

function uniqueRegions(regions = []) {
  return Array.from(new Set(regions.filter(Boolean)));
}

export default function MuscleMapFigure({
  anatomyRegions = { front: [], back: [] },
  primaryMuscles = [],
  secondaryMuscles = [],
}) {
  const inferredSecondaryRegions = inferSecondaryRegions(secondaryMuscles);
  const primaryFrontRegions = uniqueRegions(anatomyRegions.front || []);
  const primaryBackRegions = uniqueRegions(anatomyRegions.back || []);
  const primaryRegionSet = new Set([...primaryFrontRegions, ...primaryBackRegions]);

  const secondaryFrontRegions = uniqueRegions(inferredSecondaryRegions.front || [])
    .filter((regionName) => !primaryRegionSet.has(regionName));
  const secondaryBackRegions = uniqueRegions(inferredSecondaryRegions.back || [])
    .filter((regionName) => !primaryRegionSet.has(regionName));

  const primaryRegionLabels = toUniqueLabels([...primaryFrontRegions, ...primaryBackRegions]);
  const secondaryRegionLabels = toUniqueLabels([...secondaryFrontRegions, ...secondaryBackRegions]);

  const renderActiveSpots = (view, activeRegions, tone) => {
    return activeRegions.map((regionName) => {
      const coordList = REGION_COORDINATES[view]?.[regionName];
      if (!coordList) return null;

      return coordList.map((coord, idx) => (
        <span
          key={`${view}-${regionName}-${tone}-${idx}`}
          className={`fiber-activation ${tone}`}
          style={{
            top: coord.top,
            left: coord.left,
            width: coord.width,
            height: coord.height
          }}
          title={`${REGION_LABELS[regionName]} (${tone === 'primary' ? 'Primario' : 'Secundario'})`}
          aria-hidden="true"
        />
      ));
    });
  };

  return (
    <section className="muscle-map-shell">
      <div className="muscle-map-header">
        <div>
          <h5>Activación Muscular 3D</h5>
        </div>
        <div className="muscle-map-legend-inline">
          <span><i className="legend-swatch primary" /> Primario (Azul Magenta)</span>
          <span><i className="legend-swatch secondary" /> Secundario (Índigo)</span>
        </div>
      </div>

      <div className="muscle-atlas-stage double-view" role="img" aria-label="Vista 3D anatómica frontal y posterior con activación dinámica">
        {/* Panel Frontal */}
        <div className="view-panel">
          <span className="panel-kicker">VISTA FRONTAL</span>
          <div className="anatomy-view-container">
            <img
              className="muscle-atlas-base-new"
              src="/anatomy/gray-back.png?v=5"
              alt="Modelo Clínico 3D Frontal"
            />
            <div className="muscle-atlas-layer-stack">
              {renderActiveSpots('front', secondaryFrontRegions, 'secondary')}
              {renderActiveSpots('front', primaryFrontRegions, 'primary')}
            </div>
          </div>
        </div>

        {/* Panel Posterior */}
        <div className="view-panel">
          <span className="panel-kicker">VISTA POSTERIOR</span>
          <div className="anatomy-view-container">
            <img
              className="muscle-atlas-base-new"
              src="/anatomy/gray-front.png?v=5"
              alt="Modelo Clínico 3D Posterior"
            />
            <div className="muscle-atlas-layer-stack">
              {renderActiveSpots('back', secondaryBackRegions, 'secondary')}
              {renderActiveSpots('back', primaryBackRegions, 'primary')}
            </div>
          </div>
        </div>

        <div className="muscle-atlas-vignette" aria-hidden="true" />
      </div>

      <div className="muscle-atlas-view-summary">
        <span>Frente: <strong>{primaryFrontRegions.length + secondaryFrontRegions.length}</strong> activos</span>
        <span>Espalda: <strong>{primaryBackRegions.length + secondaryBackRegions.length}</strong> activos</span>
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
