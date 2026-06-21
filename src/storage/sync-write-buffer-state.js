const BUFFER_VERSION = 1;

/**
 * @typedef {{ v: number, setItems: Record<string, unknown>, removeKeys: string[], updatedAt: string | null }} SyncWriteBuffer
 */

/**
 * @returns {SyncWriteBuffer}
 */
export function createEmptySyncWriteBuffer() {
  return {
    v: BUFFER_VERSION,
    setItems: {},
    removeKeys: [],
    updatedAt: null,
  };
}

/**
 * @param {unknown} value
 * @returns {SyncWriteBuffer}
 */
export function normalizeSyncWriteBuffer(value) {
  const raw = value && typeof value === 'object' ? /** @type {Record<string, any>} */ (value) : {};
  const setItems = raw.setItems && typeof raw.setItems === 'object' && !Array.isArray(raw.setItems)
    ? { ...raw.setItems }
    : {};
  const removeKeys = Array.isArray(raw.removeKeys)
    ? [...new Set(raw.removeKeys.filter((key) => typeof key === 'string'))]
    : [];

  return {
    v: BUFFER_VERSION,
    setItems,
    removeKeys,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/**
 * @param {SyncWriteBuffer} buffer
 * @returns {boolean}
 */
export function hasBufferedSyncWrites(buffer) {
  return Object.keys(buffer.setItems).length > 0 || buffer.removeKeys.length > 0;
}

/**
 * @param {SyncWriteBuffer} buffer
 * @param {Record<string, unknown>} items
 * @param {string} updatedAt
 * @returns {SyncWriteBuffer}
 */
export function mergeBufferedSyncSet(buffer, items, updatedAt) {
  const keys = Object.keys(items);
  const removedKeySet = new Set(keys);
  return {
    v: BUFFER_VERSION,
    setItems: { ...buffer.setItems, ...items },
    removeKeys: buffer.removeKeys.filter((key) => !removedKeySet.has(key)),
    updatedAt,
  };
}

/**
 * @param {SyncWriteBuffer} buffer
 * @param {string[]} keys
 * @param {string} updatedAt
 * @returns {SyncWriteBuffer}
 */
export function mergeBufferedSyncRemove(buffer, keys, updatedAt) {
  const removeKeys = new Set(buffer.removeKeys);
  const setItems = { ...buffer.setItems };
  for (const key of keys) {
    delete setItems[key];
    removeKeys.add(key);
  }
  return {
    v: BUFFER_VERSION,
    setItems,
    removeKeys: [...removeKeys],
    updatedAt,
  };
}

/**
 * @param {Record<string, unknown>} stored
 * @param {SyncWriteBuffer} buffer
 * @returns {Record<string, unknown>}
 */
export function applyBufferedSyncWrites(stored, buffer) {
  const merged = { ...stored, ...buffer.setItems };
  for (const key of buffer.removeKeys) {
    delete merged[key];
  }
  return merged;
}
