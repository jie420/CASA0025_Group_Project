// ============================================================
// Mongolia Land Degradation Risk Explorer
// CASA0025 Group Project - Visualization Component
// ============================================================
// Author: Ruijue Song, Lin Su (visualization)
// ============================================================


// ============================================================
// SECTION 1 - CONFIG
// ============================================================

var CONFIG = {
  //study area and initial map view
  aoi: ee.Geometry.Rectangle([95, 45, 115, 48]),
  centerZoom: 6,
  //asset paths
  gridAssetPath_withRF: 'projects/casa25-488411/assets/grid_y15_probability_f',

  boundaryName: 'Province boundaries',
  lulcDisplayScale: 5000,

  earlyStart: '2016-06-01',
  earlyEnd: '2018-09-30',
  recentStart: '2021-06-01',
  recentEnd: '2023-09-30',

  fieldDegShare: 'degradation_share_allpx',
  fieldRecShare: 'recovery_share_allpx',
  fieldNetChange: 'net_change_allpx',
  fieldPriority: 'y15_netneg',
  fieldRFProb: 'classification',
  
  //predictor metadata for inspector display
  predictors: [
    'prec', 'vpd', 'pet', 'ws',
    'elev', 'slope', 'northness', 'eastness',
    'clay', 'sand'
  ],

  predictorMeta: {
    prec: {label: 'Precipitation', unit: 'mm/mo'},
    vpd: {label: 'Vapor pressure deficit', unit: 'kPa'},
    pet: {label: 'Potential ET', unit: 'mm'},
    ws: {label: 'Wind speed', unit: 'm/s'},
    elev: {label: 'Elevation', unit: 'm'},
    slope: {label: 'Slope', unit: 'deg'},
    northness: {label: 'Northness', unit: ''},
    eastness: {label: 'Eastness', unit: ''},
    clay: {label: 'Clay content', unit: '%'},
    sand: {label: 'Sand content', unit: '%'}
  },

  //colour palettes
  palNetChange: ['993C1D', 'D85A30', 'F5C4B3', 'F1EFE8', 'C0DD97', '639922', '3B6D11'],
  palDegradation: ['FFFFE5', 'FEE391', 'FEC44F', 'FE9929', 'EC7014', 'CC4C02', '8C2D04'],
  palRecovery: ['F7FCF5', 'C7E9C0', '74C476', '31A354', '006D2C'],
  palRFProb: ['e5e8d8', 'c7dab0', 'fee08b', 'fc8d59', 'd73027'],
  palLULC: [
    '419bdf', '397d49', '88b053', '7a87c6', 'e49635',
    'dfc35a', 'c4281b', 'a59b8f', 'b39fe1'
  ],

rfImportance: [
  {name: 'prec',      value: 56.67},
  {name: 'ws',        value: 43.80},
  {name: 'elev',      value: 36.46},
  {name: 'slope',     value: 33.99},
  {name: 'pet',       value: 31.57},
  {name: 'vpd',       value: 30.70},
  {name: 'clay',      value: 27.03},
  {name: 'sand',      value: 24.54},
  {name: 'northness', value: 20.74},
  {name: 'eastness',  value: 15.21}
],

rfImportanceByGroup: {
  Climate: 162.74,
  Terrain: 106.40,
  Soil:    51.57
},

rfMetrics: {
  OA: 0.923,
  Kappa: 0.638,
  F1: 0.681,
  Precision: 0.732,
  Recall: 0.637
},

rfConfusionMatrix: {
  TP: 172, TN: 1766, FP: 63, FN: 98
}
};


// ============================================================
// SECTION 2 - DATA LOADING
// ============================================================

var mapPanel = ui.Map();

var gridWithRF = ee.FeatureCollection(CONFIG.gridAssetPath_withRF);
var grid = gridWithRF;

print('gridWithRF size', gridWithRF.size());
print('gridWithRF first feature', gridWithRF.first());

// Load province boundaries as a lightweight contextual reference layer
// support spatial orientation but are not part of the analysis
var provinceBoundaries = ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM0_NAME', 'Mongolia'));

var dwEarly = ee.Image('projects/rs-and-bsabd/assets/mongolia_dw_early');
var dwRecent = ee.Image('projects/rs-and-bsabd/assets/mongolia_dw_recent');

// ============================================================
// SECTION 3 - LAYER BUILDERS
// ============================================================

function transparentTextStyle(extra) {
  var style = {
    backgroundColor: 'rgba(0,0,0,0)'
  };

  Object.keys(extra || {}).forEach(function(key) {
    style[key] = extra[key];
  });

  return style;
}

function safeNumber(feature, propertyName, fallback) {
  var raw = feature.get(propertyName);
  return ee.Number(ee.Algorithms.If(raw, raw, fallback));
}

function layerLulcEarly() {
  return ui.Map.Layer(
    dwEarly,
    {min: 0, max: 8, palette: CONFIG.palLULC},
    'Land cover baseline, 2016-2018'
  );
}

