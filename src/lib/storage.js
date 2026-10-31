import ScratchStorage from '@turbowarp/scratch-storage';

import defaultProject from './default-project';

/**
 * Wrapper for ScratchStorage which adds default web sources.
 * @todo make this more configurable
 */
// Where a scratch project's assets live, and where the CCW mirror keeps the same files. The two
// disagree on the path, not only on the host: scratch publishes
// `<assetHost>/internalapi/asset/<md5>.<ext>/get/` while the mirror serves `<host>/<md5>.<ext>`.
const OFFICIAL_ASSET_HOST = 'https://assets.scratch.mit.edu';
const MIRROR_ASSET_HOST = 'https://m.ccw.site';
const scratchAssetUrl = (asset, host) =>
    `${host || OFFICIAL_ASSET_HOST}/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`;
const mirrorAssetUrl = asset => `${MIRROR_ASSET_HOST}/user_projects_assets/${asset.assetId}.${asset.dataFormat}`;

/**
 * Two asset sources: scratch's own host and the CCW mirror, in the order the editor decides is
 * right for the project it is showing.
 */
class Storage extends ScratchStorage {
    constructor () {
        super();
        // Set once the editor knows where the project it is showing came from; see
        // setOfficialProject. Defaults to "not from scratch", which keeps library picks on the
        // mirror even for a brand new project.
        this.officialProject = false;
        this.assetStoresRegistered = false;
        this.cacheDefaultProject();
    }
    addOfficialScratchWebStores () {
        // The host is decided per request (see getPreferredAssetGetConfig), so registering twice
        // would only stack duplicate sources and slow every load down by an extra 404.
        if (this.assetStoresRegistered) return;
        this.assetStoresRegistered = true;
        this.addWebStore(
            [this.AssetType.Project],
            this.getProjectGetConfig.bind(this),
            this.getProjectCreateConfig.bind(this),
            this.getProjectUpdateConfig.bind(this)
        );
        // Two sources for the same asset types, tried in this order by scratch-storage: the first
        // one it can build a URL for wins, and a failed fetch falls through to the next. Which of
        // the two is "preferred" is read per request, so a project opened from scratch.mit.edu
        // pulls its costumes from assets.scratch.mit.edu while everything else keeps using the
        // mirror -- and each of them still has the other as a backstop.
        this.addWebStore(
            [this.AssetType.ImageVector, this.AssetType.ImageBitmap, this.AssetType.Sound, this.AssetType.Font],
            this.getPreferredAssetGetConfig.bind(this),
            // We set both the create and update configs to the same method because
            // storage assumes it should update if there is an assetId, but the
            // asset store uses the assetId as part of the create URI.
            this.getAssetCreateConfig.bind(this),
            this.getAssetCreateConfig.bind(this)
        );
        // Same types again, without create/update: uploads keep using `assetHost` (`store()` picks
        // the first source that has a create/update function, which is the one above).
        this.addWebStore(
            [this.AssetType.ImageVector, this.AssetType.ImageBitmap, this.AssetType.Sound, this.AssetType.Font],
            this.getFallbackAssetGetConfig.bind(this)
        );
    }
    setProjectHost (projectHost) {
        this.projectHost = projectHost;
    }
    setProjectToken (projectToken) {
        this.projectToken = projectToken;
    }
    /**
     * Tell the storage where the project currently on screen came from.
     *
     * Only two things decide the asset host, and both have to be true for a project to count as
     * official: it was loaded by id (not from a file or `?project_url=`), and the project host is
     * scratch's own. A library pick made inside such a project then also comes from scratch, which
     * is where those assets actually live.
     * @param {boolean} isOfficial true when the project was fetched from scratch.mit.edu
     */
    setOfficialProject (isOfficial) {
        this.officialProject = !!isOfficial;
    }
    getProjectGetConfig (projectAsset) {
        const path = `${this.projectHost}/${projectAsset.assetId}`;
        const qs = this.projectToken ? `?token=${this.projectToken}` : '';
        return path + qs;
    }
    getProjectCreateConfig () {
        return {
            url: `${this.projectHost}/`,
            withCredentials: true
        };
    }
    getProjectUpdateConfig (projectAsset) {
        return {
            url: `${this.projectHost}/${projectAsset.assetId}`,
            withCredentials: true
        };
    }
    setAssetHost (assetHost) {
        this.assetHost = assetHost;
    }
    /**
     * The source tried first. Read per request, so switching projects does not need the web stores
     * to be registered again.
     * @param {Asset} asset the asset being fetched
     * @returns {{url: string}} request config for the preferred host
     */
    getPreferredAssetGetConfig (asset) {
        return this.officialProject ?
            {url: scratchAssetUrl(asset, this.assetHost)} :
            {url: mirrorAssetUrl(asset)};
    }
    /**
     * The other source, used when the preferred one fails. scratch-storage walks the registered
     * web stores in order and moves on when a fetch rejects or comes back empty.
     * @param {Asset} asset the asset being fetched
     * @returns {{url: string}} request config for the fallback host
     */
    getFallbackAssetGetConfig (asset) {
        return this.officialProject ?
            {url: mirrorAssetUrl(asset)} :
            {url: scratchAssetUrl(asset, this.assetHost)};
    }
    getAssetCreateConfig (asset) {
        return {
            // There is no such thing as updating assets, but storage assumes it
            // should update if there is an assetId, and the asset store uses the
            // assetId as part of the create URI. So, force the method to POST.
            // Then when storage finds this config to use for the "update", still POSTs
            method: 'post',
            url: `${this.assetHost}/${asset.assetId}.${asset.dataFormat}`,
            withCredentials: true
        };
    }
    setTranslatorFunction (translator) {
        this.translator = translator;
        this.cacheDefaultProject();
    }
    cacheDefaultProject () {
        const defaultProjectAssets = defaultProject(this.translator);
        defaultProjectAssets.forEach(asset => this.builtinHelper._store(
            this.AssetType[asset.assetType],
            this.DataFormat[asset.dataFormat],
            asset.data,
            asset.id
        ));
    }
}

const storage = new Storage();

export default storage;
