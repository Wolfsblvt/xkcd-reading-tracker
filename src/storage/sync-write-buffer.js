import {
  LOCAL_SYNC_WRITE_BUFFER_KEY,
  SYNC_WRITE_DEBOUNCE_MS,
  SYNC_WRITE_FLUSH_ALARM,
} from '../shared/constants.js';
import { isSyncWriteRateLimitError, normalizeSyncWriteError } from '../shared/errors.js';
import {
  createEmptySyncWriteBuffer,
  hasBufferedSyncWrites,
  mergeBufferedSyncRemove,
  mergeBufferedSyncSet,
  normalizeSyncWriteBuffer,
} from './sync-write-buffer-state.js';

const RATE_LIMIT_RETRY_MINUTES = 1;
const SUSPENSION_FALLBACK_MINUTES = 0.5;
let debounceTimer = null;
let operationChain = Promise.resolve();

/** @typedef {ReturnType<typeof createEmptySyncWriteBuffer>} SyncWriteBuffer */

/**
 * @param {unknown} error
 */
function logUnexpectedBufferError(error) {
  if (!isSyncWriteRateLimitError(error)) {
    console.warn('[xkcd tracker]', error);
  }
}

/**
 * Serializes journal updates and flushes so a completed flush cannot erase a newer write.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
function serialize(operation) {
  const result = operationChain.then(operation, operation);
  operationChain = result.catch(() => undefined);
  return result;
}

/**
 * @returns {Promise<SyncWriteBuffer>}
 */
async function readBuffer() {
  const stored = await chrome.storage.local.get(LOCAL_SYNC_WRITE_BUFFER_KEY);
  return normalizeSyncWriteBuffer(stored[LOCAL_SYNC_WRITE_BUFFER_KEY]);
}

/**
 * @param {SyncWriteBuffer} buffer
 * @returns {Promise<void>}
 */
async function persistBuffer(buffer) {
  if (hasBufferedSyncWrites(buffer)) {
    await chrome.storage.local.set({ [LOCAL_SYNC_WRITE_BUFFER_KEY]: buffer });
    return;
  }
  await chrome.storage.local.remove(LOCAL_SYNC_WRITE_BUFFER_KEY);
}

/**
 * @param {number} delayInMinutes
 * @returns {Promise<void>}
 */
async function scheduleFallbackAlarm(delayInMinutes = SUSPENSION_FALLBACK_MINUTES) {
  await chrome.alarms.create(SYNC_WRITE_FLUSH_ALARM, { delayInMinutes });
}

function scheduleDebouncedFlush() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushBufferedSyncWrites().catch(logUnexpectedBufferError);
  }, SYNC_WRITE_DEBOUNCE_MS);
  scheduleFallbackAlarm().catch(logUnexpectedBufferError);
}

/**
 * @param {Record<string, unknown>} items
 * @returns {Promise<void>}
 */
export function queueSyncSet(items) {
  if (Object.keys(items).length === 0) {
    return Promise.resolve();
  }
  return serialize(async () => {
    const buffer = mergeBufferedSyncSet(await readBuffer(), items, new Date().toISOString());
    await persistBuffer(buffer);
    scheduleDebouncedFlush();
  });
}

/**
 * @param {string | string[]} keys
 * @returns {Promise<void>}
 */
export function queueSyncRemove(keys) {
  const normalizedKeys = [...new Set((Array.isArray(keys) ? keys : [keys]).filter((key) => typeof key === 'string'))];
  if (normalizedKeys.length === 0) {
    return Promise.resolve();
  }

  return serialize(async () => {
    const buffer = mergeBufferedSyncRemove(await readBuffer(), normalizedKeys, new Date().toISOString());
    await persistBuffer(buffer);
    scheduleDebouncedFlush();
  });
}

/**
 * Flushes the durable journal. Rate-limit failures remain queued and retry later.
 * @returns {Promise<void>}
 */
export function flushBufferedSyncWrites() {
  return serialize(async () => {
    let buffer = await readBuffer();
    if (!hasBufferedSyncWrites(buffer)) {
      await chrome.alarms.clear(SYNC_WRITE_FLUSH_ALARM);
      return;
    }

    try {
      if (Object.keys(buffer.setItems).length > 0) {
        await chrome.storage.sync.set(buffer.setItems);
        buffer = { ...buffer, setItems: {} };
        await persistBuffer(buffer);
      }
      if (buffer.removeKeys.length > 0) {
        await chrome.storage.sync.remove(buffer.removeKeys);
        buffer = createEmptySyncWriteBuffer();
        await persistBuffer(buffer);
      }
      await chrome.alarms.clear(SYNC_WRITE_FLUSH_ALARM);
    } catch (error) {
      if (isSyncWriteRateLimitError(error)) {
        await scheduleFallbackAlarm(RATE_LIMIT_RETRY_MINUTES);
        return;
      }
      await scheduleFallbackAlarm(RATE_LIMIT_RETRY_MINUTES);
      throw normalizeSyncWriteError(error);
    }
  });
}

/**
 * Restores the timer/alarm after service-worker startup without forcing an immediate write.
 * @returns {Promise<void>}
 */
export async function recoverBufferedSyncWrites() {
  const buffer = await readBuffer();
  if (hasBufferedSyncWrites(buffer)) {
    scheduleDebouncedFlush();
  } else {
    await chrome.alarms.clear(SYNC_WRITE_FLUSH_ALARM);
  }
}
