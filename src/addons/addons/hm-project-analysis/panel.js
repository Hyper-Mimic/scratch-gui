// The analysis panel: modal chrome (tab strip + tab body) and the state that drives it.
//
// Plain DOM throughout -- see dom.js for why. The panel owns nothing outside the node it is
// mounted into: it does not know about the VM, the addon or the modal, it just receives a
// translator, a settings snapshot and the analysis results.

import {styles} from './styles.js';
import {cx, el, div, span, append, fill} from './dom.js';
import {placeTabIndicator, watchTabIndicator} from '../../../lib/tab-indicator.js';
import {renderResultTab} from './views/result.js';
import {renderErrorsTab} from './views/errors.js';

const RESULT_TAB = 'result';
const ERRORS_TAB = 'errors';

export class AnalysisPanel {
    /**
     * @param {object} options
     * @param {function(string, ?object): string} options.t translator (messages.js)
     * @param {object} options.messages merged addon l10n map, for the data-driven block /
     *   extension name lookups
     * @param {object} options.settings settings snapshot (analysis-runner.js `readSettings`)
     * @param {?function(string): ?string} options.getBlockColor
     * @param {function(): string} options.getProjectTitle read on every render, so renaming a
     *   project while the panel is open is reflected
     */
    constructor ({t, messages, settings, getBlockColor, getProjectTitle}) {
        this.t = t;
        this.messages = messages;
        this.settings = settings || {};
        this.getBlockColor = getBlockColor || null;
        this.getProjectTitle = getProjectTitle || (() => '');

        this.state = {
            activeTab: RESULT_TAB,
            summary: null,
            extensionDisplayInfo: null,
            extensionDataInfo: null,
            loading: false,
            error: null
        };

        // Last tab count, so the underline can be re-placed without animating when the errors
        // tab appears or disappears with an analysis result.
        this.tabCount = 0;
        this.activeTabButton = null;
        this.unwatchIndicator = null;

        // One delegated listener instead of one per button; `data-tab` marks the targets
        // (the tab buttons and the "View Errors" button).
        this.handleClick = event => {
            const target = event.target && event.target.closest && event.target.closest('[data-tab]');
            if (target && this.root.contains(target)) {
                this.setActiveTab(target.getAttribute('data-tab'));
            }
        };

        this.root = div(styles.modalContent);
        this.body = div(styles.body);
        this.tabStrip = div(styles.tabContainer);
        // The underline is one element shared by every tab and re-positioned on switch, so it
        // visibly travels; a per-tab `::after` could only blink out in one place and in at
        // another. It must outlive every tab rebuild, hence it is created once, here.
        this.tabIndicator = span(styles.tabIndicator);
        this.tabContent = div(styles.tabContent);
    }

    /**
     * Build the panel inside a modal's `content` node.
     * @param {HTMLElement} contentEl
     */
    mount (contentEl) {
        append(this.tabStrip, this.tabIndicator);
        append(this.body, this.tabStrip, this.tabContent);
        append(this.root, this.body);
        contentEl.appendChild(this.root);

        this.root.addEventListener('click', this.handleClick);
        this.render();

        // Keeps the bar aligned through layout changes the panel does not control (the modal
        // resizing, tab labels changing length with the language). It also fires once on
        // observe, which is what places the bar the first time the strip is measurable.
        this.unwatchIndicator = watchTabIndicator(
            this.tabStrip,
            this.tabIndicator,
            () => this.activeTabButton
        );
    }

    // ===== Analysis state =====

    /** An analysis just started. */
    setLoading () {
        this.state.loading = true;
        this.state.error = null;
        this.refresh();
    }

    /**
     * @param {string} textMessage
     */
    setError (textMessage) {
        this.state.loading = false;
        this.state.error = textMessage;
        this.refresh();
    }

