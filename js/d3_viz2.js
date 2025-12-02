const width = 1340;
const height = 650;
const margin = {top: 20, right: 20, bottom: 20, left: 20};

// Month names
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

// Color scales
const semesterColors = {
    'Fall': '#e74c3c',
    'Spring': '#3498db',
    'Summer': '#f39c12'
};

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

// Neighborhood colors (subtle pastels)
const neighborhoodColors = {
    'Roxbury': '#ffebee',
    'South End': '#e8f5e9',
    'Dorchester': '#e3f2fd',
    'Mission Hill': '#fff3e0',
    'Back Bay': '#f3e5f5',
    'Jamaica Plain': '#fce4ec',
    'Fenway / Kenmore / Audubon Circle / Longwood': '#e0f2f1',
    'Boston': '#fff9c4',
    'Downtown / Financial District': '#f1f8e9',
    'Beacon Hill': '#ede7f6',
    'South Boston / South Boston Waterfront': '#e1f5fe'
};

// State
let allData = [];
let currentMonth = 0;
let isPlaying = false;
let playInterval;
let monthlyData = [];

const svg = d3.select("#map")
    .attr("width", width)
    .attr("height", height);

// Add background group for neighborhoods (behind everything)
const neighborhoodGroup = svg.append("g")
    .attr("class", "neighborhood-layer")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#tooltip");

// Timeline chart setup
const chartSvg = d3.select("#timeline-chart");

d3.csv("../sample_data.csv").then(data => {
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

    // Group data by month
    for (let m = 1; m <= 12; m++) {
        monthlyData.push(allData.filter(d => d.month === m));
    }

    // Setup slider
    d3.select("#time-slider")
        .on("input", function() {
            currentMonth = +this.value;
            updateVisualization();
        });

    // play button
    d3.select("#play-btn").on("click", togglePlay);
    d3.select("#reset-btn").on("click", reset);

    // Draw timeline chart
    drawTimelineChart();

    // Draw initial neighborhood zones
    drawNeighborhoodZones();

    updateVisualization();
});

function togglePlay() {
    isPlaying = !isPlaying;
    const btn = d3.select("#play-btn");

    if (isPlaying) {
        btn.text("⏸️ Pause");
        playInterval = setInterval(() => {
            currentMonth = (currentMonth + 1) % 12;
            d3.select("#time-slider").property("value", currentMonth);
            updateVisualization();
        }, 1500);
    } else {
        btn.text("▶️ Play Animation");
        clearInterval(playInterval);
    }
}

function reset() {
    if (isPlaying) togglePlay();
    currentMonth = 0;
    d3.select("#time-slider").property("value", 0);
    updateVisualization();
}

function updateVisualization() {
    const filteredData = monthlyData[currentMonth];
    const monthName = monthNames[currentMonth];

    // Update period label
    const semester = getSemester(currentMonth + 1);
    d3.select("#current-period")
        .text(`${monthName} - ${semester} Semester`);

    updateStats(filteredData, semester);
    renderMap(filteredData, semester);
    updateTimelineChart(currentMonth);
}

function getSemester(month) {
    if (month >= 9 && month <= 12) return 'Fall';
    if (month >= 1 && month <= 5) return 'Spring';
    return 'Summer';
}

function updateStats(data, semester) {
    const totalComplaints = data.length;
    const topCategory = d3.rollup(data, v => v.length, d => d.category);
    const topCat = Array.from(topCategory.entries())
        .sort((a, b) => b[1] - a[1])[0];
    const avgResponseTime = d3.mean(data.filter(d => d.response_time_hours > 0),
        d => d.response_time_hours);
    const neighborhoods = new Set(data.map(d => d.neighborhood)).size;

    const statsData = [
        { label: 'Complaints', value: totalComplaints },
        { label: 'Top Category', value: topCat ? topCat[0] : 'N/A' },
        { label: 'Avg Response', value: avgResponseTime ?
                `${avgResponseTime.toFixed(1)}h` : 'N/A' },
        { label: 'Neighborhoods', value: neighborhoods }
    ];

    const stats = d3.select("#stats")
        .selectAll(".stat-card")
        .data(statsData);

    const statsEnter = stats.enter()
        .append("div")
        .attr("class", "stat-card");

    statsEnter.merge(stats)
        .html(d => `
            <div class="stat-value">${d.value}</div>
            <div class="stat-label">${d.label}</div>
        `);
}

