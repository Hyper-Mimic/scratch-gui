import React from 'react';
import PropTypes from 'prop-types';
import render from '../app-target';
import styles from './credits.css';

import {APP_NAME} from '../../lib/brand';
import {applyGuiColors} from '../../lib/themes/guiHelpers';
import {detectTheme} from '../../lib/themes/themePersistance';
import UserData from './users';

import clyainImage from './Clyain.png';

/* eslint-disable react/jsx-no-literals */

applyGuiColors(detectTheme());
document.documentElement.lang = 'en';

const User = ({image, text, href}) => (
    <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={styles.user}
    >
        <img
            loading="lazy"
            className={styles.userImage}
            src={image}
            width="60"
            height="60"
        />
        <div className={styles.userInfo}>
            {text}
        </div>
    </a>
);
User.propTypes = {
    image: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    href: PropTypes.string
};

const UserList = ({users}) => (
    <div className={styles.users}>
        {users.map((data, index) => (
            <User
                key={index}
                {...data}
            />
        ))}
    </div>
);
UserList.propTypes = {
    users: PropTypes.arrayOf(PropTypes.object)
};

const Credits = () => (
    <main className={styles.main}>
        <header className={styles.headerContainer}>
            <h1 className={styles.headerText}>
                {APP_NAME} Credits
            </h1>
        </header>
        <section>
            <h2>HyperMimic</h2>
            <p>
                The {APP_NAME} project is made possible by the work of the following member:
                <div className={styles.users}>
                    <User
                        image={clyainImage}
                        text={
                        <div>
                            <p style={{margin:'10px 0',}}>Clyain</p>
                            <a href="https://github.com/Clyain" target="_blank" rel="noopener noreferrer" style={{fontSize:'small',}}>Github</a>
                            <div style={{width: '5px', display: 'inline-block',}}></div>
                            <a href="https://space.bilibili.com/3546580911131107" target="_blank" rel="noopener noreferrer" style={{fontSize:'small',}}>Bilibili</a>
                            <div style={{width: '5px', display: 'inline-block',}}></div>
                            <a href="https://www.ccw.site/student/655362014b9a4844976e9231" target="_blank" rel="noopener noreferrer" style={{fontSize:'small',}}>ccw</a>
                        </div>
                        } 
                        href={'https://clyain.netlify.app'}
                    />
                </div>
            </p>
        </section>
        {APP_NAME !== 'TurboWarp' && (
            // Be kind and considerate. Don't remove this :)
            <section>
                <h2>TurboWarp</h2>
                <p>
                    {APP_NAME} is based on <a href="https://turbowarp.org/">TurboWarp</a>.
                </p>
            </section>
        )}
        <section>
            <h2>Scratch</h2>
            <p>
                TurboWarp is based on the work of the <a href="https://scratch.mit.edu/credits">Scratch contributors</a> but is not endorsed by Scratch in any way.
            </p>
            <p>
                <a href="https://scratch.mit.edu/donate">
                    Donate to support Scratch.
                </a>
            </p>
        </section>
        <section>
            <h2>Contributors</h2>
            <UserList users={UserData.contributors} />
        </section>
        <section>
            <h2>Addons</h2>
            <UserList users={UserData.addonDevelopers} />
        </section>
        <section>
            <h2>TurboWarp Extension Gallery</h2>
            <UserList users={UserData.extensionDevelopers} />
        </section>
        <section>
            <h2>Documentation</h2>
            <UserList users={UserData.docs} />
        </section>
        <section>
            <h2>Translators</h2>
            <p>
                More than 100 people have helped translate TurboWarp and its addons into many languages
                &mdash; far more than we could hope to list here.
            </p>
        </section>
        <section>
            <p>
                <i>
                    Individual contributors are listed in no particular order.
                    The order is randomized each visit.
                </i>
            </p>
        </section>
    </main>
);

render(<Credits />);
