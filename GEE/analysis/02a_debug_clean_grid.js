// ================================================
// 02a_debug_clean_grid.js
// Purpose: fast debug version for Console checking
// ================================================

var aoi = ee.Geometry.Rectangle([95, 45, 115, 48]);

// Select just a smaller test area 
var debugAoi = ee.Geometry.Rectangle([95, 45, 99, 46]);

var dwEarly = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2016-06-01', '2018-09-30')
  .filterBounds(debugAoi)
  .select('label')
  .mode()
  .clip(debugAoi);

var dwRecent = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2021-06-01', '2023-09-30')
  .filterBounds(debugAoi)
  .select('label')
  .mode()
  .clip(debugAoi);

var changed = dwEarly.neq(dwRecent).rename('changed');
var transition = dwEarly.multiply(10).add(dwRecent).updateMask(changed);

var grassToBare = transition.eq(27);
var treesToBare = transition.eq(17);
var shrubToBare = transition.eq(57);

var degradation = grassToBare
  .add(treesToBare)
  .add(shrubToBare)
  .gt(0)
  .rename('degradation');

var bareToGrass = transition.eq(72);
var bareToTrees = transition.eq(71);
var bareToShrub = transition.eq(75);

var recovery = bareToGrass
  .add(bareToTrees)
  .add(bareToShrub)
  .gt(0)
  .rename('recovery');


var grid = debugAoi.coveringGrid('EPSG:4326', 10000);

var stackedImage = dwEarly.rename('lulc_early')
  .addBands(dwRecent.rename('lulc_recent'))
  .addBands(degradation)
  .addBands(recovery)
  .addBands(changed);


var gridStats = stackedImage.reduceRegions({
  collection: grid,
  reducer: ee.Reducer.mean().combine(ee.Reducer.mode(), null, true),
  scale: 1000,
  crs: 'EPSG:4326'
});

var gridNonEmpty = gridStats.filter(ee.Filter.notNull(['changed_mean']));

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


print('debug original grid size');
print(grid.size());

print('debug non-empty grid size');
print(gridNonEmpty.size());

print('debug sample cleaned feature');
print(gridClean.limit(3));

print('debug sample cleaned feature');
print(gridClean.limit(3));

print('debug changed_mean values');
print(gridClean.aggregate_array('changed_mean').slice(0, 10));

print('debug degradation_share_allpx values');
print(gridClean.aggregate_array('degradation_share_allpx').slice(0, 10));