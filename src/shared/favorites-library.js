import { getComicState, getFavoriteComicIds } from './comic-state.js';
import { getComicUrl, getExplainXkcdUrl } from './navigation.js';

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

export const FAVORITE_PAGE_SIZES = Object.freeze([5, 10, 20, 50]);
export const DEFAULT_FAVORITE_PAGE_SIZE = 10;

/**
 * @typedef {object} FavoriteLibraryRow
 * @property {number} id
 * @property {boolean} read
 * @property {number | null} rating
 * @property {string | null} title
 * @property {string | null} safeTitle
 * @property {string | null} imageUrl
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
      read: state.read,
      rating: state.rating,
      title: typeof metadata?.title === 'string' && metadata.title ? metadata.title : null,
      safeTitle: typeof metadata?.safeTitle === 'string' && metadata.safeTitle ? metadata.safeTitle : null,
      imageUrl: typeof metadata?.img === 'string' && metadata.img ? metadata.img : null,
      metadataCached: Boolean(metadata),
    };
  });
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizePageSize(value) {
  const size = Number(value);
  return FAVORITE_PAGE_SIZES.includes(size) ? size : DEFAULT_FAVORITE_PAGE_SIZE;
}

/**
 * @param {unknown} value
 * @param {number} totalPages
 * @returns {number}
 */
function normalizePage(value, totalPages) {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }
  return Math.min(page, totalPages);
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
 * @param {{ page?: number, pageSize?: number }} [options]
 * @returns {{ rows: FavoriteLibraryRow[], currentPage: number, pageSize: number, totalPages: number, totalRows: number, startIndex: number, endIndex: number }}
 */
export function paginateFavoriteRows(rows, options = {}) {
  const pageSize = normalizePageSize(options.pageSize);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = normalizePage(options.page, totalPages);
  const startIndex = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalRows);
  return {
    rows: rows.slice(startIndex === 0 ? 0 : startIndex - 1, endIndex),
    currentPage,
    pageSize,
    totalPages,
    totalRows,
    startIndex,
    endIndex,
  };
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

/**
 * @param {unknown} raw
 * @returns {{ ratingFilter: string, sortMode: string, pageSize: number }}
 */
export function normalizeFavoriteLibraryPreferences(raw) {
  const value = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const ratingFilter = Object.values(FAVORITE_RATING_FILTERS).includes(/** @type {string} */ (value.ratingFilter))
    ? /** @type {string} */ (value.ratingFilter)
    : FAVORITE_RATING_FILTERS.ALL;
  const sortMode = Object.values(FAVORITE_SORT_MODES).includes(/** @type {string} */ (value.sortMode))
    ? /** @type {string} */ (value.sortMode)
    : FAVORITE_SORT_MODES.RATING_DESC;

  return {
    ratingFilter,
    sortMode,
    pageSize: normalizePageSize(value.pageSize),
  };
}

/**
 * @param {string | number | boolean | null | undefined} value
 * @returns {string}
 */
function csvField(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * @param {string | number | boolean | null | undefined} value
 * @returns {string}
 */
function markdownCell(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ');
}

/**
 * @param {FavoriteLibraryRow} row
 * @returns {string}
 */
function getExportTitle(row) {
  return row.title ?? row.safeTitle ?? '';
}

/**
 * @param {FavoriteLibraryRow[]} rows
 * @returns {string}
 */
export function exportFavoriteRowsAsCsv(rows) {
  const header = ['Comic', 'Title', 'Rating', 'Read', 'xkcd URL', 'Explain xkcd URL', 'Image URL'];
  const lines = [header.map(csvField).join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      getExportTitle(row),
      row.rating ?? '',
      row.read ? 'yes' : 'no',
      getComicUrl(row.id),
      getExplainXkcdUrl(row.id),
      row.imageUrl ?? '',
    ].map(csvField).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {FavoriteLibraryRow[]} rows
 * @returns {string}
 */
export function exportFavoriteRowsAsMarkdown(rows) {
  const lines = [
    '| Comic | Title | Rating | Read | Links |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const comic = `[#${row.id}](${getComicUrl(row.id)})`;
    const links = `[xkcd](${getComicUrl(row.id)}) / [Explain](${getExplainXkcdUrl(row.id)})`;
    lines.push(`| ${markdownCell(comic)} | ${markdownCell(getExportTitle(row))} | ${markdownCell(row.rating === null ? '' : `${row.rating}/10`)} | ${markdownCell(row.read ? 'yes' : 'no')} | ${markdownCell(links)} |`);
  }
  return `${lines.join('\n')}\n`;
}
