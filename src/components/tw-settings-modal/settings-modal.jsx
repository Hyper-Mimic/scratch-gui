import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import FancyCheckbox from '../tw-fancy-checkbox/checkbox.jsx';
import Input from '../forms/input.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import DocumentationLink from '../tw-documentation-link/documentation-link.jsx';
import styles from './settings-modal.css';
import inputStyles from '../forms/input.css';
import helpIcon from './help-icon.svg';
import {APP_NAME} from '../../lib/brand.js';
import {createWorkspaceBackgroundPanel} from '../../lib/workspace-background/index.js';
import {
    getSettings,
    setSetting,
    SETTING_BLOCK_PALETTE_STYLE,
    BLOCK_PALETTE_STYLE_DEFAULT,
    BLOCK_PALETTE_STYLE_UNCLIP,
    BLOCK_PALETTE_STYLE_RESIZE,
    SETTING_CONTEXT_MENU_STYLE,
    CONTEXT_MENU_STYLE_DEFAULT,
    CONTEXT_MENU_STYLE_LOOSE,
    SETTING_COMMENT_MARKDOWN_EDITOR,
    SETTING_ADD_README_CONTEXT_MENU,
    SETTING_ADD_FRAME_CONTEXT_MENU,
    SETTING_CANCEL_EDITOR_MARGINS,
    SETTING_MERGE_ALL_SETTINGS,
    SETTING_DISABLE_GUI_CONTEXT_MENU,
    SETTING_AUTO_DISPLAY_README,
    SETTING_README_HTML_SUPPORT,
    SETTING_HIDE_GUI_WATERMARK,
    SETTING_WORKSPACE_TOOLBOX,
    SETTING_WINDOW_MODAL
} from '../../lib/hypermimic-settings.js';

/* eslint-disable react/no-multi-comp */

const BufferedInput = BufferedInputHOC(Input);

