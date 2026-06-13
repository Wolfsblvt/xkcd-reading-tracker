import { BROWSE_MODES } from './constants.js';
import { getFavoriteComicIds, getUnreadComicIds, getValidComicIds } from './comic-state.js';

/**
 * @param {number} comicId
 * @returns {string}
 */
export function getComicUrl(comicId) {
  return `https://xkcd.com/${comicId}/`;
}

/**
 * @param {number} comicId
 * @returns {string}
 */
export function getExplainXkcdUrl(comicId) {
  return `https://www.explainxkcd.com/wiki/index.php/${comicId}`;
}

/**
 * @param {import('./types.js').BrowseMode} mode
 * @param {import('./types.js').ComicStateMap} state
 * @param {number | null | undefined} latestComicId
 * @returns {number[]}
 */
export function getEligibleComicIds(mode, state, latestComicId) {
  if (mode === BROWSE_MODES.UNREAD) {
    return getUnreadComicIds(state, latestComicId);
  }

  if (mode === BROWSE_MODES.FAVORITES) {
    return getFavoriteComicIds(state, latestComicId);
  }

  return getValidComicIds(latestComicId);
}

/**
 * @param {number[]} ids
 * @param {number} currentId
 * @returns {number | null}
 */
function getPreviousId(ids, currentId) {
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    if (ids[index] < currentId) {
      return ids[index];
    }
  }

  return null;
}

/**
 * @param {number[]} ids
 * @param {number} currentId
 * @returns {number | null}
 */
function getNextId(ids, currentId) {
  return ids.find((id) => id > currentId) ?? null;
}

/**
 * @param {number[]} ids
 * @param {number} currentId
 * @param {() => number} random
 * @returns {number | null}
 */
function getRandomId(ids, currentId, random) {
  if (ids.length === 0) {
    return null;
  }

  const candidates = ids.length > 1 ? ids.filter((id) => id !== currentId) : ids;
  return candidates[Math.floor(random() * candidates.length)] ?? candidates[0] ?? null;
}

/**
 * @param {{ mode: import('./types.js').BrowseMode, currentId: number, state: import('./types.js').ComicStateMap, latestComicId: number | null | undefined, random?: () => number }} input
 * @returns {{ first: number | null, previous: number | null, random: number | null, next: number | null, last: number | null, count: number, includesCurrent: boolean }}
 */
export function calculateNavigation(input) {
  const ids = getEligibleComicIds(input.mode, input.state, input.latestComicId);
  return {
    first: ids[0] ?? null,
    previous: getPreviousId(ids, input.currentId),
    random: getRandomId(ids, input.currentId, input.random ?? Math.random),
    next: getNextId(ids, input.currentId),
    last: ids.at(-1) ?? null,
    count: ids.length,
    includesCurrent: ids.includes(input.currentId),
  };
}

