/**
 * Copyright (C) 2021 Thomas Weber
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import './import-first';

import React from 'react';

import runAddons from '../addons/entry';
import Interface from './render-interface.jsx';
import render from './app-target.js';

const start = () => {
    // Order matters, and not in the obvious direction: the render has to come *first*. The addon
    // runtime reads redux state as it starts (see whenStoreReady in src/addons/api.js), and the
    // store is created by the first AppStateWrapper -- rendering, in other words. Awaiting the
    // addons before rendering (the previous version of this file) deadlocked exactly there and
    // left the page with no addons at all.
    //
    // What the wait is really for is the first *painted* frame: `render()` normally hides the splash
    // immediately (app-target.js), which showed the raw GUI for a moment before the addon styles
    // landed on top. The splash stays up across that gap instead, so the page the user first sees is
    // already the addon-adjusted one.
    const splashEnd = window.SplashEnd;
    window.SplashEnd = null;
    try {
        render(<Interface isPlayerOnly />);
    } finally {
        window.SplashEnd = splashEnd;
    }

    // Wait for the addons themselves, not just for their runtime: importing that chunk only
    // installs the API, while each addon is a separate chunk that lands a moment later. Holding the
    // splash until they are done is what makes the first visible frame the addon-adjusted one.
    // The timeout is the escape hatch: a chunk that never arrives must not keep the project hidden.
    // Reaching it also prints the runtime's own diagnostics, so the next report says why.
    const timeout = new Promise(resolve => setTimeout(resolve, 8000)).then(() => {
        if (typeof window.hmAddonDebug === 'function') {
            console.warn('[addons] still starting after 8s, showing the page anyway', window.hmAddonDebug());
        }
    });
    const addonsSettled = runAddons()
        .then(module => (module && module.addonsReady) || null)
        .catch(() => null);
    Promise.race([addonsSettled, timeout]).then(() => {
        if (splashEnd) splashEnd();
    });
};

start();