function layerLulcRecent() {
  return ui.Map.Layer(
    dwRecent,
    {min: 0, max: 8, palette: CONFIG.palLULC},
    'Land cover recent, 2021-2023'
  );
}

function layerDegradation() {
  var styled = grid.map(function(f) {
    var v = safeNumber(f, CONFIG.fieldDegShare, 0);
    return f.set('style', {
      color: '00000000',
      fillColor: paletteFill(v, 0, 0.3, CONFIG.palDegradation),
      width: 0
    });
  });

  return ui.Map.Layer(
    styled.style({styleProperty: 'style'}),
    {},
    'Observed degradation share'
  );
}

function layerRecovery() {
  var styled = grid.map(function(f) {
    var v = safeNumber(f, CONFIG.fieldRecShare, 0);
    return f.set('style', {
      color: '00000000',
      fillColor: paletteFill(v, 0, 0.3, CONFIG.palRecovery),
      width: 0
    });
  });

  return ui.Map.Layer(
    styled.style({styleProperty: 'style'}),
    {},
    'Observed recovery share'
  );
}

function layerNetChange() {
  var styled = grid.map(function(f) {
    var v = safeNumber(f, CONFIG.fieldNetChange, 0);
    return f.set('style', {
      color: '00000000',
      fillColor: paletteFill(v, -0.3, 0.3, CONFIG.palNetChange),
      width: 0
    });
  });

  return ui.Map.Layer(
    styled.style({styleProperty: 'style'}),
    {},
    'Net change balance'
  );
}

function layerPriority() {
  var priorityCells = grid.filter(ee.Filter.eq(CONFIG.fieldPriority, 1));

  return ui.Map.Layer(
    priorityCells.style({
      color: 'A32D2D',
      fillColor: 'A32D2D66',
      width: 1
    }),
    {},
    'Priority areas'
  );
}

function layerRFProbability() {
  var styled = grid.map(function(f) {
    var v = safeNumber(f, CONFIG.fieldRFProb, 0);
    return f.set('style', {
      color: '00000000',
      fillColor: paletteFill(v, 0, 1, CONFIG.palRFProb),
      width: 0
    });
  });

  return ui.Map.Layer(
    styled.style({styleProperty: 'style'}),
    {},
    'Random Forest modelled land degradation probability'
  );
}

function layerProvinceBoundaries() {
  return ui.Map.Layer(
    provinceBoundaries.style({
      color: '33333350',
      fillColor: '00000000',
      width: 1
    }),
    {},
    CONFIG.boundaryName
  );
}

function layerExampleMarker() {
  var exampleCell = ee.FeatureCollection([STATE.exampleFeature]);

  return ui.Map.Layer(
    exampleCell.style({
      color: '00AEEF',
      fillColor: '00AEEF33',
      width: 3
    }),
    {},
    'Guided example cell'
  );
}

function paletteFill(value, vmin, vmax, palette) {
  var n = palette.length;
  var t = ee.Number(value)
    .subtract(vmin)
    .divide(vmax - vmin)
    .max(0)
    .min(0.9999);

  var idx = t.multiply(n).floor().int();
  var hex = ee.List(palette).get(idx);
  return ee.String(hex).cat('CC');
}


// ============================================================
// SECTION 4 - UI STATE
// ============================================================

var STATE = {
  viewMode: 'A',
  activeSubLayer: 'net',
  opacity: 1,
  showBoundaries: true,
  exampleFeature: null,
  exampleName: '',
  exampleKind: null,
  highlightMetric: null
};

var CURRENT_LAYOUT = null;


// ============================================================
// SECTION 5 - LAYER SWITCHING
// ============================================================

function isSwipeMode() {
  return STATE.viewMode === 'A' && STATE.activeSubLayer === 'swipe';
}

function setActiveLayer() {
  if (isSwipeMode()) {
    initSwipeLayers();
    updateLegend();
    updateExplanation();
    return;
  }

  mapPanel.layers().reset();

  var layer;

  if (STATE.viewMode === 'A') {
    if (STATE.activeSubLayer === 'early') {
      layer = layerLulcEarly();
    } else if (STATE.activeSubLayer === 'recent') {
      layer = layerLulcRecent();
    } else if (STATE.activeSubLayer === 'deg') {
      layer = layerDegradation();
    } else if (STATE.activeSubLayer === 'rec') {
      layer = layerRecovery();
    } else {
      layer = layerNetChange();
    }
  } else if (STATE.viewMode === 'B') {
    layer = layerPriority();
  } else {
    layer = layerRFProbability();
  }

  layer.setOpacity(STATE.opacity);
  mapPanel.layers().add(layer);

  if (STATE.showBoundaries) {
    mapPanel.layers().add(layerProvinceBoundaries());
  }

  if (STATE.exampleFeature) {
    mapPanel.layers().add(layerExampleMarker());
  }

  updateLegend();
  updateExplanation();
}


// ============================================================
// SECTION 6 - LULC SWIPE MAPS
// ============================================================

var leftMap = ui.Map();
var rightMap = ui.Map();

