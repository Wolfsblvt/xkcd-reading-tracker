import {
  LOCAL_METADATA_KEY,
  META_KEY,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  getChunkIndex,
  getChunkKey,
  isChunkKey,
  isExtensionStorageKey,
} from '../shared/constants.js';
import { createBackup, validateBackup } from '../shared/backup.js';
import { createDefaultSettings, normalizeSettings } from '../shared/defaults.js';
import {
  calculateNextContinuePoint,
  coerceComicId,
  isValidComicId,
  mergeComicStatePatch,
  normalizeComicStateMap,
} from '../shared/comic-state.js';
import { migrateSyncItems, normalizeMeta } from './migrations.js';

/**
 * @returns {string}
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * @returns {Promise<void>}
 */
export async function ensureStorageReady() {
  const stored = await chrome.storage.sync.get(null);
  const { updates, changed } = migrateSyncItems(stored);

  if (changed) {
    await chrome.storage.sync.set(updates);
  }
}

/**
 * @param {Record<string, unknown>} items
 * @returns {import('../shared/types.js').ComicStateMap}
 */
function collectComicsFromSyncItems(items) {
  const comics = /** @type {import('../shared/types.js').ComicStateMap} */ ({});
  const meta = normalizeMeta(items[META_KEY]);

  for (const [key, value] of Object.entries(items)) {
    if (!isChunkKey(key) || !value || typeof value !== 'object') {
      continue;
    }

    const chunk = /** @type {Record<string, any>} */ (value);
    Object.assign(comics, normalizeComicStateMap(chunk.comics, meta.latestKnownComicId));
  }

  return comics;
}

/**
 * @returns {Promise<import('../shared/types.js').TrackerSnapshot>}
 */
export async function getTrackerSnapshot() {
  await ensureStorageReady();
  const items = await chrome.storage.sync.get(null);
  const meta = normalizeMeta(items[META_KEY]);
  const comics = collectComicsFromSyncItems(items);
  const settings = normalizeSettings(items[SETTINGS_KEY]);
  const continuePoint = calculateNextContinuePoint({
    state: comics,
    latestComicId: meta.latestKnownComicId,
    continuePoint: meta.continuePoint,
  });

  if (continuePoint !== meta.continuePoint) {
    meta.continuePoint = continuePoint;
    meta.updatedAt = nowIso();
    await chrome.storage.sync.set({ [META_KEY]: meta });
  }

  return { meta, settings, comics };
}

/**
 * @param {number} comicId
 * @returns {Promise<{ key: string, chunk: { v: number, comics: import('../shared/types.js').ComicStateMap } }>}
 */
async function getChunkForComic(comicId) {
  const key = getChunkKey(getChunkIndex(comicId));
  const stored = await chrome.storage.sync.get(key);
  const rawChunk = stored[key] && typeof stored[key] === 'object' ? stored[key] : {};
  return {
    key,
    chunk: {
      v: SCHEMA_VERSION,
      comics: normalizeComicStateMap(rawChunk.comics, null),
    },
  };
}

/**
 * @param {number} comicId
 * @param {Partial<import('../shared/types.js').ComicState>} patch
 * @returns {Promise<import('../shared/types.js').TrackerSnapshot>}
 */
