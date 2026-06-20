import { BROWSE_MODES, LATEST_COMIC_ALARM, SESSION_TAB_MODE_PREFIX, isChunkKey } from '../shared/constants.js';
import { coerceComicId, getFavoriteComicIds, isValidComicId } from '../shared/comic-state.js';
import { createLatestComicCheckPatch } from '../shared/latest-comic.js';
import { storageService } from '../storage/storage-service.js';
import { metadataCache } from '../storage/metadata-cache.js';

const FAVORITE_METADATA_BATCH_SIZE = 50;
const DEFAULT_ACTION_TITLE = 'xkcd Reading Tracker';
// MV3 service-worker setIcon calls are picky about extension-root paths.
const ACTION_ICONS = Object.freeze({
  muted: Object.freeze({
    16: '/assets/icons/icon-muted16.png',
    32: '/assets/icons/icon-muted32.png',
    48: '/assets/icons/icon-muted48.png',
    128: '/assets/icons/icon-muted128.png',
  }),
  active: Object.freeze({
    16: '/assets/icons/icon16.png',
    32: '/assets/icons/icon32.png',
    48: '/assets/icons/icon48.png',
    128: '/assets/icons/icon128.png',
  }),
});
let favoriteMetadataRefreshPromise = null;

/**
 * @param {unknown} error
 */
function logNonFatal(error) {
  console.warn('[xkcd tracker]', error);
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isMissingTabError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /No tab with id|Invalid tab ID|The tab was closed/i.test(message);
}

/**
 * Callback-based Chrome calls require reading runtime.lastError explicitly.
 * @template T
 * @param {(callback: (result: T) => void) => void} invoke
 * @returns {Promise<T>}
 */
function callChromeApi(invoke) {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const message = chrome.runtime.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }
      resolve(result);
    });
  });
}

/**
 * @param {number} tabId
 * @param {{ path: Record<number, string>, title: string }} action
 * @returns {Promise<boolean>}
 */
