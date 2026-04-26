// ================================================
// SINGLE-FILE RF WORKFLOW FOR GEE
// Modes:
//   1) LABEL_SELECTION
//   2) TUNING
//   3) FINAL
//
// Run order:
//   - First:  MODE = 'LABEL_SELECTION'
//   - Second: MODE = 'TUNING'
//   - Third:  MODE = 'FINAL'
// ================================================


// ================================================
// PART 0. MODE SWITCH
// Change this manually before each run
// ================================================
var MODE = 'FINAL';   // 'LABEL_SELECTION' | 'TUNING' | 'FINAL'


// ================================================
// PART 1. GLOBAL SETTINGS
// ================================================
var grid = table;
print('Grid size check (should be 7031):', grid.size());

var climateBands = ['prec', 'vpd', 'pet', 'ws'];
var terrainBands = ['elev', 'slope', 'northness', 'eastness'];
var soilBands    = ['clay', 'sand'];
var inputBands   = climateBands.concat(terrainBands).concat(soilBands);

// Verify all inputBands exist in grid
var missingBands = ee.List(inputBands).removeAll(
  grid.first().propertyNames()
);
print('Missing bands (should be empty):', missingBands);

var labels = ['y10_netneg', 'y15_netneg', 'y20_netneg'];

// fixed seeds for reproducibility
var splitSeed = 42;
var foldSeed  = 123;

// manually update these after each stage
var selectedLabel = 'y15_netneg';
var bestNtree = 200;
var bestMtry  = 5;
var bestLeaf  = 10;


// ================================================
// PART 2. HELPERS
// ================================================

function metricsFromCM(cm) {
  cm = ee.ConfusionMatrix(cm);

  var oa = ee.Number(cm.accuracy());
  var kappa = ee.Number(cm.kappa());

  var arr = ee.Array(cm.array());

  // Rows = actual class, columns = predicted class
  // Assumed binary class order: [0, 1]
  //
  //            Pred 0   Pred 1
  // Actual 0    TN       FP
  // Actual 1    FN       TP
  var tn = ee.Number(arr.get([0, 0]));
  var fp = ee.Number(arr.get([0, 1]));
  var fn = ee.Number(arr.get([1, 0]));
  var tp = ee.Number(arr.get([1, 1]));

  // Precision = among predicted positives, how many are truly positive
  var precision = ee.Algorithms.If(
    tp.add(fp).gt(0),
    tp.divide(tp.add(fp)),
    ee.Number(0)
  );

  // Recall = among actual positives, how many are correctly identified
  var recall = ee.Algorithms.If(
    tp.add(fn).gt(0),
    tp.divide(tp.add(fn)),
    ee.Number(0)
  );

  // Harmonic mean of precision and recall
  var f1 = ee.Algorithms.If(
    ee.Number(precision).add(ee.Number(recall)).gt(0),
    ee.Number(2)
      .multiply(ee.Number(precision))
      .multiply(ee.Number(recall))
      .divide(ee.Number(precision).add(ee.Number(recall))),
    ee.Number(0)
  );

  return ee.Dictionary({
    TN: tn,
    FP: fp,
    FN: fn,
    TP: tp,
    OA: oa,
    Kappa: kappa,
    Precision: ee.Number(precision),
    Recall: ee.Number(recall),
    F1: ee.Number(f1)
  });
}

function meanStd(list) {
  list = ee.List(list);
  var mean = ee.Number(list.reduce(ee.Reducer.mean()));
  var std = ee.Number(list.reduce(ee.Reducer.stdDev()));
  return ee.Dictionary({mean: mean, std: std});
}

function makeSplit(labelName) {
  var pos = grid.filter(ee.Filter.eq(labelName, 1))
                .randomColumn('rand_split', splitSeed);

  var neg = grid.filter(ee.Filter.eq(labelName, 0))
                .randomColumn('rand_split', splitSeed);

  var trainPos = pos.filter(ee.Filter.lt('rand_split', 0.70));
  var testPos  = pos.filter(ee.Filter.gte('rand_split', 0.70));
  var trainNeg = neg.filter(ee.Filter.lt('rand_split', 0.70));
  var testNeg  = neg.filter(ee.Filter.gte('rand_split', 0.70));

  return {
    trainPos: trainPos,
    testPos: testPos,
    trainNeg: trainNeg,
    testNeg: testNeg,
    trainSet: trainPos.merge(trainNeg),
    testSet: testPos.merge(testNeg)
  };
}