export async function updateComicState(comicId, patch) {
  const snapshot = await getTrackerSnapshot();
  if (!isValidComicId(comicId, snapshot.meta.latestKnownComicId)) {
    throw new Error(`Comic ${comicId} is not available.`);
  }

  const { key, chunk } = await getChunkForComic(comicId);
  const nextState = mergeComicStatePatch(chunk.comics[String(comicId)], patch);
  if (nextState) {
    chunk.comics[String(comicId)] = nextState;
  } else {
    delete chunk.comics[String(comicId)];
  }

  const now = nowIso();
  const nextComics = { ...snapshot.comics };
  if (nextState) {
    nextComics[String(comicId)] = nextState;
  } else {
    delete nextComics[String(comicId)];
  }

  const meta = {
    ...snapshot.meta,
    updatedAt: now,
    continuePoint: calculateNextContinuePoint({
      state: nextComics,
      latestComicId: snapshot.meta.latestKnownComicId,
      continuePoint: snapshot.meta.continuePoint,
    }),
  };

  if (patch.read && snapshot.meta.lastNewComicId && comicId >= snapshot.meta.lastNewComicId) {
    meta.acknowledgedLatestComicId = Math.max(meta.acknowledgedLatestComicId ?? 0, comicId);
  }

  await chrome.storage.sync.set({
    [key]: chunk,
    [META_KEY]: meta,
  });

  return getTrackerSnapshot();
}

/**
 * @param {number[]} comicIds
 * @param {Partial<import('../shared/types.js').ComicState>} patch
 * @returns {Promise<import('../shared/types.js').TrackerSnapshot>}
 */
export async function updateManyComicStates(comicIds, patch) {
  const snapshot = await getTrackerSnapshot();
  const validIds = [...new Set(comicIds)].filter((id) => isValidComicId(id, snapshot.meta.latestKnownComicId));
  const grouped = new Map();
  const nextComics = { ...snapshot.comics };

  for (const id of validIds) {
    const chunkIndex = getChunkIndex(id);
    if (!grouped.has(chunkIndex)) {
      grouped.set(chunkIndex, []);
    }
    grouped.get(chunkIndex).push(id);

    const current = nextComics[String(id)];
    const nextState = mergeComicStatePatch(current, patch);
    if (nextState) {
      nextComics[String(id)] = nextState;
    } else {
      delete nextComics[String(id)];
    }
  }

  const updates = {};
  for (const [chunkIndex, ids] of grouped) {
    const key = getChunkKey(chunkIndex);
    const stored = await chrome.storage.sync.get(key);
    const rawChunk = stored[key] && typeof stored[key] === 'object' ? stored[key] : {};
    const chunk = {
      v: SCHEMA_VERSION,
      comics: normalizeComicStateMap(rawChunk.comics, null),
    };

    for (const id of ids) {
      const nextState = nextComics[String(id)];
      if (nextState) {
        chunk.comics[String(id)] = nextState;
      } else {
        delete chunk.comics[String(id)];
      }
    }
    updates[key] = chunk;
  }

  const latestPatchedComicId = Math.max(0, ...validIds);
  const meta = {
    ...snapshot.meta,
    updatedAt: nowIso(),
    continuePoint: calculateNextContinuePoint({
      state: nextComics,
      latestComicId: snapshot.meta.latestKnownComicId,
      continuePoint: snapshot.meta.continuePoint,
    }),
  };

  if (patch.read && snapshot.meta.lastNewComicId && latestPatchedComicId >= snapshot.meta.lastNewComicId) {
    meta.acknowledgedLatestComicId = Math.max(meta.acknowledgedLatestComicId ?? 0, latestPatchedComicId);
  }

  updates[META_KEY] = meta;
  await chrome.storage.sync.set(updates);
  return getTrackerSnapshot();
}

/**
 * @param {number | null} comicId
 * @returns {Promise<void>}
 */
export async function setContinuePoint(comicId) {
  const snapshot = await getTrackerSnapshot();
  const normalized = comicId === null ? null : coerceComicId(comicId);
  if (normalized !== null && !isValidComicId(normalized, snapshot.meta.latestKnownComicId)) {
    throw new Error(`Comic ${normalized} is not available.`);
  }

  const meta = {
    ...snapshot.meta,
    continuePoint: normalized,
    updatedAt: nowIso(),
  };
  await chrome.storage.sync.set({ [META_KEY]: meta });
}

/**
 * @param {number} comicId
 * @returns {Promise<void>}
 */
