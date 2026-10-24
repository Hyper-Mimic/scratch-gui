// The block-category chart: the same data the progress bars show, drawn as a *doughnut* (a ring,
// not a solid pie) -- with the two interactions the AstraEditor "simple-project-analyzer" chart
// has:
//
//   1. an entrance animation (a clockwise sweep on first paint, a quick pop on later updates), and
//   2. a hover tooltip on every slice (`name: count (percentage)`).
//
// Deliberate differences from AstraEditor's Chart.js doughnut:
//   - this is plain SVG (no chart.js dependency) and the colours are the *live* Blockly theme
//     colours -- the same ones the progress bars use -- instead of a hardcoded table, so the chart
//     follows custom-editor-theme / editor-theme3;
//   - the ring's border and the dividing lines between categories use a *neutral* stroke that
//     follows the theme: `light-dark()` keys off the root `color-scheme` (set by custom-editor-theme
//     and TWThemeManager), so the lines read as a soft gray on light surfaces and a translucent
//     white on dark ones. They are no longer the panel background (which made them invisible).

import {styles} from '../styles.js';
import {div, span, svgEl, append} from '../dom.js';

// The ring is drawn in a 200x200 user space; the outer radius leaves room for the stroke, the inner
// radius carves the hole that makes it a doughnut rather than a pie.
const CENTER = 100;
const R_OUTER = 92;
const R_INNER = 50;

/**
 * The path of one annular sector (a "slice" of the ring).
 *
 * @param {number} startAngle radians
 * @param {number} endAngle radians
 * @param {number} rOuter
 * @param {number} rInner
 * @returns {string} SVG path data
 */
const sectorPath = (startAngle, endAngle, rOuter, rInner) => {
    const oSx = CENTER + rOuter * Math.cos(startAngle);
    const oSy = CENTER + rOuter * Math.sin(startAngle);
    const oEx = CENTER + rOuter * Math.cos(endAngle);
    const oEy = CENTER + rOuter * Math.sin(endAngle);
    const iEx = CENTER + rInner * Math.cos(endAngle);
    const iEy = CENTER + rInner * Math.sin(endAngle);
    const iSx = CENTER + rInner * Math.cos(startAngle);
    const iSy = CENTER + rInner * Math.sin(startAngle);
    // An arc over half the circle has to be drawn the long way round.
    const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    return [
        `M ${oSx.toFixed(3)} ${oSy.toFixed(3)}`,
        `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${oEx.toFixed(3)} ${oEy.toFixed(3)}`,
        `L ${iEx.toFixed(3)} ${iEy.toFixed(3)}`,
        `A ${rInner} ${rInner} 0 ${largeArc} 0 ${iSx.toFixed(3)} ${iSy.toFixed(3)}`,
        'Z'
    ].join(' ');
};

/**
 * A full ring (one category owns the whole visible set): an outer circle and an inner circle drawn
 * in opposite directions, with `fill-rule: evenodd` cutting the hole.
 * @param {number} rOuter
 * @param {number} rInner
 * @returns {string} SVG path data
 */
const fullRingPath = (rOuter, rInner) => [
    `M ${CENTER + rOuter} ${CENTER}`,
    `A ${rOuter} ${rOuter} 0 1 1 ${CENTER - rOuter} ${CENTER}`,
    `A ${rOuter} ${rOuter} 0 1 1 ${CENTER + rOuter} ${CENTER}`,
    `M ${CENTER + rInner} ${CENTER}`,
    `A ${rInner} ${rInner} 0 1 0 ${CENTER - rInner} ${CENTER}`,
    `A ${rInner} ${rInner} 0 1 0 ${CENTER + rInner} ${CENTER}`,
    'Z'
].join(' ');

const easeOutCubic = p => 1 - Math.pow(1 - p, 3);

// One shared tooltip element, appended to <body> and reused across renders. `position: fixed`
// so it tracks the cursor in viewport coordinates (the same coordinate space the slice
// mousemove events report through `clientX/clientY`), and a high z-index so it sits above the
// modal -- mirroring how the number-pad dropdown escapes the modal's stacking context.
let tooltipEl = null;
const getTooltip = () => {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = styles.pieTooltip;
        tooltipEl.style.display = 'none';
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
};

/**
 * Hover behaviour for a slice: show the tooltip, follow the cursor, hide on leave.
 * @param {SVGElement} el
 * @param {{displayName: string, count: number}} row
 * @param {number} visibleTotal denominator for the percentage (the remaining, visible total)
 */
const attachHover = (el, row, visibleTotal) => {
    const tip = getTooltip();
    el.style.cursor = 'pointer';
    el.addEventListener('mouseenter', () => {
        const percent = visibleTotal > 0 ? ((row.count / visibleTotal) * 100).toFixed(1) : '0.0';
        tip.textContent = `${row.displayName}: ${row.count} (${percent}%)`;
        tip.style.display = 'block';
    });
    el.addEventListener('mousemove', event => {
        tip.style.left = `${event.clientX + 12}px`;
        tip.style.top = `${event.clientY + 12}px`;
    });
    el.addEventListener('mouseleave', () => {
        tip.style.display = 'none';
    });
};

