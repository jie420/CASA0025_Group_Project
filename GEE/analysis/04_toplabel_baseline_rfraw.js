// ================================================
// 04A_toplabel_screening.js
// Purpose:
// Use degradation_share_allpx to create y10 / y15 / y20,
// then inspect thresholds, class balance, and map patterns.
// ================================================

// Here, simply use the variable name you have already imported: table
var grid = table;

// 1. Basic examination
print('grid size');
print(grid.size());

print('sample feature');
print(grid.first());

// 2. Calculate the thresholds for the top 20, top 15 and top 10
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

// 3. Generate three candidate labels
var gridLabeled = grid.map(function(f) {
  var deg = ee.Number(f.get('degradation_share_allpx'));

  return f.set({
    y20: deg.gte(q80).int(),
    y15: deg.gte(q85).int(),
    y10: deg.gte(q90).int()
  });
});

// 4. Check the number of categories
function printClassBalance(fc, labelName) {
  print(labelName + ' class counts');
  print(fc.aggregate_histogram(labelName));
}

printClassBalance(gridLabeled, 'y20');
printClassBalance(gridLabeled, 'y15');
printClassBalance(gridLabeled, 'y10');

// 5. Map preview
Map.centerObject(gridLabeled, 6);

Map.addLayer(
  gridLabeled.style({color: '999999', fillColor: '00000000', width: 1}),
  {},
  'grid outline',
  false
);

Map.addLayer(
  gridLabeled.filter(ee.Filter.eq('y20', 1))
    .style({color: 'orange', fillColor: 'ffa50055', width: 1}),
  {},
  'y20 positives',
  false
);

Map.addLayer(
  gridLabeled.filter(ee.Filter.eq('y15', 1))
    .style({color: 'red', fillColor: 'ff000055', width: 1}),
  {},
  'y15 positives',
  true
);

Map.addLayer(
  gridLabeled.filter(ee.Filter.eq('y10', 1))
    .style({color: 'purple', fillColor: '80008055', width: 1}),
  {},
  'y10 positives',
  false
);

// 6. Reserve the output object for subsequent scripts
print('gridLabeled sample');
print(gridLabeled.first());