export async function acknowledgeLatestComic(comicId) {
  const id = coerceComicId(comicId);
  if (id === null) {
    return;
  }

  const snapshot = await getTrackerSnapshot();
  const acknowledgedLatestComicId = Math.max(snapshot.meta.acknowledgedLatestComicId ?? 0, id);
  const meta = {
    ...snapshot.meta,
    acknowledgedLatestComicId,
    lastNewComicId: snapshot.meta.lastNewComicId && acknowledgedLatestComicId >= snapshot.meta.lastNewComicId
      ? null
      : snapshot.meta.lastNewComicId,
    updatedAt: nowIso(),
  };
  await chrome.storage.sync.set({ [META_KEY]: meta });
}

/**
 * @param {Partial<import('../shared/types.js').TrackerMeta>} patch
 * @returns {Promise<import('../shared/types.js').TrackerMeta>}
 */
export async function updateMeta(patch) {
  const snapshot = await getTrackerSnapshot();
  const latestKnownComicId = coerceComicId(patch.latestKnownComicId) ?? snapshot.meta.latestKnownComicId;
  const meta = {
    ...snapshot.meta,
    ...patch,
    schemaVersion: SCHEMA_VERSION,
    latestKnownComicId,
    updatedAt: nowIso(),
  };

  meta.continuePoint = calculateNextContinuePoint({
    state: snapshot.comics,
    latestComicId: meta.latestKnownComicId,
    continuePoint: meta.continuePoint,
  });

  await chrome.storage.sync.set({ [META_KEY]: meta });
  return meta;
}

/**
 * @param {import('../shared/onboarding.js').OnboardingPlan} plan
 * @returns {Promise<import('../shared/types.js').TrackerSnapshot>}
 */
export async function applyOnboardingPlan(plan) {
  if (!plan || !Array.isArray(plan.readIds)) {
    throw new Error('Invalid onboarding plan.');
  }

  if (plan.readIds.length > 0) {
    await updateManyComicStates(plan.readIds, { read: true });
  }

  const snapshot = await getTrackerSnapshot();
  const acknowledgedLatestComicId = coerceComicId(plan.acknowledgedLatestComicId);
  const patch = /** @type {Partial<import('../shared/types.js').TrackerMeta>} */ ({
    continuePoint: plan.continuePoint,
    onboardingCompletedAt: nowIso(),
  });

  if (acknowledgedLatestComicId !== null) {
    patch.acknowledgedLatestComicId = Math.max(snapshot.meta.acknowledgedLatestComicId ?? 0, acknowledgedLatestComicId);
    if (snapshot.meta.lastNewComicId && acknowledgedLatestComicId >= snapshot.meta.lastNewComicId) {
      patch.lastNewComicId = null;
    }
  }

  await updateMeta(patch);
  return getTrackerSnapshot();
}

/**
 * @returns {Promise<import('../shared/types.js').TrackerSnapshot>}
 */
export async function completeOnboarding() {
  await updateMeta({ onboardingCompletedAt: nowIso() });
  return getTrackerSnapshot();
}

/**
 * @returns {Promise<import('../shared/types.js').TrackerSnapshot>}
 */
export async function restartOnboarding() {
  await updateMeta({ onboardingCompletedAt: null });
  return getTrackerSnapshot();
}

/**
 * @param {import('../shared/types.js').TrackerSettings} settings
 * @returns {Promise<import('../shared/types.js').TrackerSettings>}
 */
export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  const snapshot = await getTrackerSnapshot();
  await chrome.storage.sync.set({
    [SETTINGS_KEY]: normalized,
    [META_KEY]: {
      ...snapshot.meta,
      updatedAt: nowIso(),
    },
  });
  return normalized;
}

/**
 * @returns {Promise<import('../shared/types.js').TrackerSettings>}
 */
export async function resetSettings() {
  return saveSettings(createDefaultSettings());
}

/**
 * @returns {Promise<object>}
 */
export async function exportBackup() {
  const snapshot = await getTrackerSnapshot();
  return createBackup({
    snapshot,
    extensionVersion: chrome.runtime.getManifest().version,
  });
}

