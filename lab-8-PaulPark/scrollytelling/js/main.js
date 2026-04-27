/**
 * Load data from CSV file asynchronously and render scatter plot
 */
let data, scrollerVis;
d3.csv('data/assignments.csv').then(_data => {
  data = _data;
  data.forEach(d => {
    d.time = +d.time;
  });

  // Update text on the web page based on the loaded dataset
  d3.select('#assignments-count').text(data.length);
  d3.select('#easy-assignment-count').text(data.filter(d => d.difficulty == 'Easy').length);
  d3.select('#difficult-assignment-count').text(data.filter(d => d.difficulty == 'Difficult').length);

  const longestAssignment = [...data].sort((a,b) => b.time - a.time)[0];
  d3.select('#max-duration').text(longestAssignment.time);
  d3.select('#max-duration-name').text(longestAssignment.name);

  // Initialize visualization
  scrollerVis = new ScrollerVis({ parentElement: '#vis'}, data);
  
  // Create a waypoint for each `step` container
  const waypoints = d3.selectAll('.step').each( function(d, stepIndex) {
    return new Waypoint({
      // `this` contains the current HTML element
      element: this,
      handler: function(direction) {
        // Check if the user is scrolling up or down
        const nextStep = direction === 'down' ? stepIndex : Math.max(0, stepIndex - 1)
        
        // Update visualization based on the current step
        scrollerVis.goToStep(nextStep);
      },
      // Trigger scroll event halfway up. Depending on the text length, 75% might be even better
      offset: '50%',
    });
  });
})
.catch(error => console.error(error));