function makeFolds(trainPos, trainNeg) {
  var trainPosFolded = trainPos.randomColumn('fold_rand', foldSeed).map(function(f) {
    // Convert a random number in [0, 1) into fold IDs: 0, 1, 2, 3, 4
    return f.set('fold_id', ee.Number(f.get('fold_rand')).multiply(5).floor());
  });

  var trainNegFolded = trainNeg.randomColumn('fold_rand', foldSeed).map(function(f) {
    // Apply the same fold assignment logic to the negative class
    return f.set('fold_id', ee.Number(f.get('fold_rand')).multiply(5).floor());
  });

  return {
    trainPosFolded: trainPosFolded,
    trainNegFolded: trainNegFolded
  };
}

// ================================================
// PART 3. MODE = LABEL_SELECTION
// Compare y10 / y15 / y20 using baseline RF
// Training-set only
// ================================================
function evaluateLabel(labelName) {

  print('==============================');
  print('Evaluating label:', labelName);
  print('==============================');

  var split = makeSplit(labelName);

  print('Train size:', split.trainSet.size());
  print('Test size (locked):', split.testSet.size());
  print('Train positive count:', split.trainPos.size());
  print('Test positive count:', split.testPos.size());

  var folds = makeFolds(split.trainPos, split.trainNeg);

  var oaList = [];
  var kappaList = [];
  var precisionList = [];
  var recallList = [];
  var f1List = [];

  for (var i = 0; i < 5; i++) {
    var valPos = folds.trainPosFolded.filter(ee.Filter.eq('fold_id', i));
    var valNeg = folds.trainNegFolded.filter(ee.Filter.eq('fold_id', i));
    var cvVal = valPos.merge(valNeg);

    var trPos = folds.trainPosFolded.filter(ee.Filter.neq('fold_id', i));
    var trNeg = folds.trainNegFolded.filter(ee.Filter.neq('fold_id', i));
    var cvTrain = trPos.merge(trNeg);

    var clf = ee.Classifier.smileRandomForest({
      numberOfTrees: 100
    }).train({
      features: cvTrain,
      classProperty: labelName,
      inputProperties: inputBands
    });

    var pred = cvVal.classify(clf);
    var cm = pred.errorMatrix(labelName, 'classification');
    var m = metricsFromCM(cm);

    print('Fold ' + i + ' metrics:', m);

    oaList.push(m.get('OA'));
    kappaList.push(m.get('Kappa'));
    precisionList.push(m.get('Precision'));
    recallList.push(m.get('Recall'));
    f1List.push(m.get('F1'));
  }

  var oaStats = meanStd(oaList);
  var kappaStats = meanStd(kappaList);
  var precisionStats = meanStd(precisionList);
  var recallStats = meanStd(recallList);
  var f1Stats = meanStd(f1List);

  return ee.Feature(null, {
    label: labelName,
    train_n: split.trainSet.size(),
    test_n_locked: split.testSet.size(),
    train_pos_n: split.trainPos.size(),
    test_pos_n_locked: split.testPos.size(),

    cv_oa_mean: oaStats.get('mean'),
    cv_oa_std: oaStats.get('std'),

    cv_kappa_mean: kappaStats.get('mean'),
    cv_kappa_std: kappaStats.get('std'),

    cv_precision_mean: precisionStats.get('mean'),
    cv_precision_std: precisionStats.get('std'),

    cv_recall_mean: recallStats.get('mean'),
    cv_recall_std: recallStats.get('std'),

    cv_f1_mean: f1Stats.get('mean'),
    cv_f1_std: f1Stats.get('std')
  });
}

if (MODE === 'LABEL_SELECTION') {
  var summaryFC = ee.FeatureCollection(labels.map(evaluateLabel));

print('===== LABEL SELECTION SUMMARY =====');
  print(summaryFC);
  summaryFC.evaluate(function(fc) {
    fc.features.forEach(function(f) {
      var p = f.properties;
      print(p.label +
            ' | F1=' + p.cv_f1_mean.toFixed(3) +
            ' std=' + p.cv_f1_std.toFixed(3) +
            ' Kappa=' + p.cv_kappa_mean.toFixed(3) +
            ' train_pos=' + p.train_pos_n);
    });
  });
  
}

