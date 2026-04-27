## Code structure and reproducibility

This project uses both **Google Earth Engine (GEE)** and **Python**.

**Google Earth Engine** is the main platform for:
- land-cover change detection,
- grid-based spatial analysis,
- map layers,
- and the final interactive application.

**Python** is used only for supporting tasks, including:
- checking exported grid tables,
- exploratory analysis,
- label inspection,
- and preparing intermediate CSV/GeoJSON files.

The **main visualisation and final user-facing application are implemented in Google Earth Engine**.

---

## GEE asset dependency

Several GEE scripts rely on the cleaned 10 km grid asset imported in the GEE editor as `table`:

```js
var table = ee.FeatureCollection(
  "projects/project-d66d6e26-4a7f-4da9-a72/assets/mongolia_grid_10km_cleaned_for_gee_v2"
);

The main visualisation and user-facing application are implemented in Google Earth Engine.

Use this repository to host a website for your CASA0025 final project by following these stpes: 

1. clone this repository 
2. install [quarto](https://quarto.org/docs/download/) 
3. edit the 'index.qmd' file with the contents of your project
4. using terminal, navigate to the project directory and run "quarto render" 
5. push the changes to your github repository 
6. on github, navigate to Settings>Pages>Build and Deployment. Make sure that under "Source" it says "deploy from branch". Under "Branch", select "Main" in the first dropdown and "Docs" under the second drop down. Then press "Save" 

Your website should now be available under 
https://{your_username}.github.io/{your_repo_name}
