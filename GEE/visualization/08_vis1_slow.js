// ============================================================
// Mongolia Land Degradation Risk Explorer
// CASA0025 Group Project — Visualization Component
// ============================================================
// Author: Ruijue Song, Lin Su (visualization)
//
// App structure:
//   - Left control panel (~320px): view selector, layer options, legend, about
//   - Main map: one active layer at a time (A/B/D view modes)
//   - Inspector popup (appears on grid cell click): full cell diagnostics
//   - About modal: methods, limitations, responsible-use statement
//
// Data dependencies (GEE assets):
//   - Grid with predictors + labels (+ RF prob after export): 
//     projects/casa25-488411/assets/mongolia_grid_10km_predictors_early1
//   - LULC early/recent rasters: reconstructed inline from Dynamic World
//     (no asset export was done in 01c)
// ============================================================


// ============================================================
// SECTION 1 — CONFIG
// ============================================================

var CONFIG = {
  // ---- AOI ----
  aoi: ee.Geometry.Rectangle([95, 45, 115, 48]),
  centerZoom: 6.2,

  // ---- Asset paths ----
  // TODO (after org confirms): swap to the RF-prob-enriched asset when exported.
  // New asset will include a `classification` field (0–1) from setOutputMode('PROBABILITY').
  gridAssetPath: 'projects/casa25-488411/assets/mongolia_grid_10km_predictors_early1',
  gridAssetPath_withRF: 'projects/casa25-488411/assets/grid_y15_probability_f',

  // ---- LULC time windows ----
  earlyStart: '2016-06-01', earlyEnd: '2018-09-30',
  recentStart: '2021-06-01', recentEnd: '2023-09-30',

  // ---- Field names in grid asset ----
  // observed
  fieldDegShare:   'degradation_share_allpx',
  fieldRecShare:   'recovery_share_allpx',
  fieldNetChange:  'net_change_allpx',
  fieldLulcEarly:  'lulc_early_mode',
  fieldLulcRecent: 'lulc_recent_mode',
  // priority/hotspot
  // TODO (ask teammate): confirm which of the three hotspot fields 
  // is the "final" priority definition. Using is_netdeg_hotspot_5 as default.
  fieldPriority:   'y15_netneg',
  // RF output (present only after teammate re-exports)
  fieldRFProb:     'classification',
  // predictors (10 from 05_combine_driver_and_04delete)
  predictors: [
    'prec', 'vpd', 'pet', 'ws',
    'elev', 'slope', 'northness', 'eastness',
    'clay', 'sand'
  ],
  // pretty names + units for Inspector display
  predictorMeta: {
    prec:      {label: 'Precipitation', unit: 'mm/mo'},
    vpd:       {label: 'Vapor pressure deficit', unit: 'kPa'},
    pet:       {label: 'Potential ET', unit: 'mm'},
    ws:        {label: 'Wind speed', unit: 'm/s'},
    elev:      {label: 'Elevation', unit: 'm'},
    slope:     {label: 'Slope', unit: '°'},
    northness: {label: 'Northness', unit: ''},
    eastness:  {label: 'Eastness', unit: ''},
    clay:      {label: 'Clay content', unit: '%'},
    sand:      {label: 'Sand content', unit: '%'}
  },

  // ---- Visualization palettes ----
  // Diverging (net change): brown → white → green
  palNetChange:  ['993C1D', 'D85A30', 'F5C4B3', 'F1EFE8', 'C0DD97', '639922', '3B6D11'],
  // Sequential single-hue (degradation alone): yellow-brown ramp
  palDegradation: ['FFFFE5', 'FEE391', 'FEC44F', 'FE9929', 'EC7014', 'CC4C02', '8C2D04'],
  // Sequential (recovery alone): green ramp
  palRecovery:    ['F7FCF5', 'C7E9C0', '74C476', '31A354', '006D2C'],
// Green-yellow-red traffic-light palette for intuitive risk reading.
// Used deliberately here because the app's core purpose is triaging 
// priority areas for NGOs; the red-green metaphor accelerates recognition.
  palRFProb:      ['e5e8d8', 'c7dab0', 'fee08b', 'fc8d59', 'd73027'],
  // Dynamic World land cover (9 classes) — from DW docs
  palLULC: [
    '419bdf', '397d49', '88b053', '7a87c6', 'e49635',
    'dfc35a', 'c4281b', 'a59b8f', 'b39fe1'
  ],
  // ---- Model diagnostics (from 06_ml FINAL run) ----
  rfImportance: [
  {name: 'slope',     value: 312.3},
  {name: 'ws',        value: 311.4},
  {name: 'prec',      value: 307.3},
  {name: 'elev',      value: 305.3},
  {name: 'eastness',  value: 293.9},
  {name: 'sand',      value: 287.5},
  {name: 'northness', value: 284.4},
  {name: 'pet',       value: 283.1},
  {name: 'vpd',       value: 282.3},
  {name: 'clay',      value: 262.1}
  ],
  rfMetrics: {
  OA: 0.928,
  Kappa: 0.652,
  F1: 0.693,
  Precision: 0.748,
  Recall: 0.645
  }
};