// ================================================
// PART 4a. MODE = TUNING
// Tune RF hyperparameters on training set only
// ================================================
if (MODE === 'TUNING') {

  var split = makeSplit(selectedLabel);
  var folds = makeFolds(split.trainPos, split.trainNeg);

  print('===== TUNING LABEL =====');
  print(selectedLabel);
  print('Train size:', split.trainSet.size());
  print('Test size (locked):', split.testSet.size());

  var ntreeOptions = [100, 200];
  var mtryOptions  = [3, 5];
  var leafOptions  = [5, 10, 20];

  var tuningRows = [];

  for (var a = 0; a < ntreeOptions.length; a++) {
    for (var b = 0; b < mtryOptions.length; b++) {
      for (var c = 0; c < leafOptions.length; c++) {

        var ntree = ntreeOptions[a];
        var mtry  = mtryOptions[b];
        var leaf  = leafOptions[c];

        var oaList = [];
        var kappaList = [];
        var precisionList = [];
        var recallList = [];
        var f1List = [];

        for (var i = 0; i < 5; i++) {
          var valPos = folds.trainPosFolded.filter(ee.Filter.eq('fold_id', i));
          var valNeg = folds.trainNegFolded.filter(ee.Filter.eq('fold_id', i));
          var cvVal = valPos.merge(valNeg);

          var trPos = folds.trainPosFolded.filter(ee.Filter.neq('fold_id', i));
          var trNeg = folds.trainNegFolded.filter(ee.Filter.neq('fold_id', i));
          var cvTrain = trPos.merge(trNeg);

          var clf = ee.Classifier.smileRandomForest({
            numberOfTrees: ntree,
            variablesPerSplit: mtry,
            minLeafPopulation: leaf
          }).train({
            features: cvTrain,
            classProperty: selectedLabel,
            inputProperties: inputBands
          });

          var pred = cvVal.classify(clf);
          var cm = pred.errorMatrix(selectedLabel, 'classification');
          var m = metricsFromCM(cm);

          oaList.push(m.get('OA'));
          kappaList.push(m.get('Kappa'));
          precisionList.push(m.get('Precision'));
          recallList.push(m.get('Recall'));
          f1List.push(m.get('F1'));
        }

        var oaStats = meanStd(oaList);
        var kappaStats = meanStd(kappaList);
        var precisionStats = meanStd(precisionList);
        var recallStats = meanStd(recallList);
        var f1Stats = meanStd(f1List);

        tuningRows.push(ee.Feature(null, {
          ntree: ntree,
          mtry: mtry,
          minLeafPop: leaf,

          cv_oa_mean: oaStats.get('mean'),
          cv_oa_std: oaStats.get('std'),

          cv_kappa_mean: kappaStats.get('mean'),
          cv_kappa_std: kappaStats.get('std'),

          cv_precision_mean: precisionStats.get('mean'),
          cv_precision_std: precisionStats.get('std'),

          cv_recall_mean: recallStats.get('mean'),
          cv_recall_std: recallStats.get('std'),

          cv_f1_mean: f1Stats.get('mean'),
          cv_f1_std: f1Stats.get('std')
        }));
      }
    }
  }

  var tuningFC = ee.FeatureCollection(tuningRows);
  var tuningSorted = tuningFC.sort('cv_f1_mean', false);

print('===== TUNING RESULTS =====');
  print(tuningSorted);

  // Print top 5 results in readable format
  tuningSorted.limit(5).evaluate(function(fc) {
    print('===== TOP 5 TUNING RESULTS =====');
    fc.features.forEach(function(f, i) {
      var p = f.properties;
      print('Rank ' + (i+1) +
            ' | ntree=' + p.ntree +
            ' mtry=' + p.mtry +
            ' leaf=' + p.minLeafPop +
            ' | F1=' + p.cv_f1_mean.toFixed(3) +
            ' std=' + p.cv_f1_std.toFixed(3) +
            ' Kappa=' + p.cv_kappa_mean.toFixed(3) +
            ' Recall=' + p.cv_recall_mean.toFixed(3));
    });
  });
}

