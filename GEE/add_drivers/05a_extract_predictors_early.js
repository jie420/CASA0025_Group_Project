// ================================================
// 05a_extract_drivers_early.js
// Author: 
//
// Purpose:
//   1) Construct netneg binary labels (from 04B logic)
//   2) Extract Early-period (2016-2018) drivers
//   3) Aggregate both to the 10km grid
//   4) Export as a single Asset for RF training
//
// Labels (3 thresholds × netneg filter):
//   y10_netneg: top 10% degradation + net < 0
//   y15_netneg: top 15% degradation + net < 0
//   y20_netneg: top 20% degradation + net < 0
//
// Drivers (based on Meng et al. 2021):
//   Climate (4): prec, vpd, pet, ws
//   Terrain (4): elev, slope, northness, eastness
//                [aspect decomposed to avoid 0/360 discontinuity]
//   Soil    (2): clay, sand
//
// Input:
//   Asset 1: mongolia_grid_10km_cleaned_for_gee_v2
// Output:
//   Asset 2: mongolia_grid_10km_drivers_early
// ================================================


// ================================================
// PART 0: Settings
// ================================================

var outAssetId =
  'projects/project-d66de26-4a7f-4da9-a72/assets/mongolia_grid_10km_drivers_early';

var gridRaw = table;

// Check raw feature geometry vs geometry property
print('raw first feature', gridRaw.first());
print('raw true geometry', gridRaw.first().geometry());
print('raw geometry property', gridRaw.first().get('geometry'));

// Rebuild the FeatureCollection so that the actual geometry
// used in later overlay comes from the geometry column

var grid = ee.FeatureCollection(gridRaw.map(function(f) {
  var props = f.toDictionary();
  return ee.Feature(f.geometry(), props);
}));

print('grid size:', grid.size());
print('first feature:', grid.first());
print('first geometry:', grid.first().geometry());

// Use a wider AOI than the earlier preprocessing workflow
var aoi = ee.Geometry.Rectangle([94, 44, 116, 50]);

// ================================================
// PART 1: Construct netneg labels (from 04B)
// ================================================

// --- 1a. Compute degradation percentile thresholds ---
var pct = grid.reduceColumns({
  reducer: ee.Reducer.percentile([80, 85, 90]),
  selectors: ['degradation_share_allpx']
});
var q80 = ee.Number(pct.get('p80'));
var q85 = ee.Number(pct.get('p85'));
var q90 = ee.Number(pct.get('p90'));

// --- 1b. Label each grid cell ---
var gridLabeled = grid.map(function(f) {
  var deg = ee.Number(f.get('degradation_share_allpx'));
  var net = ee.Number(f.get('net_change_allpx'));
  var isNetNeg = net.lt(0);

  return f.set({
    y20_netneg: deg.gte(q80).and(isNetNeg).int(),
    y15_netneg: deg.gte(q85).and(isNetNeg).int(),
    y10_netneg: deg.gte(q90).and(isNetNeg).int()
  });
});


// ================================================
// PART 2: Build driver stack
// ================================================

// --- 2a. Climate: TerraClimate 2016-2018 mean ---
var tc = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('2016-06-01', '2018-09-30')
  .filterBounds(aoi);

var prec = tc.select('pr').mean().clip(aoi).rename('prec');
var vpd  = tc.select('vpd').mean().multiply(0.01).clip(aoi).rename('vpd');
var pet  = tc.select('pet').mean().multiply(0.1).clip(aoi).rename('pet');
var ws   = tc.select('vs').mean().multiply(0.01).clip(aoi).rename('ws');

// --- 2b. Terrain: SRTM DEM + derivatives ---
var dem = ee.Image('USGS/SRTMGL1_003').clip(aoi);
var elev      = dem.rename('elev');
var slope     = ee.Terrain.slope(dem).rename('slope');
var aspectRad = ee.Terrain.aspect(dem).multiply(Math.PI).divide(180);
var northness = aspectRad.cos().rename('northness');
var eastness  = aspectRad.sin().rename('eastness');

// --- 2c. Soil: OpenLandMap surface layer ---
var clay = ee.Image('OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02')
  .select('b0')
  .clip(aoi)
  .rename('clay');