// ============================================================
// SECTION 2 — DATA LOADING
// ============================================================

// Create a Map widget (distinct from the global Map singleton).
// All Map.addLayer / Map.onClick / Map.centerObject calls below 
// must target this widget, not the global Map.
var mapPanel = ui.Map();

// Custom grayscale basemap style — reduces visual clutter so data layers
// (degradation, recovery, RF susceptibility) stand out more.
// All roads dimmed to neutral gray; labels kept for geographic context.
var basemapStyle = [
  {stylers: [{saturation: -100}, {lightness: 10}]},
  {featureType: 'road',          stylers: [{visibility: 'simplified'}]},
  {featureType: 'road.highway',  elementType: 'geometry', stylers: [{color: '#cccccc'}, {weight: 0.5}]},
  {featureType: 'road.arterial', elementType: 'geometry', stylers: [{color: '#dddddd'}, {weight: 0.3}]},
  {featureType: 'road.local',    elementType: 'geometry', stylers: [{color: '#eeeeee'}, {weight: 0.2}]},
  {featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{color: '#888888'}, {weight: 0.8}]},
  {featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{color: '#bbbbbb'}, {weight: 0.4}]},
  {featureType: 'poi',           stylers: [{visibility: 'off'}]},
  {featureType: 'transit',       stylers: [{visibility: 'off'}]}
];

// Load the grid FeatureCollection (single source of truth for everything
// except the raster LULC composites).
var grid = ee.FeatureCollection(CONFIG.gridAssetPath);

// Dynamic World composites for visual backdrop (Panel A, LULC layers).
// Section 1 (fast but with noise)
//var dwEarly = ee.Image('projects/rs-and-bsabd/assets/mongolia_dw_early');
//var dwRecent = ee.Image('projects/rs-and-bsabd/assets/mongolia_dw_recent');

// Section 2 (slow but without noise)
var dwEarly = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
  .filterDate(CONFIG.earlyStart, CONFIG.earlyEnd)
  .filterBounds(CONFIG.aoi)
  .select('label').mode().clip(CONFIG.aoi);

var dwRecent = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
  .filterDate(CONFIG.recentStart, CONFIG.recentEnd)
  .filterBounds(CONFIG.aoi)
  .select('label').mode().clip(CONFIG.aoi);


// ============================================================
// SECTION 3 — RF ENRICHED GRID (loaded from asset)
// ============================================================
var gridWithRF = ee.FeatureCollection(CONFIG.gridAssetPath_withRF);


// ============================================================
// SECTION 4 — LAYER BUILDERS (one per map layer)
// ============================================================
// Each function returns a ui.Map.Layer. Adding/removing layers is 
// centralised in setActiveLayer() (Section 6) so we never stack conflicting
// layers accidentally.

function layerLulcEarly() {
  return ui.Map.Layer(
    dwEarly, {min: 0, max: 8, palette: CONFIG.palLULC},
    'Land cover 2016–2018'
  );
}

function layerLulcRecent() {
  return ui.Map.Layer(
    dwRecent, {min: 0, max: 8, palette: CONFIG.palLULC},
    'Land cover 2021–2023'
  );
}

function layerDegradation() {
  // Grid-cell polygons colored by degradation share (sequential)
  var styled = grid.map(function(f) {
    var v = ee.Number(f.get(CONFIG.fieldDegShare));
    return f.set('style', {
      color: '00000000',
      fillColor: paletteFill(v, 0, 0.3, CONFIG.palDegradation),
      width: 0
    });
  });
  return ui.Map.Layer(
    styled.style({styleProperty: 'style'}),
    {}, 'Degradation share'
  );
}

