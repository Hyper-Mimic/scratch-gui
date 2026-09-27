/**
 * Shared sliding underline for tab strips.
 *
 * The bar used to live on each tab as an `::after`, which can only ever appear and
 * disappear in place: a pseudo-element belongs to one element and cannot travel to
 * another, so switching tabs could never look like the bar moving. A slide therefore
 * needs a single element in the strip that gets re-positioned, which is what this drives.
 *
 * Layout contract for the caller:
 *   - the strip is `position: relative`
 *   - the indicator is a child of the strip, `position: absolute; left: 0`
 *   - the tabs are direct children of the strip, so `offsetLeft` and the indicator's
 *     `left: 0` are measured against the same box (the strip's padding box)
 */

// Fraction of the tab width the bar spans. Matches the 60%-wide, centred bar the tab
// strips used before they were animated.
const BAR_RATIO = 0.6;

/**
 * Where the bar should sit, or null when that cannot be known yet.
 *
 * A zero width means the strip is hidden or has not been laid out, and measuring now
 * would park the bar at x=0 -- which then reads as the bar sliding in from the left
 * the moment the strip becomes visible.
 */
const measure = (strip, tab) => {
    const tabWidth = tab.offsetWidth;
    if (!tabWidth || !strip.offsetWidth) return null;
    const width = tabWidth * BAR_RATIO;
    return {width, offset: tab.offsetLeft + ((tabWidth - width) / 2)};
};

const apply = (indicator, {width, offset}) => {
    indicator.style.width = `${width}px`;
    indicator.style.transform = `translateX(${offset}px)`;
};

/**
 * Move `indicator` under `tab`.
 *
 * @param {HTMLElement} strip the tab strip
 * @param {HTMLElement} indicator the shared bar
 * @param {?HTMLElement} tab the active tab
 * @param {boolean} [animate] false for the first placement and for re-placements after a
 *   layout change, where sliding from wherever the bar happened to be would be wrong
 * @returns {boolean} whether the bar was placed
 */
export const placeTabIndicator = (strip, indicator, tab, animate = true) => {
    if (!strip || !indicator || !tab) return false;
    const geometry = measure(strip, tab);
    if (!geometry) return false;
    if (animate) {
        apply(indicator, geometry);
        return true;
    }
    // Writing the new geometry with the transition off and only then turning it back on
    // is what keeps a non-animated placement from animating. The style read is what makes
    // the transition-less values the before-change style.
    indicator.style.transition = 'none';
    apply(indicator, geometry);
    void indicator.offsetWidth;
    indicator.style.transition = '';
    return true;
};

/**
 * Keep the bar aligned through layout changes the caller does not control: the strip
 * resizing, and tab labels changing length with the language.
 *
 * @param {HTMLElement} strip the tab strip
 * @param {HTMLElement} indicator the shared bar
 * @param {function(): ?HTMLElement} getActiveTab re-read on every update
 * @returns {function()} disconnect
 */
export const watchTabIndicator = (strip, indicator, getActiveTab) => {
    const update = () => placeTabIndicator(strip, indicator, getActiveTab(), false);
    window.addEventListener('resize', update);
    // Fires once on observe, which also covers the initial placement for callers that
    // cannot know when the strip became measurable.
    const observer = typeof ResizeObserver === 'function' ?
        new ResizeObserver(update) :
        null;
    if (observer) observer.observe(strip);
    return () => {
        window.removeEventListener('resize', update);
        if (observer) observer.disconnect();
    };
};