const messages = defineMessages({
    title: {
        defaultMessage: 'Advanced Settings',
        description: 'Title of settings modal',
        id: 'tw.settingsModal.title'
    },
    help: {
        defaultMessage: 'Click for help',
        description: 'Hover text of help icon in settings',
        id: 'tw.settingsModal.help'
    },
    tabProject: {
        defaultMessage: 'Project',
        description: 'Tab in settings modal',
        id: 'tw.settingsModal.tabProject'
    },
    tabHyperMimicGui: {
        defaultMessage: 'HyperMimic GUI',
        description: 'Tab in settings modal',
        id: 'tw.settingsModal.tabHyperMimicGui'
    },
    tabHyperMimicWorkspace: {
        defaultMessage: 'HyperMimic Workspace',
        description: 'Tab in settings modal',
        id: 'tw.settingsModal.tabHyperMimicWorkspace'
    },
    workSpace: {
        defaultMessage: 'Workspace',
        description: 'Settings modal section in the HyperMimic tab',
        id: 'hm.settingsModal.workSpace'
    },
    workspaceBackground: {
        defaultMessage: 'Workspace Background',
        description: 'Settings modal section in the HyperMimic tab',
        id: 'hm.settingsModal.workspaceBackground'
    },
    blockPaletteStyle: {
        defaultMessage: 'Block Palette Style:',
        description: 'Block palette style setting',
        id: 'hm.settingsModal.blockPaletteStyle'
    },
    blockPaletteStyleHelp: {
        // eslint-disable-next-line max-len
        defaultMessage: 'Default shows the block palette the way TurboWarp does, clipping anything that does not fit. Unclip Block Palette reveals the full contents of a partially hidden block while you hover it. Allow Changing the Width of the Block Palette lets you resize the palette so it can show more or less at once.',
        description: 'Block palette style setting help',
        id: 'hm.settingsModal.blockPaletteStyleHelp'
    },
    blockPaletteStyleDefault: {
        defaultMessage: 'Default (Clip Block Palette)',
        description: 'Option of the block palette style setting',
        id: 'hm.settingsModal.blockPaletteStyle.default'
    },
    blockPaletteStyleUnclip: {
        defaultMessage: 'Unclip Block Palette',
        description: 'Option of the block palette style setting',
        id: 'hm.settingsModal.blockPaletteStyle.unclip'
    },
    blockPaletteStyleResize: {
        defaultMessage: 'Allow Changing the Width of the Block Palette',
        description: 'Option of the block palette style setting',
        id: 'hm.settingsModal.blockPaletteStyle.resize'
    },
    contextMenuStyle: {
        defaultMessage: 'Context Menu Style:',
        description: 'Context menu style setting',
        id: 'hm.settingsModal.contextMenuStyle'
    },
    contextMenuStyleHelp: {
        defaultMessage: 'Default behaves the same as TurboWarp. Loose gives the editor context menus more room by increasing their spacing.',
        description: 'Context menu style setting help',
        id: 'hm.settingsModal.contextMenuStyleHelp'
    },
    contextMenuStyleDefault: {
        defaultMessage: 'Default',
        description: 'Option of the context menu style setting',
        id: 'hm.settingsModal.contextMenuStyle.default'
    },
    contextMenuStyleLoose: {
        defaultMessage: 'Loose',
        description: 'Option of the context menu style setting',
        id: 'hm.settingsModal.contextMenuStyle.loose'
    },
    commentMarkdownEditor: {
        defaultMessage: 'Comment Markdown Editor',
        description: 'Comment markdown editor setting',
        id: 'hm.settingsModal.commentMarkdownEditor'
    },
    commentMarkdownEditorHelp: {
        // eslint-disable-next-line max-len
        defaultMessage: 'Adds a button to the top bar of comments that switches the current comment between a Markdown preview and plain text.',
        description: 'Comment markdown editor setting help',
        id: 'hm.settingsModal.commentMarkdownEditorHelp'
    },
    addReadmeContextMenu: {
        defaultMessage: "Add 'Add README' to Context Menu Item",
        description: 'Add README to context menu setting',
        id: 'hm.settingsModal.addReadmeContextMenu'
    },
    addReadmeContextMenuHelp: {
        defaultMessage: "Adds an 'Add README' item to the context menu that adds a README comment inside the sprite. Once a README comment is added, a button is added to the small toolbar at the top right of the workspace; clicking it lets you view all READMEs in that sprite, and the popup has tabs to preview different READMEs.",
        description: 'Add README to context menu setting help',
        id: 'hm.settingsModal.addReadmeContextMenuHelp'
    },
    addFrameContextMenu: {
        defaultMessage: "Add 'Add Frame' to Context Menu Item",
        description: 'Add Frame to context menu setting',
        id: 'hm.settingsModal.addFrameContextMenu'
    },
    addFrameContextMenuHelp: {
        defaultMessage: 'Adds an "Add Frame" item to the context menu. A frame is a collapsible, deletable container that can hold many blocks. Compatible with MistWarp (colors are not) and Gandi, among others.',
        description: 'Add Frame to context menu setting help',
        id: 'hm.settingsModal.addFrameContextMenuHelp'
    },
    interfaceSection: {
        defaultMessage: 'Interface',
        description: 'Settings modal section in the HyperMimic tab',
        id: 'hm.settingsModal.interface'
    },
    cancelEditorMargins: {
        defaultMessage: 'Cancel the margins and borders of various parts of the editor',
        description: 'Cancel editor margins and borders setting',
        id: 'hm.settingsModal.cancelEditorMargins'
    },
    cancelEditorMarginsHelp: {
        defaultMessage: 'Removes the margins and rounded corners around the backpack, the stage and the sprite stage panel, just like AstraEditor.',
        description: 'Cancel editor margins and borders setting help',
        id: 'hm.settingsModal.cancelEditorMarginsHelp'
    },
    mergeAllSettings: {
        defaultMessage: 'Merge all settings into one interface',
        description: 'Merge all settings into one interface setting',
        id: 'hm.settingsModal.mergeAllSettings'
    },
    mergeAllSettingsHelp: {
        defaultMessage: 'Organizes and categorizes the settings from the settings menu at the top right of the menu bar, the advanced menu and other settings, and integrates them into one popup, just like MistWarp and Gandi.',
        description: 'Merge all settings into one interface setting help',
        id: 'hm.settingsModal.mergeAllSettingsHelp'
    },
    disableGuiContextMenu: {
        defaultMessage: 'Disable the long-press-to-show-context-menu behavior in the GUI',
        description: 'Disable the long-press context menu setting',
        id: 'hm.settingsModal.disableGuiContextMenu'
    },
    disableGuiContextMenuHelp: {
        defaultMessage: 'Stops holding down the mouse button or touching and holding on sprites, costumes, sounds and monitors from opening the context menu. Right-clicking still opens it as usual.',
        description: 'Disable the long-press context menu setting help',
        id: 'hm.settingsModal.disableGuiContextMenuHelp'
    },
    readme: {
        defaultMessage: 'README',
        description: 'Settings modal section in the HyperMimic tab',
        id: 'hm.settingsModal.readme'
    },
    readmeNotice: {
        // eslint-disable-next-line max-len
        defaultMessage: 'Enable "Add \'Add README\' to Context Menu Item" above before these settings can be edited.',
        description: 'Notice above the README settings that depend on another setting',
        id: 'hm.settingsModal.readmeNotice'
    },
    autoDisplayReadme: {
        defaultMessage: 'Automatically Display README',
        description: 'Automatically display README setting',
        id: 'hm.settingsModal.autoDisplayReadme'
    },
    autoDisplayReadmeHelp: {
        defaultMessage: 'After a project is opened, if there is a sprite named README, the README inside that sprite will automatically open in a popup, just like AstraEditor.',
        description: 'Automatically display README setting help',
        id: 'hm.settingsModal.autoDisplayReadmeHelp'
    },
    readmeHtmlSupport: {
        defaultMessage: 'Enable HTML Support',
        description: 'Enable HTML support in README setting',
        id: 'hm.settingsModal.readmeHtmlSupport'
    },
    readmeHtmlSupportHelp: {
        defaultMessage: 'Allows README to display HTML tags, just like AstraEditor.',
        description: 'Enable HTML support in README setting help',
        id: 'hm.settingsModal.readmeHtmlSupportHelp'
    },
    readmeHtmlSupportWarning: {
        defaultMessage: 'Some malicious READMEs may contain dangerous HTML content. We would like to add detection to prevent this, but that is very difficult. Therefore, only enable this setting if you trust the project you are opening and understand the risks.',
        description: 'Warning inside the HTML support help',
        id: 'hm.settingsModal.readmeHtmlSupportWarning'
    },
    hideGuiWatermark: {
        defaultMessage: 'Hide the sprite watermark in the top-left of the workspace',
        description: 'Hide the GUI sprite watermark setting',
        id: 'hm.settingsModal.hideGuiWatermark'
    },
    hideGuiWatermarkHelp: {
        defaultMessage: 'Hides the small sprite watermark shown in the top-left corner of the block workspace.',
        description: 'Hide the GUI sprite watermark setting help',
        id: 'hm.settingsModal.hideGuiWatermarkHelp'
    },
    workspaceToolbox: {
        defaultMessage: 'Workspace Toolbox',
        description: 'Workspace toolbox setting',
        id: 'hm.settingsModal.workspaceToolbox'
    },
    workspaceToolboxHelp: {
        defaultMessage: 'Adds a toolbox button in the top-right corner of the block workspace that expands into a set of tool buttons.',
        description: 'Workspace toolbox setting help',
        id: 'hm.settingsModal.workspaceToolboxHelp'
    },
    windowModal: {
        defaultMessage: 'Convert modals to windows',
        description: 'Window modal setting',
        id: 'hm.settingsModal.windowModal'
    },
    windowModalHelp: {
        defaultMessage: 'Makes every modal draggable by its title bar and resizable from its edges and corners, like a desktop window.',
        description: 'Window modal setting help',
        id: 'hm.settingsModal.windowModalHelp'
    }
});