function layerRecovery() {
  var styled = grid.map(function(f) {
    var v = ee.Number(f.get(CONFIG.fieldRecShare));
    return f.set('style', {
      color: '00000000',
      fillColor: paletteFill(v, 0, 0.3, CONFIG.palRecovery),
      width: 0
    });
  });
  return ui.Map.Layer(
    styled.style({styleProperty: 'style'}),
    {}, 'Recovery share'
  );
}

function layerNetChange() {
  // Diverging palette centred at 0
  var styled = grid.map(function(f) {
    var v = ee.Number(f.get(CONFIG.fieldNetChange));
    return f.set('style', {
      color: '00000000',
      fillColor: paletteFill(v, -0.3, 0.3, CONFIG.palNetChange),
      width: 0
    });
  });
  return ui.Map.Layer(
    styled.style({styleProperty: 'style'}),
    {}, 'Net change'
  );
}

function layerPriority() {
  // Only show cells flagged as priority
  var priorityCells = grid.filter(ee.Filter.eq(CONFIG.fieldPriority, 1));
  return ui.Map.Layer(
    priorityCells.style({color: 'A32D2D', fillColor: 'A32D2D66', width: 1}),
    {}, 'Priority cells'
  );
}

function layerRFProbability() {
  // Sequential on RF prob (0–1)
  var styled = gridWithRF.map(function(f) {
    var v = ee.Number(f.get(CONFIG.fieldRFProb));
    return f.set('style', {
      color: '00000000',
      fillColor: paletteFill(v, 0, 1, CONFIG.palRFProb),
      width: 0
    });
  });
  return ui.Map.Layer(
    styled.style({styleProperty: 'style'}),
    {}, 'RF susceptibility'
  );
}

// Helper: map a numeric value onto a palette, returning an 8-char hex 
// (RRGGBBAA). Server-side because value lives inside .map().
function paletteFill(value, vmin, vmax, palette) {
  var n = palette.length;
  var t = ee.Number(value).subtract(vmin).divide(vmax - vmin)
            .max(0).min(0.9999);
  var idx = t.multiply(n).floor().int();
  var hex = ee.List(palette).get(idx);
  return ee.String(hex).cat('CC');  // ~80% opacity
}


// ============================================================
// SECTION 5 — UI STATE
// ============================================================

var STATE = {
  viewMode: 'A',          // 'A' | 'B' | 'D'
  activeSubLayer: 'net',  // 'early' | 'recent' | 'deg' | 'rec' | 'net' | 'swipe'
  opacity: 1
};


// ============================================================
// SECTION 6 — LAYER SWITCHING
// ============================================================

function setActiveLayer() {
  // Custom loading messages per view to help users understand what's happening.
  var loadingMsg = 'Loading map layer...';
  if (STATE.viewMode === 'D') loadingMsg = 'Loading RF susceptibility model...';
  else if (STATE.viewMode === 'B') loadingMsg = 'Filtering priority cells...';
  else if (STATE.activeSubLayer === 'swipe') loadingMsg = 'Loading LULC comparison...';
  showLoading(loadingMsg);
  
  // Swipe mode is handled by a different map pair; skip the main mapPanel.
  if (STATE.viewMode === 'A' && STATE.activeSubLayer === 'swipe') {
    initSwipeLayers();
    updateLegend();
    return;
  }

  mapPanel.layers().reset();

  var layer;
  if (STATE.viewMode === 'A') {
    if      (STATE.activeSubLayer === 'early')  layer = layerLulcEarly();
    else if (STATE.activeSubLayer === 'recent') layer = layerLulcRecent();
    else if (STATE.activeSubLayer === 'deg')    layer = layerDegradation();
    else if (STATE.activeSubLayer === 'rec')    layer = layerRecovery();
    else                                        layer = layerNetChange();
  } else if (STATE.viewMode === 'B') {
    layer = layerPriority();
  } else if (STATE.viewMode === 'D') {
    layer = layerRFProbability();
  }

  layer.setOpacity(STATE.opacity);
  mapPanel.layers().add(layer);
  updateLegend();
}

// ============================================================
// SECTION 6B — LULC SWIPE MAPS
// ============================================================
// Fixed setup: left shows 2016–2018 LULC, right shows 2021–2023 LULC.
// Created once at app boot; the SplitPanel is swapped into ui.root by
// setAppLayout() when user selects the swipe sub-layer.

var leftMap = ui.Map();
var rightMap = ui.Map();

// Link panning/zooming so the two sides stay aligned during swipe.
var swipeLinker = ui.Map.Linker([leftMap, rightMap]);

