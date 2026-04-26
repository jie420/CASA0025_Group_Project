// ================================================
// 04B_toplabel_netneg.js
// Purpose:
// Create stricter labels using:
//
// 1) degradation_share_allpx >= threshold
// 2) net_change_allpx < 0
//
// Keep ALL grid cells in the dataset.
// Only redefine the positive class.
// ================================================

// ------------------------------------------------
// 0. Use imported asset
// ------------------------------------------------
var grid = table;

// ------------------------------------------------
// 1. Basic checks
// ------------------------------------------------
print('grid size');
print(grid.size());

print('sample feature');
print(grid.first());

// ------------------------------------------------
// 2. Thresholds from ALL cells
// (same as previous raw version)
// ------------------------------------------------
var pct = grid.reduceColumns({
  reducer: ee.Reducer.percentile([80, 85, 90]),
  selectors: ['degradation_share_allpx']
});

var q80 = ee.Number(pct.get('p80')); // top 20%
var q85 = ee.Number(pct.get('p85')); // top 15%
var q90 = ee.Number(pct.get('p90')); // top 10%

print('q80 (top 20% threshold)');
print(q80);

print('q85 (top 15% threshold)');
print(q85);

print('q90 (top 10% threshold)');
print(q90);

// ------------------------------------------------
// 3. Create B-version labels
// Rule:
// positive = high degradation AND net negative
// ------------------------------------------------
var gridLabeledB = grid.map(function(f) {
  var deg = ee.Number(f.get('degradation_share_allpx'));
  var net = ee.Number(f.get('net_change_allpx'));

  var isNetNeg = net.lt(0);

  var y20_netneg = deg.gte(q80).and(isNetNeg).int();
  var y15_netneg = deg.gte(q85).and(isNetNeg).int();
  var y10_netneg = deg.gte(q90).and(isNetNeg).int();

  return f.set({
    y20_netneg: y20_netneg,
    y15_netneg: y15_netneg,
    y10_netneg: y10_netneg
  });
});

// ------------------------------------------------
// 4. Class balance
// ------------------------------------------------
function printClassBalance(fc, labelName) {
  print(labelName + ' class counts');
  print(fc.aggregate_histogram(labelName));
}

printClassBalance(gridLabeledB, 'y20_netneg');
printClassBalance(gridLabeledB, 'y15_netneg');
printClassBalance(gridLabeledB, 'y10_netneg');

// ------------------------------------------------
// 5. Check that positives are truly net negative
// ------------------------------------------------
function checkNetConsistency(fc, labelName) {
  var pos = fc.filter(ee.Filter.eq(labelName, 1));

  print(labelName + ' positives count');
  print(pos.size());

  print(labelName + ' positives with net_change_allpx < 0');
  print(pos.filter(ee.Filter.lt('net_change_allpx', 0)).size());

  print(labelName + ' positives with net_change_allpx >= 0');
  print(pos.filter(ee.Filter.gte('net_change_allpx', 0)).size());

  print(labelName + ' min/max net_change_allpx among positives');
  print(pos.reduceColumns({
    selectors: ['net_change_allpx'],
    reducer: ee.Reducer.minMax()
  }));
}

checkNetConsistency(gridLabeledB, 'y20_netneg');
checkNetConsistency(gridLabeledB, 'y15_netneg');
checkNetConsistency(gridLabeledB, 'y10_netneg');

// ------------------------------------------------
// 6. Map preview
// ------------------------------------------------
Map.centerObject(gridLabeledB, 6);

Map.addLayer(
  gridLabeledB.style({color: '999999', fillColor: '00000000', width: 1}),
  {},
  'grid outline',
  false
);

Map.addLayer(
  gridLabeledB.filter(ee.Filter.eq('y20_netneg', 1))
    .style({color: 'orange', fillColor: 'ffa50055', width: 1}),
  {},
  'y20_netneg positives',
  false
);

Map.addLayer(
  gridLabeledB.filter(ee.Filter.eq('y15_netneg', 1))
    .style({color: 'red', fillColor: 'ff000055', width: 1}),
  {},
  'y15_netneg positives',
  true
);

Map.addLayer(
  gridLabeledB.filter(ee.Filter.eq('y10_netneg', 1))
    .style({color: 'purple', fillColor: '80008055', width: 1}),
  {},
  'y10_netneg positives',
  false
);

// ------------------------------------------------
// 7. Keep one sample for inspection
// ------------------------------------------------
print('gridLabeledB sample');
print(gridLabeledB.first());
