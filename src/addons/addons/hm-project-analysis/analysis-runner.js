// Analysis lifecycle: read the addon settings, run the analyzer, and re-run it when the
// project changes. Kept away from the panel so the DOM code never touches the VM and the
// VM code never touches the DOM -- the panel only receives `{summary, extensionDisplayInfo,
// extensionDataInfo}` and plain error strings.

import {createProjectAnalyzer} from './lib/ProjectAnalyzer.js';

// Boolean manifest settings that decide what the panel shows, with the fallback used when the
// setting is missing entirely (`addon.settings.get` normally returns the manifest default).
// Values mirror _manifest_entry.js.
export const BOOLEAN_SETTINGS = {
    showFileName: true,
    showSpriteCount: true,
    showCostumeCount: true,
    showSoundCount: true,
    showBlocksNum: true,
    showEffectiveBlocksNum: true,
    showScriptsNum: true,
    showEffectiveScriptsNum: true,
    showVarDefinitionsNum: false,
    showListDefinitionsNum: false,
    showFuncDefinitionsNum: false,
    showExtensionsInfo: false,
    showSpecificExtensions: true,
    betterProgressBar: false
};

/**
 * Snapshot every setting the panel or the analyzer needs.
 *
 * The boolean values are coerced with `!!` because the panel treats them as flags; the two
 * selects keep the same `|| default` fallbacks the React component used.
 *
 * @param {object} addon
 * @returns {object}
 */
export const readSettings = addon => {
    const settings = {};
    for (const id of Object.keys(BOOLEAN_SETTINGS)) {
        const value = addon.settings.get(id);
        settings[id] = value === undefined || value === null ? BOOLEAN_SETTINGS[id] : !!value;
    }
    settings.orderType = addon.settings.get('orderType') || 'original';
    settings.datadisplayway = addon.settings.get('datadisplayway') || 'onlydata';
    return settings;
};

/**
 * Drives `ProjectAnalyzer` for one open panel.
 *
 *   - `run()` analyses on demand (the initial open, and every debounced PROJECT_CHANGED);
 *   - results are dropped when a newer run started or the panel was closed, so a slow analysis
 *     can never overwrite a fresher one;
 *   - the VM may be missing (opened before the editor finished booting) -- that surfaces as the
 *     same error message the React version used.
 */
export class AnalysisRunner {
    /**
     * @param {object} options
     * @param {?object} options.vm
     * @param {function(): object} options.getSettings
     * @param {function(): void} options.onLoading
     * @param {function(object): void} options.onResult `{summary, extensionDisplayInfo, extensionDataInfo}`
     * @param {function(string): void} options.onError
     * @param {number} [options.debounceMs]
     */
    constructor ({vm, getSettings, onLoading, onResult, onError, debounceMs = 1000}) {
        this.vm = vm;
        this.getSettings = getSettings;
        this.onLoading = onLoading;
        this.onResult = onResult;
        this.onError = onError;
        this.debounceMs = debounceMs;

        this.bound = false;
        this.disposed = false;
        // Incremented per run; a run whose token is stale is ignored.
        this.token = 0;
        this.debounceTimer = null;
        this.handleProjectChanged = null;
    }

    /**
     * Re-analyse (debounced) whenever the VM reports the project changed -- blocks added or
     * removed, sprites/costumes/sounds edited. Without this the panel would only ever show a
     * snapshot of the moment it was opened.
     */
    bind () {
        if (this.bound || !this.vm || typeof this.vm.on !== 'function') return;
        this.bound = true;
        this.handleProjectChanged = () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.run(), this.debounceMs);
        };
        this.vm.on('PROJECT_CHANGED', this.handleProjectChanged);
    }

    unbind () {
        if (this.bound && this.vm && typeof this.vm.off === 'function' && this.handleProjectChanged) {
            this.vm.off('PROJECT_CHANGED', this.handleProjectChanged);
        }
        this.bound = false;
        this.handleProjectChanged = null;
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
    }

    async run () {
        if (this.disposed) return;

        if (!this.vm) {
            this.onError('Failed to analyze project: VM is not initialized.');
            return;
        }

        const token = ++this.token;
        this.onLoading();

        try {
            const analyzer = createProjectAnalyzer(this.vm);
            await analyzer.analyzeProject(this.getSettings().datadisplayway);
            if (this.disposed || token !== this.token) return;
            this.onResult({
                summary: analyzer.getSummary(),
                extensionDisplayInfo: analyzer.getExtensionDisplayInfo(),
                extensionDataInfo: analyzer.extensionsInfo
            });
        } catch (error) {
            if (this.disposed || token !== this.token) return;
            console.error('[hm-Analysis] Failed to analyze project:', error);
            this.onError((error && error.message) || 'Failed to analyze project: Unknown error.');
        }
    }

    destroy () {
        this.disposed = true;
        // Invalidate an in-flight analysis too.
        this.token++;
        this.unbind();
    }
}
