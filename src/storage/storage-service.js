import {
  LOCAL_METADATA_KEY,
  LOCAL_SYNC_WRITE_BUFFER_KEY,
  META_KEY,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  SYNC_WRITE_REMOVE_MESSAGE,
  SYNC_WRITE_SET_MESSAGE,
  getChunkIndex,
  getChunkKey,
  isChunkKey,
  isExtensionStorageKey,
} from '../shared/constants.js';
import { normalizeSyncWriteError } from '../shared/errors.js';
import { createBackup, validateBackup } from '../shared/backup.js';
import { createDefaultSettings, normalizeSettings } from '../shared/defaults.js';
import {
  areComicStatesEqual,
  calculateNextContinuePoint,
  coerceComicId,
  isValidComicId,
  mergeComicStatePatch,
  normalizeComicStateMap,
} from '../shared/comic-state.js';
import { migrateSyncItems, normalizeMeta } from './migrations.js';
import { applyBufferedSyncWrites, normalizeSyncWriteBuffer } from './sync-write-buffer-state.js';

const runtimeSyncWriteAdapter = Object.freeze({
  async set(items) {
    const response = await chrome.runtime.sendMessage({ type: SYNC_WRITE_SET_MESSAGE, items });
    if (response?.ok !== true) {
      throw new Error(response?.error || 'The background sync writer did not accept the change.');
    }
  },
  async remove(keys) {
    const response = await chrome.runtime.sendMessage({ type: SYNC_WRITE_REMOVE_MESSAGE, keys });
    if (response?.ok !== true) {
      throw new Error(response?.error || 'The background sync writer did not accept the removal.');
    }
  },
});
let syncWriteAdapter = runtimeSyncWriteAdapter;

/**
 * @returns {string}
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Uses a direct writer in the service worker and runtime messages elsewhere.
 * @param {{ set: (items: Record<string, unknown>) => Promise<void>, remove: (keys: string[]) => Promise<void> }} adapter
 */
export function configureSyncWriteAdapter(adapter) {
  syncWriteAdapter = adapter;
}

/**
 * Reads synced values with locally journaled changes overlaid.
 * @param {null | string | string[] | Record<string, unknown>} [keys]
 * @returns {Promise<Record<string, unknown>>}
 */
async function getBufferedSyncItems(keys = null) {
  const [stored, local] = await Promise.all([
    chrome.storage.sync.get(keys),
    chrome.storage.local.get(LOCAL_SYNC_WRITE_BUFFER_KEY),
  ]);
  const buffer = normalizeSyncWriteBuffer(local[LOCAL_SYNC_WRITE_BUFFER_KEY]);
  if (keys === null) {
    return applyBufferedSyncWrites(stored, buffer);
  }

  const requestedKeys = new Set(
    typeof keys === 'string'
      ? [keys]
      : Array.isArray(keys)
        ? keys
        : Object.keys(keys)
  );
  const filteredBuffer = {
    ...buffer,
    setItems: Object.fromEntries(Object.entries(buffer.setItems).filter(([key]) => requestedKeys.has(key))),
    removeKeys: buffer.removeKeys.filter((key) => requestedKeys.has(key)),
  };
  return applyBufferedSyncWrites(stored, filteredBuffer);
}

/**
 * @param {Record<string, unknown>} items
 * @returns {Promise<void>}
 */
async function setSyncItems(items) {
  try {
    await syncWriteAdapter.set(items);
  } catch (error) {
    throw normalizeSyncWriteError(error);
  }
}

/**
 * @param {string[]} keys
 * @returns {Promise<void>}
 */
async function removeSyncItems(keys) {
  try {
    await syncWriteAdapter.remove(keys);
  } catch (error) {
    throw normalizeSyncWriteError(error);
  }
}

/**
 * @returns {Promise<void>}
 */
export async function ensureStorageReady() {
  const stored = await getBufferedSyncItems(null);
  const { updates, changed } = migrateSyncItems(stored);

  if (changed) {
    await setSyncItems(updates);
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
  const items = await getBufferedSyncItems(null);
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
    await setSyncItems({ [META_KEY]: meta });
  }

  return { meta, settings, comics };
}

