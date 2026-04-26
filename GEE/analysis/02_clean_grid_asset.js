// ================================================
// 02_clean_grid_asset.js
// Purpose:
// Rebuild a cleaned 10km grid asset using the
// corrected whole-grid definitions from Python.
//
// Output:
// A new table asset:
// projects/project-d66de26-4a7f-4da9-a72/assets/mongolia_grid_10km_cleaned_asset_v2
// ================================================


// ------------------------------------------------
// 0. Basic settings
// ------------------------------------------------
var aoi = ee.Geometry.Rectangle([95, 45, 115, 48]);


var outAssetId =
  'projects/project-d66de26-4a7f-4da9-a72/assets/mongolia_grid_10km_cleaned_asset_v2';


// ------------------------------------------------
// 1. Load two Dynamic World composites
// Same logic as 01b / 01c
// ------------------------------------------------
var dwEarly = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2016-06-01', '2018-09-30')
  .filterBounds(aoi)
  .select('label')
  .mode()
  .clip(aoi);

var dwRecent = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2021-06-01', '2023-09-30')
  .filterBounds(aoi)
  .select('label')
  .mode()
  .clip(aoi);


// ------------------------------------------------
// 2. Change detection
// ------------------------------------------------
var changed = dwEarly.neq(dwRecent).rename('changed');

// Encode transitions only where change happened
var transition = dwEarly.multiply(10).add(dwRecent).updateMask(changed);

// Degradation transitions: vegetation -> bare
var grassToBare = transition.eq(27);   // grass -> bare
var treesToBare = transition.eq(17);   // trees -> bare
var shrubToBare = transition.eq(57);   // shrub -> bare

var degradation = grassToBare
  .add(treesToBare)
  .add(shrubToBare)
  .gt(0)
  .rename('degradation');

// Recovery transitions: bare -> vegetation
var bareToGrass = transition.eq(72);   // bare -> grass
var bareToTrees = transition.eq(71);   // bare -> trees
var bareToShrub = transition.eq(75);   // bare -> shrub

var recovery = bareToGrass
  .add(bareToTrees)
  .add(bareToShrub)
  .gt(0)
  .rename('recovery');


// ------------------------------------------------
// 3. Build 10km grid
// ------------------------------------------------
var grid = aoi.coveringGrid('EPSG:4326', 10000);
//print('Original grid cell count:', grid.size());


// ------------------------------------------------
// 4. Stack bands and aggregate to grid
// mean() -> proportions
// mode() -> dominant class
// ------------------------------------------------
var stackedImage = dwEarly.rename('lulc_early')
  .addBands(dwRecent.rename('lulc_recent'))
  .addBands(degradation)
  .addBands(recovery)
  .addBands(changed);

var gridStats = stackedImage.reduceRegions({
  collection: grid,
  reducer: ee.Reducer.mean().combine(ee.Reducer.mode(), null, true),
  scale: 500,
  crs: 'EPSG:4326'
});

// Original 01c-style net change
gridStats = gridStats.map(function(cell) {
  var deg = ee.Number(ee.Algorithms.If(
    cell.get('degradation_mean'),
    cell.get('degradation_mean'),
    0
  ));

  var rec = ee.Number(ee.Algorithms.If(
    cell.get('recovery_mean'),
    cell.get('recovery_mean'),
    0
  ));

  return cell.set('net_change', rec.subtract(deg));
});


// ------------------------------------------------
// 5. CLEANING
// Your corrected logic from Python
// ------------------------------------------------

// 5A. Remove true empty cells
// changed_mean == null means no valid pixels in this grid
var gridNonEmpty = gridStats.filter(ee.Filter.notNull(['changed_mean']));
//print('After removing true empty cells:', gridNonEmpty.size());

// 5B. Fill degradation/recovery nulls with 0
// 5C. Create whole-grid metrics
var gridClean = gridNonEmpty.map(function(cell) {
  var changedMean = ee.Number(cell.get('changed_mean'));

  var degMeanFilled = ee.Number(ee.Algorithms.If(
    cell.get('degradation_mean'),
    cell.get('degradation_mean'),
    0
  ));

  var recMeanFilled = ee.Number(ee.Algorithms.If(
    cell.get('recovery_mean'),
    cell.get('recovery_mean'),
    0
  ));

  // Whole-grid metrics
  var degradationShareAllpx = changedMean.multiply(degMeanFilled);
  var recoveryShareAllpx = changedMean.multiply(recMeanFilled);
  var netChangeAllpx = recoveryShareAllpx.subtract(degradationShareAllpx);

  return cell.set({
    degradation_mean_filled: degMeanFilled,
    recovery_mean_filled: recMeanFilled,
    degradation_share_allpx: degradationShareAllpx,
    recovery_share_allpx: recoveryShareAllpx,
    net_change_allpx: netChangeAllpx
  });
});


// ------------------------------------------------
// 6. Minimal checks only
// ------------------------------------------------
//print('Original grid cell count:', grid.size());

// ------------------------------------------------
// 7. Very light map preview only
// ------------------------------------------------
//Map.centerObject(aoi, 6);
//Map.addLayer(aoi, {color: 'red'}, 'AOI', false);

// ------------------------------------------------
// 8. Export to Asset
// ------------------------------------------------
Export.table.toAsset({
  collection: gridClean,
  description: 'mongolia_grid_10km_cleaned_asset_v2',
  assetId: 'projects/project-d66de26-4a7f-4da9-a72/assets/mongolia_grid_10km_cleaned_asset_v2'
});

// ------------------------------------------------
// 9. Optional backup export to Drive
// ------------------------------------------------
Export.table.toDrive({
  collection: gridClean,
  description: 'mongolia_grid_10km_cleaned_asset_v2_csv',
  folder: 'CASA0025',
  fileNamePrefix: 'mongolia_grid_10km_cleaned_asset_v2',
  fileFormat: 'CSV'
});