const BLOCK_PALETTE_STYLE_OPTIONS = [
    {
        value: BLOCK_PALETTE_STYLE_DEFAULT,
        message: messages.blockPaletteStyleDefault
    },
    {
        value: BLOCK_PALETTE_STYLE_UNCLIP,
        message: messages.blockPaletteStyleUnclip
    },
    {
        value: BLOCK_PALETTE_STYLE_RESIZE,
        message: messages.blockPaletteStyleResize
    }
];

const CONTEXT_MENU_STYLE_OPTIONS = [
    {
        value: CONTEXT_MENU_STYLE_DEFAULT,
        message: messages.contextMenuStyleDefault
    },
    {
        value: CONTEXT_MENU_STYLE_LOOSE,
        message: messages.contextMenuStyleLoose
    }
];

const LearnMore = props => (
    <React.Fragment>
        {' '}
        <DocumentationLink {...props}>
            <FormattedMessage
                defaultMessage="Learn more."
                id="gui.alerts.cloudInfoLearnMore"
            />
        </DocumentationLink>
    </React.Fragment>
);

class UnwrappedSetting extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickHelp'
        ]);
        this.state = {
            helpVisible: false
        };
    }
    componentDidUpdate (prevProps) {
        if (this.props.active && !prevProps.active) {
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({
                helpVisible: true
            });
        }
    }
    handleClickHelp () {
        this.setState(prevState => ({
            helpVisible: !prevState.helpVisible
        }));
    }
    render () {
        const hasHelp = Boolean(this.props.help || this.props.slug);
        return (
            <div
                className={classNames(styles.setting, {
                    [styles.active]: this.props.active,
                    [styles.settingDisabled]: this.props.disabled
                })}
            >
                <div className={styles.label}>
                    {this.props.primary}
                    {hasHelp && (
                        <button
                            className={styles.helpIcon}
                            onClick={this.handleClickHelp}
                            title={this.props.intl.formatMessage(messages.help)}
                        >
                            <img
                                src={helpIcon}
                                draggable={false}
                            />
                        </button>
                    )}
                </div>
                {hasHelp && (
                    <div
                        className={classNames(styles.detail, {
                            [styles.detailCollapsed]: !this.state.helpVisible
                        })}
                    >
                        <div className={styles.detailInner}>
                            {this.props.help}
                            {this.props.slug && <LearnMore slug={this.props.slug} />}
                        </div>
                    </div>
                )}
                {this.props.secondary}
            </div>
        );
    }
}
UnwrappedSetting.propTypes = {
    intl: intlShape,
    active: PropTypes.bool,
    disabled: PropTypes.bool,
    help: PropTypes.node,
    primary: PropTypes.node,
    secondary: PropTypes.node,
    slug: PropTypes.string
};
const Setting = injectIntl(UnwrappedSetting);

const BooleanSetting = ({value, onChange, label, disabled, ...props}) => (
    <Setting
        {...props}
        disabled={disabled}
        active={value && !disabled}
        primary={
            <label className={classNames(styles.label, {
                [styles.labelDisabled]: disabled
            })}
            >
                <FancyCheckbox
                    className={styles.checkbox}
                    checked={value}
                    disabled={disabled}
                    onChange={onChange}
                />
                {label}
            </label>
        }
    />
);
BooleanSetting.propTypes = {
    onChange: PropTypes.func.isRequired,
    value: PropTypes.bool.isRequired,
    label: PropTypes.node.isRequired,
    disabled: PropTypes.bool
};

