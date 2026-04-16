// ================================================
// extract_predictors_early.js
// Author：Ziyi YUAN
// Purpose:
//   Extract Early-period (2016-2018) predictors and
//   aggregate them to the same 10km grid as the
//   label asset.
//
// Used for: main RF model training
//           (predicts degradation observed between
//           Early and Recent periods)
//
// Factors: drivers from Meng et al. (2021)
//   Climate (4): prec, vpd, pet, ws
//   Terrain (3): elev, slope, aspect
//   Soil    (2): clay, sand  [substituting the
//                categorical SOIL in Meng et al.]
//
// Output:
//   projects/project-d66de26-4a7f-4da9-a72/assets/mongolia_grid_10km_predictors_early
//
// Depends on:
//   02_clean_grid_asset.js  →  produces the grid asset with labels
// ================================================


// ------------------------------------------------
// 0. Basic settings
// ------------------------------------------------
var aoi = ee.Geometry.Rectangle([95, 45, 115, 48]);

var gridAssetId =
  'projects/project-d66de26-4a7f-4da9-a72/assets/mongolia_grid_10km_cleaned_asset_v2';

var outAssetId =
  'projects/project-d66de26-4a7f-4da9-a72/assets/mongolia_grid_10km_predictors_early';

var grid = ee.FeatureCollection(gridAssetId);


// ------------------------------------------------
// 1. Dynamic climate predictors - Early (2016-2018)
// Source: TerraClimate monthly data, averaged over
//         3 full years to get mean annual conditions.
// ------------------------------------------------
var tc = ee.ImageCollection('IDAHO_EPSCOR/TERRACLIMATE')
  .filterDate('2016-01-01', '2018-12-31');

var prec = tc.select('pr').mean().rename('prec');
var vpd  = tc.select('vpd').mean().multiply(0.01).rename('vpd');  // scale → kPa
var pet  = tc.select('pet').mean().multiply(0.1).rename('pet');   // scale → mm
var ws   = tc.select('vs').mean().multiply(0.01).rename('ws');    // scale → m/s


// ------------------------------------------------
// 2. Static predictors (time-invariant)
// Terrain: SRTM 30m DEM + derived slope and aspect
// Soil: OpenLandMap surface (0 cm) clay and sand
//       fractions, substituting the categorical soil
//       type used in Meng et al. (2021)
// ------------------------------------------------
var dem    = ee.Image('USGS/SRTMGL1_003');
var elev   = dem.rename('elev');
var slope  = ee.Terrain.slope(dem).rename('slope');
var aspect = ee.Terrain.aspect(dem).rename('aspect');

var clay = ee.Image('OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02')
  .select('b0').rename('clay');
var sand = ee.Image('OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02')
  .select('b0').rename('sand');


// ------------------------------------------------
// 3. Build the Early-period predictor stack
// Final band list (9 bands from Meng et al. 2021):
//   Climate (4): prec, vpd, pet, ws
//   Terrain (3): elev, slope, aspect
//   Soil    (2): clay, sand
// ------------------------------------------------
var predictorStack = prec.addBands(vpd).addBands(pet).addBands(ws)
  .addBands(elev).addBands(slope).addBands(aspect)
  .addBands(clay).addBands(sand);


// ------------------------------------------------
// 4. Aggregate predictors to the 10km grid
// Parameters match 02_clean_grid_asset.js:
//   scale = 500, crs = 'EPSG:4326'
// ------------------------------------------------
var gridWithPredictors = predictorStack.reduceRegions({
  collection: grid,
  reducer: ee.Reducer.mean(),
  scale: 500,
  crs: 'EPSG:4326'
});


// ------------------------------------------------
// 5. Sanity checks
// ------------------------------------------------
print('Early predictors - grid size');
print(gridWithPredictors.size());

print('Early predictors - first feature');
print(gridWithPredictors.first());

print('Early prec sample values');
print(gridWithPredictors.aggregate_array('prec').slice(0, 10));

print('Early elev sample values');
print(gridWithPredictors.aggregate_array('elev').slice(0, 10));


// ------------------------------------------------
// 6. Export to Asset
// ------------------------------------------------
Export.table.toAsset({
  collection: gridWithPredictors,
  description: 'mongolia_grid_10km_predictors_early',
  assetId: outAssetId
});


// ------------------------------------------------
// 7.backup export to Drive as CSV
// ------------------------------------------------
Export.table.toDrive({
  collection: gridWithPredictors,
  description: 'mongolia_grid_10km_predictors_early_csv',
  folder: 'CASA0025',
  fileNamePrefix: 'mongolia_grid_10km_predictors_early',
  fileFormat: 'CSV'
});
