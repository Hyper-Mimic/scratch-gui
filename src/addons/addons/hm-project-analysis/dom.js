// Minimal DOM builders for the analysis panel.
//
// The panel is rendered with plain DOM APIs rather than React on purpose: it lives inside an
// addon modal whose `content` node scratch-gui never reconciles, so there is no React tree to
// keep in sync -- and this fork's addon environment does not reliably deliver React synthetic
// events, which the old React version had to work around with a manual `addEventListener`
// delegation anyway. Everything below is deliberately tiny: no virtual DOM, no diffing.

/**
 * Join class names, dropping the falsy ones.
 * CSS-module lookups are `undefined` for an unknown key, so this keeps a typo from
 * producing a literal "undefined" class.
 * @param {...(?string)} names
 * @returns {string}
 */
export const cx = (...names) => names.filter(Boolean).join(' ');

/**
 * @param {string} tag
 * @param {?string} className
 * @param {object} [options]
 * @param {string} [options.text] textContent
 * @param {object} [options.style] inline styles, camelCased; null/undefined values are skipped
 *   so a resolved colour that is legitimately `null` leaves the property unset (matching what
 *   React does with `style={{backgroundColor: null}}`).
 * @param {object} [options.dataset] data-* attributes
 * @param {object} [options.attrs] setAttribute pairs
 * @returns {HTMLElement}
 */
export const el = (tag, className, options = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (options.text !== undefined && options.text !== null) node.textContent = options.text;
    if (options.style) {
        for (const property of Object.keys(options.style)) {
            const value = options.style[property];
            if (value === undefined || value === null || value === '') continue;
            node.style[property] = value;
        }
    }
    if (options.dataset) {
        for (const key of Object.keys(options.dataset)) node.dataset[key] = options.dataset[key];
    }
    if (options.attrs) {
        for (const key of Object.keys(options.attrs)) node.setAttribute(key, options.attrs[key]);
    }
    return node;
};

export const div = (className, options) => el('div', className, options);
export const span = (className, options) => el('span', className, options);

/**
 * An SVG element.
 *
 * SVG needs its own namespace, so `document.createElement` would produce an unknown element that
 * never renders.
 *
 * @param {string} tag e.g. 'path', 'circle'
 * @param {?string} className
 * @param {object} [attrs] attribute name -> value
 * @returns {SVGElement}
 */
export const svgEl = (tag, className, attrs = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (className) node.setAttribute('class', className);
    for (const name of Object.keys(attrs)) {
        if (attrs[name] === undefined || attrs[name] === null) continue;
        node.setAttribute(name, attrs[name]);
    }
    return node;
};

/**
 * An inline SVG icon.
 *
 * `markup` is a whole SVG document (imported with raw-loader) and is injected rather than used as
 * a URL: the drawings are coloured with `currentColor`, so they take their colour from the
 * surrounding CSS `color`. An <img> or a background-image would keep the file's own colour and
 * ignore the theme.
 *
 * @param {?string} className
 * @param {string} markup
 * @returns {HTMLElement}
 */
export const icon = (className, markup) => {
    const node = span(className);
    node.innerHTML = markup;
    return node;
};

/**
 * Append every non-null child (mirrors how React skips a `null` child).
 * @param {Node} parent
 * @param {...(?Node)} children
 * @returns {Node} parent
 */
export const append = (parent, ...children) => {
    for (const child of children) {
        if (child) parent.appendChild(child);
    }
    return parent;
};

/**
 * Empty a node.
 * @param {Node} node
 * @returns {Node} node
 */
export const clear = node => {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
};

/**
 * Replace every child of `node` with `children`.
 * A DocumentFragment counts as one child and unfolds into its own children.
 * @param {Node} node
 * @param {...(?Node)} children
 * @returns {Node} node
 */
export const fill = (node, ...children) => append(clear(node), ...children);