const HighQualityPen = props => (
    <BooleanSetting
        {...props}
        label={
            <FormattedMessage
                defaultMessage="High Quality Pen"
                description="High quality pen setting"
                id="tw.settingsModal.highQualityPen"
            />
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Allows pen projects to render at higher resolutions and disables some coordinate rounding in the editor. Not all projects benefit from this setting and it may impact performance."
                description="High quality pen setting help"
                id="tw.settingsModal.highQualityPenHelp"
            />
        }
        slug="high-quality-pen"
    />
);

const CustomFPS = props => (
    <BooleanSetting
        value={props.framerate !== 30}
        onChange={props.onChange}
        label={
            <FormattedMessage
                defaultMessage="60 FPS (Custom FPS)"
                description="FPS setting"
                id="tw.settingsModal.fps"
            />
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Runs scripts 60 times per second instead of 30. Most projects will not work properly with this enabled. You should try Interpolation with 60 FPS mode disabled if that is the case. {customFramerate}."
                description="FPS setting help"
                id="tw.settingsModal.fpsHelp"
                values={{
                    customFramerate: (
                        <a
                            onClick={props.onCustomizeFramerate}
                            tabIndex="0"
                        >
                            <FormattedMessage
                                defaultMessage="Click to use a framerate other than 30 or 60"
                                description="FPS settings help"
                                id="tw.settingsModal.fpsHelp.customFramerate"
                            />
                        </a>
                    )
                }}
            />
        }
        slug="custom-fps"
    />
);
CustomFPS.propTypes = {
    framerate: PropTypes.number,
    onChange: PropTypes.func,
    onCustomizeFramerate: PropTypes.func
};

const Interpolation = props => (
    <BooleanSetting
        {...props}
        label={
            <FormattedMessage
                defaultMessage="Interpolation"
                description="Interpolation setting"
                id="tw.settingsModal.interpolation"
            />
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Makes projects appear smoother by interpolating sprite motion. Interpolation should not be used on 3D projects, raytracers, pen projects, and laggy projects as interpolation will make them run slower without making them appear smoother."
                description="Interpolation setting help"
                id="tw.settingsModal.interpolationHelp"
            />
        }
        slug="interpolation"
    />
);

const InfiniteClones = props => (
    <BooleanSetting
        {...props}
        label={
            <FormattedMessage
                defaultMessage="Infinite Clones"
                description="Infinite Clones setting"
                id="tw.settingsModal.infiniteClones"
            />
        }
        help={
            <FormattedMessage
                defaultMessage="Disables Scratch's 300 clone limit."
                description="Infinite Clones setting help"
                id="tw.settingsModal.infiniteClonesHelp"
            />
        }
        slug="infinite-clones"
    />
);

const RemoveFencing = props => (
    <BooleanSetting
        {...props}
        label={
            <FormattedMessage
                defaultMessage="Remove Fencing"
                description="Remove Fencing setting"
                id="tw.settingsModal.removeFencing"
            />
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Allows sprites to move offscreen, become as large or as small as they want, and makes touching blocks work offscreen."
                description="Remove Fencing setting help"
                id="tw.settingsModal.removeFencingHelp"
            />
        }
        slug="remove-fencing"
    />
);

const RemoveMiscLimits = props => (
    <BooleanSetting
        {...props}
        label={
            <FormattedMessage
                defaultMessage="Remove Miscellaneous Limits"
                description="Remove Miscellaneous Limits setting"
                id="tw.settingsModal.removeMiscLimits"
            />
        }
        help={
            <FormattedMessage
                defaultMessage="Removes sound effect limits and pen size limits."
                description="Remove Miscellaneous Limits setting help"
                id="tw.settingsModal.removeMiscLimitsHelp"
            />
        }
        slug="remove-misc-limits"
    />
);

const WarpTimer = props => (
    <BooleanSetting
        {...props}
        label={
            <FormattedMessage
                defaultMessage="Warp Timer"
                description="Warp Timer setting"
                id="tw.settingsModal.warpTimer"
            />
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Makes scripts check if they are stuck in a long or infinite loop and run at a low framerate instead of getting stuck until the loop finishes. This fixes most crashes but has a significant performance impact, so it's only enabled by default in the editor."
                description="Warp Timer help"
                id="tw.settingsModal.warpTimerHelp"
            />
        }
        slug="warp-timer"
    />
);

const DisableCompiler = props => (
    <BooleanSetting
        {...props}
        label={
            <FormattedMessage
                defaultMessage="Disable Compiler"
                description="Disable Compiler setting"
                id="tw.settingsModal.disableCompiler"
            />
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Disables the {APP_NAME} compiler. You may want to enable this while editing projects so that scripts update immediately. Otherwise, you should never enable this."
                description="Disable Compiler help"
                id="tw.settingsModal.disableCompilerHelp"
                values={{
                    APP_NAME
                }}
            />
        }
        slug="disable-compiler"
    />
);