async function updateTabAction(tabId, action) {
  try {
    await Promise.all([
      callChromeApi((callback) => chrome.action.setIcon({ tabId, path: action.path }, callback)),
      callChromeApi((callback) => chrome.action.setTitle({ tabId, title: action.title }, callback)),
    ]);
    return true;
  } catch (error) {
    if (isMissingTabError(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * @param {number} tabId
 * @returns {Promise<unknown>}
 */
function getCurrentComicFromTab(tabId) {
  return callChromeApi((callback) => {
    chrome.tabs.sendMessage(tabId, { type: 'xrt:get-current-comic' }, callback);
  });
}

/**
 * @param {number} tabId
 * @returns {string}
 */
function getTabModeKey(tabId) {
  return `${SESSION_TAB_MODE_PREFIX}${tabId}`;
}

/**
 * @param {unknown} mode
 * @returns {mode is import('../shared/types.js').BrowseMode}
 */
function isBrowseMode(mode) {
  return Object.values(BROWSE_MODES).includes(/** @type {any} */ (mode));
}

/**
 * @returns {Promise<void>}
 */
async function configureLatestComicAlarm() {
  const snapshot = await storageService.getTrackerSnapshot();
  await chrome.alarms.create(LATEST_COMIC_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: snapshot.settings.badge.checkEveryMinutes,
  });
}

/**
 * @returns {Promise<void>}
 */
async function updateBadge() {
  const snapshot = await storageService.getTrackerSnapshot();
  const acknowledged = snapshot.meta.acknowledgedLatestComicId ?? 0;
  const lastNewComicId = snapshot.meta.lastNewComicId ?? 0;
  const showBadge = snapshot.settings.badge.enabled && lastNewComicId > acknowledged;
  const title = showBadge ? `New xkcd comic #${lastNewComicId} is available` : DEFAULT_ACTION_TITLE;

  await chrome.action.setBadgeText({ text: showBadge ? 'NEW' : '' });
  if (showBadge) {
    await chrome.action.setBadgeBackgroundColor({ color: '#6E7B9D' });
  }
  await chrome.action.setTitle({ title });
}

/**
 * @param {number} tabId
 * @param {{ global?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function setMutedActionForTab(tabId, options = {}) {
  const updated = await updateTabAction(tabId, {
    path: ACTION_ICONS.muted,
    title: DEFAULT_ACTION_TITLE,
  });
  if (updated && options.global) {
    await chrome.action.setIcon({ path: ACTION_ICONS.muted });
  }
}

/**
 * @param {number} tabId
 * @param {number} comicId
 * @param {{ global?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function setComicActionForTab(tabId, comicId, options = {}) {
  const updated = await updateTabAction(tabId, {
    path: ACTION_ICONS.active,
    title: `${DEFAULT_ACTION_TITLE} - xkcd comic #${comicId} detected`,
  });
  if (updated && options.global) {
    await chrome.action.setIcon({ path: ACTION_ICONS.active });
  }
}

/**
 * @param {number} tabId
 * @param {number} comicId
 * @param {{ global?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function setComicActionForTabIfValid(tabId, comicId, options = {}) {
  const snapshot = await storageService.getTrackerSnapshot();
  if (isValidComicId(comicId, snapshot.meta.latestKnownComicId)) {
    await setComicActionForTab(tabId, comicId, options);
    return;
  }

  await setMutedActionForTab(tabId, options);
}

/**
 * @param {number} tabId
 * @param {{ global?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function refreshActionForTab(tabId, options = {}) {
  try {
    const response = await getCurrentComicFromTab(tabId);
    const comicId = coerceComicId(response?.comicId);
    if (comicId !== null) {
      await setComicActionForTabIfValid(tabId, comicId, options);
      return;
    }
  } catch (error) {
    if (isMissingTabError(error)) {
      return;
    }
    // Most tabs do not have the xkcd content script. Muted is the expected state.
  }

  await setMutedActionForTab(tabId, options);
}

/**
 * @returns {Promise<void>}
 */
async function checkLatestComic() {
  const before = await storageService.getTrackerSnapshot();
  const latest = await metadataCache.fetchLatestComicMetadata();
  const patch = createLatestComicCheckPatch(before.meta, latest.num, new Date().toISOString());
  await storageService.updateMeta(patch);
  await updateBadge();
}

/**
 * @param {{ comicIds?: unknown, limit?: unknown }} [options]
 * @returns {Promise<{ requested: number, fetched: number, failed: number }>}
 */
async function cacheMissingFavoriteMetadata(options = {}) {
  const snapshot = await storageService.getTrackerSnapshot();
  const favoriteIds = getFavoriteComicIds(snapshot.comics, snapshot.meta.latestKnownComicId);
  const favoriteIdSet = new Set(favoriteIds);
  const requestedIds = Array.isArray(options.comicIds)
    ? [...new Set(options.comicIds.map(Number))].filter((id) => favoriteIdSet.has(id))
    : favoriteIds;
  const cached = await metadataCache.getCachedMetadataForComics(requestedIds);
  const missing = requestedIds.filter((id) => !cached[String(id)]);
  const limit = Math.max(1, Math.min(250, Number(options.limit) || FAVORITE_METADATA_BATCH_SIZE));
  let fetched = 0;
  let failed = 0;

  for (const id of missing.slice(0, limit)) {
    try {
      await metadataCache.getOrFetchComicMetadata(id);
      fetched += 1;
    } catch (error) {
      failed += 1;
      logNonFatal(error);
    }
  }

  return { requested: missing.length, fetched, failed };
}

/**
 * @param {{ comicIds?: unknown, limit?: unknown }} [options]
 * @returns {Promise<{ metadataById: Record<string, import('../shared/types.js').ComicMetadata>, fetched: number, failed: number }>}
 */
async function getMetadataForComics(options = {}) {
  const requestedIds = Array.isArray(options.comicIds)
    ? [...new Set(options.comicIds.map(coerceComicId).filter((id) => id !== null))]
    : [];
  const limit = Math.max(1, Math.min(20, Number(options.limit) || 10));
  const metadataById = await metadataCache.getCachedMetadataForComics(requestedIds);
  const missing = requestedIds.filter((id) => !metadataById[String(id)]);
  let fetched = 0;
  let failed = 0;

  for (const id of missing.slice(0, limit)) {
    try {
      metadataById[String(id)] = await metadataCache.getOrFetchComicMetadata(id);
      fetched += 1;
    } catch (error) {
      failed += 1;
      logNonFatal(error);
    }
  }

  return { metadataById, fetched, failed };
}

function queueFavoriteMetadataRefresh() {
  if (favoriteMetadataRefreshPromise) {
    return favoriteMetadataRefreshPromise;
  }

  favoriteMetadataRefreshPromise = cacheMissingFavoriteMetadata()
    .catch((error) => {
      logNonFatal(error);
      return { requested: 0, fetched: 0, failed: 1 };
    })
    .finally(() => {
      favoriteMetadataRefreshPromise = null;
    });

  return favoriteMetadataRefreshPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  storageService.ensureStorageReady()
    .then(configureLatestComicAlarm)
    .then(checkLatestComic)
    .then(queueFavoriteMetadataRefresh)
    .catch(logNonFatal);
});

chrome.runtime.onStartup.addListener(() => {
  storageService.ensureStorageReady()
    .then(configureLatestComicAlarm)
    .then(checkLatestComic)
    .then(queueFavoriteMetadataRefresh)
    .catch(logNonFatal);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== LATEST_COMIC_ALARM) {
    return;
  }

  checkLatestComic().catch(logNonFatal);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'xrt:get-tab-browse-mode') {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ mode: isBrowseMode(message.defaultMode) ? message.defaultMode : BROWSE_MODES.ALL });
      return false;
    }

    chrome.storage.session.get(getTabModeKey(tabId))
      .then((items) => {
        const mode = items[getTabModeKey(tabId)];
        sendResponse({ mode: isBrowseMode(mode) ? mode : message.defaultMode ?? BROWSE_MODES.ALL });
      })
      .catch((error) => {
        logNonFatal(error);
        sendResponse({ mode: message.defaultMode ?? BROWSE_MODES.ALL });
      });
    return true;
  }

  if (message?.type === 'xrt:set-tab-browse-mode') {
    const tabId = sender.tab?.id;
    if (tabId == null || !isBrowseMode(message.mode)) {
      sendResponse({ ok: false });
      return false;
    }

    chrome.storage.session.set({ [getTabModeKey(tabId)]: message.mode })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        logNonFatal(error);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message?.type === 'xrt:update-badge') {
    updateBadge()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        logNonFatal(error);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message?.type === 'xrt:comic-page-detected') {
    const tabId = sender.tab?.id;
    const comicId = coerceComicId(message.comicId);
    if (tabId == null || comicId == null) {
      sendResponse({ ok: false });
      return false;
    }

    setComicActionForTabIfValid(tabId, comicId, { global: sender.tab?.active === true })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        logNonFatal(error);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message?.type === 'xrt:check-latest-comic') {
    checkLatestComic()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        logNonFatal(error);
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }

  if (message?.type === 'xrt:cache-favorite-metadata') {
    cacheMissingFavoriteMetadata({
      comicIds: message.comicIds,
      limit: message.limit,
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        logNonFatal(error);
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }

  if (message?.type === 'xrt:get-comic-metadata') {
    getMetadataForComics({
      comicIds: message.comicIds,
      limit: message.limit,
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        logNonFatal(error);
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }

  if (message?.type === 'xrt:open-dashboard') {
    chrome.runtime.openOptionsPage()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        logNonFatal(error);
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') {
    return;
  }

  const changedKeys = Object.keys(changes);
  if (changedKeys.some((key) => key.startsWith('xrt:'))) {
    updateBadge().catch(logNonFatal);
    if (changes['xrt:settings']) {
      configureLatestComicAlarm().catch(logNonFatal);
    }
    if (changedKeys.some(isChunkKey)) {
      queueFavoriteMetadataRefresh().catch(logNonFatal);
    }
  }
});

chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
  const global = tab?.active === true;
  if (changeInfo.status === 'loading') {
    setMutedActionForTab(tabId, { global }).catch(logNonFatal);
  } else if (changeInfo.status === 'complete') {
    refreshActionForTab(tabId, { global }).catch(logNonFatal);
  }
});

chrome.tabs?.onActivated?.addListener(({ tabId }) => {
  refreshActionForTab(tabId, { global: true }).catch(logNonFatal);
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  chrome.storage.session.remove(getTabModeKey(tabId)).catch(logNonFatal);
});