    /**
     * @param {object} result `{summary, extensionDisplayInfo, extensionDataInfo}`
     */
    setResult ({summary, extensionDisplayInfo, extensionDataInfo}) {
        this.state.loading = false;
        this.state.error = null;
        this.state.summary = summary;
        this.state.extensionDisplayInfo = extensionDisplayInfo;
        this.state.extensionDataInfo = extensionDataInfo;
        this.refresh();
    }

    // ===== Tabs =====

    /**
     * @param {string} tab 'result' | 'errors'
     */
    setActiveTab (tab) {
        if (!tab || tab === this.state.activeTab) return;
        this.state.activeTab = tab;
        this.renderTabs();
        this.renderContent();
        this.syncIndicator(true);
    }

    /** Re-render the tab strip and the body after a state change. */
    refresh () {
        const errorCount = this.state.summary && this.state.summary.errors ?
            this.state.summary.errors.length :
            0;
        // A re-analysis can clear the errors away; if the user was on the errors tab it would
        // vanish out from under them and leave the underline with no tab to sit under.
        if (this.state.activeTab === ERRORS_TAB && errorCount === 0) {
            this.state.activeTab = RESULT_TAB;
        }
        this.renderTabs();
        this.renderContent();
    }

    render () {
        this.renderTabs();
        this.renderContent();
    }

    renderTabs () {
        const {activeTab, summary} = this.state;
        const errorCount = summary && summary.errors ? summary.errors.length : 0;
        const hasErrors = errorCount > 0;

        const buttons = [this.createTabButton(RESULT_TAB, this.t('tabResult'), false, 0)];
        if (hasErrors) {
            buttons.push(this.createTabButton(ERRORS_TAB, this.t('tabErrors'), true, errorCount));
        }

        // `fill` re-appends the same indicator node, so it is moved back to the end rather than
        // recreated -- that is what lets it slide when a tab appears or disappears.
        fill(this.tabStrip, ...buttons, this.tabIndicator);
        this.activeTabButton = this.tabStrip.querySelector(`.${styles.tabActive}`);

        if (buttons.length !== this.tabCount) {
            this.tabCount = buttons.length;
            this.syncIndicator(false);
        }
    }

    /**
     * @param {string} tab
     * @param {string} label
     * @param {boolean} isError
     * @param {number} errorCount 0 for a plain tab
     * @returns {HTMLElement}
     */
    createTabButton (tab, label, isError, errorCount) {
        const button = el('button', cx(
            styles.tabButton,
            this.state.activeTab === tab && styles.tabActive,
            isError && styles.tabError
        ), {
            text: label,
            attrs: {type: 'button'},
            dataset: {tab}
        });
        if (errorCount > 0) {
            button.appendChild(span(styles.errorBadge, {text: `[${errorCount}]`}));
        }
        return button;
    }

    /**
     * @param {boolean} animate false for the first placement and for re-placements after a
     *   layout change, where sliding from wherever the bar happened to be would be wrong
     */
    syncIndicator (animate) {
        placeTabIndicator(this.tabStrip, this.tabIndicator, this.activeTabButton, animate);
    }

    renderContent () {
        const ctx = this.createContext();
        const node = this.state.activeTab === ERRORS_TAB ?
            renderErrorsTab(ctx) :
            renderResultTab(ctx);
        fill(this.tabContent, node);
    }

    /**
     * Everything a view may read. Built fresh on every render so the project title is current.
     * @returns {object}
     */
    createContext () {
        return {
            t: this.t,
            messages: this.messages,
            settings: this.settings,
            getBlockColor: this.getBlockColor,
            projectTitle: this.getProjectTitle(),
            summary: this.state.summary,
            extensionDisplayInfo: this.state.extensionDisplayInfo,
            extensionDataInfo: this.state.extensionDataInfo,
            loading: this.state.loading,
            error: this.state.error
        };
    }

    destroy () {
        if (this.unwatchIndicator) {
            this.unwatchIndicator();
            this.unwatchIndicator = null;
        }
        if (this.root) this.root.removeEventListener('click', this.handleClick);
        this.activeTabButton = null;
    }
}
