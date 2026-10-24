/**
 * Google Fonts, for the editor font picker.
 *
 * Borrowed from the Bilup fork (src/lib/themes/google-fonts.js). The font list comes from the
 * public metadata endpoint, which needs no API key, and a font is loaded by pointing a <link>
 * at the css2 API. When the metadata cannot be fetched -- offline, or a CSP that blocks it --
 * a short list of popular fonts stands in, so the picker always has something to offer.
 */

const GOOGLE_FONTS_METADATA_URL = 'https://fonts.google.com/metadata/fonts';

// Shown before the user searches, and the fallback when the metadata cannot be fetched.
const POPULAR_GOOGLE_FONTS = [
    'Open Sans',
    'Roboto',
    'Lato',
    'Montserrat',
    'Source Sans Pro',
    'Roboto Condensed',
    'Oswald',
    'Raleway',
    'Nunito',
    'Ubuntu',
    'Playfair Display',
    'Merriweather',
    'PT Sans',
    'Poppins',
    'Fira Sans',
    'Work Sans',
    'Roboto Slab',
    'Crimson Text',
    'Droid Sans',
    'Libre Baskerville'
];

const WEIGHTS = ['400', '700'];

let fontsCache = null;
let loadingPromise = null;

const normalizeFamily = fontFamily => (fontFamily || '').trim();

const encodeCss2Family = fontFamily =>
    encodeURIComponent(normalizeFamily(fontFamily)).replace(/%20/g, '+');

const getOrCreateGoogleFontLink = fontFamily => {
    const family = normalizeFamily(fontFamily);
    const existing = document.querySelector(`link[data-google-font="${CSS.escape(family)}"]`);
    if (existing) return existing;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-google-font', family);
    document.head.appendChild(link);
    return link;
};

/**
 * Load a Google Font into the document.
 * @param {string} fontFamily the family to load
 * @returns {Promise} resolves once the stylesheet has loaded
 */
const loadGoogleFont = fontFamily => new Promise((resolve, reject) => {
    const family = normalizeFamily(fontFamily);
    if (!family) {
        resolve();
        return;
    }
    const url = `https://fonts.googleapis.com/css2?family=${encodeCss2Family(family)}` +
        `:wght@${WEIGHTS.join(';')}&display=swap`;
    const link = getOrCreateGoogleFontLink(family);
    if (link.href === url) {
        // Already loaded (or on its way): the caller only needs to know it is there.
        resolve();
        return;
    }
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load font: ${family}`));
    link.href = url;
});

const fetchGoogleFontsMetadata = async () => {
    const response = await fetch(GOOGLE_FONTS_METADATA_URL);
    if (!response.ok) {
        throw new Error(`Google Fonts metadata error: ${response.status}`);
    }
    // The endpoint answers with a JSON array prefixed by a guard sequence.
    const jsonText = (await response.text()).replace(/^\)\]\}'\n/, '');
    const data = JSON.parse(jsonText);
    const list = data.familyMetadataList || [];
    return list.map(item => ({
        family: item.family,
        category: item.category || 'sans-serif'
    }));
};

const toFontObjects = names => names.map(family => ({family, category: 'sans-serif'}));

/**
 * Every Google Font there is, or the popular list when the metadata is unreachable.
 *
 * Always a Promise, cached or not: callers chain `.then()` off it, and handing back the raw
 * array once the cache is warm breaks them on every later call.
 * @returns {Promise<Array<{family: string, category: string}>>}
 */
const getGoogleFontsList = () => {
    if (fontsCache) return Promise.resolve(fontsCache);
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
        try {
            fontsCache = await fetchGoogleFontsMetadata();
        } catch (error) {
            console.warn('Failed to load the Google Fonts list, using popular fonts:', error);
            fontsCache = toFontObjects(POPULAR_GOOGLE_FONTS);
        }
        return fontsCache;
    })();
    return loadingPromise;
};

/**
 * Search Google Fonts by name.
 * @param {string} query
 * @returns {Promise<Array<{family: string, category: string}>>} at most 10 matches
 */
const searchGoogleFonts = async query => {
    const fonts = await getGoogleFontsList();
    const lowercaseQuery = normalizeFamily(query).toLowerCase();
    if (!lowercaseQuery) return [];
    return fonts
        .filter(font => font.family.toLowerCase().includes(lowercaseQuery))
        .slice(0, 10);
};

export {
    loadGoogleFont,
    searchGoogleFonts,
    getGoogleFontsList,
    POPULAR_GOOGLE_FONTS
};
