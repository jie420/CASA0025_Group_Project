Code structure and reproducibility

This project uses both Python and Google Earth Engine because different parts of the workflow are better suited to different environments.

Python was used for data cleaning, label checking, exploratory analysis, and preparing intermediate CSV/GeoJSON outputs. This made it easier to inspect the 10 km grid data, test degradation definitions, and prepare inputs for the Random Forest workflow.

Google Earth Engine was used for the main geospatial processing, map layers, interactive visualisation, and final application interface. The main app code is therefore stored in the GEE script, while the Python files document the supporting data-processing steps.

The workflow should be read in the following order:

data_preprocessing/ — creates or prepares the 10 km grid and land-cover change variables
python_analysis/ — checks degradation labels, cleans exported tables, and prepares model-ready data
gee_random_forest/ — trains and evaluates the Random Forest model
gee_app/ — contains the final interactive GEE app and visualisation code

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
