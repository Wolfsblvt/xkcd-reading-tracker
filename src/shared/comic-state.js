import { UNAVAILABLE_COMIC_IDS } from './constants.js';

const UNAVAILABLE_SET = new Set(UNAVAILABLE_COMIC_IDS);

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function coerceComicId(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return number;
}

/**
 * @param {number} comicId
 * @returns {boolean}
 */
export function isUnavailableComicId(comicId) {
  return UNAVAILABLE_SET.has(comicId);
}

/**
 * @param {unknown} comicId
 * @param {number | null | undefined} latestComicId
 * @returns {boolean}
 */
export function isValidComicId(comicId, latestComicId) {
  const id = coerceComicId(comicId);
  if (id === null || isUnavailableComicId(id)) {
    return false;
  }

  return latestComicId == null || id <= latestComicId;
}

/**
 * @param {number | null | undefined} latestComicId
 * @returns {number[]}
 */
export function getValidComicIds(latestComicId) {
  const latest = coerceComicId(latestComicId);
  if (latest === null) {
    return [];
  }

  const ids = [];
  for (let id = 1; id <= latest; id += 1) {
    if (!isUnavailableComicId(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeRating(value) {
  if (value == null || value === '') {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  const rounded = Math.round(number);
  if (rounded < 1 || rounded > 10) {
    return null;
  }

  return rounded;
}

/**
 * @param {unknown} raw
 * @returns {import('./types.js').ComicState}
 */
export function expandComicState(raw) {
  if (!raw || typeof raw !== 'object') {
    return { read: false, favorite: false, rating: null };
  }

  const value = /** @type {Record<string, unknown>} */ (raw);
  return {
    read: Boolean(value.r ?? value.read),
    favorite: Boolean(value.f ?? value.favorite),
    rating: normalizeRating(value.rating),
  };
}

/**
 * @param {Partial<import('./types.js').ComicState>} state
 * @returns {import('./types.js').PersistedComicState | null}
 */
export function compressComicState(state) {
  const rating = normalizeRating(state.rating);
  const persisted = /** @type {import('./types.js').PersistedComicState} */ ({});
  if (state.read) {
    persisted.r = 1;
  }
  if (state.favorite) {
    persisted.f = 1;
  }
  if (rating !== null) {
    persisted.rating = rating;
  }

  return Object.keys(persisted).length > 0 ? persisted : null;
}

/**
 * @param {unknown} rawMap
 * @param {number | null | undefined} latestComicId
 * @returns {import('./types.js').ComicStateMap}
 */
export function normalizeComicStateMap(rawMap, latestComicId) {
  const raw = rawMap && typeof rawMap === 'object' ? /** @type {Record<string, unknown>} */ (rawMap) : {};
  const result = /** @type {import('./types.js').ComicStateMap} */ ({});

  for (const [key, value] of Object.entries(raw)) {
    const id = coerceComicId(key);
    if (id === null || !isValidComicId(id, latestComicId)) {
      continue;
    }

    const compressed = compressComicState(expandComicState(value));
    if (compressed) {
      result[String(id)] = compressed;
    }
  }

  return result;
}

/**
 * @param {import('./types.js').PersistedComicState | undefined} current
 * @param {Partial<import('./types.js').ComicState>} patch
 * @returns {import('./types.js').PersistedComicState | null}
 */
export function mergeComicStatePatch(current, patch) {
  const expanded = expandComicState(current);
  const next = {
    read: patch.read ?? expanded.read,
    favorite: patch.favorite ?? expanded.favorite,
    rating: Object.hasOwn(patch, 'rating') ? normalizeRating(patch.rating) : expanded.rating,
  };

  return compressComicState(next);
}

/**
 * @param {import('./types.js').ComicStateMap} state
 * @param {number} comicId
 * @returns {import('./types.js').ComicState}
 */
export function getComicState(state, comicId) {
  return expandComicState(state[String(comicId)]);
}

/**
 * @param {import('./types.js').ComicStateMap} state
 * @param {number | null | undefined} latestComicId
 * @returns {{ total: number, read: number, unread: number, percent: number }}
 */
export function calculateProgress(state, latestComicId) {
  const validIds = getValidComicIds(latestComicId);
  const total = validIds.length;
  let read = 0;

  for (const id of validIds) {
    if (getComicState(state, id).read) {
      read += 1;
    }
  }

  return {
    total,
    read,
    unread: Math.max(0, total - read),
    percent: total === 0 ? 0 : Math.round((read / total) * 1000) / 10,
  };
}

/**
 * @param {import('./types.js').ComicStateMap} state
 * @param {number | null | undefined} latestComicId
 * @returns {number[]}
 */
export function getUnreadComicIds(state, latestComicId) {
  return getValidComicIds(latestComicId).filter((id) => !getComicState(state, id).read);
}

/**
 * @param {import('./types.js').ComicStateMap} state
 * @param {number | null | undefined} latestComicId
 * @returns {number[]}
 */
export function getFavoriteComicIds(state, latestComicId) {
  return getValidComicIds(latestComicId).filter((id) => getComicState(state, id).favorite);
}

/**
 * Advance only when the current continue point is read. If no unread comic exists
 * above that point, the user is considered caught up and the point becomes null.
 *
 * @param {{ state: import('./types.js').ComicStateMap, latestComicId: number | null | undefined, continuePoint: number | null | undefined }} input
 * @returns {number | null}
 */
export function calculateNextContinuePoint({ state, latestComicId, continuePoint }) {
  const unreadIds = getUnreadComicIds(state, latestComicId);
  if (unreadIds.length === 0) {
    return null;
  }

  const point = coerceComicId(continuePoint);
  if (point === null || !isValidComicId(point, latestComicId)) {
    return unreadIds[0];
  }

  if (!getComicState(state, point).read) {
    return point;
  }

  return unreadIds.find((id) => id > point) ?? null;
}

