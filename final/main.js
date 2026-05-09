
/**
 * Final Project: Demographic Representation Gap
 * Features: 10x10 Grid, Year Slider, Hover Clustering, Accessibility Patterns
 */

// Chart colors — distinct tones (not Davidson red/black) so categories stay readable
const config = {
    tileSize: 35,
    gridGap: 5,
    gridSize: 10,
    colors: {
        white: "#b8703c",
        black: "#1f6f7e",
        other: "#6b5195",
        missing: "#c9c6c1"
    },
    transitionDuration: 600
};

let factfileData, archiveData;
let currentYear;
let currentStats = null;
let pendingYear = null;
let sliderRafId = null;
let displayedSimilarity = 100;
/** When set, grids stay dimmed to this race until cleared (legend toggle or tile hover). */
let legendPinnedRace = null;
/** When true, tile mousemove must not reposition the tooltip (legend anchored it by the grids). */
let tooltipBesideGrids = false;

/** Last numeric values shown in the pinned legend panel (for smooth transitions on year change). */
let legendPanelNumericSnapshot = null;

let trendChart = null;

const raceLabels = {
    white: "White",
    black: "Black",
    other: "Other"
};

const tooltip = d3.select("body")
    .append("div")
    .attr("id", "tile-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0);

const legendTooltipPanel = d3.select("#legend-tooltip-panel");

function highlightTilesByRace(selectedType) {
    d3.selectAll(".tile-group")
        .interrupt()
        .transition().duration(200)
        .style("opacity", tile => tile.type === selectedType ? 1 : 0.12);
}

function resetTilesOpacity() {
    d3.selectAll(".tile-group")
        .interrupt()
        .transition().duration(200)
        .style("opacity", 1);
}

function getLegendPanelNumericValues(selectedType) {
    if (!currentStats) return null;
    const pct = currentStats.actualPct;
    const bp = currentStats.brochurePct;
    return {
        actualTotal: currentStats.totals.actual ?? 0,
        brochureTotal: currentStats.totals.brochure ?? 0,
        actualGroupCount: currentStats.actual[selectedType] ?? 0,
        brochureGroupCount: currentStats.brochure[selectedType] ?? 0,
        actualShare: pct?.[selectedType] ?? 0,
        brochureShare: bp?.[selectedType] ?? 0
    };
}

function raceTooltipContent(selectedType) {
    if (!currentStats) return "";
    const pct = currentStats.actualPct;
    const bp = currentStats.brochurePct;
    const group = raceLabels[selectedType] ?? selectedType;
    const nums = getLegendPanelNumericValues(selectedType);
    if (!nums) return "";
    const {
        actualTotal,
        brochureTotal,
        actualGroupCount,
        brochureGroupCount,
        actualShare,
        brochureShare
    } = nums;
    return (
        `<dl class="tooltip-stats">` +
        `<dt>Group</dt><dd>${group}</dd>` +
        `<dt>Year</dt><dd>${currentYear}</dd>` +
        `<dt>Total count</dt><dd><span class="legend-panel-num" data-field="actualTotal">${actualTotal}</span></dd>` +
        `<dt>Total ${group} count</dt><dd><span class="legend-panel-num" data-field="actualGroupCount">${actualGroupCount}</span></dd>` +
        `<dt>Total ${group} share</dt><dd><strong><span class="legend-panel-num legend-panel-pct" data-field="actualShare">${actualShare.toFixed(1)}</span>%</strong></dd>` +
        `<dt>Brochure count</dt><dd><span class="legend-panel-num" data-field="brochureTotal">${brochureTotal}</span></dd>` +
        `<dt>Brochure ${group} count</dt><dd><span class="legend-panel-num" data-field="brochureGroupCount">${brochureGroupCount}</span></dd>` +
        `<dt>Brochure ${group} share</dt><dd><strong><span class="legend-panel-num legend-panel-pct" data-field="brochureShare">${brochureShare.toFixed(1)}</span>%</strong></dd>` +
        `</dl>`
    );
}

function similarityScoreShowAlert(text) {
    const alertEl = document.querySelector("#similarity-alert");
    const pct = document.querySelector("#similarity-percent");
    if (alertEl) {
        alertEl.textContent = text;
        alertEl.removeAttribute("hidden");
    }
    if (pct) pct.textContent = "—";
    const body = document.querySelector("#similarity-panel-body");
    if (body) body.hidden = true;
}

function similarityScoreRevealBody() {
    const alertEl = document.querySelector("#similarity-alert");
    const body = document.querySelector("#similarity-panel-body");
    if (alertEl) {
        alertEl.textContent = "";
        alertEl.setAttribute("hidden", "");
    }
    if (body) body.hidden = false;
}

function hideRaceTooltip() {
    tooltip.style("opacity", 0);
    tooltipBesideGrids = false;
}

/** Parse numeric fields from the currently rendered pinned panel (mid-transition safe). */
function readLegendPanelNumericSnapshotFromDom(selectedType) {
    const nums = {};
    let count = 0;
    legendTooltipPanel.selectAll(".legend-panel-num").each(function() {
        const field = this.dataset.field;
        const raw = parseFloat(this.textContent);
        if (!field || !Number.isFinite(raw)) return;
        nums[field] = raw;
        count++;
    });
    if (count < 6) return null;
    return { race: selectedType, ...nums };
}

function showLegendTooltipPanel(selectedType, options = {}) {
    if (!currentStats) return;
    if (legendTooltipPanel.empty()) return;
    const animate = options.animate !== false;
    const prevSnap = legendPanelNumericSnapshot;
    const nextVals = getLegendPanelNumericValues(selectedType);
    if (!nextVals) return;

    const panelEl = legendTooltipPanel.node();
    const panelWasVisible = panelEl != null && !panelEl.hasAttribute("hidden");
    const domSnap = panelWasVisible ? readLegendPanelNumericSnapshotFromDom(selectedType) : null;
    const tweenBase =
        domSnap && domSnap.race === selectedType ? domSnap : prevSnap;

    legendTooltipPanel
        .html(raceTooltipContent(selectedType))
        .attr("hidden", null);

    const canTween =
        animate &&
        tweenBase &&
        tweenBase.race === selectedType &&
        legendTooltipPanel.selectAll(".legend-panel-num").size() > 0;

    if (!canTween) {
        legendPanelNumericSnapshot = { race: selectedType, ...nextVals };
        return;
    }

    const duration = config.transitionDuration;

    legendTooltipPanel.selectAll(".legend-panel-num").each(function() {
        const el = this;
        const field = el.dataset.field;
        const start = tweenBase[field];
        const end = nextVals[field];
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        const isPct = el.classList.contains("legend-panel-pct");
        const sel = d3.select(el);
        sel.text(isPct ? start.toFixed(1) : String(Math.round(start)));
        sel.interrupt().transition().duration(duration).ease(d3.easeCubicOut).tween("text", () => {
            const i = d3.interpolateNumber(start, end);
            return t => {
                const v = i(t);
                sel.text(isPct ? v.toFixed(1) : String(Math.round(v)));
            };
        });
    });

    legendPanelNumericSnapshot = { race: selectedType, ...nextVals };
}

function hideLegendTooltipPanel() {
    legendPanelNumericSnapshot = null;
    if (legendTooltipPanel.empty()) return;
    legendTooltipPanel.html("").attr("hidden", "");
}

function showRaceTooltip(selectedType, options = {}) {
    if (!currentStats) return;
    if (options.pinned) {
        showLegendTooltipPanel(selectedType);
        return;
    }
    let left;
    let top;
    tooltipBesideGrids = false;
    const ev = options.pointerEvent;
    if (ev) {
        left = ev.pageX + 14;
        top = ev.pageY + 14;
    }
    if (left == null || top == null) return;
    tooltip
        .style("opacity", 1)
        .html(raceTooltipContent(selectedType))
        .style("left", `${left}px`)
        .style("top", `${top}px`);
}

function updateLegendPressedState(activeRace) {
    d3.select("#legend").selectAll("button.legend-item").each(function() {
        const race = this.dataset.race;
        const on = activeRace != null && race === activeRace;
        this.setAttribute("aria-pressed", on ? "true" : "false");
        this.classList.toggle("legend-item--pressed", on);
    });
}

function setupLegendRaceButtons() {
    d3.select("#legend").on("click.legendRace", function(event) {
        const btn = event.target.closest("button[data-race]");
        if (!btn) return;
        const race = btn.dataset.race;
        if (!(race in raceLabels)) return;

        if (legendPinnedRace === race) {
            legendPinnedRace = null;
            resetTilesOpacity();
            hideRaceTooltip();
            hideLegendTooltipPanel();
            updateLegendPressedState(null);
            return;
        }

        legendPinnedRace = race;
        highlightTilesByRace(race);
        hideRaceTooltip();
        showRaceTooltip(race, { pinned: true });
        updateLegendPressedState(race);
    });
}

setupLegendRaceButtons();

function setupAboutDataPopover() {
    const btn = document.querySelector("#about-data-btn");
    const pop = document.querySelector("#about-data-popover");
    if (!btn || !pop) return;

    const positionPopoverUnderButton = () => {
        const rect = btn.getBoundingClientRect();
        const gap = 10;

        // Temporarily reveal for measurement if needed.
        const wasHidden = pop.hidden;
        if (wasHidden) pop.hidden = false;

        const popRect = pop.getBoundingClientRect();
        const viewportPadding = 12;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Prefer aligning the popover's right edge with the button's right edge.
        let left = rect.right - popRect.width;
        left = Math.max(viewportPadding, Math.min(left, vw - viewportPadding - popRect.width));

        // Place below the button; if it would run off-screen, flip above.
        let top = rect.bottom + gap;
        const wouldClipBottom = top + popRect.height > vh - viewportPadding;
        if (wouldClipBottom) {
            top = rect.top - gap - popRect.height;
        }
        top = Math.max(viewportPadding, Math.min(top, vh - viewportPadding - popRect.height));

        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;

        if (wasHidden) pop.hidden = true;
    };

    const close = () => {
        pop.hidden = true;
        btn.setAttribute("aria-expanded", "false");
    };

    const open = () => {
        positionPopoverUnderButton();
        pop.hidden = false;
        btn.setAttribute("aria-expanded", "true");
    };

    const toggle = () => {
        const expanded = btn.getAttribute("aria-expanded") === "true";
        if (expanded) close();
        else open();
    };

    btn.addEventListener("click", (e) => {
        e.preventDefault();
        toggle();
    });

    document.addEventListener("click", (e) => {
        if (pop.hidden) return;
        const t = e.target;
        if (t instanceof Node && (pop.contains(t) || btn.contains(t))) return;
        close();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (pop.hidden) return;
        close();
        btn.focus();
    });

    window.addEventListener("resize", () => {
        if (pop.hidden) return;
        positionPopoverUnderButton();
    }, { passive: true });
}

setupAboutDataPopover();

function buildEnrollmentSeries(factRows) {
    const toNumber = (v) => {
        const n = +v;
        return Number.isFinite(n) ? n : 0;
    };

    return factRows.map((d) => {
        const total = toNumber(d.total_incoming_class);
        const white = toNumber(d.white_female) + toNumber(d.white_male);
        const black = toNumber(d.black_female) + toNumber(d.black_male);
        const other = toNumber(d.total_other_female) + toNumber(d.total_other_male);
        const denom = total > 0 ? total : (white + black + other);
        return {
            year: d.year,
            white: denom > 0 ? (white / denom) * 100 : 0,
            black: denom > 0 ? (black / denom) * 100 : 0,
            other: denom > 0 ? (other / denom) * 100 : 0
        };
    });
}

function initTrendChart(factRows) {
    const svg = d3.select("#trend-chart");
    if (svg.empty()) return null;

    const width = 320;
    const height = 190;
    const margin = { top: 10, right: 10, bottom: 40, left: 40 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const series = buildEnrollmentSeries(factRows);
    const years = series.map(d => d.year);

    const x = d3.scalePoint()
        .domain(years)
        .range([0, innerW])
        .padding(0.35);

    const y = d3.scaleLinear()
        .domain([0, 100])
        .range([innerH, 0]);

    svg.selectAll("*").remove();
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Gridlines
    g.append("g")
        .attr("class", "trend-grid")
        .selectAll("line")
        .data([0, 25, 50, 75, 100])
        .join("line")
        .attr("x1", 0)
        .attr("x2", innerW)
        .attr("y1", d => y(d))
        .attr("y2", d => y(d))
        .attr("stroke", "rgba(20, 18, 17, 0.10)")
        .attr("stroke-width", 1);

    // Axes (minimal)
    const yAxis = d3.axisLeft(y).tickValues([0, 50, 100]).tickFormat(d => `${d}%`);
    g.append("g")
        .attr("class", "trend-axis trend-axis--y")
        .call(yAxis)
        .call(g => g.selectAll("path, line").attr("stroke", "rgba(20, 18, 17, 0.18)"))
        .call(g => g.selectAll("text").attr("fill", "rgba(20, 18, 17, 0.75)").attr("font-size", 10));

    const approxTickCount = 4;
    const step = Math.max(1, Math.round(years.length / approxTickCount));
    const xTickYears = years.filter((_, i) => i % step === 0 || i === years.length - 1);
    const xAxis = d3.axisBottom(x).tickValues(xTickYears);

    g.append("g")
        .attr("class", "trend-axis trend-axis--x")
        .attr("transform", `translate(0,${innerH})`)
        .call(xAxis)
        .call(g => g.selectAll("path, line").attr("stroke", "rgba(20, 18, 17, 0.18)"))
        .call(g => g.selectAll("text")
            .attr("fill", "rgba(20, 18, 17, 0.75)")
            .attr("font-size", 10)
            .attr("text-anchor", "end")
            .attr("transform", "rotate(-35)")
            .attr("dx", "-0.4em")
            .attr("dy", "0.25em"));

    // Axis labels
    // Y label: horizontal, above the plot area (avoids overlap with y ticks).
    g.append("text")
        .attr("x", 0)
        .attr("y", -2)
        .attr("fill", "rgba(20, 18, 17, 0.75)")
        .attr("font-size", 10)
        .attr("font-weight", 700)
        .attr("text-anchor", "start")
        .text("Share of incoming class (%)");

    g.append("text")
        .attr("x", innerW / 2)
        .attr("y", innerH + 44)
        .attr("fill", "rgba(20, 18, 17, 0.75)")
        .attr("font-size", 10)
        .attr("font-weight", 700)
        .attr("text-anchor", "middle")
        .text("Incoming class year");

    const line = (key) => d3.line()
        .x(d => x(d.year))
        .y(d => y(d[key]))
        .curve(d3.curveMonotoneX);

    const keys = ["other", "black", "white"];
    const colors = {
        white: config.colors.white,
        black: config.colors.black,
        other: config.colors.other
    };

    g.append("g")
        .attr("class", "trend-lines")
        .selectAll("path")
        .data(keys)
        .join("path")
        .attr("fill", "none")
        .attr("stroke", k => colors[k])
        .attr("stroke-width", 2)
        .attr("opacity", 0.95)
        .attr("d", k => line(k)(series));

    const marker = g.append("g").attr("class", "trend-marker");
    const markerLine = marker.append("line")
        .attr("y1", 0)
        .attr("y2", innerH)
        .attr("stroke", "rgba(20, 18, 17, 0.35)")
        .attr("stroke-width", 1);

    const markerDots = marker.selectAll("circle")
        .data(keys)
        .join("circle")
        .attr("r", 3.6)
        .attr("stroke", "rgba(0,0,0,0.35)")
        .attr("stroke-width", 1)
        .attr("fill", k => colors[k])
        .style("cursor", "default");

    function showTrendDotTooltip(key, year, event) {
        const row = series.find(d => d.year === year);
        if (!row) return;
        const pct = Number.isFinite(row[key]) ? row[key] : 0;
        tooltipBesideGrids = false;
        tooltip
            .style("opacity", 1)
            .html(
                `<dl class="tooltip-stats">` +
                `<dt>Group</dt><dd>${raceLabels[key] ?? key}</dd>` +
                `<dt>Year</dt><dd>${year}</dd>` +
                `<dt>Enrollment share</dt><dd><strong>${pct.toFixed(1)}%</strong></dd>` +
                `</dl>`
            )
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
    }

    markerDots
        .on("mouseover", function(event, key) {
            showTrendDotTooltip(key, currentYear, event);
        })
        .on("mousemove", function(event, key) {
            showTrendDotTooltip(key, currentYear, event);
        })
        .on("mouseout", function() {
            hideRaceTooltip();
        });

    function update(year) {
        const xPos = x(year);
        if (xPos == null) return;
        const row = series.find(d => d.year === year);
        if (!row) return;

        markerLine.attr("x1", xPos).attr("x2", xPos);
        markerDots
            .attr("cx", xPos)
            .attr("cy", k => y(row[k]));
    }

    // Initialize at first year
    if (years.length) update(years[0]);

    return { update };
}

// 2. Load and preprocess data
Promise.all([
    d3.csv('capstone data.xlsx - archive data.csv'),
    d3.csv('capstone data.xlsx - factfile.csv')
]).then(datasets => {
    // Keep Promise.all order consistent with variable mapping
    archiveData = datasets[0];
    factfileData = datasets[1];

    // Clean archive data: forward-fill missing year fields
    let tempYear = "";
    archiveData = archiveData.map(d => {
        if (d.year && d.year.trim() !== "") tempYear = d.year;
        d.year = tempYear;
        return d;
    });

    // Configure slider range to match number of years in the dataset
    const years = factfileData.map(d => d.year);
    const slider = d3.select("#year-slider")
        .attr("min", 0)
        .attr("max", years.length - 1)
        .attr("value", 0);

    trendChart = initTrendChart(factfileData);

    // Slider event: update on every input change
    slider.on("input", function() {
        const yearIndex = +this.value;
        const selectedYear = years[yearIndex];
        d3.select("#year-display").text(selectedYear);
        pendingYear = selectedYear;
        if (trendChart) trendChart.update(selectedYear);

        if (sliderRafId !== null) return;
        sliderRafId = requestAnimationFrame(() => {
            if (pendingYear !== null) updateVis(pendingYear);
            sliderRafId = null;
        });
    });

    // Initial render (first year)
    d3.select("#year-display").text(years[0]);
    if (trendChart) trendChart.update(years[0]);
    updateVis(years[0]);
    
    console.log("Visualization Initialized");
}).catch(err => console.error("Error loading data:", err));


/**
 * When the year changes, filter data and refresh the grids.
 */
function updateVis(year) {
    // 1. Filter data for the selected year
    const fact = factfileData.find(d => d.year === year);
    const arch = archiveData.filter(d => d.year === year);

    if (!fact) return;

    // 2. Compute shares and build the 100-tile arrays (normalization)
    // Actual Data (Factfile)
    const toNumber = (v) => {
        const n = +v;
        return Number.isFinite(n) ? n : 0;
    };

    const actualTotal = toNumber(fact.total_incoming_class);
    const actualWhite = toNumber(fact.white_female) + toNumber(fact.white_male);
    const actualBlack = toNumber(fact.black_female) + toNumber(fact.black_male);
    const actualOther = toNumber(fact.total_other_female) + toNumber(fact.total_other_male);

    const actualTiles = createTileArray(
        actualTotal > 0 ? actualWhite / actualTotal : 0,
        actualTotal > 0 ? actualBlack / actualTotal : 0,
        actualTotal > 0 ? actualOther / actualTotal : 0
    );

    // Brochure Data (Archive)
    const brochureTotal = d3.sum(arch, d => 
        toNumber(d.white_female) + toNumber(d.white_male) + 
        toNumber(d.black_female) + toNumber(d.black_male) + 
        toNumber(d.other_race_female) + toNumber(d.other_race_male)
    );
    
    // Handle missing data (denominator is 0)
    const brochureTiles = brochureTotal > 0 ? createTileArray(
        d3.sum(arch, d => toNumber(d.white_female) + toNumber(d.white_male)) / brochureTotal,
        d3.sum(arch, d => toNumber(d.black_female) + toNumber(d.black_male)) / brochureTotal,
        d3.sum(arch, d => toNumber(d.other_race_female) + toNumber(d.other_race_male)) / brochureTotal
    ) : createMissingTileArray();

    const brochureWhite = d3.sum(arch, d => toNumber(d.white_female) + toNumber(d.white_male));
    const brochureBlack = d3.sum(arch, d => toNumber(d.black_female) + toNumber(d.black_male));
    const brochureOther = d3.sum(arch, d => toNumber(d.other_race_female) + toNumber(d.other_race_male));
    const hasActualData = actualTotal > 0;
    const hasBrochureData = brochureTotal > 0;

    currentYear = year;
    currentStats = {
        actual: {
            white: Math.round(actualWhite),
            black: Math.round(actualBlack),
            other: Math.round(actualOther)
        },
        brochure: {
            white: Math.round(brochureWhite),
            black: Math.round(brochureBlack),
            other: Math.round(brochureOther)
        },
        actualPct: {
            white: actualTotal > 0 ? (actualWhite / actualTotal) * 100 : 0,
            black: actualTotal > 0 ? (actualBlack / actualTotal) * 100 : 0,
            other: actualTotal > 0 ? (actualOther / actualTotal) * 100 : 0
        },
        brochurePct: {
            white: brochureTotal > 0 ? (brochureWhite / brochureTotal) * 100 : 0,
            black: brochureTotal > 0 ? (brochureBlack / brochureTotal) * 100 : 0,
            other: brochureTotal > 0 ? (brochureOther / brochureTotal) * 100 : 0
        },
        totals: {
            actual: Math.round(actualTotal),
            brochure: Math.round(brochureTotal)
        }
    };

    // 3. Render the grids
    renderGrid("#actual-grid", actualTiles);
    renderGrid("#brochure-grid", brochureTiles);

    if (legendPinnedRace != null && legendPinnedRace in raceLabels) {
        highlightTilesByRace(legendPinnedRace);
        updateLegendPressedState(legendPinnedRace);
    }

    // 4. Similarity score
    if (!hasActualData && !hasBrochureData) {
        setSimilarityMessage(`Actual and brochure data for year ${year} were not found.`);
    } else if (!hasActualData) {
        setSimilarityMessage(`Actual demographic data for year ${year} was not found.`);
    } else if (!hasBrochureData) {
        setSimilarityMessage(`Brochure data for year ${year} was not found.`);
    } else {
        const similarityPct = calculateDistributionSimilarity(
            actualTotal,
            { white: actualWhite, black: actualBlack, other: actualOther },
            brochureTotal,
            { white: brochureWhite, black: brochureBlack, other: brochureOther }
        );
        animateSimilarityScore(similarityPct);
    }

    // Keep pinned legend info panel in sync with the selected year (counts / shares).
    if (legendPinnedRace != null && legendPinnedRace in raceLabels) {
        showLegendTooltipPanel(legendPinnedRace, { animate: true });
    }

    // Brochure image section removed.
}

/**
 * Given group shares, return an array of 100 tile objects.
 */
function createTileArray(pWhite, pBlack, pOther) {
    const safeWhite = Number.isFinite(pWhite) ? Math.max(0, pWhite) : 0;
    const safeBlack = Number.isFinite(pBlack) ? Math.max(0, pBlack) : 0;
    const safeOther = Number.isFinite(pOther) ? Math.max(0, pOther) : 0;
    const sum = safeWhite + safeBlack + safeOther;

    if (sum <= 0) return [];

    // Stable allocation to exactly 100 tiles (avoids negatives / >100 due to rounding)
    const ratios = [safeWhite / sum, safeBlack / sum, safeOther / sum];
    const scaled = ratios.map(r => r * 100);
    const counts = scaled.map(Math.floor);
    let remaining = 100 - d3.sum(counts);

    const order = scaled
        .map((v, i) => ({ i, frac: v - counts[i] }))
        .sort((a, b) => b.frac - a.frac);

    for (let k = 0; k < remaining; k++) {
        counts[order[k % order.length].i] += 1;
    }

    let tiles = [];
    const [countWhite, countBlack, countOther] = counts;

    for(let i=0; i<countOther; i++) tiles.push({type: 'other'});
    for(let i=0; i<countBlack; i++) tiles.push({type: 'black'});
    for(let i=0; i<countWhite; i++) tiles.push({type: 'white'});

    // Compute base grid coordinates (x, y) for each tile
    return tiles.map((d, i) => {
        return {
            type: d.type,
            id: i,
            origX: (i % 10) * (config.tileSize + config.gridGap) + 15,
            origY: Math.floor(i / 10) * (config.tileSize + config.gridGap) + 15
        };
    });
}

function createMissingTileArray() {
    const tiles = Array.from({ length: 100 }, (_, i) => ({ type: "missing", id: i }));
    return tiles.map((d, i) => ({
        type: d.type,
        id: d.id,
        origX: (i % 10) * (config.tileSize + config.gridGap) + 15,
        origY: Math.floor(i / 10) * (config.tileSize + config.gridGap) + 15
    }));
}

/**
 * Render a grid using a D3 data join.
 */
function renderGrid(selector, data) {
    const svg = d3.select(selector);
    // Ensure the SVG contents scale with responsive CSS sizing (prevents clipping on narrower columns).
    svg.attr("viewBox", "0 0 420 420")
        .attr("preserveAspectRatio", "xMidYMid meet");
    const baseTransition = d3.transition()
        .duration(config.transitionDuration)
        .ease(d3.easeCubicOut);

    svg.selectAll(".tile-group")
        .data(data, d => d.id) // Bind by id to preserve transitions
        .join(
            enter => {
                const g = enter.append("g")
                    .attr("class", d => `tile-group ${d.type}`)
                    .attr("transform", d => `translate(${d.origX}, ${d.origY})`);

                g.append("rect")
                    .attr("class", "tile")
                    .attr("width", config.tileSize)
                    .attr("height", config.tileSize)
                    .attr("fill", d => config.colors[d.type]);

                // Simple "person" icon (head + torso)
                g.append("circle")
                    .attr("class", "tile-icon")
                    .attr("cx", config.tileSize / 2)
                    .attr("cy", config.tileSize * 0.34)
                    .attr("r", config.tileSize * 0.13)
                    .attr("fill", "rgba(255, 255, 255, 0.92)");

                g.append("path")
                    .attr("class", "tile-icon")
                    .attr("d", () => {
                        const cx = config.tileSize / 2;
                        const yTop = config.tileSize * 0.52;
                        const shoulder = config.tileSize * 0.22;
                        const bodyBottom = config.tileSize * 0.84;
                        const waist = config.tileSize * 0.12;
                        return `
                            M ${cx - shoulder} ${yTop}
                            Q ${cx - shoulder} ${yTop - 3} ${cx - shoulder + 3} ${yTop - 3}
                            L ${cx + shoulder - 3} ${yTop - 3}
                            Q ${cx + shoulder} ${yTop - 3} ${cx + shoulder} ${yTop}
                            L ${cx + waist} ${bodyBottom}
                            L ${cx - waist} ${bodyBottom}
                            Z
                        `;
                    })
                    .attr("fill", "rgba(255, 255, 255, 0.92)");

                return g;
            },
            update => {
                update
                    .attr("class", d => `tile-group ${d.type}`)
                    .interrupt()
                    .transition(baseTransition)
                    .attr("transform", d => `translate(${d.origX}, ${d.origY})`);

                update.select("rect.tile")
                    .interrupt()
                    .transition(baseTransition)
                    .attr("fill", d => config.colors[d.type]);

                return update;
            },
            exit => exit.remove()
        )
        // Hover interaction: dim non-selected groups (legend pin cleared on hover)
        .on("mouseover", function(event, d) {
            if (!(d.type in raceLabels)) return;
            legendPinnedRace = null;
            updateLegendPressedState(null);
            hideLegendTooltipPanel();

            highlightTilesByRace(d.type);
            showRaceTooltip(d.type, { pointerEvent: event });
        })
        .on("mousemove", function(event) {
            if (tooltipBesideGrids) return;
            tooltip
                .style("left", `${event.pageX + 14}px`)
                .style("top", `${event.pageY + 14}px`);
        })
        .on("mouseout", function() {
            // If this is a missing-data grid, do nothing.
            // (No tooltip / dimming interactions apply.)
            // Reset logic below still works when a legend race is pinned.
            hideRaceTooltip();
            if (legendPinnedRace != null && legendPinnedRace in raceLabels) {
                highlightTilesByRace(legendPinnedRace);
            } else {
                resetTilesOpacity();
            }
        });
}

/**
 * Compute similarity between two distributions using underlying ratios (factfile vs archive totals).
 * For 3-category share vectors, the L1 distance Σ|p−q| is at most 2, so we report (1 − L1/2)×100 as percent similarity.
 * (Uses original ratios, independent of 100-tile integer rounding.)
 */
function calculateDistributionSimilarity(actualTotal, actualCounts, brochureTotal, brochureCounts) {
    if (actualTotal <= 0 || brochureTotal <= 0) return 0;
    const types = ["white", "black", "other"];
    let l1 = 0;
    types.forEach((type) => {
        const p = actualCounts[type] / actualTotal;
        const q = brochureCounts[type] / brochureTotal;
        l1 += Math.abs(p - q);
    });
    return Math.max(0, Math.min(100, (1 - l1 / 2) * 100));
}

/** nextSimilarity: similarity in 0–100 range (shown in #similarity-percent) */
function animateSimilarityScore(nextSimilarity) {
    similarityScoreRevealBody();
    const scoreNode = d3.select("#similarity-percent");
    const startSimilarity = displayedSimilarity;

    scoreNode
        .interrupt()
        .transition()
        .duration(config.transitionDuration)
        .ease(d3.easeCubicOut)
        .tween("text", () => {
            const interpolator = d3.interpolateNumber(startSimilarity, nextSimilarity);
            return t => {
                scoreNode.text(interpolator(t).toFixed(1));
            };
        })
        .on("end", () => {
            displayedSimilarity = nextSimilarity;
        });
}

function setSimilarityMessage(message) {
    d3.select("#similarity-percent").interrupt();
    similarityScoreShowAlert(message);
}

// Brochure image section removed.