var sand = ee.Image('OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02')
  .select('b0')
  .clip(aoi)
  .rename('sand');

// --- 2d. Stack all driver bands ---
var driverStack = prec.addBands(vpd).addBands(pet).addBands(ws)
  .addBands(elev).addBands(slope)
  .addBands(northness).addBands(eastness)
  .addBands(clay).addBands(sand);

// ================================================
// Sanity check: confirm all 4 climate bands loaded correctly
// ================================================

// Check image count (should be ~28 for 2016-06 to 2018-09)
print('Total TerraClimate images:', tc.size());

// Check available band names in first image
print('Bands in first image:', tc.first().bandNames());

// Check each variable has the right number of images
print('prec image count:', tc.select('pr').size());
print('vpd image count:', tc.select('vpd').size());
print('pet image count:', tc.select('pet').size());
print('ws image count:', tc.select('vs').size());

// Check mean values over Mongolia AOI (rough sanity check)
print('prec mean value:', prec.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 4000,
  maxPixels: 1e9
}));

print('vpd mean value:', vpd.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 4000,
  maxPixels: 1e9
}));

print('pet mean value:', pet.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 4000,
  maxPixels: 1e9
}));

print('ws mean value:', ws.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 4000,
  maxPixels: 1e9
}));
// Terrain and soil mean values over AOI
print('elev mean value:', elev.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 500,
  maxPixels: 1e9
}));

print('slope mean value:', slope.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 500,
  maxPixels: 1e9
}));

print('northness mean value:', northness.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 500,
  maxPixels: 1e9
}));

print('eastness mean value:', eastness.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 500,
  maxPixels: 1e9
}));

print('clay mean value:', clay.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 500,
  maxPixels: 1e9
}));

print('sand mean value:', sand.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 500,
  maxPixels: 1e9
}));
// ================================================
// PART 3: Aggregate to grid
// ================================================
var gridFinal = driverStack.reduceRegions({
  collection: gridLabeled,      // ← 已含 netneg 标签
  reducer: ee.Reducer.mean(),
  scale: 500,
  crs: 'EPSG:4326'
});


// ================================================
// PART 4a: Sanity checks
// ================================================
print('=== Grid size ===');
print(gridFinal.size());

print('=== First feature (check all columns present) ===');
print(gridFinal.first());

print('=== Label thresholds ===');
print('q80 (top 20%):', q80);
print('q85 (top 15%):', q85);
print('q90 (top 10%):', q90);

print('=== Label distributions ===');
print('y20_netneg:', gridFinal.aggregate_histogram('y20_netneg'));
print('y15_netneg:', gridFinal.aggregate_histogram('y15_netneg'));
print('y10_netneg:', gridFinal.aggregate_histogram('y10_netneg'));

print('=== Driver samples (first 5 values) ===');
print('prec:', gridFinal.aggregate_array('prec').slice(0, 5));
print('northness:', gridFinal.aggregate_array('northness').slice(0, 5));
print('elev:', gridFinal.aggregate_array('elev').slice(0, 5));

// ================================================
// PART 4b: Reorder columns for export
// ================================================
var exportColumns = [
  'changed_mean',
  'degradation_mean',
  'recovery_mean',
  'degradation_share_allpx',
  'recovery_share_allpx',
  'net_change_allpx',
  'is_deg_hotspot_5',
  'is_netdeg_hotspot_5',
  'is_core_hotspot',
  'lulc_early_mode',
  'lulc_recent_mode',
  'y20_netneg',
  'y15_netneg',
  'y10_netneg',
  'prec',
  'vpd',
  'pet',
  'ws',
  'elev',
  'slope',
  'northness',
  'eastness',
  'clay',
  'sand'
];

var gridFinalOrdered = gridFinal.select(exportColumns);

// ================================================
// PART 5: Export
// ================================================
Export.table.toAsset({
  collection: gridFinalOrdered,
  description: 'mongolia_grid_10km_drivers_early',
  assetId: outAssetId
});

Export.table.toDrive({
  collection: gridFinalOrdered,
  description: 'mongolia_grid_10km_drivers_early_csv',
  folder: 'CASA0025',
  fileNamePrefix: 'mongolia_grid_10km_drivers_early',
  fileFormat: 'CSV'
});
