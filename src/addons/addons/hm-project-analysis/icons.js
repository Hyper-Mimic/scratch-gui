// Stat icons, inlined as markup so they can be coloured by CSS.
//
// Ported from the EPSA project-analysis site (same drawings, same ratios). The originals were a
// fixed blue ramp -- #4d97ff with #6ba9ff / #99c3ff / #b3d2ff for the layered parts -- which is
// useless inside a themed panel: a data URI or an <img> would keep that blue in every theme. So
// every shade was rewritten to `currentColor` plus the matching `fill-opacity`, and the CSS sets
// `color` on the wrapper. That makes the icons follow var(--text-primary) (and therefore any
// custom-editor-theme preset) with the original sense of depth intact.
//
// raw-loader rather than url-loader: we need the markup, not a URL, because the colour has to be
// inherited rather than baked into the file.

import spriteIcon from '!raw-loader!./assets/SpriteIcon.svg';
import costumeIcon from '!raw-loader!./assets/CostumeIcon.svg';
import soundIcon from '!raw-loader!./assets/SoundIcon.svg';
import blocksIcon from '!raw-loader!./assets/BlocksIcon.svg';
import effectiveBlocksIcon from '!raw-loader!./assets/EffectiveBlocksIcon.svg';
import scriptsIcon from '!raw-loader!./assets/ScriptsIcon.svg';
import effectiveScriptsIcon from '!raw-loader!./assets/EffectiveScriptsIcon.svg';
import varIcon from '!raw-loader!./assets/VarIcon.svg';
import listIcon from '!raw-loader!./assets/ListIcon.svg';
import funcIcon from '!raw-loader!./assets/FuncIcon.svg';

/**
 * Keyed by the `icon` field of `STAT_ITEMS` in views/stats.js.
 * @type {Record<string, string>}
 */
export const ICONS = {
    sprites: spriteIcon,
    costumes: costumeIcon,
    sounds: soundIcon,
    totalBlocks: blocksIcon,
    effectiveBlocks: effectiveBlocksIcon,
    totalScripts: scriptsIcon,
    effectiveScripts: effectiveScriptsIcon,
    variables: varIcon,
    lists: listIcon,
    functions: funcIcon
};
