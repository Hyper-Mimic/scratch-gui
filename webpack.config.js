const defaultsDeep = require('lodash.defaultsdeep');
const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

// True when running under webpack-dev-server, which compiles to an in-memory
// filesystem. The disk-lock workarounds below only apply to real disk builds.
const IS_DEV_SERVER = process.argv.some(a => a.includes('webpack-dev-server'));

// Custom outputFileSystem that retries writes through temporary EPERM/EBUSY
// locks caused by external processes (backup/sync agents or antivirus
// real-time scanning). Inherits from fs via prototype chain (so every
// fs method is available without copying read-only constants like F_OK)
// and adds the join/mkdirp shims webpack 4 expects, then overrides
// writeFile/writeFileSync to retry on transient errors.
function createRetryingFileSystem () {
    const MAX_RETRIES = 120;
    const MIN_DELAY = 150;
    const MAX_DELAY = 5000;
    const delayFor = i => Math.min(MIN_DELAY * Math.pow(1.5, i), MAX_DELAY);
    const isTransient = e => e && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES');

    const retrying = Object.create(fs);
    retrying.join = path.join;
    retrying.mkdirp = function (dir, opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = undefined; }
        if (fs.mkdirp) return fs.mkdirp(dir, opts, cb);
        return fs.mkdir(dir, {recursive: true}, cb);
    };
    retrying.writeFile = function (file, data, ...args) {
        const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
        const opts = cb ? args.slice(0, -1) : args;
        const attempt = i => {
            fs.writeFile(file, data, ...opts, err => {
                if (!err) { if (cb) cb(); return; }
                if (i < MAX_RETRIES && isTransient(err)) {
                    setTimeout(() => attempt(i + 1), delayFor(i));
                } else { if (cb) cb(err); }
            });
        };
        attempt(0);
    };
    retrying.writeFileSync = function (file, data, ...args) {
        let lastErr;
        for (let i = 0; i < MAX_RETRIES; i++) {
            try { return fs.writeFileSync(file, data, ...args); }
            catch (e) {
                lastErr = e;
                if (!isTransient(e) || i === MAX_RETRIES - 1) throw e;
                const end = Date.now() + delayFor(i);
                while (Date.now() < end) { /* spin */ }
            }
        }
        throw lastErr;
    };

    return retrying;
}

class RetryingOutputFileSystemPlugin {
    apply (compiler) {
        // Dev server compiles to an in-memory filesystem, so the disk-retry
        // wrapper is unnecessary there and would break it.
        if (IS_DEV_SERVER) return;
        compiler.hooks.environment.tap('RetryingOutputFileSystemPlugin', () => {
            compiler.outputFileSystem = createRetryingFileSystem();
        });
    }
}

// Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// PostCss
const autoprefixer = require('autoprefixer');
const postcssVars = require('postcss-simple-vars');
const postcssImport = require('postcss-import');

const STATIC_PATH = process.env.STATIC_PATH || '/static';
const {APP_NAME} = require('./src/lib/brand');

const root = process.env.ROOT || '';
if (root.length > 0 && !root.endsWith('/')) {
    throw new Error('If ROOT is defined, it must have a trailing slash.');
}

const htmlWebpackPluginCommon = {
    root: root,
    meta: JSON.parse(process.env.EXTRA_META || '{}'),
    APP_NAME
};

// When this changes, the path for all JS files will change, bypassing any HTTP caches
const CACHE_EPOCH = 'pentapod';

