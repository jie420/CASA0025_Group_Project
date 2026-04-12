// ================================================
// 01a_preprocessing_explore_mongolia.js
// Author: Jie Liu
// Purpose: Visualise full-country Dynamic World land 
//          cover distribution to identify and justify
//          the transition zone AOI for our study.
// Finding: A clear forest→grassland→desert gradient
//          is observed from north to south. The 
//          grassland-desert ecotone is concentrated
//          between approximately 43°–48°N, which
//          is used as the AOI in 01b.
// ================================================

// Load Mongolia national boundary
var mongolia = ee.FeatureCollection("FAO/GAUL/2015/level0")
  .filter(ee.Filter.eq('ADM0_NAME', 'Mongolia'));

// Load Dynamic World - 2023 growing season
// Using lower resolution (scale: 5000) to allow 
// full-country rendering without computation timeout
var dw_full = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
  .filterDate('2022-06-01', '2023-09-30')
  .filterBounds(mongolia)
  .select('label')
  .mode()
  .clip(mongolia);

// Visualise
// Dynamic World label classes:
//   0:Water  1:Trees  2:Grass  3:Flooded veg
//   4:Crops  5:Shrub  6:Built  7:Bare  8:Snow
var dwVis = {
  min: 0, max: 8,
  palette: ['419BDF','397D49','88B053','7A87C6',
            'E49635','DFC35A','C4281B','A59B8F','B39FE1']
};

Map.centerObject(mongolia, 5);
Map.addLayer(
  dw_full.reproject({crs: 'EPSG:4326', scale: 5000}),
  dwVis,
  'Dynamic World 2023 - Full Mongolia'
);
Map.addLayer(mongolia.style({color: 'black', fillColor: '00000000', width: 2}), 
             {}, 'Mongolia boundary');

// Mark the identified transition zone
// Based on visual inspection above, the grassland-desert
// ecotone (classes 2 and 7) is concentrated in this band
var aoi_candidate = ee.Geometry.Rectangle([95, 45, 115, 48]);
Map.addLayer(aoi_candidate, {color: 'red'}, 'Candidate AOI (transition zone)');

print('Visual exploration complete.');
print('North: forest/trees (dark green)');
print('Middle: grassland/shrub (orange-yellow)'); 
print('South: bare/desert (grey-brown)');
print('Red rectangle = proposed AOI for 01b');