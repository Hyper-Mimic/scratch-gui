// Cross-shell production build wrapper for scratch-gui.
// Sets NODE_ENV=production then runs webpack, so the emitted bundle uses
// react-dom.production.min.js (no dev-mode lifecycle warnings in the console).
process.env.NODE_ENV = 'production';

const {execSync} = require('child_process');
const path = require('path');

const webpackBin = require.resolve('webpack/bin/webpack.js');

execSync(`node "${webpackBin}" --colors --bail`, {stdio: 'inherit'});