leftMap.setControlVisibility({all: false, zoomControl: true, mapTypeControl: true});
rightMap.setControlVisibility({all: false, zoomControl: false, mapTypeControl: false});
leftMap.setOptions('TERRAIN');
rightMap.setOptions('TERRAIN');

// Floating labels telling the user which period each side shows.
leftMap.add(ui.Label('2016–2018', {
  position: 'top-left',
  backgroundColor: 'rgba(255,255,255,0.85)',
  padding: '4px 8px',
  fontSize: '11px',
  fontWeight: 'bold'
}));
rightMap.add(ui.Label('2021–2023', {
  position: 'top-right',
  backgroundColor: 'rgba(255,255,255,0.85)',
  padding: '4px 8px',
  fontSize: '11px',
  fontWeight: 'bold'
}));

var swipePanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});

// Populate the swipe layers once — they don't change.
function initSwipeLayers() {
  leftMap.layers().reset();
  rightMap.layers().reset();
  var lEarly = layerLulcEarly();
  var lRecent = layerLulcRecent();
  lEarly.setOpacity(STATE.opacity);
  lRecent.setOpacity(STATE.opacity);
  leftMap.layers().add(lEarly);
  rightMap.layers().add(lRecent);
}

// ============================================================
// SECTION 7 — CONTROL PANEL (left side)
// ============================================================

// Thin horizontal divider between sections, creating visual separation
// similar to hr in HTML. GEE has no native hr, so we fake it with a
// 1px-tall panel with a light gray background.
function makeDivider() {
  return ui.Panel({
    style: {
      height: '1px',
      backgroundColor: 'E0E0E0',
      margin: '10px 0 8px 0',
      stretch: 'horizontal'
    }
  });
}
// --- Title block ---
var titleLabel = ui.Label('Mongolia Land Degradation', {
  fontSize: '22px', fontWeight: 'bold', margin: '6px 0 0 0', color: '222'
});
var subtitleLabel = ui.Label('Risk explorer', {
  fontSize: '17px', color: '777', margin: '0 0 8px 0'
});

// --- View mode selector ---
var viewModeLabel = ui.Label('View mode', {
  fontSize: '15px', fontWeight: 'bold', color: '333',
  margin: '8px 0 2px 0'
});
var viewModeHint = ui.Label('Choose what to display on the map', {
  fontSize: '10px', color: '888', margin: '0 0 6px 0'
});
var viewAButton = ui.Button('Historical change', function() {
  STATE.viewMode = 'A'; updateControlPanel(); setActiveLayer();
});
var viewBButton = ui.Button('Priority areas', function() {
  STATE.viewMode = 'B'; updateControlPanel(); setActiveLayer();
});
var viewDButton = ui.Button('Susceptibility map', function() {
  STATE.viewMode = 'D'; updateControlPanel(); setActiveLayer();
});

// --- Sub-layer selector (only relevant for view A) ---
var subLayerSelect = ui.Select({
  items: [
    {label: 'Land cover 2016–2018',                  value: 'early'},
    {label: 'Land cover 2021–2023',                  value: 'recent'},
    {label: 'Land cover change comparison', value: 'swipe'},
    {label: 'Degradation share',                     value: 'deg'},
    {label: 'Recovery share',                        value: 'rec'},
    {label: 'Net change',                            value: 'net'}
  ],
  value: 'net',
  onChange: function(v) {
    STATE.activeSubLayer = v;
    setAppLayout();
    setActiveLayer();
  },
  style: {stretch: 'horizontal'}
});

// --- Opacity slider ---
var opacitySlider = ui.Slider({
  min: 0, max: 1, value: 1, step: 0.05,
  onChange: function(v) {
    STATE.opacity = v;
    if (mapPanel.layers().length() > 0) {
      mapPanel.layers().get(0).setOpacity(v);
    }
  },
  style: {stretch: 'horizontal'}
});

// --- Legend placeholder (updated per view) ---
var legendPanel = ui.Panel({
  style: {stretch: 'horizontal', padding: '4px 0'}
});

// --- About button ---
var aboutButton = ui.Button('About · methods · limitations', function() {
  showAboutModal();
}, false, {stretch: 'horizontal', margin: '12px 0 0 0'});

