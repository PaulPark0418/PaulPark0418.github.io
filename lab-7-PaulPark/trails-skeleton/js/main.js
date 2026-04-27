// Global objects go here (outside of any functions)
let data, scatterplot, barchart; 
let difficultyFilter = [];

const dispatcher = d3.dispatch('filterCategories');

d3.csv('data/vancouver_trails.csv')
   .then(_data => {
     data = _data;
     // for safety, so that we use a local copy of data.

     // ... data preprocessing etc. ... TODO: you add code here for numeric
     // Be sure to examine your data to fully understand the code
    data.forEach(d => {
       d.time = +d.time
       d.distance = +d.distance;
     });
     // Initialize scale
     const colorScale = d3.scaleOrdinal()
        .domain(["Easy", "Intermediate", "Difficult"])
        .range(['lightgreen', 'green', 'darkgreen']);

     scatterplot = new Scatterplot({parentElement: "#scatterplot", colorScale: colorScale}, data); //we will update config soon
     scatterplot.updateVis();

     barchart = new Barchart({parentElement: "#barchart", colorScale: colorScale}, dispatcher, data);
     barchart.updateVis();
     
   })
  .catch(error => console.error(error));

/**
 * Use bar chart as filter buttons and update scatter plot accordingly
 */
dispatcher.on('filterCategories', selectedCategories => {
	if (selectedCategories.length == 0) {
		scatterplot.data = data;
	} else {
		scatterplot.data = data.filter(d => selectedCategories.includes(d.difficulty));
	}
	scatterplot.updateVis();
});



/**
 * Load data from CSV file asynchronously and render charts
 */



/**
 * Use bar chart as filter and update scatter plot accordingly
 */



