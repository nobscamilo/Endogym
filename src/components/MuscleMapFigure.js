const ATLAS = {
  src: '/anatomy/vector-muscles-base.png',
  width: 1600,
  height: 1394,
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Muscles_front_and_back.svg',
};

const REGION_LAYERS = {
  front: {
    front_shoulders: '/anatomy/vector-layers/front-front_shoulders.png',
    chest: '/anatomy/vector-layers/front-chest.png',
    biceps: '/anatomy/vector-layers/front-biceps.png',
    forearms: '/anatomy/vector-layers/front-forearms.png',
    abs: '/anatomy/vector-layers/front-abs.png',
    obliques: '/anatomy/vector-layers/front-obliques.png',
    quadriceps: '/anatomy/vector-layers/front-quadriceps.png',
    adductors: '/anatomy/vector-layers/front-adductors.png',
    calves: '/anatomy/vector-layers/front-calves.png',
  },
  back: {
    rear_shoulders: '/anatomy/vector-layers/back-rear_shoulders.png',
    upper_back: '/anatomy/vector-layers/back-upper_back.png',
    lats: '/anatomy/vector-layers/back-lats.png',
    triceps: '/anatomy/vector-layers/back-triceps.png',
    lower_back: '/anatomy/vector-layers/back-lower_back.png',
    glutes: '/anatomy/vector-layers/back-glutes.png',
    hamstrings: '/anatomy/vector-layers/back-hamstrings.png',
    calves: '/anatomy/vector-layers/back-calves.png',
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

function uniqueRegions(regions = []) {
  return Array.from(new Set(regions.filter(Boolean)));
}

function getLayerUrl(view, regionName) {
  return REGION_LAYERS[view]?.[regionName] || null;
}

function renderAtlasLayers(view, regions, tone) {
  return uniqueRegions(regions).map((regionName) => {
    const layerUrl = getLayerUrl(view, regionName);
    if (!layerUrl) return null;

    return (
      <span
        key={`${view}-${regionName}-${tone}`}
        className={`muscle-atlas-layer ${tone}`}
        style={{ '--muscle-mask': `url(${layerUrl})` }}
        aria-hidden="true"
      />
    );
  });
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

      <div
        className="muscle-atlas-stage vector"
        style={{ '--atlas-ratio': `${ATLAS.width} / ${ATLAS.height}` }}
        role="img"
        aria-label="Mapa anatómico frontal y posterior con músculos activos de la sesión"
      >
        <img className="muscle-atlas-base" src={ATLAS.src} alt="" aria-hidden="true" />
        <div className="muscle-atlas-layer-stack" aria-hidden="true">
          {renderAtlasLayers('front', secondaryFrontRegions, 'secondary')}
          {renderAtlasLayers('back', secondaryBackRegions, 'secondary')}
          {renderAtlasLayers('front', primaryFrontRegions, 'primary')}
          {renderAtlasLayers('back', primaryBackRegions, 'primary')}
        </div>
        <div className="muscle-atlas-vignette" aria-hidden="true" />
      </div>

      <div className="muscle-atlas-view-summary" aria-label="Regiones activas por vista anatómica">
        <span>Frontal <strong>{primaryFrontRegions.length + secondaryFrontRegions.length}</strong></span>
        <span>Posterior <strong>{primaryBackRegions.length + secondaryBackRegions.length}</strong></span>
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

      <a className="muscle-atlas-credit" href={ATLAS.sourceUrl} target="_blank" rel="noreferrer">
        Atlas anatómico CC BY-SA 4.0
      </a>
    </section>
  );
}