var swipeLinker = ui.Map.Linker([leftMap, rightMap]);

leftMap.setControlVisibility({all: false, zoomControl: true, mapTypeControl: true});
rightMap.setControlVisibility({all: false, zoomControl: false, mapTypeControl: false});
leftMap.setOptions('TERRAIN');
rightMap.setOptions('TERRAIN');

leftMap.add(ui.Label('2016-2018', {
  position: 'top-left',
  backgroundColor: 'rgba(255,255,255,0.85)',
  padding: '4px 8px',
  fontSize: '11px',
  fontWeight: 'bold'
}));

rightMap.add(ui.Label('2021-2023', {
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

function initSwipeLayers() {
  leftMap.layers().reset();
  rightMap.layers().reset();

  var lEarly = layerLulcEarly();
  var lRecent = layerLulcRecent();

  lEarly.setOpacity(STATE.opacity);
  lRecent.setOpacity(STATE.opacity);

  leftMap.layers().add(lEarly);
  rightMap.layers().add(lRecent);

  if (STATE.showBoundaries) {
    leftMap.layers().add(layerProvinceBoundaries());
    rightMap.layers().add(layerProvinceBoundaries());
  }
}


// ============================================================
// SECTION 7 - GUIDED EXAMPLES
// ============================================================

var exampleCalloutPanel = ui.Panel({
  style: {
    position: 'bottom-left',
    width: '330px',
    padding: '12px',
    margin: '0 0 18px 16px',
    backgroundColor: 'rgba(255,255,255,0.96)',
    border: '2px solid #00AEEF',
    shown: false
  }
});

function hideExampleCallout() {
  exampleCalloutPanel.clear();
  exampleCalloutPanel.style().set('shown', false);
}

function makeCalloutMetric(label, value, color) {
  return ui.Panel({
    widgets: [
      ui.Label(label, transparentTextStyle({
        fontSize: '11px',
        color: '555',
        stretch: 'horizontal',
        margin: '0'
      })),
      ui.Label(value, transparentTextStyle({
        fontSize: '18px',
        fontWeight: 'bold',
        color: color || '111',
        margin: '0'
      }))
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      padding: '6px 8px',
      margin: '6px 0',
      backgroundColor: 'FFF7CC',
      border: '0px solid white',
      stretch: 'horizontal'
    }
  });
}

function renderExampleCallout(kind, props) {
  exampleCalloutPanel.clear();

  var title;
  var metric;
  var body;

  if (kind === 'priority') {
    title = 'Why this priority area matters';
    metric = makeCalloutMetric(
      'Observed degradation share',
      fmtPct(props[CONFIG.fieldDegShare]),
      '#A32D2D'
    );
    body =
      'This grid cell has a high observed degradation share and negative net change. ' +
      'Observed recovery is not enough to offset vegetation-to-bare-ground change here. ' +
      'This makes it a useful place for NGOs or monitoring teams to prioritise follow-up checks.';
  } else if (kind === 'model') {
    title = 'Why this modelled-risk area matters';
    metric = makeCalloutMetric(
      'Modelled degradation probability',
      fmtProb(props[CONFIG.fieldRFProb]),
      '#A32D2D'
    );
    body =
      'The Random Forest model gives this cell a high relative land-degradation probability. ' +
      'This does not mean degradation is certain, but it flags the cell as worth closer monitoring ' +
      'because its climate, terrain, and soil conditions resemble other priority cells.';
  } else {
    title = 'Why this recovering example matters';
    metric = makeCalloutMetric(
      'Observed recovery share',
      fmtPct(props[CONFIG.fieldRecShare]),
      '#1B7F3A'
    );
    body =
      'This cell is a useful contrast case: recovery is visible here, so not every land-cover change ' +
      'should be interpreted as degradation. Including this example helps users compare priority areas ' +
      'with places where recovery offsets or exceeds observed degradation.';
  }

  var closeRow = ui.Panel({
    widgets: [
      ui.Label(title, transparentTextStyle({
        fontSize: '14px',
        fontWeight: 'bold',
        color: '111',
        stretch: 'horizontal',
        margin: '0'
      })),
      ui.Button({
        label: 'x',
        onClick: hideExampleCallout,
        style: {
          padding: '0 6px',
          margin: '0',
          fontSize: '11px',
          backgroundColor: 'rgba(0,0,0,0)',
          border: '0px solid white',
          color: '666'
        }
      })
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal'}
  });

  exampleCalloutPanel.add(closeRow);
  exampleCalloutPanel.add(metric);
  exampleCalloutPanel.add(ui.Label(body, transparentTextStyle({
    fontSize: '12px',
    color: '444',
    margin: '4px 0 0 0',
    whiteSpace: 'pre-wrap'
  })));

  exampleCalloutPanel.add(ui.Label(
    'Use the inspector panel to compare this value with observed change and driver variables.',
    transparentTextStyle({
      fontSize: '11px',
      color: '777',
      margin: '8px 0 0 0',
      whiteSpace: 'pre-wrap'
    })
  ));

  exampleCalloutPanel.style().set('shown', true);
}

function setExampleStatus(text) {
  exampleStatusLabel.setValue(text);
}

function getExampleFeature(kind) {
  if (kind === 'priority') {
    return grid
      .filter(ee.Filter.eq(CONFIG.fieldPriority, 1))
      .sort(CONFIG.fieldDegShare, false)
      .first();
  }

  if (kind === 'model') {
    return grid
      .sort(CONFIG.fieldRFProb, false)
      .first();
  }

  if (kind === 'recovery') {
    return grid
      .filter(ee.Filter.gt(CONFIG.fieldNetChange, 0))
      .sort(CONFIG.fieldRecShare, false)
      .first();
  }
}

function clearExample() {
  STATE.exampleFeature = null;
  STATE.exampleName = '';
  STATE.exampleKind = null;
  STATE.highlightMetric = null;
  setExampleStatus('');
  hideExampleCallout();
}

function goToExample(kind) {
  var exampleName;
  var targetView;
  var targetLayer;
  var status;

  if (kind === 'priority') {
    exampleName = 'Observed priority area';
    targetView = 'B';
    targetLayer = 'net';
    status = 'Loading observed priority example...';
  } else if (kind === 'model') {
    exampleName = 'High modelled probability';
    targetView = 'D';
    targetLayer = 'net';
    status = 'Loading high modelled probability example...';
  } else {
    exampleName = 'Mixed / recovering cell';
    targetView = 'A';
    targetLayer = 'rec';
    status = 'Loading mixed / recovering example...';
  }

  setExampleStatus(status);

  var exampleFeature = ee.Feature(getExampleFeature(kind));
  var centroid = exampleFeature.geometry().centroid(1);
  var coords = centroid.coordinates();

  exampleFeature.evaluate(function(featureResult) {
    if (!featureResult) {
      setExampleStatus('No suitable example was found.');
      return;
    }

    coords.evaluate(function(coordResult) {
      if (!coordResult) {
        setExampleStatus('Example found, but its location could not be read.');
        return;
      }

      var lon = coordResult[0];
      var lat = coordResult[1];

      STATE.viewMode = targetView;
      STATE.activeSubLayer = targetLayer;
      STATE.exampleFeature = exampleFeature;
      STATE.exampleName = exampleName;
      STATE.exampleKind = kind;

      if (kind === 'priority') {
        STATE.highlightMetric = CONFIG.fieldDegShare;
      } else if (kind === 'model') {
        STATE.highlightMetric = CONFIG.fieldRFProb;
      } else {
        STATE.highlightMetric = CONFIG.fieldRecShare;
      }

      subLayerSelect.setValue(targetLayer, false);

      updateControlPanel();
      setAppLayout();
      setActiveLayer();

      mapPanel.setCenter(lon, lat, 9);
      renderInspector(featureResult.properties, null);
      renderExampleCallout(kind, featureResult.properties);

      setExampleStatus(exampleName + ' selected and highlighted on the map.');
    });
  });
}


// ============================================================
// SECTION 8 - CONTROL PANEL
// ============================================================

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

var titleLabel = ui.Label('Mongolia Land Degradation', {
  fontSize: '22px',
  fontWeight: 'bold',
  margin: '6px 0 0 0',
  color: '222'
});

var subtitleLabel = ui.Label('Risk explorer', {
  fontSize: '17px',
  color: '777',
  margin: '0 0 8px 0'
});

var viewModeLabel = ui.Label('View mode', {
  fontSize: '15px',
  fontWeight: 'bold',
  color: '333',
  margin: '8px 0 2px 0'
});

var viewAButton = ui.Button('Historical change', function() {
  STATE.viewMode = 'A';
  STATE.activeSubLayer = 'net';
  clearExample();
  subLayerSelect.setValue('net', false);
  updateControlPanel();
  setAppLayout();
  setActiveLayer();
});

var viewBButton = ui.Button('Priority areas', function() {
  STATE.viewMode = 'B';
  clearExample();
  updateControlPanel();
  setAppLayout();
  setActiveLayer();
});

var viewDButton = ui.Button('Susceptibility map', function() {
  STATE.viewMode = 'D';
  clearExample();
  updateControlPanel();
  setAppLayout();
  setActiveLayer();
});

var subLayerSelect = ui.Select({
  items: [
    {label: 'Net change balance', value: 'net'},
    {label: 'Observed degradation share', value: 'deg'},
    {label: 'Observed recovery share', value: 'rec'},
    {label: 'Land cover baseline, 2016-2018', value: 'early'},
    {label: 'Land cover recent, 2021-2023', value: 'recent'},
    {label: 'Compare land-cover periods', value: 'swipe'}
  ],
  value: 'net',
  onChange: function(v) {
    STATE.activeSubLayer = v;
    clearExample();
    setAppLayout();
    setActiveLayer();
  },
  style: {stretch: 'horizontal'}
});

var explanationPanel = ui.Panel({
  style: {
    stretch: 'horizontal',
    padding: '0',
    margin: '8px 0 0 0'
  }
});

var explanationTitle = ui.Label('', transparentTextStyle({
  fontSize: '12px',
  fontWeight: 'bold',
  color: '333',
  margin: '0 0 3px 0'
}));

var explanationBody = ui.Label('', transparentTextStyle({
  fontSize: '11px',
  color: '555',
  margin: '0',
  whiteSpace: 'pre-wrap'
}));

explanationPanel.add(explanationTitle);
explanationPanel.add(explanationBody);

function updateExplanation() {
  var title = '';
  var body = '';

  if (STATE.viewMode === 'A') {
    if (STATE.activeSubLayer === 'net') {
      title = 'Net change balance';
      body =
        'Net change = recovery share - degradation share.\n' +
        'Positive values mean more recovery than degradation; negative values mean more degradation than recovery.';
    } else if (STATE.activeSubLayer === 'deg') {
      title = 'Observed degradation share';
      body =
        'The proportion of each 10 km grid cell where vegetation changed to bare ground between the two periods.';
    } else if (STATE.activeSubLayer === 'rec') {
      title = 'Observed recovery share';
      body =
        'The proportion of each 10 km grid cell where bare ground changed back to vegetation between the two periods.';
    } else if (STATE.activeSubLayer === 'early') {
      title = 'Land cover baseline, 2016-2018';
      body =
        'This map shows the most common Dynamic World land-cover class during the 2016-2018 growing seasons.';
    } else if (STATE.activeSubLayer === 'recent') {
      title = 'Land cover recent, 2021-2023';
      body =
        'This map shows the most common Dynamic World land-cover class during the 2021-2023 growing seasons.';
    } else if (STATE.activeSubLayer === 'swipe') {
      title = 'Compare land-cover periods';
      body =
        'Drag the divider to compare the baseline land-cover map with the recent land-cover map.';
    }
  } else if (STATE.viewMode === 'B') {
    title = 'Priority areas';
    body =
      'Areas where observed degradation is high and recovery does not offset it.\n' +
      'Priority areas are grid cells in the top 15% for observed degradation and with negative net change. They are suggested for monitoring, not official degradation classifications.';
  } else {
    title = 'Susceptibility map';
    body =
      'This score comes from a Random Forest model using climate, terrain, and soil variables. It shows relative monitoring priority, not a certain future prediction.';
  }

  explanationTitle.setValue(title);
  explanationBody.setValue(body);
}

var layerSectionPanel = ui.Panel({
  widgets: [
    ui.Label('Historical evidence layer', {
      fontSize: '15px',
      fontWeight: 'bold',
      color: '333',
      margin: '0 0 2px 0'
    }),
    ui.Label('Choose the evidence layer to inspect historical change.', {
      fontSize: '12px',
      color: '888',
      margin: '0 0 6px 0'
    }),
    subLayerSelect
  ],
  style: {
    stretch: 'horizontal',
    margin: '8px 0 0 0'
  }
});

var boundaryCheckbox = ui.Checkbox({
  label: 'Show province boundaries',
  value: true,
  onChange: function(v) {
    STATE.showBoundaries = v;
    setActiveLayer();
  },
  style: {margin: '8px 0 0 0'}
});

var exampleStatusLabel = ui.Label('', transparentTextStyle({
  fontSize: '11px',
  color: '666',
  margin: '6px 0 0 0',
  whiteSpace: 'pre-wrap'
}));

var examplesPanel = ui.Panel({
  widgets: [
    ui.Label('Guided examples', {
      fontSize: '15px',
      fontWeight: 'bold',
      color: '333',
      margin: '0 0 2px 0'
    }),
    ui.Label('Jump to typical grid cells for the live demo.', {
      fontSize: '12px',
      color: '888',
      margin: '0 0 6px 0'
    }),
    ui.Button('Observed priority area', function() {
      goToExample('priority');
    }, false, {stretch: 'horizontal', margin: '2px 0'}),
    ui.Button('High modelled probability', function() {
      goToExample('model');
    }, false, {stretch: 'horizontal', margin: '2px 0'}),
    ui.Button('Mixed / recovering cell', function() {
      goToExample('recovery');
    }, false, {stretch: 'horizontal', margin: '2px 0'}),
    exampleStatusLabel
  ],
  style: {stretch: 'horizontal'}
});

var opacitySlider = ui.Slider({
  min: 0,
  max: 1,
  value: 1,
  step: 0.05,
  onChange: function(v) {
    STATE.opacity = v;

    if (isSwipeMode()) {
      initSwipeLayers();
      return;
    }

    if (mapPanel.layers().length() > 0) {
      mapPanel.layers().get(0).setOpacity(v);
    }
  },
  style: {stretch: 'horizontal'}
});

var legendPanel = ui.Panel({
  style: {
    stretch: 'horizontal',
    padding: '4px 0'
  }
});

var aboutButton = ui.Button('About · methods · limitations', function() {
  showAboutModal();
}, false, {
  stretch: 'horizontal',
  margin: '12px 0 0 0'
});

var controlPanel = ui.Panel({
  widgets: [
    titleLabel,
    subtitleLabel,
    viewModeLabel,
    viewAButton,
    viewBButton,
    viewDButton,

    makeDivider(),
    explanationPanel,
    layerSectionPanel,
    boundaryCheckbox,

    makeDivider(),
    examplesPanel,

    makeDivider(),
    ui.Label('Opacity', {
      fontSize: '15px',
      fontWeight: 'bold',
      color: '333',
      margin: '0 0 2px 0'
    }),
    ui.Label('Adjust layer transparency', {
      fontSize: '12px',
      color: '888',
      margin: '0 0 6px 0'
    }),
    opacitySlider,

    makeDivider(),
    ui.Label('Legend', {
      fontSize: '15px',
      fontWeight: 'bold',
      color: '333',
      margin: '0 0 2px 0'
    }),
    ui.Label('Current layer colour scale', {
      fontSize: '12px',
      color: '888',
      margin: '0 0 6px 0'
    }),
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
  style: {
    width: '320px',
    padding: '12px'
  }
});


// ============================================================
// SECTION 9 - LEGEND RENDERER
// ============================================================

function updateLegend() {
  legendPanel.clear();

  var palette;
  var vmin;
  var vmax;
  var title;

  if (STATE.viewMode === 'A') {
    if (
      STATE.activeSubLayer === 'early' ||
      STATE.activeSubLayer === 'recent' ||
      STATE.activeSubLayer === 'swipe'
    ) {
      renderCategoricalLulcLegend();
      return;
    } else if (STATE.activeSubLayer === 'deg') {
      palette = CONFIG.palDegradation;
      vmin = 0;
      vmax = 0.3;
      title = 'Observed degradation share';
    } else if (STATE.activeSubLayer === 'rec') {
      palette = CONFIG.palRecovery;
      vmin = 0;
      vmax = 0.3;
      title = 'Observed recovery share';
    } else {
      palette = CONFIG.palNetChange;
      vmin = -0.3;
      vmax = 0.3;
      title = 'Net change balance';
    }
  } else if (STATE.viewMode === 'B') {
    renderPriorityLegend();
    return;
  } else {
    palette = CONFIG.palRFProb;
    vmin = 0;
    vmax = 1;
    title = 'Random Forest modelled land degradation probability';
  }

  legendPanel.add(ui.Label(title, {
    fontSize: '11px',
    color: '666',
    margin: '0 0 4px 0'
  }));

  var ramp = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      stretch: 'horizontal',
      padding: '0',
      margin: '0 0 2px 0'
    }
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

  var ticks = ui.Panel({
    widgets: [
      ui.Label(String(vmin), {
        fontSize: '10px',
        color: '888',
        margin: '0'
      }),
      ui.Label(String(vmax), {
        fontSize: '10px',
        color: '888',
        margin: '0',
        textAlign: 'right',
        stretch: 'horizontal'
      })
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal'}
  });

  legendPanel.add(ticks);

  if (STATE.viewMode === 'A' && STATE.activeSubLayer === 'net') {
    legendPanel.add(ui.Label(
      'Negative = more degradation; positive = more recovery.',
      {fontSize: '10px', color: '777', margin: '4px 0 0 0'}
    ));
  }

  if (
    STATE.viewMode === 'A' &&
    (STATE.activeSubLayer === 'deg' || STATE.activeSubLayer === 'rec')
  ) {
    legendPanel.add(ui.Label(
      'Share means the proportion of the 10 km grid cell.',
      {fontSize: '10px', color: '777', margin: '4px 0 0 0'}
    ));
  }
}

function renderPriorityLegend() {
  legendPanel.add(ui.Label('Priority areas', {
    fontSize: '11px',
    color: '666',
    margin: '0 0 3px 0'
  }));

  legendPanel.add(ui.Label('Top 15% degraded + net negative', {
    fontSize: '10px',
    color: '777',
    margin: '0 0 6px 0'
  }));

  legendPanel.add(ui.Panel({
    widgets: [
      ui.Label('', {
        backgroundColor: 'A32D2D',
        padding: '0',
        margin: '2px 8px 0 0',
        width: '12px',
        height: '12px'
      }),
      ui.Label('Priority cell', {
        fontSize: '11px',
        color: '333',
        margin: '0'
      })
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      stretch: 'horizontal',
      margin: '0'
    }
  }));
}

function renderCategoricalLulcLegend() {
  var classes = [
    {name: 'Water', color: '419bdf'},
    {name: 'Trees', color: '397d49'},
    {name: 'Grass', color: '88b053'},
    {name: 'Flooded veg', color: '7a87c6'},
    {name: 'Crops', color: 'e49635'},
    {name: 'Shrub/scrub', color: 'dfc35a'},
    {name: 'Built', color: 'c4281b'},
    {name: 'Bare', color: 'a59b8f'},
    {name: 'Snow/ice', color: 'b39fe1'}
  ];

  legendPanel.add(ui.Label('Land cover class', {
    fontSize: '11px',
    color: '666',
    margin: '0 0 4px 0'
  }));

  classes.forEach(function(c) {
    legendPanel.add(ui.Panel({
      widgets: [
        ui.Label('', {
          backgroundColor: c.color,
          padding: '4px 8px',
          margin: '1px 4px 1px 0'
        }),
        ui.Label(c.name, {
          fontSize: '10px',
          margin: '1px 0'
        })
      ],
      layout: ui.Panel.Layout.flow('horizontal')
    }));
  });
}


// ============================================================
// SECTION 10 - UI REFRESH
// ============================================================

function updateControlPanel() {
  var activeStyle = {
    backgroundColor: '1d9e75',
    color: '888',
    fontWeight: 'bold'
  };

  var inactiveStyle = {
    backgroundColor: 'white',
    color: 'black',
    fontWeight: 'normal'
  };

  viewAButton.style().set(STATE.viewMode === 'A' ? activeStyle : inactiveStyle);
  viewBButton.style().set(STATE.viewMode === 'B' ? activeStyle : inactiveStyle);
  viewDButton.style().set(STATE.viewMode === 'D' ? activeStyle : inactiveStyle);

  layerSectionPanel.style().set('shown', STATE.viewMode === 'A');

  updateExplanation();
}


// ============================================================
// SECTION 11 - INSPECTOR
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
  if (isSwipeMode()) return;

  STATE.highlightMetric = null;
  STATE.exampleKind = null;
  hideExampleCallout();

  var point = ee.Geometry.Point([coords.lon, coords.lat]);
  var cell = grid.filterBounds(point).first();

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

  var headerRow = ui.Panel({
    widgets: [
      ui.Label('Grid cell', transparentTextStyle({
        fontSize: '14px',
        fontWeight: 'bold',
        stretch: 'horizontal',
        margin: '0'
      })),
      ui.Button({
        label: 'x',
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
    style: {
      stretch: 'horizontal',
      margin: '0 0 2px 0'
    }
  });

  inspectorPanel.add(headerRow);

  inspectorPanel.add(makeSectionLabel('OBSERVED (2016-18 to 2021-23)'));
  inspectorPanel.add(makeKV(
    'Observed degradation share',
    fmtPct(props[CONFIG.fieldDegShare]),
    CONFIG.fieldDegShare
  ));
  inspectorPanel.add(makeKV(
    'Observed recovery share',
    fmtPct(props[CONFIG.fieldRecShare]),
    CONFIG.fieldRecShare
  ));
  inspectorPanel.add(makeKV(
    'Net change balance',
    fmtSigned(props[CONFIG.fieldNetChange]),
    CONFIG.fieldNetChange
  ));

  inspectorPanel.add(makeSectionLabel('MODELLED'));
  inspectorPanel.add(makeKV(
    'Modelled degradation probability',
    fmtProb(props[CONFIG.fieldRFProb]),
    CONFIG.fieldRFProb
  ));
  inspectorPanel.add(makeKV(
    'Priority cell',
    props[CONFIG.fieldPriority] === 1 ? 'Yes' : 'No'
  ));

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

function makeSectionLabel(text) {
  return ui.Label(text, transparentTextStyle({
    fontSize: '10px',
    color: '888',
    margin: '8px 0 2px 0'
  }));
}

function makeKV(k, v, metricKey) {
  var highlighted = metricKey && STATE.highlightMetric === metricKey;

  return ui.Panel({
    widgets: [
      ui.Label(k, transparentTextStyle({
        fontSize: '12px',
        color: highlighted ? '111' : '666',
        fontWeight: highlighted ? 'bold' : 'normal',
        stretch: 'horizontal',
        margin: '0'
      })),
      ui.Label(String(v), transparentTextStyle({
        fontSize: highlighted ? '14px' : '12px',
        fontWeight: 'bold',
        color: highlighted ? 'A32D2D' : '222',
        textAlign: 'right',
        margin: '0'
      }))
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      padding: highlighted ? '5px 6px' : '1px 0',
      margin: highlighted ? '3px 0' : '0',
      backgroundColor: highlighted ? 'FFF7CC' : 'rgba(0,0,0,0)',
      border: highlighted ? '0px solid white' : '0px solid white'
    }
  });
}

function fmtPct(v) {
  return v == null ? '-' : (v * 100).toFixed(1) + '%';
}

function fmtSigned(v) {
  return v == null ? '-' : (v >= 0 ? '+' : '') + v.toFixed(3);
}

function fmtProb(v) {
  return v == null ? '-' : v.toFixed(2);
}


// ============================================================
// SECTION 12 - ABOUT MODAL
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
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '0 0 8px 0'
  }));

  modal.add(ui.Label(
    'A screening and monitoring-support tool for identifying priority cells ' +
    'for land-degradation attention across the 45-48 N Mongolian transect. ' +
    'Intended for NGOs, environmental monitoring stakeholders, and ' +
    'restoration-oriented organisations. Not a substitute for field survey ' +
    'or official degradation assessment.',
    {fontSize: '12px', margin: '0 0 8px 0'}
  ));

  modal.add(ui.Label('Methods', {
    fontSize: '13px',
    fontWeight: 'bold',
    margin: '12px 0 4px 0'
  }));

  modal.add(ui.Label(
    'Land cover from Google Dynamic World V1 (2016-18 vs 2021-23 seasonal modes). ' +
    'Degradation pixels = vegetation to bare transitions (grass/trees/shrub to bare). ' +
    'Recovery pixels = the reverse. Pixel counts are aggregated to a 10 km grid as ' +
    'degradation share, recovery share, and net change balance. ' +
    'Priority cells are defined as the top 15% of cells by degradation share, ' +
    'conditional on net change being negative (y15_netneg label). ' +
    'A Random Forest classifier (100 trees, mtry=6) was trained on this label ' +
    'using 10 predictors covering climate (precipitation, VPD, PET, wind speed, ' +
    '2016-18 means from TerraClimate), terrain (elevation, slope, northness, ' +
    'eastness from SRTM), and soil (clay, sand fractions from OpenLandMap).',
    {fontSize: '11px', margin: '0 0 8px 0'}
  ));

  modal.add(ui.Label('Model performance (held-out test set)', {
    fontSize: '13px',
    fontWeight: 'bold',
    margin: '12px 0 4px 0'
  }));

modal.add(ui.Label(
  'Overall accuracy: ' + (CONFIG.rfMetrics.OA * 100).toFixed(1) + '%  |  ' +
  'Kappa: ' + CONFIG.rfMetrics.Kappa.toFixed(2) + '  |  ' +
  'F1: ' + CONFIG.rfMetrics.F1.toFixed(2) + '  |  ' +
  'Precision: ' + CONFIG.rfMetrics.Precision.toFixed(2) + '  |  ' +
  'Recall: ' + CONFIG.rfMetrics.Recall.toFixed(2),
  {fontSize: '11px', margin: '0 0 4px 0'}
));

modal.add(ui.Label(
  'Confusion matrix on the held-out test set: ' +
  CONFIG.rfConfusionMatrix.TP + ' true positives, ' +
  CONFIG.rfConfusionMatrix.TN + ' true negatives, ' +
  CONFIG.rfConfusionMatrix.FP + ' false positives, ' +
  CONFIG.rfConfusionMatrix.FN + ' false negatives.',
  {fontSize: '11px', color: '666', margin: '0 0 4px 0'}
));

modal.add(ui.Label(
  'The high overall accuracy partly reflects class imbalance (most cells are ' +
  'non-priority). Kappa of 0.64 indicates substantial agreement beyond chance. ' +
  'Recall of 0.64 means roughly one in three true priority cells is missed by ' +
  'the model, so users should cross-reference modelled probability with the ' +
  'observed degradation layer rather than rely on the model alone.',
  {fontSize: '11px', color: '666', margin: '0 0 8px 0'}
));

  modal.add(ui.Label('Limitations', {
    fontSize: '13px',
    fontWeight: 'bold',
    margin: '12px 0 4px 0'
  }));

  modal.add(ui.Label(
    'Livestock pressure, a well-established driver of Mongolian rangeland ' +
    'degradation, is not included due to limited data access. Dynamic World ' +
    'thematic accuracy is lower in sparsely vegetated drylands, so individual ' +
    'transitions carry noise that aggregation to 10 km partially mitigates. ' +
    'Probabilities from the Random Forest model indicate relative susceptibility ' +
    'under 2016-18 environmental conditions and are not forecasts of future change.',
    {fontSize: '11px', margin: '0 0 8px 0'}
  ));

  var closeBtn = ui.Button('Close', function() {
    ui.root.remove(modal);
  }, false, {margin: '12px 0 0 0'});

  modal.add(closeBtn);
  ui.root.add(modal);
}


// ============================================================
// SECTION 13 - APP BOOT
// ============================================================

function setAppLayout() {
  var nextLayout = isSwipeMode() ? 'swipe' : 'main';

  if (CURRENT_LAYOUT === nextLayout) {
    return;
  }

  ui.root.clear();
  ui.root.add(controlPanel);

  if (nextLayout === 'swipe') {
    ui.root.add(swipePanel);
    inspectorPanel.style().set('shown', false);
    hideExampleCallout();
  } else {
    ui.root.add(mapPanel);
  }

  CURRENT_LAYOUT = nextLayout;
}

mapPanel.add(exampleCalloutPanel);
mapPanel.add(inspectorPanel);

mapPanel.setOptions('TERRAIN');
mapPanel.setControlVisibility({
  layerList: false,
  fullscreenControl: false,
  mapTypeControl: false
});
mapPanel.centerObject(CONFIG.aoi, CONFIG.centerZoom);
mapPanel.style().set('cursor', 'crosshair');

leftMap.centerObject(CONFIG.aoi, CONFIG.centerZoom);
rightMap.centerObject(CONFIG.aoi, CONFIG.centerZoom);

setAppLayout();
updateControlPanel();
setActiveLayer();
