// Configuration
const width = 1340;
const height = 650;
const margin = {top: 20, right: 20, bottom: 20, left: 20};

// Color scale for categories
const categoryColors = {
    'Parking': '#e74c3c',
    'Street/Sidewalk': '#3498db',
    'Trash/Sanitation': '#f39c12',
    'Parks/Trees': '#27ae60',
    'Building/Housing': '#9b59b6',
    'Traffic/Signs': '#e67e22',
    'Graffiti': '#1abc9c',
    'Noise': '#e84393',
    'Animal/Pest': '#95a5a6',
    'Other': '#7f8c8d'
};

let allData = [];
let filteredData = [];
let selectedCategories = new Set();
let selectedSemesters = new Set();

// SVG setup
const svg = d3.select("#map")
    .attr("width", width)
    .attr("height", height);

const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#tooltip");

d3.csv("./sample_data.csv").then(data => {
    // Process data
    allData = data.map(d => ({
        ...d,
        latitude: +d.latitude,
        longitude: +d.longitude,
        distance_from_neu_km: +d.distance_from_neu_km,
        response_time_hours: +d.response_time_hours || 0,
        month: +d.month,
        year: +d.year
    }));
    
    const categories = [...new Set(allData.map(d => d.category))].sort();
    const semesters = ['Fall', 'Spring', 'Summer'];
    
    // Category filter buttons
    const categoryFilters = d3.select("#category-filters");
    categories.forEach(cat => {
        categoryFilters.append("button")
            .attr("class", "filter-btn active")
            .text(cat)
            .on("click", function() {
                toggleCategory(cat, this);
            });
        selectedCategories.add(cat);
    });
    
    // Semester filter buttons
    const semesterFilters = d3.select("#semester-filters");
    semesters.forEach(sem => {
        semesterFilters.append("button")
            .attr("class", "filter-btn active")
            .text(sem)
            .on("click", function() {
                toggleSemester(sem, this);
            });
        selectedSemesters.add(sem);
    });
    
    // Map Legend
    const legend = d3.select("#legend");
    categories.forEach(cat => {
        const item = legend.append("div").attr("class", "legend-item");
        item.append("div")
            .attr("class", "legend-color")
            .style("background-color", categoryColors[cat] || '#95a5a6');
        item.append("span")
            .attr("class", "legend-label")
            .text(cat);
    });
  
    updateVisualization();
});

function toggleCategory(category, button) {
    if (selectedCategories.has(category)) {
        selectedCategories.delete(category);
        button.classList.remove('active');
    } else {
        selectedCategories.add(category);
        button.classList.add('active');
    }
    updateVisualization();
}

function toggleSemester(semester, button) {
    if (selectedSemesters.has(semester)) {
        selectedSemesters.delete(semester);
        button.classList.remove('active');
    } else {
        selectedSemesters.add(semester);
        button.classList.add('active');
    }
    updateVisualization();
}

function updateVisualization() {
    // Filter data
    filteredData = allData.filter(d => 
        selectedCategories.has(d.category) && 
        selectedSemesters.has(d.semester)
    );
  
    updateStats();
    renderMap();
}

function updateStats() {
    const totalComplaints = filteredData.length;
    const avgResponseTime = d3.mean(filteredData.filter(d => d.response_time_hours > 0), 
        d => d.response_time_hours);
    const neighborhoods = new Set(filteredData.map(d => d.neighborhood)).size;
    
    const statsData = [
        { label: 'Total Complaints', value: totalComplaints },
        { label: 'Avg Response Time', value: avgResponseTime ? 
            `${avgResponseTime.toFixed(1)}h` : 'N/A' },
        { label: 'Neighborhoods', value: neighborhoods }
    ];
    
    const stats = d3.select("#stats")
        .selectAll(".stat-card")
        .data(statsData);
    
    stats.enter()
        .append("div")
        .attr("class", "stat-card")
        .merge(stats)
        .html(d => `
            <div class="stat-value">${d.value}</div>
            <div class="stat-label">${d.label}</div>
        `);
}

function renderMap() {
    // Create scales
    const xExtent = d3.extent(filteredData, d => d.longitude);
    const yExtent = d3.extent(filteredData, d => d.latitude);
    
    const xScale = d3.scaleLinear()
        .domain(xExtent)
        .range([0, width - margin.left - margin.right]);
    
    const yScale = d3.scaleLinear()
        .domain(yExtent)
        .range([height - margin.top - margin.bottom, 0]);
    
    // Size scale based on distance from campus
    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(filteredData, d => d.distance_from_neu_km)])
        .range([8, 3]);
    
    // Bind data to circles
    const circles = g.selectAll(".circle")
        .data(filteredData, d => d.case_id);
    
    // Exit
    circles.exit()
        .transition()
        .duration(300)
        .attr("r", 0)
        .remove();
    
    // Enter + Update
    circles.enter()
        .append("circle")
        .attr("class", "circle")
        .attr("cx", d => xScale(d.longitude))
        .attr("cy", d => yScale(d.latitude))
        .attr("r", 0)
        .style("fill", d => categoryColors[d.category] || '#95a5a6')
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .merge(circles)
        .transition()
        .duration(500)
        .attr("cx", d => xScale(d.longitude))
        .attr("cy", d => yScale(d.latitude))
        .attr("r", d => sizeScale(d.distance_from_neu_km))
        .style("fill", d => categoryColors[d.category] || '#95a5a6');
}

function showTooltip(event, d) {
    const responseTime = d.response_time_hours > 0 ? 
        `${d.response_time_hours.toFixed(1)} hours` : 'Open';
    
    tooltip
        .html(`
            <div class="tooltip-title">${d.category}</div>
            <div><strong>Type:</strong> ${d.request_type}</div>
            <div><strong>Neighborhood:</strong> ${d.neighborhood}</div>
            <div><strong>Date:</strong> ${new Date(d.open_datetime).toLocaleDateString()}</div>
            <div><strong>Semester:</strong> ${d.semester} ${d.academic_year}</div>
            <div><strong>Response Time:</strong> ${responseTime}</div>
            <div><strong>Distance from NEU:</strong> ${d.distance_from_neu_km.toFixed(2)} km</div>
        `)
        .classed("show", true);
}

function moveTooltip(event) {
    tooltip
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 15) + "px");
}

function hideTooltip() {
    tooltip.classed("show", false);
}
