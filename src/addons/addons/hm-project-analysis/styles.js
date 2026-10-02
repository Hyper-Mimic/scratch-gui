// Single import point for the addon's CSS-module class names.
//
// The stylesheet is imported by JS (the addon declares no `userstyles` in its manifest), so
// webpack injects it via style-loader and hands back the hashed locals object. Views import
// this module instead of the .css file directly -- webpack dedupes the duplicate CSS import,
// and every view keeps talking about `styles.someClass` the same way it did under React.

import styles from './hm-project-analysis.css';

export {styles};
