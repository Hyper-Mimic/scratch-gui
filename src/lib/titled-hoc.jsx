import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {
    getIsAnyCreatingNewState,
    getIsShowingWithoutId
} from '../reducers/project-state';
import {setProjectTitle} from '../reducers/project-title';
import generatedTranslations from './tw-translations/generated-translations.json';

const messages = defineMessages({
    defaultProjectTitle: {
        id: 'tw.gui.defaultProjectTitle',
        description: 'Default title for project',
        defaultMessage: 'Project'
    }
});

// All known localized "default project title" strings. Used to detect whether
// the current title is still an unmodified default (and therefore safe to
// re-localize on language switch) vs. a user-customized title (which we keep).
const DEFAULT_PROJECT_TITLES = new Set(
    Object.keys(generatedTranslations).map(locale => {
        const value = generatedTranslations[locale] &&
            generatedTranslations[locale]['tw.gui.defaultProjectTitle'];
        return value;
    }).filter(Boolean)
);
DEFAULT_PROJECT_TITLES.add(messages.defaultProjectTitle.defaultMessage);

/* Higher Order Component to get and set the project title
 * @param {React.Component} WrappedComponent component to receive project title related props
 * @returns {React.Component} component with project loading behavior
 */
const TitledHOC = function (WrappedComponent) {
    class TitledComponent extends React.Component {
        componentDidMount () {
            const current = this.props.reduxProjectTitle;
            // NOTE: the whole GUI remounts on every language switch because
            // ConnectedIntlProvider's React `key` is the locale, so this method
            // runs with the NEW locale already active. We must NOT blindly reset
            // the title to the new-language default (that wiped custom titles on
            // every switch). Instead:
            //  - if the title is still one of the localized defaults, translate it;
            //  - otherwise keep the existing title (custom title, or empty while a
            //    project is still loading — the original default/URL fallback only
            //    applies when nothing is loaded yet, covered by `current || projectTitle`).
            if (DEFAULT_PROJECT_TITLES.has(current)) {
                const newDefault = this.props.intl.formatMessage(messages.defaultProjectTitle);
                if (current !== newDefault) {
                    this.props.onChangedProjectTitle(newDefault);
                }
                return;
            }
            this.handleReceivedProjectTitle(current || this.props.projectTitle);
        }
        componentDidUpdate (prevProps) {
            if (this.props.projectTitle !== prevProps.projectTitle) {
                this.handleReceivedProjectTitle(this.props.projectTitle);
            }
            // Language switching is handled in componentDidMount: the GUI remounts on
            // locale change (ConnectedIntlProvider key = locale), so a fresh mount runs
            // with the new locale and we decide there whether to translate/keep the title.
            // if project is a new default project, and has loaded,
            if (this.props.isShowingWithoutId && prevProps.isAnyCreatingNewState) {
                // reset title to default
                const {title, isDefault} = this.handleReceivedProjectTitle();
                this.props.onUpdateProjectTitle(title, isDefault);
            }
            // if the projectTitle hasn't changed, but the reduxProjectTitle
            // HAS changed, we need to report that change to the projectTitle's owner
            if (this.props.reduxProjectTitle !== prevProps.reduxProjectTitle &&
                this.props.reduxProjectTitle !== this.props.projectTitle) {
                const defaultProjectTitle = this.props.intl.formatMessage(messages.defaultProjectTitle);
                this.props.onUpdateProjectTitle(
                    this.props.reduxProjectTitle,
                    this.props.reduxProjectTitle === defaultProjectTitle
                );
            }
        }
        handleReceivedProjectTitle (requestedTitle) {
            let newTitle = requestedTitle;
            let isDefault = false;
            if (newTitle === null || typeof newTitle === 'undefined') {
                const urlTitle = typeof URLSearchParams !== 'undefined' &&
                    new URLSearchParams(location.search).get('project_title');
                if (urlTitle) {
                    newTitle = urlTitle;
                } else {
                    newTitle = this.props.intl.formatMessage(messages.defaultProjectTitle);
                    isDefault = true;
                }
            }
            this.props.onChangedProjectTitle(newTitle, isDefault);
            return {
                title: newTitle,
                isDefault
            };
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                intl,
                isAnyCreatingNewState,
                isShowingWithoutId,
                onChangedProjectTitle,
                // for children, we replace onUpdateProjectTitle with our own
                onUpdateProjectTitle,
                // we don't pass projectTitle prop to children -- they must use
                // redux value
                projectTitle,
                reduxProjectTitle,
                /* eslint-enable no-unused-vars */
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent
                    {...componentProps}
                />
            );
        }
    }

    TitledComponent.propTypes = {
        intl: intlShape,
        isAnyCreatingNewState: PropTypes.bool,
        isShowingWithoutId: PropTypes.bool,
        onChangedProjectTitle: PropTypes.func,
        onUpdateProjectTitle: PropTypes.func,
        projectTitle: PropTypes.string,
        reduxProjectTitle: PropTypes.string
    };

    TitledComponent.defaultProps = {
        onUpdateProjectTitle: () => {}
    };

    const mapStateToProps = state => {
        const loadingState = state.scratchGui.projectState.loadingState;
        return {
            isAnyCreatingNewState: getIsAnyCreatingNewState(loadingState),
            isShowingWithoutId: getIsShowingWithoutId(loadingState),
            reduxProjectTitle: state.scratchGui.projectTitle
        };
    };

    const mapDispatchToProps = dispatch => ({
        onChangedProjectTitle: title => dispatch(setProjectTitle(title))
    });

    return injectIntl(connect(
        mapStateToProps,
        mapDispatchToProps
    )(TitledComponent));
};

export {
    TitledHOC as default
};
