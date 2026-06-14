import { getComicState, getFavoriteComicIds } from './comic-state.js';

export const FAVORITE_RATING_FILTERS = Object.freeze({
  ALL: 'all',
  RATED: 'rated',
  UNRATED: 'unrated',
});

export const FAVORITE_SORT_MODES = Object.freeze({
  RATING_DESC: 'rating-desc',
  RATING_ASC: 'rating-asc',
  NUMBER_ASC: 'number-asc',
  NUMBER_DESC: 'number-desc',
  TITLE_ASC: 'title-asc',
  TITLE_DESC: 'title-desc',
});

/**
 * @typedef {object} FavoriteLibraryRow
 * @property {number} id
 * @property {number | null} rating
 * @property {string | null} title
 * @property {string | null} safeTitle
 * @property {boolean} metadataCached
 */

/**
 * @param {{ comics: import('./types.js').ComicStateMap, metadataById: Record<string, Partial<import('./types.js').ComicMetadata> | undefined>, latestComicId: number | null | undefined }} input
 * @returns {FavoriteLibraryRow[]}
 */
export function buildFavoriteRows({ comics, metadataById, latestComicId }) {
  return getFavoriteComicIds(comics, latestComicId).map((id) => {
    const state = getComicState(comics, id);
    const metadata = metadataById[String(id)] ?? null;
    return {
      id,
      rating: state.rating,
      title: typeof metadata?.title === 'string' && metadata.title ? metadata.title : null,
      safeTitle: typeof metadata?.safeTitle === 'string' && metadata.safeTitle ? metadata.safeTitle : null,
      metadataCached: Boolean(metadata),
    };
  });
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function normalizeSearchValue(value) {
  return (value ?? '').trim().toLocaleLowerCase();
}

/**
 * @param {FavoriteLibraryRow} row
 * @param {string} query
 * @returns {boolean}
 */
function matchesSearch(row, query) {
  const normalized = normalizeSearchValue(query);
  if (!normalized) {
    return true;
  }

  const numericQuery = normalized.replace(/^#/, '');
  if (/^\d+$/.test(numericQuery) && String(row.id).includes(numericQuery)) {
    return true;
  }

  return normalizeSearchValue(row.title).includes(normalized)
    || normalizeSearchValue(row.safeTitle).includes(normalized);
}

/**
 * @param {FavoriteLibraryRow[]} rows
 * @param {{ query?: string, ratingFilter?: string }} [options]
 * @returns {FavoriteLibraryRow[]}
 */
export function filterFavoriteRows(rows, options = {}) {
  const ratingFilter = options.ratingFilter ?? FAVORITE_RATING_FILTERS.ALL;
  return rows.filter((row) => {
    if (ratingFilter === FAVORITE_RATING_FILTERS.RATED && row.rating === null) {
      return false;
    }
    if (ratingFilter === FAVORITE_RATING_FILTERS.UNRATED && row.rating !== null) {
      return false;
    }
    return matchesSearch(row, options.query ?? '');
  });
}

/**
 * @param {FavoriteLibraryRow} row
 * @returns {string}
 */
function getComparableTitle(row) {
  return normalizeSearchValue(row.title ?? row.safeTitle ?? '');
}

/**
 * @param {FavoriteLibraryRow} left
 * @param {FavoriteLibraryRow} right
 * @param {boolean} ascending
 * @returns {number}
 */
function compareTitles(left, right, ascending) {
  if (left.metadataCached !== right.metadataCached) {
    return left.metadataCached ? -1 : 1;
  }

  const comparison = getComparableTitle(left).localeCompare(getComparableTitle(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  return (ascending ? comparison : -comparison) || left.id - right.id;
}

/**
 * @param {FavoriteLibraryRow[]} rows
 * @param {string} [sortMode]
 * @returns {FavoriteLibraryRow[]}
 */
export function sortFavoriteRows(rows, sortMode = FAVORITE_SORT_MODES.RATING_DESC) {
  return [...rows].sort((left, right) => {
    if (sortMode === FAVORITE_SORT_MODES.NUMBER_DESC) {
      return right.id - left.id;
    }
    if (sortMode === FAVORITE_SORT_MODES.NUMBER_ASC) {
      return left.id - right.id;
    }
    if (sortMode === FAVORITE_SORT_MODES.TITLE_ASC) {
      return compareTitles(left, right, true);
    }
    if (sortMode === FAVORITE_SORT_MODES.TITLE_DESC) {
      return compareTitles(left, right, false);
    }

    if (left.rating === null || right.rating === null) {
      if (left.rating === right.rating) {
        return left.id - right.id;
      }
      return left.rating === null ? 1 : -1;
    }

    if (sortMode === FAVORITE_SORT_MODES.RATING_ASC) {
      return left.rating - right.rating || left.id - right.id;
    }

    return right.rating - left.rating || left.id - right.id;
  });
}

/**
 * @param {FavoriteLibraryRow[]} rows
 * @param {() => number} [random]
 * @returns {FavoriteLibraryRow | null}
 */
export function getRandomFavoriteRow(rows, random = Math.random) {
  if (rows.length === 0) {
    return null;
  }

  return rows[Math.floor(random() * rows.length)] ?? rows[0] ?? null;
}