/**
 * @param {number} comicId
 * @returns {Promise<{ key: string, chunk: { v: number, comics: import('../shared/types.js').ComicStateMap } }>}
 */
async function getChunkForComic(comicId) {
  const key = getChunkKey(getChunkIndex(comicId));
  const stored = await getBufferedSyncItems(key);
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
  const currentState = chunk.comics[String(comicId)];
  const nextState = mergeComicStatePatch(currentState, patch);
  if (areComicStatesEqual(currentState, nextState)) {
    return snapshot;
  }
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

  await setSyncItems({
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
    const stored = await getBufferedSyncItems(key);
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
  await setSyncItems(updates);
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
  if (normalized === snapshot.meta.continuePoint) {
    return;
  }

  const meta = {
    ...snapshot.meta,
    continuePoint: normalized,
    updatedAt: nowIso(),
  };
  await setSyncItems({ [META_KEY]: meta });
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
  if (
    acknowledgedLatestComicId === snapshot.meta.acknowledgedLatestComicId
    && meta.lastNewComicId === snapshot.meta.lastNewComicId
  ) {
    return;
  }
  await setSyncItems({ [META_KEY]: meta });
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
  };

  meta.continuePoint = calculateNextContinuePoint({
    state: snapshot.comics,
    latestComicId: meta.latestKnownComicId,
    continuePoint: meta.continuePoint,
  });

  const comparableCurrent = { ...snapshot.meta, updatedAt: null };
  const comparableNext = { ...meta, updatedAt: null };
  if (JSON.stringify(comparableCurrent) === JSON.stringify(comparableNext)) {
    return snapshot.meta;
  }

  meta.updatedAt = nowIso();
  await setSyncItems({ [META_KEY]: meta });
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
  if (JSON.stringify(normalized) === JSON.stringify(snapshot.settings)) {
    return snapshot.settings;
  }
  await setSyncItems({
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
  const items = await getBufferedSyncItems(null);
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

  await setSyncItems(updates);
  const replacementChunkKeys = new Set([...chunks.keys()].map(getChunkKey));
  const removeKeys = staleChunkKeys.filter((key) => !replacementChunkKeys.has(key));
  if (removeKeys.length > 0) {
    await removeSyncItems(removeKeys);
  }
  await chrome.storage.local.remove(LOCAL_METADATA_KEY);

  return { ok: true };
}

/**
 * @returns {Promise<void>}
 */
export async function resetTrackerData() {
  const syncItems = await getBufferedSyncItems(null);
  const syncKeys = Object.keys(syncItems).filter(isExtensionStorageKey);
  if (syncKeys.length > 0) {
    await removeSyncItems(syncKeys);
  }

  const localItems = await chrome.storage.local.get(null);
  const localKeys = Object.keys(localItems)
    .filter(isExtensionStorageKey)
    .filter((key) => key !== LOCAL_SYNC_WRITE_BUFFER_KEY);
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
 * @returns {Promise<{ syncBytes: number | null, localBytes: number | null, syncKeys: number, pendingSyncChanges: number, pendingSyncUpdatedAt: string | null }>}
 */
export async function getStorageUsage() {
  const [syncItems, local] = await Promise.all([
    getBufferedSyncItems(null),
    chrome.storage.local.get(LOCAL_SYNC_WRITE_BUFFER_KEY),
  ]);
  const buffer = normalizeSyncWriteBuffer(local[LOCAL_SYNC_WRITE_BUFFER_KEY]);
  const syncKeys = Object.keys(syncItems).filter(isExtensionStorageKey);
  const syncBytes = chrome.storage.sync.getBytesInUse ? await chrome.storage.sync.getBytesInUse(syncKeys) : null;
  const localBytes = chrome.storage.local.getBytesInUse ? await chrome.storage.local.getBytesInUse(null) : null;
  return {
    syncBytes,
    localBytes,
    syncKeys: syncKeys.length,
    pendingSyncChanges: Object.keys(buffer.setItems).length + buffer.removeKeys.length,
    pendingSyncUpdatedAt: buffer.updatedAt,
  };
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
