// ================================================
// 01c_preprocessing_change_detection_and_grid.js
// Author: Jie Liu
// Purpose: Detect land cover changes between 2017-2018
//          and 2022-2023, identify degradation and
//          recovery pixels, then aggregate to 10km grid
//          for handoff to Analysis team.
// Outputs: 
//   - Degradation/recovery maps (visual)
//   - 10km grid CSV + GeoJSON (exported to Drive)
// ================================================


// ------------------------------------------------
// Define AOI and reload LULC composites
// ------------------------------------------------
var aoi = ee.Geometry.Rectangle([95, 45, 115, 48]);

var dw2018 = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2017-06-01', '2018-09-30')
  .filterBounds(aoi)
  .select('label')
  .mode()
  .clip(aoi);

var dw2023 = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2022-06-01', '2023-09-30')
  .filterBounds(aoi)
  .select('label')
  .mode()
  .clip(aoi);


// ------------------------------------------------
// Detect changed pixels
// Pixels where land cover class differs between
// the two periods are flagged as changed (value=1)
// ------------------------------------------------
var changed = dw2018.neq(dw2023);

Map.centerObject(aoi, 6);
Map.addLayer(changed, 
             {min: 0, max: 1, palette: ['white', 'red']},
             'Changed pixels');


// ------------------------------------------------
// ncode land cover transitions
// Formula: from_class * 10 + to_class
// e.g. grass(2) → bare(7) = 27
//      trees(1) → bare(7) = 17
// Only changed pixels are included (updateMask)
// ------------------------------------------------
var transition = dw2018.multiply(10).add(dw2023)
  .updateMask(changed);


// ------------------------------------------------
// Classify degradation and recovery pixels
// Degradation = vegetation/grassland turning to bare
// Recovery    = bare land returning to vegetation
// ------------------------------------------------

// Degradation transitions (→ bare land)
var grassToBare = transition.eq(27);   // grass  → bare
var treesToBare = transition.eq(17);   // trees  → bare
var shrubToBare = transition.eq(57);   // shrub  → bare

var degradation = grassToBare
  .add(treesToBare)
  .add(shrubToBare)
  .gt(0)
  .rename('degradation');

// Recovery transitions (bare → vegetation)
var bareToGrass = transition.eq(72);   // bare → grass
var bareToTrees = transition.eq(71);   // bare → trees
var bareToShrub = transition.eq(75);   // bare → shrub

var recovery = bareToGrass
  .add(bareToTrees)
  .add(bareToShrub)
  .gt(0)
  .rename('recovery');

// Combined map: -1 = degradation, 0 = no change, 1 = recovery
var changeMap = recovery.subtract(degradation);

Map.addLayer(degradation.selfMask(),
             {palette: ['orange']}, 'Degradation pixels');
Map.addLayer(recovery.selfMask(),
             {palette: ['green']}, 'Recovery pixels');
Map.addLayer(changeMap,
             {min: -1, max: 1, palette: ['red', 'white', 'green']},
             'Degradation vs Recovery');

// Print pixel-level summary statistics
print('Degradation pixels (grass/trees/shrub → bare):',
  degradation.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoi, scale: 1000, maxPixels: 1e9
}));
print('Recovery pixels (bare → grass/trees/shrub):',
  recovery.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoi, scale: 1000, maxPixels: 1e9
}));
print('grass→bare:', grassToBare.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aoi, scale: 1000, maxPixels: 1e9
}));
print('trees→bare:', treesToBare.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aoi, scale: 1000, maxPixels: 1e9
}));


// ------------------------------------------------
// Create 10km grid over AOI
// Aggregating to grid cells makes the data usable
// for regression modelling by the Analysis team —
// pixel-level data (~millions of points) is too
// large for direct statistical modelling
// ------------------------------------------------
var grid = aoi.coveringGrid('EPSG:4326', 10000);
print('Total grid cells:', grid.size());


// ------------------------------------------------
// Stack all layers into one multi-band image
// Allows a single reduceRegions() call for efficiency
// Bands: lulc_2018, lulc_2023, degradation, recovery,
//        changed
// ------------------------------------------------
var stackedImage = dw2018.rename('lulc_2018')
  .addBands(dw2023.rename('lulc_2023'))
  .addBands(degradation)
  .addBands(recovery)
  .addBands(changed.rename('changed'));


// ------------------------------------------------
// Aggregate pixel statistics to each grid cell
// mean()  → proportion of pixels in each category
// mode()  → dominant land cover class
// net_change = recovery_mean - degradation_mean
//   positive = net recovery
//   negative = net degradation
// ------------------------------------------------
var gridStats = stackedImage.reduceRegions({
  collection: grid,
  reducer: ee.Reducer.mean()
    .combine(ee.Reducer.mode(), null, true),
  scale: 500,
  crs: 'EPSG:4326'
});

// Add net change field to each grid cell
gridStats = gridStats.map(function(cell) {
  var deg = ee.Number(cell.get('degradation_mean'));
  var rec = ee.Number(cell.get('recovery_mean'));
  // If null (empty cell), default to 0
  deg = ee.Algorithms.If(deg, deg, ee.Number(0));
  rec = ee.Algorithms.If(rec, rec, ee.Number(0));
  return cell.set(
    'net_change', ee.Number(rec).subtract(ee.Number(deg))
  );
});

print('Sample grid cell properties:', gridStats.first());


// ------------------------------------------------
// Visualise grid on map
// Red cells  = net degradation (recovery < degradation)
// Green cells = net recovery   (recovery > degradation)
// ------------------------------------------------
var degradationCells = gridStats.filter(
  ee.Filter.lt('net_change', 0));
var recoveryCells = gridStats.filter(
  ee.Filter.gt('net_change', 0));

// Map.addLayer(gridStats.style({color: 'grey', fillColor: '00000000', width: 1}),
//             {}, 'Grid cells (outline)');
Map.addLayer(degradationCells.style({color: 'red',   fillColor: 'ff000044'}),
             {}, 'Net degradation cells');
Map.addLayer(recoveryCells.style({color: 'green', fillColor: '00ff0044'}),
             {}, 'Net recovery cells');


// ------------------------------------------------
// Export grid
// CSV     → for Analysis team's regression model
// GeoJSON → for Python (geopandas) / QGIS / web app
//
// Column descriptions:
//   degradation_mean : proportion of degraded pixels
//   recovery_mean    : proportion of recovered pixels
//   net_change       : recovery_mean - degradation_mean
//   lulc_2018_mode   : dominant class in 2017-2018
//   lulc_2023_mode   : dominant class in 2022-2023
//   changed_mean     : proportion of changed pixels
// ------------------------------------------------
Export.table.toDrive({
  collection: gridStats,
  description: 'Mongolia_grid_10km_CSV',
  folder: 'CASA0025',
  fileNamePrefix: 'mongolia_grid_10km',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: gridStats,
  description: 'Mongolia_grid_10km_GeoJSON',
  folder: 'CASA0025',
  fileNamePrefix: 'mongolia_grid_10km',
  fileFormat: 'GeoJSON'
});

print('01c complete.');