// --- Assemble control panel ---
var controlPanel = ui.Panel({
  widgets: [
    titleLabel, subtitleLabel,
    viewModeLabel,
    viewAButton, viewBButton, viewDButton,
  makeDivider(),
  ui.Label('Layer', {fontSize: '15px', fontWeight: 'bold', color: '333', margin: '0 0 2px 0'}),
  ui.Label('Select a specific data view', {fontSize: '12px', color: '888', margin: '0 0 6px 0'}),
  subLayerSelect,

  makeDivider(),
  ui.Label('Opacity', {fontSize: '15px', fontWeight: 'bold', color: '333', margin: '0 0 2px 0'}),
  ui.Label('Adjust layer transparency', {fontSize: '12px', color: '888', margin: '0 0 6px 0'}),
  opacitySlider,

  makeDivider(),
  ui.Label('Legend', {fontSize: '15px', fontWeight: 'bold', color: '333', margin: '0 0 2px 0'}),
  ui.Label('Current layer colour scale', {fontSize: '12px', color: '888', margin: '0 0 6px 0'}),
  legendPanel,
  ui.Label(
    'Tip: click any grid cell on the map to inspect its values.',
    {
      fontSize: '12px',
      color: '666',
      fontWeight: 'bold',
      margin: '10px 0 0 0',
      stretch: 'horizontal'
    }
  ),
    aboutButton
  ],
  style: {width: '320px', padding: '12px'}
});


// ============================================================
// SECTION 8 — LEGEND RENDERER
// ============================================================

function updateLegend() {
  legendPanel.clear();

  // Decide which palette and range to show based on active layer.
  var palette, vmin, vmax, title;

if (STATE.viewMode === 'A') {
    if (STATE.activeSubLayer === 'early' || 
        STATE.activeSubLayer === 'recent' ||
        STATE.activeSubLayer === 'swipe') {
      // LULC is categorical — show class legend instead of a ramp.
      // Swipe mode also shows LULC on both sides, so same legend applies.
      renderCategoricalLulcLegend();
      return;
    } else if (STATE.activeSubLayer === 'deg') {
      palette = CONFIG.palDegradation; vmin = 0; vmax = 0.3;
      title = 'Degradation share';
    } else if (STATE.activeSubLayer === 'rec') {
      palette = CONFIG.palRecovery; vmin = 0; vmax = 0.3;
      title = 'Recovery share';
    } else {
      palette = CONFIG.palNetChange; vmin = -0.3; vmax = 0.3;
      title = 'Net change';
    }
  } else if (STATE.viewMode === 'B') {
    // Priority view is binary — show a simple key.
    legendPanel.add(ui.Label('Top 15% degraded + net negative',
      {fontSize: '11px', color: '666'}));
    legendPanel.add(ui.Panel({
      widgets: [
        ui.Label('', {
          backgroundColor: 'A32D2D',
          padding: '6px', margin: '2px 4px 2px 0'
        }),
        ui.Label('Priority cell', {fontSize: '11px'})
      ],
      layout: ui.Panel.Layout.flow('horizontal')
    }));
    return;
  } else {
    palette = CONFIG.palRFProb; vmin = 0; vmax = 1;
    title = 'RF susceptibility probability';
  }

  // Render horizontal color ramp with tick labels.
  legendPanel.add(ui.Label(title, {
    fontSize: '11px', color: '666', margin: '0 0 4px 0'
  }));

// Ramp row — each stop stretches equally so the bar fills the legend width
// and matches the min/max tick positions below.
var ramp = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal', padding: '0', margin: '0 0 2px 0'}
});
palette.forEach(function(hex) {
  ramp.add(ui.Label('', {
    backgroundColor: hex,
    padding: '6px 0',
    margin: '0',
    stretch: 'horizontal'
  }));
});
legendPanel.add(ramp);

// Min / max tick labels — stretch to match the ramp width.
var ticks = ui.Panel({
  widgets: [
    ui.Label(String(vmin), {fontSize: '10px', color: '888', margin: '0'}),
    ui.Label(String(vmax), {fontSize: '10px', color: '888', margin: '0', textAlign: 'right', stretch: 'horizontal'})
  ],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});
legendPanel.add(ticks);
}