const base = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: process.env.SOURCEMAP || (process.env.NODE_ENV === 'production' ? false : 'cheap-module-source-map'),
    devServer: {
        contentBase: path.resolve(__dirname, 'build'),
        host: '0.0.0.0',
        disableHostCheck: true,
        compress: true,
        port: process.env.PORT || 8601,
        // allows ROUTING_STYLE=wildcard to work properly
        historyApiFallback: {
            rewrites: [
                {from: /^\/\d+\/?$/, to: '/index.html'},
                {from: /^\/\d+\/fullscreen\/?$/, to: '/fullscreen.html'},
                {from: /^\/\d+\/editor\/?$/, to: '/editor.html'},
                {from: /^\/\d+\/embed\/?$/, to: '/embed.html'},
                {from: /^\/addons\/?$/, to: '/addons.html'}
            ]
        }
    },
    output: {
        library: 'GUI',
        filename: (
            process.env.NODE_ENV === 'production' ? `js/${CACHE_EPOCH}/[name].[contenthash].js` : 'js/[name].js'
        ),
        chunkFilename: (
            process.env.NODE_ENV === 'production' ? `js/${CACHE_EPOCH}/[name].[contenthash].js` : 'js/[name].js'
        ),
        publicPath: root
    },
    resolve: {
        symlinks: false,
        alias: {
            'text-encoding$': path.resolve(__dirname, 'src/lib/tw-text-encoder'),
            'scratch-render-fonts$': path.resolve(__dirname, 'src/lib/tw-scratch-render-fonts')
        }
    },
    module: {
        rules: [{
            test: /\.jsx?$/,
            loader: 'babel-loader',
            include: [
                path.resolve(__dirname, 'src'),
                /node_modules[\\/]scratch-[^\\/]+[\\/]src/,
                /node_modules[\\/]pify/,
                /node_modules[\\/]@vernier[\\/]godirect/
            ],
            options: {
                // Explicitly disable babelrc so we don't catch various config
                // in much lower dependencies.
                babelrc: false,
                plugins: [
                    ['react-intl', {
                        messagesDir: './translations/messages/'
                    }]],
                presets: ['@babel/preset-env', '@babel/preset-react']
            }
        },
        {
            test: /\.css$/,
            exclude: [
                path.resolve(__dirname, 'src/addons/preview/preview.css'),
                path.resolve(__dirname, 'src/playground/addon-preview.css')
            ],
            use: [{
                loader: 'style-loader'
            }, {
                loader: 'css-loader',
                options: {
                    modules: true,
                    importLoaders: 1,
                    localIdentName: '[name]_[local]_[hash:base64:5]',
                    camelCase: true
                }
            }, {
                loader: 'postcss-loader',
                options: {
                    ident: 'postcss',
                    plugins: function () {
                        return [
                            postcssImport,
                            postcssVars,
                            autoprefixer
                        ];
                    }
                }
            }]
        },
        {
            // The addon preview stylesheets use plain global classnames
            // (JSX className strings and the original ScratchAddons .edm-*
            // selectors must match verbatim), so they bypass CSS modules.
            // Note: this css-loader version does not honor :global{} blocks,
            // so these files must NOT be wrapped in :global{}.
            test: /(?:addons[\\/]preview[\\/]preview\.css|playground[\\/]addon-preview\.css)$/,
            use: [{
                loader: 'style-loader'
            }, {
                loader: 'css-loader',
                options: {
                    modules: false,
                    importLoaders: 1
                }
            }, {
                loader: 'postcss-loader',
                options: {
                    ident: 'postcss',
                    plugins: function () {
                        return [
                            postcssImport,
                            postcssVars,
                            autoprefixer
                        ];
                    }
                }
            }]
        }
    ],
    // Note: src/playground/addon-preview.css intentionally uses this same
    // modules:true rule and keeps its classnames global via :global{...}
    // wrapping, so the JSX className strings match.
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'node_modules/scratch-blocks/media',
                    to: 'static/blocks-media/default'
                },
                {
                    from: 'node_modules/scratch-blocks/media',
                    to: 'static/blocks-media/high-contrast'
                },
                {
                    from: 'src/lib/themes/blocks/high-contrast-media/blocks-media',
                    to: 'static/blocks-media/high-contrast',
                    force: true
                }
            ]
        })
    ]
};

if (!process.env.CI) {
    base.plugins.push(new webpack.ProgressPlugin());
}

// Skip writing output files whose content is identical to what is already on
// disk. Prevents EPERM failures caused by external processes (backup/sync
// agents or antivirus real-time scanning) briefly locking asset files during
// rebuilds, and speeds up incremental builds.
class SkipUnchangedAssetsPlugin {
    apply (compiler) {
        // Dev server uses an in-memory filesystem; no need to skip writes there.
        if (IS_DEV_SERVER) return;
        compiler.hooks.emit.tap('SkipUnchangedAssetsPlugin', (compilation) => {
            const fs = compiler.outputFileSystem;
            const outputPath = compilation.options.output.path;
            for (const name of Object.keys(compilation.assets)) {
                let existing;
                try {
                    existing = fs.readFileSync(path.join(outputPath, name));
                } catch (e) {
                    // If the file is locked by another process (e.g. an
                    // antivirus or backup agent scanning it), reading may
                    // also fail with EPERM/EBUSY. In that case writing will
                    // certainly fail too, so skip the asset to avoid the
                    // build aborting. For ENOENT the file genuinely doesn't
                    // exist yet, so keep the asset for webpack to create.
                    if (e.code === 'ENOENT') continue;
                    delete compilation.assets[name];
                    continue;
                }
                const incoming = compilation.assets[name].source();
                const incomingBuffer = Buffer.isBuffer(incoming) ? incoming : Buffer.from(incoming);
                if (existing.equals(incomingBuffer)) {
                    delete compilation.assets[name];
                }
            }
        });
    }
}
base.plugins.push(new SkipUnchangedAssetsPlugin());
base.plugins.push(new RetryingOutputFileSystemPlugin());