const CustomStageSize = ({
    customStageSizeEnabled,
    stageWidth,
    onStageWidthChange,
    stageHeight,
    onStageHeightChange
}) => (
    <Setting
        active={customStageSizeEnabled}
        primary={(
            <div className={classNames(styles.label, styles.customStageSize)}>
                <FormattedMessage
                    defaultMessage="Custom Stage Size:"
                    description="Custom Stage Size option"
                    id="tw.settingsModal.customStageSize"
                />
                <BufferedInput
                    value={stageWidth}
                    onSubmit={onStageWidthChange}
                    className={styles.customStageSizeInput}
                    type="number"
                    min="0"
                    max="1024"
                    step="1"
                />
                <span>{'×'}</span>
                <BufferedInput
                    value={stageHeight}
                    onSubmit={onStageHeightChange}
                    className={styles.customStageSizeInput}
                    type="number"
                    min="0"
                    max="1024"
                    step="1"
                />
            </div>
        )}
        secondary={
            (stageWidth >= 1000 || stageHeight >= 1000) && (
                <div className={styles.warning}>
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Using a custom stage size this large is not recommended! Instead, use a lower size with the same aspect ratio and let fullscreen mode upscale it to match the user's display."
                        description="Warning about using stages that are too large in settings modal"
                        id="tw.settingsModal.largeStageWarning"
                    />
                    <LearnMore slug="custom-stage-size" />
                </div>
            )
        }
        help={(
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Changes the size of the Scratch stage from 480x360 to something else. Try 640x360 to make the stage widescreen. Very few projects will handle this properly."
                description="Custom Stage Size option"
                id="tw.settingsModal.customStageSizeHelp"
            />
        )}
        slug="custom-stage-size"
    />
);
CustomStageSize.propTypes = {
    customStageSizeEnabled: PropTypes.bool,
    stageWidth: PropTypes.number,
    onStageWidthChange: PropTypes.func,
    stageHeight: PropTypes.number,
    onStageHeightChange: PropTypes.func
};

const StoreProjectOptions = ({onStoreProjectOptions}) => (
    <div className={styles.setting}>
        <div>
            <button
                onClick={onStoreProjectOptions}
                className={styles.button}
            >
                <FormattedMessage
                    defaultMessage="Store settings in project"
                    description="Button in settings modal"
                    id="tw.settingsModal.storeProjectOptions"
                />
            </button>
            <p className={styles.note}>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="Stores the selected settings in the project so they will be automatically applied when {APP_NAME} loads this project. Warp timer and disable compiler will not be saved."
                    description="Help text for the store settings in project button"
                    id="tw.settingsModal.storeProjectOptionsHelp"
                    values={{
                        APP_NAME
                    }}
                />
            </p>
        </div>
    </div>
);
StoreProjectOptions.propTypes = {
    onStoreProjectOptions: PropTypes.func
};

const DropdownSetting = ({label, value, options, onChange, help, slug}) => (
    <Setting
        help={help}
        slug={slug}
        primary={
            <div className={classNames(styles.label, styles.dropdownSetting)}>
                <span>{label}</span>
                <select
                    className={styles.select}
                    value={value}
                    onChange={onChange}
                >
                    {options.map(option => (
                        <option
                            key={option.value}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        }
    />
);
DropdownSetting.propTypes = {
    label: PropTypes.node,
    value: PropTypes.string,
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.string.isRequired,
        label: PropTypes.node.isRequired
    })).isRequired,
    onChange: PropTypes.func,
    help: PropTypes.node,
    slug: PropTypes.string
};

const Header = ({children, collapsed, onToggle}) => (
    <div className={styles.header}>
        {onToggle && (
            <button
                className={classNames(styles.headerToggle, {
                    [styles.headerToggleCollapsed]: collapsed
                })}
                onClick={onToggle}
                aria-expanded={!collapsed}
            >
                <span className={styles.headerToggleIcon} />
            </button>
        )}
        {children}
        <div className={styles.divider} />
    </div>
);
Header.propTypes = {
    children: PropTypes.node,
    collapsed: PropTypes.bool,
    onToggle: PropTypes.func
};

/**
 * A header followed by the settings it owns. When `onToggle` is given the header grows a chevron
 * on its left which folds the section away.
 *
 * The fold is animated with `grid-template-rows: 1fr -> 0fr` rather than a max-height guess: the
 * track can be transitioned between a real size and zero, so the section always ends up exactly
 * closed without a hardcoded height to keep in sync with its contents. The inner element has to
 * opt into `overflow: hidden; min-height: 0` for the row to be allowed to shrink below its content.
 */
const Section = ({title, collapsed, onToggle, children}) => (
    <div className={styles.section}>
        <Header
            collapsed={collapsed}
            onToggle={onToggle}
        >
            {title}
        </Header>
        <div
            className={classNames(styles.sectionContent, {
                [styles.sectionContentCollapsed]: collapsed
            })}
        >
            <div className={styles.sectionContentInner}>
                {children}
            </div>
        </div>
    </div>
);
Section.propTypes = {
    children: PropTypes.node,
    title: PropTypes.node,
    collapsed: PropTypes.bool,
    onToggle: PropTypes.func
};