function drawNeighborhoodZones() {
    // Calculate center point for each neighborhood using ALL data
    const neighborhoodCenters = d3.rollup(
        allData,
        v => ({
            lat: d3.mean(v, d => d.latitude),
            lon: d3.mean(v, d => d.longitude),
            count: v.length,
            name: v[0].neighborhood
        }),
        d => d.neighborhood
    );

    const xExtent = d3.extent(allData, d => d.longitude);
    const yExtent = d3.extent(allData, d => d.latitude);

    const xScale = d3.scaleLinear()
        .domain(xExtent)
        .range([0, width - margin.left - margin.right]);

    const yScale = d3.scaleLinear()
        .domain(yExtent)
        .range([height - margin.top - margin.bottom, 0]);

    // Convert centers to array for Voronoi
    const centers = Array.from(neighborhoodCenters.values()).map(d => ({
        x: xScale(d.lon),
        y: yScale(d.lat),
        name: d.name,
        count: d.count
    }));

    // Create Voronoi diagram
    const delaunay = d3.Delaunay.from(centers, d => d.x, d => d.y);
    const voronoi = delaunay.voronoi([0, 0, width - margin.left - margin.right, height - margin.top - margin.bottom]);

    // Draw neighborhood zones
    centers.forEach((d, i) => {
        neighborhoodGroup.append("path")
            .attr("class", "neighborhood-zone")
            .attr("d", voronoi.renderCell(i))
            .style("fill", neighborhoodColors[d.name] || '#f5f5f5')
            .style("stroke", "#999")
            .style("stroke-width", "1.5px")
            .style("opacity", 0.4);
    });

    // Add neighborhood labels
    centers.forEach(d => {
        neighborhoodGroup.append("text")
            .attr("class", "neighborhood-label")
            .attr("x", d.x)
            .attr("y", d.y)
            .text(() => {
                // Abbreviate long neighborhood names
                if (d.name.includes('Fenway')) return 'Fenway';
                if (d.name.includes('South Boston')) return 'S. Boston';
                if (d.name.includes('Downtown')) return 'Downtown';
                return d.name;
            })
            .style("font-size", "11px")
            .style("font-weight", "600")
            .style("fill", "#333")
            .style("text-anchor", "middle")
            .style("pointer-events", "none")
            .style("text-shadow", "1px 1px 2px white, -1px -1px 2px white");
    });
}

function renderMap(data, semester) {
    // Create scales
    const xExtent = d3.extent(allData, d => d.longitude);
    const yExtent = d3.extent(allData, d => d.latitude);

    const xScale = d3.scaleLinear()
        .domain(xExtent)
        .range([0, width - margin.left - margin.right]);

    const yScale = d3.scaleLinear()
        .domain(yExtent)
        .range([height - margin.top - margin.bottom, 0]);

    const sizeScale = d3.scaleSqrt()
        .domain([0, d3.max(data, d => d.distance_from_neu_km) || 1])
        .range([8, 4]);

    const circles = g.selectAll(".circle")
        .data(data, d => d.case_id);

    // Exit
    circles.exit()
        .transition()
        .duration(300)
        .attr("r", 0)
        .style("opacity", 0)
        .remove();

    // Enter + Update
    const circlesEnter = circles.enter()
        .append("circle")
        .attr("class", "circle")
        .attr("cx", d => xScale(d.longitude))
        .attr("cy", d => yScale(d.latitude))
        .attr("r", 0)
        .style("opacity", 0)
        .style("fill", d => categoryColors[d.category] || '#95a5a6')
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip);

    circlesEnter.merge(circles)
        .transition()
        .duration(500)
        .attr("cx", d => xScale(d.longitude))
        .attr("cy", d => yScale(d.latitude))
        .attr("r", d => sizeScale(d.distance_from_neu_km))
        .style("opacity", 0.7)
        .style("fill", d => categoryColors[d.category] || '#95a5a6');
}

function drawTimelineChart() {
    const chartWidth = 1340;
    const chartHeight = 200;
    const chartMargin = {top: 20, right: 30, bottom: 40, left: 50};

    chartSvg
        .attr("width", chartWidth)
        .attr("height", chartHeight);

    const chartG = chartSvg.append("g")
        .attr("transform", `translate(${chartMargin.left},${chartMargin.top})`);

    // Calculate monthly counts
    const monthlyCounts = monthlyData.map((data, i) => ({
        month: i,
        count: data.length,
        name: monthNames[i]
    }));

    // Scales
    const x = d3.scaleBand()
        .domain(monthlyCounts.map(d => d.month))
        .range([0, chartWidth - chartMargin.left - chartMargin.right])
        .padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(monthlyCounts, d => d.count)])
        .nice()
        .range([chartHeight - chartMargin.top - chartMargin.bottom, 0]);

    // Bars
    chartG.selectAll(".bar")
        .data(monthlyCounts)
        .enter()
        .append("rect")
        .attr("class", d => `bar ${d.month === currentMonth ? 'active' : ''}`)
        .attr("x", d => x(d.month))
        .attr("y", d => y(d.count))
        .attr("width", x.bandwidth())
        .attr("height", d => chartHeight - chartMargin.top - chartMargin.bottom - y(d.count))
        .on("click", (event, d) => {
            currentMonth = d.month;
            d3.select("#time-slider").property("value", currentMonth);
            updateVisualization();
        });

    // Axes
    chartG.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${chartHeight - chartMargin.top - chartMargin.bottom})`)
        .call(d3.axisBottom(x).tickFormat(i => monthNames[i].substring(0, 3)));

    chartG.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y));
}

function updateTimelineChart(activeMonth) {
    chartSvg.selectAll(".bar")
        .classed("active", (d, i) => i === activeMonth);
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
            <div><strong>Semester:</strong> ${d.semester}</div>
            <div><strong>Response Time:</strong> ${responseTime}</div>
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