module.exports = [
    // to run editor examples
    defaultsDeep({}, base, {
        entry: {
            'editor': './src/playground/editor.jsx',
            'player': './src/playground/player.jsx',
            'fullscreen': './src/playground/fullscreen.jsx',
            'embed': './src/playground/embed.jsx',
            'addon-settings': './src/playground/addon-settings.jsx',
            'addon-preview': './src/playground/addon-preview.jsx',
            'credits': './src/playground/credits/credits.jsx'
        },
        output: {
            path: path.resolve(__dirname, 'build')
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: /\.(svg|png|wav|mp3|gif|jpg|woff2|hex)$/,
                    loader: 'url-loader',
                    options: {
                        limit: 2048,
                        outputPath: 'static/assets/',
                        esModule: false
                    }
                }
            ])
        },
        optimization: {
            splitChunks: {
                chunks: 'all',
                minChunks: 2,
                minSize: 50000,
                maxInitialRequests: 5
            }
        },
        plugins: base.plugins.concat([
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
                'process.env.DEBUG': Boolean(process.env.DEBUG),
                'process.env.ENABLE_SERVICE_WORKER': JSON.stringify(process.env.ENABLE_SERVICE_WORKER || ''),
                'process.env.ROOT': JSON.stringify(root),
                'process.env.ROUTING_STYLE': JSON.stringify(process.env.ROUTING_STYLE || 'filehash'),
                'process.env.ENABLE_WINDCHIMES': JSON.stringify(process.env.ENABLE_WINDCHIMES || '')
            }),
            new HtmlWebpackPlugin({
                chunks: ['editor'],
                template: 'src/playground/index.ejs',
                filename: 'editor.html',
                title: `${APP_NAME} - Combining  practicality, speed, and elegance`,
                isEditor: true,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['player'],
                template: 'src/playground/index.ejs',
                filename: 'index.html',
                title: `${APP_NAME} - Combining practicality, speed, and elegance`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['fullscreen'],
                template: 'src/playground/index.ejs',
                filename: 'fullscreen.html',
                title: `${APP_NAME} - Combining practicality, speed, and elegance`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['embed'],
                template: 'src/playground/embed.ejs',
                filename: 'embed.html',
                title: `Embedded Project - ${APP_NAME}`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['addon-settings'],
                template: 'src/playground/simple.ejs',
                filename: 'addons.html',
                title: `Addon Settings - ${APP_NAME}`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['addon-preview'],
                template: 'src/playground/simple.ejs',
                filename: 'addon-preview.html',
                title: `Addon Preview - ${APP_NAME}`,
                ...htmlWebpackPluginCommon
            }),
            new HtmlWebpackPlugin({
                chunks: ['credits'],
                template: 'src/playground/simple.ejs',
                filename: 'credits.html',
                title: `${APP_NAME} Credits`,
                ...htmlWebpackPluginCommon
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'static',
                        to: ''
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'extensions/**',
                        to: 'static',
                        context: 'src/examples'
                    }
                ]
            })
        ])
    })
].concat(
    process.env.NODE_ENV === 'production' || process.env.BUILD_MODE === 'dist' ? (
        // export as library
        defaultsDeep({}, base, {
            target: 'web',
            entry: {
                'scratch-gui': './src/index.js'
            },
            output: {
                libraryTarget: 'umd',
                filename: 'js/[name].js',
                chunkFilename: 'js/[name].js',
                path: path.resolve('dist'),
                publicPath: `${STATIC_PATH}/`
            },
            externals: {
                'react': 'react',
                'react-dom': 'react-dom'
            },
            module: {
                rules: base.module.rules.concat([
                    {
                        test: /\.(svg|png|wav|mp3|gif|jpg|woff2|hex)$/,
                        loader: 'url-loader',
                        options: {
                            limit: 2048,
                            outputPath: 'static/assets/',
                            publicPath: `${STATIC_PATH}/assets/`,
                            esModule: false
                        }
                    }
                ])
            },
            plugins: base.plugins.concat([
                new CopyWebpackPlugin({
                    patterns: [
                        {
                            from: 'extension-worker.{js,js.map}',
                            context: 'node_modules/scratch-vm/dist/web',
                            noErrorOnMissing: true
                        }
                    ]
                }),
                // Include library JSON files for scratch-desktop to use for downloading
                new CopyWebpackPlugin({
                    patterns: [
                        {
                            from: 'src/lib/libraries/*.json',
                            to: 'libraries',
                            flatten: true
                        }
                    ]
                })
            ])
        })) : []
);
