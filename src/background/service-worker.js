import { BROWSE_MODES, LATEST_COMIC_ALARM, SESSION_TAB_MODE_PREFIX, isChunkKey } from '../shared/constants.js';
import { coerceComicId, getFavoriteComicIds } from '../shared/comic-state.js';
import { createLatestComicCheckPatch } from '../shared/latest-comic.js';
import { storageService } from '../storage/storage-service.js';
import { metadataCache } from '../storage/metadata-cache.js';

const FAVORITE_METADATA_BATCH_SIZE = 50;
let favoriteMetadataRefreshPromise = null;

/**
 * @param {unknown} error
 */
function logNonFatal(error) {
  console.warn('[xkcd tracker]', error);
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

  await chrome.action.setBadgeText({ text: showBadge ? 'NEW' : '' });
  if (showBadge) {
    await chrome.action.setBadgeBackgroundColor({ color: '#6E7B9D' });
    await chrome.action.setTitle({ title: `New xkcd comic #${lastNewComicId} is available` });
  } else {
    await chrome.action.setTitle({ title: 'xkcd Reading Tracker' });
  }
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

chrome.tabs?.onRemoved?.addListener((tabId) => {
  chrome.storage.session.remove(getTabModeKey(tabId)).catch(logNonFatal);
});