function renderCategoricalLulcLegend() {
  // Dynamic World classes (from DW documentation).
  var classes = [
    {name: 'Water',       color: '419bdf'},
    {name: 'Trees',       color: '397d49'},
    {name: 'Grass',       color: '88b053'},
    {name: 'Flooded veg', color: '7a87c6'},
    {name: 'Crops',       color: 'e49635'},
    {name: 'Shrub/scrub', color: 'dfc35a'},
    {name: 'Built',       color: 'c4281b'},
    {name: 'Bare',        color: 'a59b8f'},
    {name: 'Snow/ice',    color: 'b39fe1'}
  ];
  legendPanel.add(ui.Label('Land cover class',
    {fontSize: '11px', color: '666', margin: '0 0 4px 0'}));
  classes.forEach(function(c) {
    legendPanel.add(ui.Panel({
      widgets: [
        ui.Label('', {
          backgroundColor: c.color,
          padding: '4px 8px', margin: '1px 4px 1px 0'
        }),
        ui.Label(c.name, {fontSize: '10px', margin: '1px 0'})
      ],
      layout: ui.Panel.Layout.flow('horizontal')
    }));
  });
}


// ============================================================
// SECTION 9 — UI REFRESH
// ============================================================

function updateControlPanel() {
  // Visual feedback for the active view mode.
  var activeStyle   = {backgroundColor: '1d9e75', color: '888', fontWeight: 'bold'};
  var inactiveStyle = {backgroundColor: 'white',  color: 'black', fontWeight: 'normal'};

  viewAButton.style().set(STATE.viewMode === 'A' ? activeStyle : inactiveStyle);
  viewBButton.style().set(STATE.viewMode === 'B' ? activeStyle : inactiveStyle);
  viewDButton.style().set(STATE.viewMode === 'D' ? activeStyle : inactiveStyle);

  // Sub-layer select only meaningful in view A.
  subLayerSelect.style().set('shown', STATE.viewMode === 'A');
}


// ============================================================
// SECTION 10 — INSPECTOR (click → popup)
// ============================================================

var inspectorPanel = ui.Panel({
  style: {
    position: 'bottom-right',
    width: '260px',
    padding: '10px',
    shown: false
  }
});

mapPanel.onClick(function(coords) {
  // Inspector is disabled in swipe mode.
  if (STATE.viewMode === 'A' && STATE.activeSubLayer === 'swipe') return;

  var point = ee.Geometry.Point([coords.lon, coords.lat]);
  var cell = gridWithRF.filterBounds(point).first();

  cell.evaluate(function(f) {
    if (!f) {
      inspectorPanel.clear();
      inspectorPanel.add(ui.Label('No grid cell at this location.'));
      inspectorPanel.style().set('shown', true);
      return;
    }
    renderInspector(f.properties, coords);
  });
});

function renderInspector(props, coords) {
  inspectorPanel.clear();

// Header row with title on the left, compact close × on the right.
var headerRow = ui.Panel({
  widgets: [
    ui.Label('Grid cell', {
      fontSize: '14px', fontWeight: 'bold',
      stretch: 'horizontal', margin: '0'
    }),
    ui.Button({
      label: '✕',
      onClick: function() {
        inspectorPanel.style().set('shown', false);
      },
      style: {
        padding: '0 6px',
        margin: '0',
        fontSize: '11px',
        border: '0px solid white',
        backgroundColor: 'rgba(0,0,0,0)',
        color: '888'
      }
    })
  ],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal', margin: '0 0 2px 0'}
});
inspectorPanel.add(headerRow);

  // --- Observed section ---
  inspectorPanel.add(makeSectionLabel('OBSERVED (2016–18 → 2021–23)'));
  inspectorPanel.add(makeKV('Degradation share', fmtPct(props[CONFIG.fieldDegShare])));
  inspectorPanel.add(makeKV('Recovery share',    fmtPct(props[CONFIG.fieldRecShare])));
  inspectorPanel.add(makeKV('Net change',        fmtSigned(props[CONFIG.fieldNetChange])));

  // --- Modelled section ---
  inspectorPanel.add(makeSectionLabel('MODELLED (RF)'));
  inspectorPanel.add(makeKV('RF probability', fmtProb(props[CONFIG.fieldRFProb])));
  inspectorPanel.add(makeKV('Priority cell', props[CONFIG.fieldPriority] === 1 ? 'Yes' : 'No'));

  // --- Drivers section ---
  inspectorPanel.add(makeSectionLabel('DRIVERS'));
  CONFIG.predictors.forEach(function(name) {
    var meta = CONFIG.predictorMeta[name];
    var val = props[name];
    if (val === null || val === undefined) return;
    inspectorPanel.add(makeKV(
      meta.label,
      val.toFixed(meta.unit === '%' || meta.unit === '' ? 2 : 1) +
        (meta.unit ? ' ' + meta.unit : '')
    ));
  });

  inspectorPanel.style().set('shown', true);
}

