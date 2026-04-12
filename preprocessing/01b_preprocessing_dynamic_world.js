// ================================================
// 01b_preprocessing_dynamic_world.js
// Author: Jie Liu
// Purpose: Load and composite Dynamic World V1 land cover
//          data for Mongolia's forest-grassland-desert
//          transition zone (identified visually from 
//          full-country LULC distribution)
// Outputs: dw2018, dw2023 (annual LULC composites)
// ================================================


// ------------------------------------------------
// Define Area of Interest (AOI)
// The transition zone is defined based on the spatial
// distribution of transitional land cover classes 
// (trees, grassland, bare) observed in Dynamic World V1.
// The rectangular AOI captures the grassland-desert
// ecotone in central-southern Mongolia (45°–48°N).
// ------------------------------------------------
var aoi = ee.Geometry.Rectangle([95, 45, 115, 48]);

// Also load full Mongolia boundary for reference
var mongolia = ee.FeatureCollection("FAO/GAUL/2015/level0")
  .filter(ee.Filter.eq('ADM0_NAME', 'Mongolia'));


// ------------------------------------------------
// Load Dynamic World V1 and create annual land cover
// composites for two time periods.
// Mode composite: takes the most frequent land cover
// class per pixel across the period. Growing season
// (Jun–Sep) is used to reduce snow/cloud contamination.
// ------------------------------------------------

// Early period: 2017–2018
var dw2018 = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2017-06-01', '2018-09-30')
  .filterBounds(aoi)
  .select('label')
  .mode()
  .clip(aoi);

// Recent period: 2022–2023
var dw2023 = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2022-06-01', '2023-09-30')
  .filterBounds(aoi)
  .select('label')
  .mode()
  .clip(aoi);


// ------------------------------------------------
// Visualize both periods
// Dynamic World label classes:
//   0: Water       1: Trees       2: Grass
//   3: Flooded veg 4: Crops       5: Shrub
//   6: Built area  7: Bare/desert 8: Snow/ice
// ------------------------------------------------
var dwVis = {
  min: 0, max: 8,
  palette: ['419BDF','397D49','88B053','7A87C6',
            'E49635','DFC35A','C4281B','A59B8F','B39FE1']
};

Map.centerObject(aoi, 6);
Map.addLayer(dw2018, dwVis, 'LULC 2017-2018');
Map.addLayer(dw2023, dwVis, 'LULC 2022-2023');
Map.addLayer(aoi, {color: 'red'}, 'AOI boundary', false);


// ------------------------------------------------
// Calculate pixel counts per class to verify data
// coverage in AOI
// ------------------------------------------------
var classCount2018 = dw2018.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: aoi,
  scale: 1000,
  maxPixels: 1e9
});

var classCount2023 = dw2023.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: aoi,
  scale: 1000,
  maxPixels: 1e9
});

print('Class distribution 2017-2018:', classCount2018);
print('Class distribution 2022-2023:', classCount2023);


// ------------------------------------------------
// Export composites
// ------------------------------------------------
Export.image.toDrive({
  image: dw2018,
  description: 'DynamicWorld_Mongolia_2018',
  folder: 'CASA0025',
  fileNamePrefix: 'dw_mongolia_2018',
  region: aoi,
  scale: 500,
  maxPixels: 1e9
});

Export.image.toDrive({
  image: dw2023,
  description: 'DynamicWorld_Mongolia_2023',
  folder: 'CASA0025',
  fileNamePrefix: 'dw_mongolia_2023',
  region: aoi,
  scale: 500,
  maxPixels: 1e9
});