const TAB_PROJECT = 'project';
const TAB_HYPERMIMIC_GUI = 'hypermimic-gui';
const TAB_HYPERMIMIC_WORKSPACE = 'hypermimic-workspace';

class SettingsModalComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSelectProjectTab',
            'handleSelectHyperMimicGuiTab',
            'handleSelectHyperMimicWorkspaceTab',
            'handleSettingChange',
            'handleToggleSetting',
            'handleDropdownChange',
            'handleToggleSection',
            'setWorkspaceBackgroundHost',
            'mountWorkspaceBackgroundPanel',
            'unmountWorkspaceBackgroundPanel'
        ]);
        this.state = {
            selectedTab: TAB_PROJECT,
            settings: getSettings(),
            // Section names that have been folded away. Purely presentational, so it is not worth
            // a trip through the settings storage. Workspace Background starts folded: it is the
            // bulkiest block in the tab and most people never touch it.
            collapsedSections: {workspaceBackground: true}
        };
        this.workspaceBackgroundHost = null;
        this.workspaceBackgroundUnmount = null;
    }
    componentWillUnmount () {
        this.unmountWorkspaceBackgroundPanel();
    }
    /**
     * react-modal only starts rendering its children one commit after this component mounts
     * (ModalPortal renders null until its own componentDidMount flips state.isOpen), so by the time
     * componentDidMount runs an object ref would still be null and the panel would silently never
     * be built. A callback ref is used instead: it fires the moment the host node is attached,
     * whether that happens on the first commit or a later one.
     */
    setWorkspaceBackgroundHost (node) {
        this.workspaceBackgroundHost = node;
        if (node) {
            this.mountWorkspaceBackgroundPanel();
        } else {
            this.unmountWorkspaceBackgroundPanel();
        }
    }
    mountWorkspaceBackgroundPanel () {
        const host = this.workspaceBackgroundHost;
        if (!host || this.workspaceBackgroundUnmount) {
            return;
        }
        Promise.resolve(createWorkspaceBackgroundPanel({
            intl: this.props.intl,
            // The panel is built outside this CSS module, so it cannot know our class names.
            // Handing ours over is what makes its dropdowns and number fields match the modal's.
            selectClassName: styles.select,
            inputFormClass: inputStyles.inputForm
        })).then(({element}) => {
            if (!this.workspaceBackgroundHost) {
                // The modal was closed while the panel was still being built.
                return;
            }
            host.appendChild(element);
            this.workspaceBackgroundElement = element;
            this.workspaceBackgroundUnmount = () => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            };
        }).catch(e => {
            console.warn('[HyperMimic] Failed to build the workspace background panel:', e);
        });
    }
    unmountWorkspaceBackgroundPanel () {
        if (this.workspaceBackgroundUnmount) {
            this.workspaceBackgroundUnmount();
            this.workspaceBackgroundUnmount = null;
            this.workspaceBackgroundElement = null;
        }
    }
    handleSelectProjectTab () {
        this.setState({selectedTab: TAB_PROJECT});
    }
    handleSelectHyperMimicGuiTab () {
        this.setState({selectedTab: TAB_HYPERMIMIC_GUI});
    }
    handleSelectHyperMimicWorkspaceTab () {
        this.setState({selectedTab: TAB_HYPERMIMIC_WORKSPACE});
    }
    handleSettingChange (key, value) {
        setSetting(key, value);
        this.setState(prevState => ({
            settings: Object.assign({}, prevState.settings, {
                [key]: value
            })
        }));
    }
    handleToggleSetting (key) {
        return () => this.handleSettingChange(key, !this.state.settings[key]);
    }
    handleDropdownChange (key) {
        return e => this.handleSettingChange(key, e.target.value);
    }
    handleToggleSection (name) {
        return () => {
            this.setState(prevState => ({
                collapsedSections: Object.assign({}, prevState.collapsedSections, {
                    [name]: !prevState.collapsedSections[name]
                })
            }));
        };
    }
    render () {
        const {selectedTab} = this.state;
        const {settings} = this.state;
        const isProjectTab = selectedTab === TAB_PROJECT;
        const isHyperMimicGuiTab = selectedTab === TAB_HYPERMIMIC_GUI;
        const isHyperMimicWorkspaceTab = selectedTab === TAB_HYPERMIMIC_WORKSPACE;
        const intl = this.props.intl;
        return (
            <Modal
                className={styles.modalContent}
                onRequestClose={this.props.onClose}
                contentLabel={this.props.intl.formatMessage(messages.title)}
                id="settingsModal"
            >
                <Box className={styles.body}>
                    <div className={styles.tabsContainer}>
                        <button
                            className={classNames(styles.tabButton, {
                                [styles.tabActive]: isProjectTab
                            })}
                            onClick={this.handleSelectProjectTab}
                        >
                            {this.props.intl.formatMessage(messages.tabProject)}
                        </button>
                        <button
                            className={classNames(styles.tabButton, {
                                [styles.tabActive]: isHyperMimicGuiTab
                            })}
                            onClick={this.handleSelectHyperMimicGuiTab}
                        >
                            {this.props.intl.formatMessage(messages.tabHyperMimicGui)}
                        </button>
                        <button
                            className={classNames(styles.tabButton, {
                                [styles.tabActive]: isHyperMimicWorkspaceTab
                            })}
                            onClick={this.handleSelectHyperMimicWorkspaceTab}
                        >
                            {this.props.intl.formatMessage(messages.tabHyperMimicWorkspace)}
                        </button>
                    </div>
                    <div className={styles.tabContent}>
                        <div
                            className={styles.tabPanel}
                            style={{display: isProjectTab ? '' : 'none'}}
                        >
                            <Section
                                title={(
                                    <FormattedMessage
                                        defaultMessage="Featured"
                                        description="Settings modal section"
                                        id="tw.settingsModal.featured"
                                    />
                                )}
                                collapsed={this.state.collapsedSections.featured}
                                onToggle={this.handleToggleSection('featured')}
                            >
                                <CustomFPS
                                    framerate={this.props.framerate}
                                    onChange={this.props.onFramerateChange}
                                    onCustomizeFramerate={this.props.onCustomizeFramerate}
                                />
                                <Interpolation
                                    value={this.props.interpolation}
                                    onChange={this.props.onInterpolationChange}
                                />
                                <HighQualityPen
                                    value={this.props.highQualityPen}
                                    onChange={this.props.onHighQualityPenChange}
                                />
                                <WarpTimer
                                    value={this.props.warpTimer}
                                    onChange={this.props.onWarpTimerChange}
                                />
                            </Section>
                            <Section
                                title={(
                                    <FormattedMessage
                                        defaultMessage="Remove Limits"
                                        description="Settings modal section"
                                        id="tw.settingsModal.removeLimits"
                                    />
                                )}
                                collapsed={this.state.collapsedSections.removeLimits}
                                onToggle={this.handleToggleSection('removeLimits')}
                            >
                                <InfiniteClones
                                    value={this.props.infiniteClones}
                                    onChange={this.props.onInfiniteClonesChange}
                                />
                                <RemoveFencing
                                    value={this.props.removeFencing}
                                    onChange={this.props.onRemoveFencingChange}
                                />
                                <RemoveMiscLimits
                                    value={this.props.removeLimits}
                                    onChange={this.props.onRemoveLimitsChange}
                                />
                            </Section>
                            <Section
                                title={(
                                    <FormattedMessage
                                        defaultMessage="Danger Zone"
                                        description="Settings modal section"
                                        id="tw.settingsModal.dangerZone"
                                    />
                                )}
                                collapsed={this.state.collapsedSections.dangerZone}
                                onToggle={this.handleToggleSection('dangerZone')}
                            >
                                {!this.props.isEmbedded && (
                                    <CustomStageSize
                                        {...this.props}
                                    />
                                )}
                                <DisableCompiler
                                    value={this.props.disableCompiler}
                                    onChange={this.props.onDisableCompilerChange}
                                />
                                {!this.props.isEmbedded && (
                                    <StoreProjectOptions
                                        {...this.props}
                                    />
                                )}
                            </Section>
                        </div>
                        <div
                            className={styles.tabPanel}
                            style={{display: isHyperMimicGuiTab ? '' : 'none'}}
                        >
                            <Section
                                title={<FormattedMessage {...messages.interfaceSection} />}
                                collapsed={this.state.collapsedSections.interface}
                                onToggle={this.handleToggleSection('interface')}
                            >
                                <BooleanSetting
                                    value={settings.cancelEditorMargins}
                                    onChange={this.handleToggleSetting(SETTING_CANCEL_EDITOR_MARGINS)}
                                    label={<FormattedMessage {...messages.cancelEditorMargins} />}
                                    help={<FormattedMessage {...messages.cancelEditorMarginsHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.mergeAllSettings}
                                    onChange={this.handleToggleSetting(SETTING_MERGE_ALL_SETTINGS)}
                                    label={<FormattedMessage {...messages.mergeAllSettings} />}
                                    help={<FormattedMessage {...messages.mergeAllSettingsHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.disableGuiContextMenu}
                                    onChange={this.handleToggleSetting(SETTING_DISABLE_GUI_CONTEXT_MENU)}
                                    label={<FormattedMessage {...messages.disableGuiContextMenu} />}
                                    help={<FormattedMessage {...messages.disableGuiContextMenuHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.windowModal}
                                    onChange={this.handleToggleSetting(SETTING_WINDOW_MODAL)}
                                    label={<FormattedMessage {...messages.windowModal} />}
                                    help={<FormattedMessage {...messages.windowModalHelp} />}
                                />
                            </Section>
                            <Section
                                title={<FormattedMessage {...messages.readme} />}
                                collapsed={this.state.collapsedSections.readme}
                                onToggle={this.handleToggleSection('readme')}
                            >
                                {!settings.addReadmeContextMenu && (
                                    <div className={styles.note}>
                                        <FormattedMessage {...messages.readmeNotice} />
                                    </div>
                                )}
                                <BooleanSetting
                                    value={settings.autoDisplayReadme}
                                    onChange={this.handleToggleSetting(SETTING_AUTO_DISPLAY_README)}
                                    disabled={!settings.addReadmeContextMenu}
                                    label={<FormattedMessage {...messages.autoDisplayReadme} />}
                                    help={<FormattedMessage {...messages.autoDisplayReadmeHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.readmeHtmlSupport}
                                    onChange={this.handleToggleSetting(SETTING_README_HTML_SUPPORT)}
                                    disabled={!settings.addReadmeContextMenu}
                                    label={<FormattedMessage {...messages.readmeHtmlSupport} />}
                                    help={
                                        <div>
                                            <span><FormattedMessage {...messages.readmeHtmlSupportHelp} /></span>
                                            <div className={styles.warning}>
                                                <span><FormattedMessage {...messages.readmeHtmlSupportWarning} /></span>
                                            </div>
                                        </div>
                                    }
                                />
                            </Section>
                        </div>
                        <div
                            className={styles.tabPanel}
                            style={{display: isHyperMimicWorkspaceTab ? '' : 'none'}}
                        >
                            <Section
                                title={<FormattedMessage {...messages.workSpace} />}
                                collapsed={this.state.collapsedSections.workspace}
                                onToggle={this.handleToggleSection('workspace')}
                            >
                                <DropdownSetting
                                    label={intl.formatMessage(messages.blockPaletteStyle)}
                                    value={settings.blockPaletteStyle}
                                    onChange={this.handleDropdownChange(SETTING_BLOCK_PALETTE_STYLE)}
                                    options={BLOCK_PALETTE_STYLE_OPTIONS.map(option => ({
                                        value: option.value,
                                        label: intl.formatMessage(option.message)
                                    }))}
                                    help={<FormattedMessage {...messages.blockPaletteStyleHelp} />}
                                />
                                <DropdownSetting
                                    label={intl.formatMessage(messages.contextMenuStyle)}
                                    value={settings.contextMenuStyle}
                                    onChange={this.handleDropdownChange(SETTING_CONTEXT_MENU_STYLE)}
                                    options={CONTEXT_MENU_STYLE_OPTIONS.map(option => ({
                                        value: option.value,
                                        label: intl.formatMessage(option.message)
                                    }))}
                                    help={<FormattedMessage {...messages.contextMenuStyleHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.commentMarkdownEditor}
                                    onChange={this.handleToggleSetting(SETTING_COMMENT_MARKDOWN_EDITOR)}
                                    label={<FormattedMessage {...messages.commentMarkdownEditor} />}
                                    help={<FormattedMessage {...messages.commentMarkdownEditorHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.addReadmeContextMenu}
                                    onChange={this.handleToggleSetting(SETTING_ADD_README_CONTEXT_MENU)}
                                    label={<FormattedMessage {...messages.addReadmeContextMenu} />}
                                    help={<FormattedMessage {...messages.addReadmeContextMenuHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.addFrameContextMenu}
                                    onChange={this.handleToggleSetting(SETTING_ADD_FRAME_CONTEXT_MENU)}
                                    label={<FormattedMessage {...messages.addFrameContextMenu} />}
                                    help={<FormattedMessage {...messages.addFrameContextMenuHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.hideGuiWatermark}
                                    onChange={this.handleToggleSetting(SETTING_HIDE_GUI_WATERMARK)}
                                    label={<FormattedMessage {...messages.hideGuiWatermark} />}
                                    help={<FormattedMessage {...messages.hideGuiWatermarkHelp} />}
                                />
                                <BooleanSetting
                                    value={settings.workspaceToolbox}
                                    onChange={this.handleToggleSetting(SETTING_WORKSPACE_TOOLBOX)}
                                    label={<FormattedMessage {...messages.workspaceToolbox} />}
                                    help={<FormattedMessage {...messages.workspaceToolboxHelp} />}
                                />
                            </Section>
                            <Section
                                title={<FormattedMessage {...messages.workspaceBackground} />}
                                collapsed={this.state.collapsedSections.workspaceBackground}
                                onToggle={this.handleToggleSection('workspaceBackground')}
                            >
                                {/* Built by src/lib/workspace-background — it owns the storage and
                                    the overlay painted behind the block workspace. */}
                                <div
                                    className={styles.workspaceBackgroundHost}
                                    ref={this.setWorkspaceBackgroundHost}
                                />
                            </Section>
                        </div>
                    </div>
                </Box>
            </Modal>
        );
    }
}

SettingsModalComponent.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func,
    isEmbedded: PropTypes.bool,
    framerate: PropTypes.number,
    onFramerateChange: PropTypes.func,
    onCustomizeFramerate: PropTypes.func,
    highQualityPen: PropTypes.bool,
    onHighQualityPenChange: PropTypes.func,
    interpolation: PropTypes.bool,
    onInterpolationChange: PropTypes.func,
    infiniteClones: PropTypes.bool,
    onInfiniteClonesChange: PropTypes.func,
    removeFencing: PropTypes.bool,
    onRemoveFencingChange: PropTypes.func,
    removeLimits: PropTypes.bool,
    onRemoveLimitsChange: PropTypes.func,
    warpTimer: PropTypes.bool,
    onWarpTimerChange: PropTypes.func,
    disableCompiler: PropTypes.bool,
    onDisableCompilerChange: PropTypes.func
};

export default injectIntl(SettingsModalComponent);