// Small helpers for consistent inspector formatting.
function makeSectionLabel(text) {
  return ui.Label(text, {
    fontSize: '10px', color: '888', margin: '8px 0 2px 0'
  });
}
function makeKV(k, v) {
  return ui.Panel({
    widgets: [
      ui.Label(k, {fontSize: '12px', color: '666', stretch: 'horizontal'}),
      ui.Label(String(v), {fontSize: '12px', fontWeight: 'bold'})
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {padding: '1px 0'}
  });
}
function fmtPct(v)    { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
function fmtSigned(v) { return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(3); }
function fmtProb(v)   { return v == null ? '—' : v.toFixed(2); }


// ============================================================
// SECTION 11 — ABOUT MODAL
// ============================================================

function showAboutModal() {
  var modal = ui.Panel({
    style: {
      position: 'top-center',
      width: '560px',
      padding: '20px',
      backgroundColor: 'white'
    }
  });

  modal.add(ui.Label('About this tool', {
    fontSize: '16px', fontWeight: 'bold', margin: '0 0 8px 0'
  }));
  modal.add(ui.Label(
    'A screening and monitoring-support tool for identifying priority cells ' +
    'for land-degradation attention across the 45–48°N Mongolian transect. ' +
    'Intended for NGOs, environmental monitoring stakeholders, and ' +
    'restoration-oriented organisations. Not a substitute for field survey ' +
    'or official degradation assessment.',
    {fontSize: '12px', margin: '0 0 8px 0'}
  ));

  modal.add(ui.Label('Methods', {
    fontSize: '13px', fontWeight: 'bold', margin: '12px 0 4px 0'
  }));
  modal.add(ui.Label(
    'Land cover from Google Dynamic World V1 (2016–18 vs 2021–23 seasonal modes). ' +
    'Degradation pixels = vegetation → bare transitions (grass/trees/shrub → bare). ' +
    'Recovery pixels = the reverse. Pixel counts aggregated to a 10 km grid as ' +
    'degradation_share, recovery_share, and net_change. ' +
    'Priority cells are defined as the top 15% of cells by degradation share, ' +
    'conditional on net change being negative (y15_netneg label). ' +
    'A random forest classifier (100 trees, mtry=6) was trained on this label ' +
    'using 10 predictors covering climate (precipitation, VPD, PET, wind speed, ' +
    '2016–18 means from TerraClimate), terrain (elevation, slope, northness, ' +
    'eastness from SRTM), and soil (clay, sand fractions from OpenLandMap).',
    {fontSize: '11px', margin: '0 0 8px 0'}
  ));

  modal.add(ui.Label('Model performance (held-out test set)', {
    fontSize: '13px', fontWeight: 'bold', margin: '12px 0 4px 0'
  }));
  modal.add(ui.Label(
    'Overall accuracy: ' + (CONFIG.rfMetrics.OA * 100).toFixed(1) + '%  ·  ' +
    'Kappa: ' + CONFIG.rfMetrics.Kappa.toFixed(2) + '  ·  ' +
    'F1: ' + CONFIG.rfMetrics.F1.toFixed(2) + '  ·  ' +
    'Precision: ' + CONFIG.rfMetrics.Precision.toFixed(2) + '  ·  ' +
    'Recall: ' + CONFIG.rfMetrics.Recall.toFixed(2),
    {fontSize: '11px', margin: '0 0 4px 0'}
  ));
  modal.add(ui.Label(
    'The high overall accuracy reflects class imbalance (~85% of cells are ' +
    'non-priority). Kappa of 0.65 represents substantial agreement. ' +
    'Recall of 0.65 means about a third of true priority cells are missed ' +
    'by the model — always cross-reference with the observed degradation layer.',
    {fontSize: '11px', color: '666', margin: '0 0 8px 0'}
  ));

  modal.add(ui.Label('Predictor importance', {
    fontSize: '13px', fontWeight: 'bold', margin: '12px 0 4px 0'
  }));
  modal.add(ui.Label(
    'Importance is distributed relatively evenly across all ten predictors ' +
    '(range 262–312), indicating no single factor dominates. Slope, wind speed, ' +
    'precipitation, and elevation rank highest. This is consistent with a ' +
    'multi-factor view of desertification rather than attribution to any single ' +
    'driver.',
    {fontSize: '11px', margin: '0 0 8px 0'}
  ));

  modal.add(ui.Label('Limitations', {
    fontSize: '13px', fontWeight: 'bold', margin: '12px 0 4px 0'
  }));
  modal.add(ui.Label(
    'Livestock pressure — a well-established driver of Mongolian rangeland ' +
    'degradation — is not included due to limited data access. ' +
    'Dynamic World thematic accuracy is lower in sparsely vegetated drylands, ' +
    'so individual transitions carry noise that aggregation to 10 km partially ' +
    'mitigates. ' +
    'Probabilities from the RF model indicate relative susceptibility under ' +
    '2016–18 environmental conditions and are not forecasts of future change.',
    {fontSize: '11px', margin: '0 0 8px 0'}
  ));

  var closeBtn = ui.Button('Close', function() {
    ui.root.remove(modal);
  }, false, {margin: '12px 0 0 0'});
  modal.add(closeBtn);
  ui.root.add(modal);
}

// ============================================================
// SECTION 12 — LOADING OVERLAY
// ============================================================
// GEE has no tile-load callback, so loading indicators are shown
// briefly on layer switch and auto-hide after a heuristic timeout.

function makeLoadingPanel() {
  return ui.Panel({
    widgets: [
      ui.Label('Loading map layer...', {
        fontSize: '13px',
        fontWeight: 'bold',
        margin: '0',
        color: '333'
      })
    ],
    style: {
      position: 'top-center',
      padding: '10px 18px',
      margin: '8px 0 0 0',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      border: '0.5px solid #ccc',
      shown: false
    }
  });
}

var loadingMain  = makeLoadingPanel();
var loadingLeft  = makeLoadingPanel();
var loadingRight = makeLoadingPanel();

mapPanel.add(loadingMain);
leftMap.add(loadingLeft);
rightMap.add(loadingRight);

var loadingTimeoutId = null;

function showLoading(msg) {
  var m = msg || 'Loading map layer...';
  var inSwipe = (STATE.viewMode === 'A' && STATE.activeSubLayer === 'swipe');

  loadingMain.widgets().get(0).setValue(m);
  loadingLeft.widgets().get(0).setValue(m);
  loadingRight.widgets().get(0).setValue(m);

  loadingMain.style().set('shown', !inSwipe);
  loadingLeft.style().set('shown', inSwipe);
  loadingRight.style().set('shown', inSwipe);

// Duration is calibrated to each layer's typical render time.
// LULC layers are slow (ImageCollection mode reduction on the fly);
// swipe is the slowest because two LULC layers render simultaneously;
// FeatureCollection layers (deg / rec / net / priority / RF) are fast.
var duration;
if (STATE.viewMode === 'A' && STATE.activeSubLayer === 'swipe') {
  duration = 22000;  // swipe: two LULC layers in parallel
} else if (STATE.viewMode === 'A' && 
           (STATE.activeSubLayer === 'early' || STATE.activeSubLayer === 'recent')) {
  duration = 14000;  // single LULC layer
} else {
  duration = 3500;   // FeatureCollection layers (fast)
}

if (loadingTimeoutId) ui.util.clearTimeout(loadingTimeoutId);
loadingTimeoutId = ui.util.setTimeout(function() {
  loadingMain.style().set('shown', false);
  loadingLeft.style().set('shown', false);
  loadingRight.style().set('shown', false);
  loadingTimeoutId = null;
}, duration);
}

// ============================================================
// SECTION 13 — APP BOOT
// ============================================================

function setAppLayout() {
  ui.root.clear();
  ui.root.add(controlPanel);

  var inSwipe = (STATE.viewMode === 'A' && STATE.activeSubLayer === 'swipe');
  if (inSwipe) {
    ui.root.add(swipePanel);
    inspectorPanel.style().set('shown', false);
  } else {
    ui.root.add(mapPanel);
  }
}

mapPanel.add(inspectorPanel);
// Use custom grayscale style instead of default HYBRID satellite.
mapPanel.setOptions('TERRAIN');
mapPanel.setControlVisibility({
  layerList: false,
  fullscreenControl: false,
  mapTypeControl: false
});
mapPanel.centerObject(CONFIG.aoi, CONFIG.centerZoom);
mapPanel.style().set('cursor', 'crosshair');

leftMap.centerObject(CONFIG.aoi, CONFIG.centerZoom);

setAppLayout();
setActiveLayer();
updateControlPanel();