/**
 * Clockwise sweep: a single leading edge travels from the 12 o'clock start, and each slice is
 * drawn from its own start up to (`min` of) that edge -- so the ring appears to draw itself.
 * @param {SVGElement} svg
 * @param {Array<{path: SVGElement, startAngle: number, endAngle: number}>} slices
 * @param {number} duration ms
 */
const animateSweep = (svg, slices, duration) => {
    // Clear synchronously so the full ring (its `d` is set during build) does not flash for one
    // frame before the first requestAnimationFrame paints the swept-in version.
    for (const slice of slices) slice.path.setAttribute('d', '');
    const startAngle0 = -Math.PI / 2;
    const startTime = performance.now();
    const step = now => {
        const progress = Math.min(1, (now - startTime) / duration);
        const sweep = startAngle0 + easeOutCubic(progress) * Math.PI * 2;
        for (const slice of slices) {
            if (sweep <= slice.startAngle) {
                slice.path.setAttribute('d', '');
                continue;
            }
            const drawnEnd = Math.min(slice.endAngle, sweep);
            slice.path.setAttribute('d', sectorPath(slice.startAngle, drawnEnd, R_OUTER, R_INNER));
        }
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
};

/**
 * Quick scale + fade in, used on re-renders (after an exclusion toggle) instead of the sweep.
 * @param {SVGElement} svg
 * @param {number} duration ms
 */
const animatePop = (svg, duration) => {
    svg.style.transformOrigin = '50% 50%';
    svg.style.opacity = '0';
    const startTime = performance.now();
    const step = now => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = easeOutCubic(progress);
        svg.style.opacity = String(eased);
        svg.style.transform = `scale(${(0.85 + 0.15 * eased).toFixed(3)})`;
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            svg.style.opacity = '1';
            svg.style.transform = 'scale(1)';
        }
    };
    requestAnimationFrame(step);
};

/**
 * @param {object} ctx panel context
 * @param {Array<{category: string, count: number, displayName: string, color: ?string}>} rows one
 *   per category, already filtered, sorted and named
 * @param {number} total the project's total block count (fallback denominator; the ring
 *   re-normalises over the visible total)
 * @returns {HTMLElement}
 */
export const renderPieChart = (ctx, rows, total) => {
    const {t} = ctx;

    const markRendered = ctx.markPieRendered;
    const firstRender = !!ctx.pieFirstRender;

    const visibleRows = rows;
    const visibleTotal = visibleRows.reduce((sum, row) => sum + row.count, 0);

    const wrapper = div(styles.pieChartWrapper);

    const chart = div(styles.pieChart);
    const svg = svgEl('svg', styles.pieChartSvg, {
        viewBox: '0 0 200 200',
        role: 'img',
        'aria-label': t('blockCategories')
    });

    // One category owns the whole visible ring: an arc from a point back to itself is empty, so it
    // is a full ring (outer + inner circle, evenodd) that animates with a scale-in.
    const singleRing = visibleRows.length === 1 ?
        svgEl('path', styles.pieSlice, {
            d: fullRingPath(R_OUTER, R_INNER),
            fill: visibleRows[0].color || 'currentColor',
            'fill-rule': 'evenodd'
        }) :
        null;
    if (singleRing) {
        svg.appendChild(singleRing);
        attachHover(singleRing, visibleRows[0], visibleTotal);
    }

    // Build the slices. Each gets its full geometry up front (so the pop re-render is correct);
    // the sweep animation overwrites `d` frame by frame on first paint.
    const slices = [];
    let startAngle = -Math.PI / 2;
    for (const row of visibleRows) {
        const endAngle = startAngle + (row.count / visibleTotal) * Math.PI * 2;
        const path = svgEl('path', styles.pieSlice, {
            fill: row.color || 'currentColor',
            d: sectorPath(startAngle, endAngle, R_OUTER, R_INNER)
        });
        svg.appendChild(path);
        attachHover(path, row, visibleTotal);
        slices.push({path, startAngle, endAngle});
        startAngle = endAngle;
    }

    chart.appendChild(svg);

    // Entrance animation: full sweep the first time the ring paints, a quick pop on later renders.
    if (firstRender) {
        if (singleRing) animatePop(svg, 500);
        else if (slices.length) animateSweep(svg, slices, 650);
    } else if (singleRing || slices.length) {
        animatePop(svg, 260);
    }

    // Legend: every category, with its colour swatch and its share of the visible total.
    const legend = div(styles.pieLegend);
    for (const row of rows) {
        const item = div(styles.pieLegendItem);
        const dot = span(styles.pieLegendDot);
        if (row.color) dot.style.backgroundColor = row.color;
        item.appendChild(dot);

        item.appendChild(span(styles.pieLegendName, {text: row.displayName}));

        const percent = visibleTotal > 0 ? ((row.count / visibleTotal) * 100).toFixed(1) : '0.0';
        item.appendChild(span(styles.pieLegendValue, {text: `${row.count} (${percent}%)`}));

        legend.appendChild(item);
    }

    append(wrapper, chart, legend);
    if (markRendered) markRendered();
    return wrapper;
};
