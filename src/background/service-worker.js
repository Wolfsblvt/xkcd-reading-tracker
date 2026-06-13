import { BROWSE_MODES, LATEST_COMIC_ALARM, SESSION_TAB_MODE_PREFIX } from '../shared/constants.js';
import { storageService } from '../storage/storage-service.js';
import { metadataCache } from '../storage/metadata-cache.js';

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
  const patch = {
    latestKnownComicId: latest.num,
    latestCheckedAt: new Date().toISOString(),
  };

  if (!before.meta.latestKnownComicId) {
    patch.acknowledgedLatestComicId = latest.num;
    patch.lastNewComicId = null;
  } else if (latest.num > before.meta.latestKnownComicId) {
    patch.lastNewComicId = latest.num;
  }

  await storageService.updateMeta(patch);
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(() => {
  storageService.ensureStorageReady()
    .then(configureLatestComicAlarm)
    .then(checkLatestComic)
    .catch(logNonFatal);
});

chrome.runtime.onStartup.addListener(() => {
  storageService.ensureStorageReady()
    .then(configureLatestComicAlarm)
    .then(updateBadge)
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

  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') {
    return;
  }

  if (Object.keys(changes).some((key) => key.startsWith('xrt:'))) {
    updateBadge().catch(logNonFatal);
    if (changes['xrt:settings']) {
      configureLatestComicAlarm().catch(logNonFatal);
    }
  }
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  chrome.storage.session.remove(getTabModeKey(tabId)).catch(logNonFatal);
});