// ================================================
// PART 5. MODE = FINAL
// Retrain final model on FULL training set
// Evaluate ONCE on held-out test set
// ================================================
if (MODE === 'FINAL') {

  // Rebuild 70/30 split using fixed seed for reproducibility
  var split = makeSplit(selectedLabel);

  print('===== FINAL MODEL =====');
  print('Selected label:', selectedLabel);
  print('Best params:', bestNtree, bestMtry, bestLeaf);

  // Train final model on full training set using best hyperparameters
  var finalClassifier = ee.Classifier.smileRandomForest({
    numberOfTrees: bestNtree,
    variablesPerSplit: bestMtry,
    minLeafPopulation: bestLeaf
  }).train({
    features: split.trainSet,
    classProperty: selectedLabel,
    inputProperties: inputBands
  });

  // Evaluate on held-out test set (used exactly once)
  var testPred = split.testSet.classify(finalClassifier);
  var finalCM = testPred.errorMatrix(selectedLabel, 'classification');
  var finalMetrics = metricsFromCM(finalCM);

  // Training set evaluation for overfitting check
  var trainPred = split.trainSet.classify(finalClassifier);
  var trainCM = trainPred.errorMatrix(selectedLabel, 'classification');
  var trainMetrics = metricsFromCM(trainCM);

  // Collect metrics and importance for unified summary print
  var importance = ee.Dictionary(finalClassifier.explain().get('importance'));

  ee.Dictionary({
    trainMetrics: trainMetrics,
    finalMetrics: finalMetrics,
    importance: importance
  }).evaluate(function(result) {
    var tr = result.trainMetrics;
    var te = result.finalMetrics;
    var imp = result.importance;

    print('===== FINAL SUMMARY =====');

    print('--- Train metrics (overfitting check) ---');
    print('  F1=' + tr.F1.toFixed(3) + ' Kappa=' + tr.Kappa.toFixed(3) +
          ' OA=' + tr.OA.toFixed(3) +
          ' Precision=' + tr.Precision.toFixed(3) +
          ' Recall=' + tr.Recall.toFixed(3));
    print('  TP=' + tr.TP + ' TN=' + tr.TN + ' FP=' + tr.FP + ' FN=' + tr.FN);

    print('--- Test metrics ---');
    print('  F1=' + te.F1.toFixed(3) + ' Kappa=' + te.Kappa.toFixed(3) +
          ' OA=' + te.OA.toFixed(3) +
          ' Precision=' + te.Precision.toFixed(3) +
          ' Recall=' + te.Recall.toFixed(3));
    print('  TP=' + te.TP + ' TN=' + te.TN + ' FP=' + te.FP + ' FN=' + te.FN);

    print('--- RF importance (descending) ---');
    var allSorted = inputBands
      .map(function(b) { return {band: b, val: imp[b]}; })
      .sort(function(a, b) { return b.val - a.val; });
    print('  ' + allSorted.map(function(x, i) {
      return (i+1) + '.' + x.band + '=' + x.val.toFixed(2);
    }).join(' | '));

    print('--- Importance by group ---');
    [{name:'Climate', bands:climateBands},
     {name:'Terrain', bands:terrainBands},
     {name:'Soil',    bands:soilBands}
    ].forEach(function(group) {
      var sorted = group.bands
        .map(function(b) { return {band: b, val: imp[b]}; })
        .sort(function(a, b) { return b.val - a.val; });
      var total = sorted.reduce(function(s, x) { return s + x.val; }, 0);
      print('  ' + group.name + ' total=' + total.toFixed(2) + ': ' +
            sorted.map(function(x) { return x.band + '=' + x.val.toFixed(2); }).join(', '));
    });
  });

  // Switch to probability output mode for risk mapping
  var probClassifier = finalClassifier.setOutputMode('PROBABILITY');
  var gridProb = grid.classify(probClassifier);

  Map.centerObject(grid, 6);

  // Assign fill colour based on probability quintiles
  var gridProbStyled = gridProb.map(function(f) {
    var p = ee.Number(f.get('classification'));
    return f.set('style', {
      color: '00000000',
      fillColor: ee.Algorithms.If(
        p.lt(0.2), '00ff0033',
        ee.Algorithms.If(
          p.lt(0.4), 'ccff0033',
          ee.Algorithms.If(
            p.lt(0.6), 'ffaa0033',
            ee.Algorithms.If(
              p.lt(0.8), 'ff550033',
              'ff000055'
            )
          )
        )
      ),
      width: 1
    });
  });

  // Add styled layer to map
  Map.addLayer(
    gridProbStyled.style({styleProperty: 'style'}),
    {},
    'Grid probability'
  );
  
// Export probability FeatureCollection to Asset
  Export.table.toAsset({
    collection: gridProb,
    description: 'grid_probability_asset',
    assetId: 'projects/casa25-488411/assets/grid_y15_probability_f'
  });

  // Export probability FeatureCollection to Google Drive as CSV
  Export.table.toDrive({
    collection: gridProb,
    description: 'grid_probability_drive',
    folder: 'GEE_exports',
    fileNamePrefix: 'grid_y15_probability_f',
    fileFormat: 'CSV'
  });
}