/**
 * @param {unknown} backup
 * @returns {Promise<{ ok: true } | { ok: false, errors: string[] }>}
 */
export async function importBackupReplacingData(backup) {
  const result = validateBackup(backup);
  if (!result.ok) {
    return result;
  }

  const data = result.data;
  const items = await chrome.storage.sync.get(null);
  const staleChunkKeys = Object.keys(items).filter((key) => isChunkKey(key));
  const updates = {};
  const chunks = new Map();

  for (const [idText, entry] of Object.entries(data.comics)) {
    const id = Number(idText);
    const chunkIndex = getChunkIndex(id);
    if (!chunks.has(chunkIndex)) {
      chunks.set(chunkIndex, { v: SCHEMA_VERSION, comics: {} });
    }

    chunks.get(chunkIndex).comics[idText] = entry;
  }

  for (const [chunkIndex, chunk] of chunks) {
    updates[getChunkKey(chunkIndex)] = chunk;
  }

  const now = nowIso();
  const meta = {
    ...data.meta,
    schemaVersion: SCHEMA_VERSION,
    createdAt: data.meta.createdAt || now,
    updatedAt: now,
    continuePoint: calculateNextContinuePoint({
      state: data.comics,
      latestComicId: data.meta.latestKnownComicId,
      continuePoint: data.meta.continuePoint,
    }),
  };

  updates[META_KEY] = meta;
  updates[SETTINGS_KEY] = normalizeSettings(data.settings);

  await chrome.storage.sync.set(updates);
  const replacementChunkKeys = new Set([...chunks.keys()].map(getChunkKey));
  const removeKeys = staleChunkKeys.filter((key) => !replacementChunkKeys.has(key));
  if (removeKeys.length > 0) {
    await chrome.storage.sync.remove(removeKeys);
  }
  await chrome.storage.local.remove(LOCAL_METADATA_KEY);

  return { ok: true };
}

/**
 * @returns {Promise<void>}
 */
export async function resetTrackerData() {
  const syncItems = await chrome.storage.sync.get(null);
  const syncKeys = Object.keys(syncItems).filter(isExtensionStorageKey);
  if (syncKeys.length > 0) {
    await chrome.storage.sync.remove(syncKeys);
  }

  const localItems = await chrome.storage.local.get(null);
  const localKeys = Object.keys(localItems).filter(isExtensionStorageKey);
  if (localKeys.length > 0) {
    await chrome.storage.local.remove(localKeys);
  }

  if (chrome.storage.session) {
    const sessionItems = await chrome.storage.session.get(null);
    const sessionKeys = Object.keys(sessionItems).filter(isExtensionStorageKey);
    if (sessionKeys.length > 0) {
      await chrome.storage.session.remove(sessionKeys);
    }
  }

  await ensureStorageReady();
}

/**
 * @returns {Promise<{ syncBytes: number | null, localBytes: number | null, syncKeys: number }>}
 */
export async function getStorageUsage() {
  const syncItems = await chrome.storage.sync.get(null);
  const syncKeys = Object.keys(syncItems).filter(isExtensionStorageKey);
  const syncBytes = chrome.storage.sync.getBytesInUse ? await chrome.storage.sync.getBytesInUse(syncKeys) : null;
  const localBytes = chrome.storage.local.getBytesInUse ? await chrome.storage.local.getBytesInUse(null) : null;
  return { syncBytes, localBytes, syncKeys: syncKeys.length };
}

export const storageService = Object.freeze({
  ensureStorageReady,
  getTrackerSnapshot,
  updateComicState,
  updateManyComicStates,
  setContinuePoint,
  acknowledgeLatestComic,
  updateMeta,
  applyOnboardingPlan,
  completeOnboarding,
  restartOnboarding,
  saveSettings,
  resetSettings,
  exportBackup,
  importBackupReplacingData,
  resetTrackerData,
  getStorageUsage,
});
