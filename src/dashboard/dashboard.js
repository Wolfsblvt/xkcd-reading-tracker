import { ALT_TEXT_MODES, APPEARANCE_THEMES, BROWSE_MODES, META_KEY, PROGRESS_DISPLAY_MODES, RATING_DISPLAY_MODES, SESSION_FAVORITES_LIBRARY_KEY, SETTINGS_KEY } from '../shared/constants.js';
import { calculateProgress, getFavoriteComicIds, getUnreadComicIds } from '../shared/comic-state.js';
import {
  DEFAULT_FAVORITE_PAGE_SIZE,
  FAVORITE_PAGE_SIZES,
  FAVORITE_RATING_FILTERS,
  FAVORITE_SORT_MODES,
  buildFavoriteRows,
  filterFavoriteRows,
  getRandomFavoriteRow,
  normalizeFavoriteLibraryPreferences,
  paginateFavoriteRows,
  sortFavoriteRows,
} from '../shared/favorites-library.js';
import { getComicUrl, getExplainXkcdUrl } from '../shared/navigation.js';
import { createOnboardingPlan, ONBOARDING_MODES, shouldSuggestOnboarding } from '../shared/onboarding.js';
import { formatProgressSummary } from '../shared/progress-format.js';
import { formatPreviewRatingValue, getRatingButtons } from '../shared/rating-control.js';
import { formatRanges, getUnreadRangesFromIds, parseComicRangeInput } from '../shared/ranges.js';
import { storageService } from '../storage/storage-service.js';
import { metadataCache } from '../storage/metadata-cache.js';

const app = document.getElementById('app');
let snapshot = null;
let metadataById = {};
let storageUsage = null;
let suppressOwnSettingsRefresh = false;
let favoriteMetadataRefreshPending = false;
let favoriteLibraryPreferencesLoaded = false;
const favoriteLibraryState = {
  query: '',
  page: 1,
  pageSize: DEFAULT_FAVORITE_PAGE_SIZE,
  ratingFilter: FAVORITE_RATING_FILTERS.ALL,
  sortMode: FAVORITE_SORT_MODES.RATING_DESC,
};

/**
 * @param {string} tagName
 * @param {{ className?: string, text?: string, attrs?: Record<string, string>, children?: Node[] }} [options]
 * @returns {HTMLElement}
 */
function element(tagName, options = {}) {
  const node = document.createElement(tagName);
  if (options.className) {
    node.className = options.className;
  }
  if (options.text != null) {
    node.textContent = options.text;
  }
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      node.setAttribute(name, value);
    }
  }
  if (options.children) {
    node.append(...options.children);
  }
  return node;
}

/**
 * @param {string} text
 * @param {() => void | Promise<void>} onClick
 * @param {{ className?: string, disabled?: boolean, pressed?: boolean, title?: string }} [options]
 * @returns {HTMLButtonElement}
 */
function button(text, onClick, options = {}) {
  const node = /** @type {HTMLButtonElement} */ (element('button', {
    className: options.className,
    text,
    attrs: { type: 'button', title: options.title ?? text },
  }));
  if (options.pressed != null) {
    node.setAttribute('aria-pressed', String(options.pressed));
  }
  node.disabled = Boolean(options.disabled);
  node.addEventListener('click', async () => {
    try {
      await onClick();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  });
  return node;
}

/**
 * @param {string} text
 * @param {boolean} [isError]
 */
function showMessage(text, isError = false) {
  const old = app.querySelector('.message');
  old?.remove();
  app.prepend(element('p', { className: `message${isError ? ' error' : ''}`, text }));
}

/**
 * @param {unknown} error
 */
function logNonFatal(error) {
  console.warn('[xkcd tracker]', error);
}

/**
 * @param {string} name
 * @param {object} value
 */
function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = element('a', {
    attrs: {
      href: url,
      download: name,
    },
  });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {string} url
 */
function openExternalUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * @param {string} labelText
 * @param {HTMLElement} control
 * @returns {HTMLElement}
 */
function field(labelText, control) {
  const label = element('label', { className: 'field' });
  label.append(element('span', { text: labelText }), control);
  return label;
}

/**
 * @param {Record<string, string>} options
 * @param {string} selected
 * @returns {HTMLSelectElement}
 */
function selectFromOptions(options, selected) {
  const select = /** @type {HTMLSelectElement} */ (element('select'));
  for (const [value, label] of Object.entries(options)) {
    const option = /** @type {HTMLOptionElement} */ (element('option', { text: label, attrs: { value } }));
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

/**
 * @param {unknown[]} comicIds
 * @returns {number[]}
 */
function normalizeComicIds(comicIds) {
  return [...new Set(comicIds.map(Number))].filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * @param {number[]} comicIds
 * @returns {Promise<Record<string, import('../shared/types.js').ComicMetadata>>}
 */
async function getFetchedComicMetadata(comicIds) {
  const ids = normalizeComicIds(comicIds);
  if (ids.length === 0) {
    return {};
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'xrt:get-comic-metadata',
      comicIds: ids,
      limit: ids.length,
    });
    if (response?.ok && response.metadataById && typeof response.metadataById === 'object') {
      return response.metadataById;
    }
  } catch (error) {
    logNonFatal(error);
  }

  return metadataCache.getCachedMetadataForComics(ids);
}

/**
 * @param {number[]} favoriteIds
 * @returns {Promise<Record<string, import('../shared/types.js').ComicMetadata>>}
 */
async function loadDashboardMetadata(favoriteIds) {
  const overviewIds = normalizeComicIds([snapshot?.meta.continuePoint]);
  const [favoriteMetadata, overviewMetadata] = await Promise.all([
    metadataCache.getCachedMetadataForComics(favoriteIds),
    getFetchedComicMetadata(overviewIds),
  ]);
  return { ...favoriteMetadata, ...overviewMetadata };
}

/**
 * @param {number} comicId
 * @returns {string | null}
 */
function getCachedComicTitle(comicId) {
  const metadata = metadataById[String(comicId)];
  return metadata?.safeTitle ?? metadata?.title ?? null;
}

/**
 * @param {number} comicId
 * @returns {string}
 */
function formatComicLabel(comicId) {
  const title = getCachedComicTitle(comicId);
  return `#${comicId}${title ? `: ${title}` : ''}`;
}

async function loadFavoriteLibraryPreferences() {
  if (favoriteLibraryPreferencesLoaded || !chrome.storage?.session) {
    favoriteLibraryPreferencesLoaded = true;
    return;
  }

  const stored = await chrome.storage.session.get(SESSION_FAVORITES_LIBRARY_KEY);
  Object.assign(
    favoriteLibraryState,
    normalizeFavoriteLibraryPreferences(stored[SESSION_FAVORITES_LIBRARY_KEY])
  );
  favoriteLibraryPreferencesLoaded = true;
}

async function saveFavoriteLibraryPreferences() {
  if (!chrome.storage?.session) {
    return;
  }

  await chrome.storage.session.set({
    [SESSION_FAVORITES_LIBRARY_KEY]: {
      ratingFilter: favoriteLibraryState.ratingFilter,
      sortMode: favoriteLibraryState.sortMode,
      pageSize: favoriteLibraryState.pageSize,
    },
  });
}

/**
 * @param {import('../shared/types.js').AppearanceTheme | undefined} theme
 */
function applyTheme(theme) {
  const normalized = Object.values(APPEARANCE_THEMES).includes(theme) ? theme : APPEARANCE_THEMES.SYSTEM;
  document.documentElement.dataset.theme = normalized;
}

/**
 * @param {string} title
 * @param {Node[]} children
 * @returns {HTMLElement}
 */
function settingGroup(title, children) {
  const group = element('div', { className: 'settings-group' });
  group.append(element('h3', { text: title }), ...children);
  return group;
}

/**
 * @param {string} title
 * @param {string} description
 * @param {HTMLElement} control
 * @returns {HTMLElement}
 */
function settingItem(title, description, control) {
  const item = element('div', { className: 'setting-item' });
  item.append(
    element('div', {
      className: 'setting-copy',
      children: [
        element('strong', { text: title }),
        element('span', { text: description }),
      ],
    }),
    element('div', { className: 'setting-control', children: [control] })
  );
  return item;
}

function renderOverview() {
  const progress = calculateProgress(snapshot.comics, snapshot.meta.latestKnownComicId);
  const section = element('section', { attrs: { id: 'overview' } });
  section.append(element('h2', { text: 'Overview' }));
  section.append(element('p', { text: formatProgressSummary(progress) }));
  section.append(element('progress', { attrs: { max: '100', value: String(progress.percent), 'aria-label': 'Reading progress' } }));

  const row = element('div', { className: 'row' });
  if (snapshot.meta.continuePoint) {
    const continuePoint = snapshot.meta.continuePoint;
    row.append(element('span', {
      children: [
        document.createTextNode('Continue at '),
        element('a', {
          text: formatComicLabel(continuePoint),
          attrs: {
            href: getComicUrl(continuePoint),
            title: `Open ${formatComicLabel(continuePoint)}`,
          },
        }),
      ],
    }));
  } else {
    row.append(element('span', { className: 'muted', text: 'Continue point is not set or you are caught up.' }));
  }
  row.append(button('Check for new comic', async () => {
    await chrome.runtime.sendMessage({ type: 'xrt:check-latest-comic' });
    await refresh();
    showMessage('Latest-comic check completed.');
  }));
  section.append(row);

  const lastNew = snapshot.meta.lastNewComicId;
  if (lastNew && lastNew > (snapshot.meta.acknowledgedLatestComicId ?? 0)) {
    section.append(element('p', {
      className: 'message',
      text: `New comic #${lastNew} has not been acknowledged yet.`,
    }));
  }

  return section;
}

function renderOnboarding() {
  const section = element('section', { className: 'onboarding-callout', attrs: { id: 'onboarding' } });
  section.append(element('h2', { text: 'Setup' }));

  if (!snapshot.meta.latestKnownComicId) {
    section.append(element('p', { text: 'Fetch the latest xkcd number first, then choose where your backlog starts.' }));
    section.append(element('div', {
      className: 'row',
      children: [
        button('Check for latest comic', async () => {
          await chrome.runtime.sendMessage({ type: 'xrt:check-latest-comic' });
          await refresh();
          showMessage('Latest-comic check completed.');
        }),
        button('Skip setup', skipOnboarding, {
          title: 'Hide setup without changing read state',
        }),
      ],
    }));
    return section;
  }

  const readThroughInput = /** @type {HTMLInputElement} */ (element('input', {
    attrs: {
      type: 'number',
      min: '1',
      max: String(snapshot.meta.latestKnownComicId),
      placeholder: `Read through #${snapshot.meta.latestKnownComicId}`,
      'aria-label': 'Last xkcd comic you have already read',
    },
  }));

  section.append(element('p', {
    text: 'Choose your starting point once. This can bulk-mark old comics read and set the first comic you want to continue with.',
  }));
  section.append(element('div', {
    className: 'row onboarding-actions',
    children: [
      button('Start at #1', () => applyOnboarding(ONBOARDING_MODES.BEGINNING), {
        title: 'Keep every comic unread and set the continue point to the first available comic',
      }),
      readThroughInput,
      button('Apply read-through', () => applyOnboarding(ONBOARDING_MODES.READ_THROUGH, Number(readThroughInput.value)), {
        title: 'Mark comics up to the entered number read and continue after that',
      }),
      button('Caught up', () => applyOnboarding(ONBOARDING_MODES.CAUGHT_UP), {
        title: 'Mark every known xkcd comic read',
      }),
      button('Skip setup', skipOnboarding, {
        title: 'Hide setup without changing read state',
      }),
    ],
  }));

  return section;
}

/**
 * @param {string} mode
 * @param {number | null} [targetComicId]
 */
async function applyOnboarding(mode, targetComicId = null) {
  const result = createOnboardingPlan({
    mode,
    targetComicId,
    latestComicId: snapshot.meta.latestKnownComicId,
  });
  if (!result.ok) {
    showMessage(result.error, true);
    return;
  }

  if (!window.confirm(result.plan.confirmText)) {
    return;
  }

  snapshot = await storageService.applyOnboardingPlan(result.plan);
  await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
  await refresh();
  showMessage(result.plan.summary);
}

async function skipOnboarding() {
  snapshot = await storageService.completeOnboarding();
  await refresh();
  showMessage('Setup skipped.');
}

async function restartOnboarding() {
  snapshot = await storageService.restartOnboarding();
  await refresh();
  showMessage('Setup can be run again.');
}

function renderFavorites() {
  const section = element('section', { attrs: { id: 'favorites' } });
  section.append(element('h2', { text: 'Favorites' }));
  const allRows = buildFavoriteRows({
    comics: snapshot.comics,
    metadataById,
    latestComicId: snapshot.meta.latestKnownComicId,
  });

  if (allRows.length === 0) {
    section.append(element('p', { className: 'muted', text: 'No favorite comics yet.' }));
    return section;
  }

  const searchInput = /** @type {HTMLInputElement} */ (element('input', {
    attrs: {
      type: 'search',
      placeholder: '#123 or title',
      'aria-label': 'Search favorite comics',
    },
  }));
  searchInput.value = favoriteLibraryState.query;
  const ratingFilter = selectFromOptions({
    [FAVORITE_RATING_FILTERS.ALL]: 'All favorites',
    [FAVORITE_RATING_FILTERS.RATED]: 'Rated only',
    [FAVORITE_RATING_FILTERS.UNRATED]: 'Unrated only',
  }, favoriteLibraryState.ratingFilter);
  const sortMode = selectFromOptions({
    [FAVORITE_SORT_MODES.RATING_DESC]: 'Rating high to low',
    [FAVORITE_SORT_MODES.RATING_ASC]: 'Rating low to high',
    [FAVORITE_SORT_MODES.NUMBER_ASC]: 'Comic number ascending',
    [FAVORITE_SORT_MODES.NUMBER_DESC]: 'Comic number descending',
    [FAVORITE_SORT_MODES.TITLE_ASC]: 'Title A-Z',
    [FAVORITE_SORT_MODES.TITLE_DESC]: 'Title Z-A',
  }, favoriteLibraryState.sortMode);
  const pageSize = selectFromOptions(
    Object.fromEntries(FAVORITE_PAGE_SIZES.map((size) => [String(size), `${size} per page`])),
    String(favoriteLibraryState.pageSize)
  );
  const results = element('div', { className: 'favorite-library-results' });
  let filteredRows = /** @type {import('../shared/favorites-library.js').FavoriteLibraryRow[]} */ ([]);

  const randomButton = button('Random favorite', () => {
    const row = getRandomFavoriteRow(filteredRows);
    if (!row) {
      showMessage('No favorite matches the current filters.', true);
      return;
    }
    openExternalUrl(getComicUrl(row.id));
  }, { title: 'Open a random favorite from the current filters' });
  const fetchButton = button('Fetch missing titles', fetchMissingFavoriteTitles, {
    title: 'Fetch missing titles for favorite comics from xkcd metadata',
  });

  const updateResults = () => {
    const rows = buildFavoriteRows({
      comics: snapshot.comics,
      metadataById,
      latestComicId: snapshot.meta.latestKnownComicId,
    });
    filteredRows = sortFavoriteRows(filterFavoriteRows(rows, {
      query: favoriteLibraryState.query,
      ratingFilter: favoriteLibraryState.ratingFilter,
    }), favoriteLibraryState.sortMode);
    const page = paginateFavoriteRows(filteredRows, {
      page: favoriteLibraryState.page,
      pageSize: favoriteLibraryState.pageSize,
    });
    favoriteLibraryState.page = page.currentPage;
    const missingCount = rows.filter((row) => !row.metadataCached).length;
    randomButton.disabled = filteredRows.length === 0;
    fetchButton.disabled = missingCount === 0 || favoriteMetadataRefreshPending;
    fetchButton.title = missingCount === 0
      ? 'All favorite titles are cached'
      : 'Fetch missing titles for favorite comics from xkcd metadata';
    results.replaceChildren(renderFavoriteResults(rows, filteredRows, page, (nextPage) => {
      favoriteLibraryState.page = nextPage;
      updateResults();
    }));
  };

  searchInput.addEventListener('input', () => {
    favoriteLibraryState.query = searchInput.value;
    favoriteLibraryState.page = 1;
    updateResults();
  });
  ratingFilter.addEventListener('change', () => {
    favoriteLibraryState.ratingFilter = ratingFilter.value;
    favoriteLibraryState.page = 1;
    saveFavoriteLibraryPreferences().catch(logNonFatal);
    updateResults();
  });
  sortMode.addEventListener('change', () => {
    favoriteLibraryState.sortMode = sortMode.value;
    favoriteLibraryState.page = 1;
    saveFavoriteLibraryPreferences().catch(logNonFatal);
    updateResults();
  });
  pageSize.addEventListener('change', () => {
    favoriteLibraryState.pageSize = Number(pageSize.value);
    favoriteLibraryState.page = 1;
    saveFavoriteLibraryPreferences().catch(logNonFatal);
    updateResults();
  });

  section.append(element('div', {
    className: 'row favorite-library-controls',
    children: [
      field('Search', searchInput),
      field('Filter', ratingFilter),
      field('Sort', sortMode),
      field('Page size', pageSize),
      element('div', {
        className: 'row favorite-library-actions',
        children: [randomButton, fetchButton],
      }),
    ],
  }));
  section.append(results);
  updateResults();
  return section;
}

/**
 * @param {import('../shared/favorites-library.js').FavoriteLibraryRow[]} rows
 * @param {import('../shared/favorites-library.js').FavoriteLibraryRow[]} filteredRows
 * @param {{ rows: import('../shared/favorites-library.js').FavoriteLibraryRow[], currentPage: number, pageSize: number, totalPages: number, totalRows: number, startIndex: number, endIndex: number }} page
 * @param {(page: number) => void} onPageChange
 * @returns {DocumentFragment}
 */
function renderFavoriteResults(rows, filteredRows, page, onPageChange) {
  const fragment = document.createDocumentFragment();
  const missingCount = rows.filter((row) => !row.metadataCached).length;
  const shown = page.totalRows === 0 ? '0 shown' : `${page.startIndex}-${page.endIndex} of ${page.totalRows} shown`;
  const summary = [
    `${rows.length} favorite${rows.length === 1 ? '' : 's'}`,
    shown,
  ];
  if (missingCount > 0) {
    summary.push(`${missingCount} title${missingCount === 1 ? '' : 's'} not cached`);
  }
  fragment.append(element('p', { className: 'muted favorite-library-summary', text: summary.join(' · ') }));

  if (filteredRows.length === 0) {
    fragment.append(element('p', { className: 'muted', text: 'No favorites match the current filters.' }));
    return fragment;
  }

  fragment.append(renderFavoriteTable(page.rows));
  if (page.totalPages > 1) {
    fragment.append(renderFavoritePagination(page, onPageChange));
  }
  return fragment;
}

/**
 * @param {{ currentPage: number, totalPages: number, totalRows: number }} page
 * @param {(page: number) => void} onPageChange
 * @returns {HTMLElement}
 */
function renderFavoritePagination(page, onPageChange) {
  const row = element('div', { className: 'row favorite-pagination' });
  row.append(
    button('First', () => onPageChange(1), {
      disabled: page.currentPage === 1,
      title: 'Show first favorites page',
    }),
    button('Prev', () => onPageChange(page.currentPage - 1), {
      disabled: page.currentPage === 1,
      title: 'Show previous favorites page',
    }),
    element('span', {
      className: 'favorite-pagination-status',
      text: `Page ${page.currentPage} of ${page.totalPages}`,
    }),
    button('Next', () => onPageChange(page.currentPage + 1), {
      disabled: page.currentPage === page.totalPages,
      title: 'Show next favorites page',
    }),
    button('Last', () => onPageChange(page.totalPages), {
      disabled: page.currentPage === page.totalPages,
      title: 'Show last favorites page',
    })
  );
  return row;
}

/**
 * @param {number} comicId
 * @param {number | null} rating
 * @returns {HTMLElement}
 */
function renderFavoriteRatingControl(comicId, rating) {
  if (snapshot.settings.ratingDisplay === RATING_DISPLAY_MODES.HIDDEN) {
    return element('span', { className: 'muted', text: rating ? `${rating}/10` : '-' });
  }

  const wrapper = element('div', {
    className: `xrt-rating-control xrt-rating-${snapshot.settings.ratingDisplay}`,
    attrs: { role: 'group', 'aria-label': `Rating for xkcd #${comicId}` },
  });
  const buttons = getRatingButtons(snapshot.settings.ratingDisplay, rating);

  if (snapshot.settings.ratingDisplay === RATING_DISPLAY_MODES.TEN_POINT) {
    const valueLabel = element('span', { className: 'xrt-rating-value', text: formatPreviewRatingValue(rating, null) });
    const setPreview = (previewRating) => {
      valueLabel.textContent = formatPreviewRatingValue(rating, previewRating);
    };
    for (const descriptor of buttons) {
      const dot = button(descriptor.text, async () => {
        snapshot = await storageService.updateComicState(comicId, { rating: descriptor.rating });
        await refresh();
      }, {
        className: descriptor.className,
        pressed: descriptor.pressed,
        title: descriptor.title,
      });
      dot.addEventListener('mouseenter', () => setPreview(descriptor.rating));
      dot.addEventListener('focus', () => setPreview(descriptor.rating));
      dot.addEventListener('mouseleave', () => setPreview(null));
      dot.addEventListener('blur', () => setPreview(null));
      wrapper.append(dot);
    }
    wrapper.append(valueLabel);
  } else {
    for (const descriptor of buttons) {
      wrapper.append(button(descriptor.text, async () => {
        snapshot = await storageService.updateComicState(comicId, { rating: descriptor.rating });
        await refresh();
      }, {
        className: descriptor.className,
        pressed: descriptor.pressed,
        title: descriptor.title,
      }));
    }
  }

  wrapper.append(button('Clear', async () => {
    if (rating) {
      snapshot = await storageService.updateComicState(comicId, { rating: null });
      await refresh();
    }
  }, {
    className: 'xrt-rating-clear',
    disabled: !rating,
    title: rating ? 'Clear this comic rating' : 'No rating to clear',
  }));

  return wrapper;
}

/**
 * @param {import('../shared/favorites-library.js').FavoriteLibraryRow[]} rows
 * @returns {HTMLElement}
 */
function renderFavoriteTable(rows) {
  const table = element('table', { className: 'favorite-table' });
  table.append(element('thead', {
    children: [element('tr', {
      children: [
        element('th', { text: 'Preview' }),
        element('th', { text: 'Comic' }),
        element('th', { text: 'Title' }),
        element('th', { text: 'Rating' }),
        element('th', { text: 'Links' }),
        element('th', { text: 'Actions' }),
      ],
    })],
  }));
  const body = element('tbody');
  for (const row of rows) {
    body.append(element('tr', {
      children: [
        renderFavoriteThumbnailCell(row),
        element('td', {
          children: [
            element('a', {
              text: `#${row.id}`,
              attrs: { href: getComicUrl(row.id), target: '_blank', rel: 'noreferrer' },
            }),
          ],
        }),
        element('td', {
          className: row.title ? '' : 'muted',
          text: row.title ?? 'Title not cached yet',
        }),
        element('td', {
          className: 'favorite-rating-cell',
          children: [renderFavoriteRatingControl(row.id, row.rating)],
        }),
        element('td', {
          children: [
            element('a', { text: 'xkcd', attrs: { href: getComicUrl(row.id), target: '_blank', rel: 'noreferrer' } }),
            document.createTextNode(' · '),
            element('a', { text: 'Explain', attrs: { href: getExplainXkcdUrl(row.id), target: '_blank', rel: 'noreferrer' } }),
          ],
        }),
        element('td', {
          className: 'favorite-actions-cell',
          children: [
            button('Read', async () => {
              snapshot = await storageService.updateComicState(row.id, { read: !row.read });
              await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
              await refresh();
            }, {
              pressed: row.read,
              title: row.read ? 'Mark this favorite unread' : 'Mark this favorite read',
            }),
            button('Unfav', async () => {
              snapshot = await storageService.updateComicState(row.id, { favorite: false });
              await refresh();
            }, {
              title: 'Remove this comic from favorites',
            }),
          ],
        }),
      ],
    }));
  }
  table.append(body);
  return element('div', { className: 'table-wrapper', children: [table] });
}

/**
 * @param {import('../shared/favorites-library.js').FavoriteLibraryRow} row
 * @returns {HTMLElement}
 */
function renderFavoriteThumbnailCell(row) {
  if (!row.imageUrl) {
    return element('td', { className: 'muted favorite-thumbnail-cell', text: 'No preview' });
  }

  return element('td', {
    className: 'favorite-thumbnail-cell',
    children: [
      element('a', {
        className: 'favorite-thumbnail-link',
        attrs: {
          href: getComicUrl(row.id),
          target: '_blank',
          rel: 'noreferrer',
        },
        children: [
          element('img', {
            className: 'favorite-thumbnail',
            attrs: {
              src: row.imageUrl,
              alt: row.title ? `Preview of ${row.title}` : `Preview of xkcd #${row.id}`,
              loading: 'lazy',
              decoding: 'async',
              referrerpolicy: 'no-referrer',
            },
          }),
        ],
      }),
    ],
  });
}

async function fetchMissingFavoriteTitles() {
  const favoriteIds = getFavoriteComicIds(snapshot.comics, snapshot.meta.latestKnownComicId);
  const missing = favoriteIds.filter((id) => !metadataById[String(id)]);
  if (missing.length === 0) {
    showMessage('Favorite title cache is already complete.');
    return;
  }

  favoriteMetadataRefreshPending = true;
  let response = null;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'xrt:cache-favorite-metadata',
      comicIds: missing,
      limit: 250,
    });
    metadataById = await loadDashboardMetadata(favoriteIds);
  } finally {
    favoriteMetadataRefreshPending = false;
    render();
  }
  showMessage(response?.ok === false
    ? 'Some favorite titles could not be fetched.'
    : 'Favorite title cache updated.');
}

function renderUnread() {
  const section = element('section', { attrs: { id: 'unread' } });
  section.append(element('h2', { text: 'Unread Ranges' }));
  const unreadIds = getUnreadComicIds(snapshot.comics, snapshot.meta.latestKnownComicId);
  const ranges = getUnreadRangesFromIds(unreadIds);
  if (ranges.length === 0) {
    section.append(element('p', { text: 'No unread comics in the known range.' }));
  } else {
    const table = element('table');
    table.append(element('thead', {
      children: [element('tr', {
        children: [
          element('th', { text: 'Range' }),
          element('th', { text: 'Count' }),
          element('th', { text: 'Actions' }),
        ],
      })],
    }));
    const body = element('tbody');
    for (const range of ranges) {
      const count = range.end - range.start + 1;
      body.append(element('tr', {
        children: [
          element('td', {
            children: [
              element('a', { text: String(range.start), attrs: { href: getComicUrl(range.start), title: `Open unread range start #${range.start}` } }),
              document.createTextNode(range.start === range.end ? '' : ' - '),
              range.start === range.end
                ? document.createTextNode('')
                : element('a', { text: String(range.end), attrs: { href: getComicUrl(range.end), title: `Open unread range end #${range.end}` } }),
            ],
          }),
          element('td', { text: String(count) }),
          element('td', {
            children: [
              button('Read next', async () => {
                await storageService.setContinuePoint(range.start);
                await refresh();
                showMessage(`Continue point set to #${range.start}.`);
              }, { title: `Set the continue point to the start of this unread range (#${range.start})` }),
              document.createTextNode(' '),
              button('Mark read', async () => {
                const ids = [];
                for (let id = range.start; id <= range.end; id += 1) {
                  ids.push(id);
                }
                await storageService.updateManyComicStates(ids, { read: true });
                await refresh();
                showMessage(`Marked range ${formatRanges([range])} as read.`);
              }, { title: `Mark every comic in ${formatRanges([range])} as read` }),
            ],
          }),
        ],
      }));
    }
    table.append(body);
    section.append(table);
  }

  const input = /** @type {HTMLInputElement} */ (element('input', {
    attrs: {
      type: 'text',
      placeholder: '1-10, 42, 100..120',
      'aria-label': 'Comic numbers or ranges',
    },
  }));
  section.append(element('h3', { text: 'Bulk Marking' }));
  section.append(element('div', {
    className: 'row',
    children: [
      input,
      button('Mark read', () => applyBulk(input.value, true), {
        title: 'Mark the entered comic numbers or ranges as read',
      }),
      button('Mark unread', () => applyBulk(input.value, false), {
        title: 'Mark the entered comic numbers or ranges as unread',
      }),
    ],
  }));
  return section;
}

/**
 * @param {string} input
 * @param {boolean} read
 */
async function applyBulk(input, read) {
  const parsed = parseComicRangeInput(input, { latestComicId: snapshot.meta.latestKnownComicId });
  if (parsed.ids.length === 0) {
    showMessage(parsed.errors[0] ?? 'No valid comics selected.', true);
    return;
  }

  await storageService.updateManyComicStates(parsed.ids, { read });
  await refresh();
  showMessage(`${read ? 'Marked read' : 'Marked unread'}: ${parsed.ids.length} comic${parsed.ids.length === 1 ? '' : 's'}.`);
}

function renderSettings() {
  const settings = snapshot.settings;
  const section = element('section', { attrs: { id: 'settings' } });
  section.append(element('h2', { text: 'Settings' }));
  const saveStatus = element('p', { className: 'autosave-status', attrs: { 'aria-live': 'polite' } });
  section.append(saveStatus);

  const autoReadEnabled = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  autoReadEnabled.checked = settings.autoMarkRead.enabled;
  const autoReadDelay = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'number', min: '0', max: '3600', value: String(settings.autoMarkRead.delaySeconds) } }));
  const altMode = selectFromOptions({
    [ALT_TEXT_MODES.NATIVE]: 'Native tooltip only',
    [ALT_TEXT_MODES.BELOW]: 'Show below comic',
    [ALT_TEXT_MODES.DELAYED]: 'Reveal after delay',
    [ALT_TEXT_MODES.HIDDEN]: 'No added display',
  }, settings.altText.mode);
  const altDelay = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'number', min: '0', max: '3600', value: String(settings.altText.delaySeconds) } }));
  const ratingDisplay = selectFromOptions({
    [RATING_DISPLAY_MODES.HIDDEN]: 'Hidden',
    [RATING_DISPLAY_MODES.TEN_POINT]: '1-10',
    [RATING_DISPLAY_MODES.FIVE_STAR]: 'Five stars',
  }, settings.ratingDisplay);
  const progressDisplay = selectFromOptions({
    [PROGRESS_DISPLAY_MODES.HIDDEN]: 'Hidden',
    [PROGRESS_DISPLAY_MODES.TEXT]: 'Text only',
    [PROGRESS_DISPLAY_MODES.BAR]: 'Bar and text',
  }, settings.progressDisplay);
  const defaultBrowseMode = selectFromOptions({
    [BROWSE_MODES.ALL]: 'All comics',
    [BROWSE_MODES.UNREAD]: 'Unread comics',
    [BROWSE_MODES.FAVORITES]: 'Favorite comics',
  }, settings.navigation.defaultBrowseMode);
  const showExplainLink = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  showExplainLink.checked = settings.navigation.showExplainLink;
  const updateBothNavBars = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  updateBothNavBars.checked = settings.navigation.updateBothNavBars;
  const showPageNavActions = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  showPageNavActions.checked = settings.navigation.showPageNavActions;
  const useXkcdStyleLabels = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  useXkcdStyleLabels.checked = settings.navigation.useXkcdStyleLabels;
  const badgeEnabled = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  badgeEnabled.checked = settings.badge.enabled;
  const checkEveryMinutes = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'number', min: '30', max: '10080', value: String(settings.badge.checkEveryMinutes) } }));
  const theme = selectFromOptions({
    [APPEARANCE_THEMES.SYSTEM]: 'Follow system',
    [APPEARANCE_THEMES.LIGHT]: 'Light',
    [APPEARANCE_THEMES.DARK]: 'Dark',
  }, settings.appearance.theme);

  const syncDisabledState = () => {
    autoReadDelay.disabled = !autoReadEnabled.checked;
    altDelay.disabled = altMode.value !== ALT_TEXT_MODES.DELAYED;
    checkEveryMinutes.disabled = !badgeEnabled.checked;
  };

  const save = async () => {
    syncDisabledState();
    applyTheme(/** @type {import('../shared/types.js').AppearanceTheme} */ (theme.value));
    suppressOwnSettingsRefresh = true;
    const savedSettings = await storageService.saveSettings({
      autoMarkRead: {
        enabled: autoReadEnabled.checked,
        delaySeconds: Number(autoReadDelay.value),
      },
      altText: {
        mode: /** @type {import('../shared/types.js').AltTextMode} */ (altMode.value),
        delaySeconds: Number(altDelay.value),
      },
      ratingDisplay: /** @type {import('../shared/types.js').RatingDisplayMode} */ (ratingDisplay.value),
      progressDisplay: /** @type {import('../shared/types.js').ProgressDisplayMode} */ (progressDisplay.value),
      navigation: {
        defaultBrowseMode: /** @type {import('../shared/types.js').BrowseMode} */ (defaultBrowseMode.value),
        showExplainLink: showExplainLink.checked,
        updateBothNavBars: updateBothNavBars.checked,
        showPageNavActions: showPageNavActions.checked,
        useXkcdStyleLabels: useXkcdStyleLabels.checked,
      },
      badge: {
        enabled: badgeEnabled.checked,
        checkEveryMinutes: Number(checkEveryMinutes.value),
      },
      appearance: {
        theme: /** @type {import('../shared/types.js').AppearanceTheme} */ (theme.value),
      },
    });
    snapshot = { ...snapshot, settings: savedSettings };
    await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
    saveStatus.textContent = 'Saved';
    window.setTimeout(() => {
      if (saveStatus.textContent === 'Saved') {
        saveStatus.textContent = '';
      }
    }, 1200);
  };

  for (const control of [
    autoReadEnabled,
    autoReadDelay,
    altMode,
    altDelay,
    ratingDisplay,
    progressDisplay,
    defaultBrowseMode,
    showExplainLink,
    updateBothNavBars,
    showPageNavActions,
    useXkcdStyleLabels,
    badgeEnabled,
    checkEveryMinutes,
    theme,
  ]) {
    control.addEventListener('change', () => {
      save().catch((error) => showMessage(String(error), true));
    });
  }
  syncDisabledState();

  section.append(element('div', {
    className: 'settings-list',
    children: [
      settingGroup('Reading', [
        settingItem('Auto mark read', 'Marks the current comic after active viewing time only.', element('span', {
          className: 'inline-field',
          children: [autoReadEnabled, document.createTextNode('Enabled'), autoReadDelay, document.createTextNode('seconds')],
        })),
        settingItem('Default browse mode', 'Initial navigation filter for newly opened xkcd tabs.', defaultBrowseMode),
      ]),
      settingGroup('Comic Page', [
        settingItem('Alt text', 'Controls whether the title text is shown below the comic.', element('span', {
          className: 'inline-field',
          children: [altMode, altDelay, document.createTextNode('seconds')],
        })),
        settingItem('Rating control', 'Chooses whether ratings are hidden, dots, or star buttons.', ratingDisplay),
        settingItem('Progress display', 'Controls the progress readout shown on comic pages.', progressDisplay),
        settingItem('Explain xkcd link', 'Shows a small Explain xkcd link near the alt text.', element('span', {
          className: 'inline-field',
          children: [showExplainLink, document.createTextNode('Show link')],
        })),
        settingItem('Navigation bars', 'Applies filtered navigation to both xkcd nav bars.', element('span', {
          className: 'inline-field',
          children: [updateBothNavBars, document.createTextNode('Update both bars')],
        })),
        settingItem('Read/Fav nav buttons', 'Injects quick read and favorite toggles into xkcd navigation bars.', element('span', {
          className: 'inline-field',
          children: [showPageNavActions, document.createTextNode('Show in xkcd nav')],
        })),
        settingItem('xkcd-style labels', 'Uses Got it, Neat, and Huh? instead of generic labels on comic pages.', element('span', {
          className: 'inline-field',
          children: [useXkcdStyleLabels, document.createTextNode('Use playful labels')],
        })),
      ]),
      settingGroup('New Comics', [
        settingItem('Toolbar badge', 'Shows NEW when xkcd publishes a comic you have not acknowledged.', element('span', {
          className: 'inline-field',
          children: [badgeEnabled, document.createTextNode('Enabled'), checkEveryMinutes, document.createTextNode('minutes')],
        })),
      ]),
      settingGroup('Appearance', [
        settingItem('Dashboard theme', 'Applies to this dashboard. The popup follows xkcd styling, and comic-page controls inherit xkcd.', theme),
      ]),
    ],
  }));
  return section;
}

function renderDataTools() {
  const section = element('section', { attrs: { id: 'data' } });
  section.append(element('h2', { text: 'Import, Export, Reset' }));
  section.append(element('p', { className: 'muted', text: 'Import currently replaces existing tracker data after validation.' }));

  const fileInput = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'file', accept: 'application/json' } }));
  section.append(element('div', {
    className: 'row',
    children: [
      button('Export backup', async () => {
        const backup = await storageService.exportBackup();
        downloadJson(`xkcd-reading-tracker-${new Date().toISOString().slice(0, 10)}.json`, backup);
      }),
      fileInput,
      button('Import replacement', async () => importReplacement(fileInput)),
    ],
  }));

  const confirmInput = /** @type {HTMLInputElement} */ (element('input', {
    attrs: {
      type: 'text',
      placeholder: 'Type RESET',
      'aria-label': 'Reset confirmation',
    },
  }));
  const resetRow = element('div', {
    className: 'row',
    children: [
      confirmInput,
      button('Download backup and reset', () => resetData(confirmInput.value, true), { className: 'danger' }),
      button('Reset without backup', () => resetData(confirmInput.value, false), { className: 'danger' }),
    ],
  });
  section.append(element('h3', { text: 'Reset' }));
  section.append(element('p', { className: 'muted', text: 'Reset removes read state, favorites, ratings, settings, continue point, metadata cache, and badge state.' }));
  section.append(resetRow);

  section.append(element('h3', { text: 'Onboarding' }));
  section.append(element('p', {
    className: 'muted',
    text: snapshot.meta.onboardingCompletedAt
      ? `Setup completed at ${snapshot.meta.onboardingCompletedAt}.`
      : 'Setup is currently visible until completed or skipped.',
  }));
  section.append(element('div', {
    className: 'row',
    children: [
      snapshot.meta.onboardingCompletedAt
        ? button('Restart setup', restartOnboarding, {
          title: 'Show the setup suggestions again',
        })
        : button('Mark setup complete', skipOnboarding, {
          title: 'Hide setup without changing read state',
        }),
    ],
  }));
  return section;
}

/**
 * @param {HTMLInputElement} fileInput
 */
async function importReplacement(fileInput) {
  const file = fileInput.files?.[0];
  if (!file) {
    showMessage('Choose a JSON backup first.', true);
    return;
  }

  const json = JSON.parse(await file.text());
  const result = await storageService.importBackupReplacingData(json);
  if (!result.ok) {
    showMessage(result.errors.join(' '), true);
    return;
  }

  await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
  await refresh();
  showMessage('Backup imported and replaced existing tracker data.');
}

/**
 * @param {string} confirmation
 * @param {boolean} withBackup
 */
async function resetData(confirmation, withBackup) {
  if (confirmation !== 'RESET') {
    showMessage('Type RESET before using a reset button.', true);
    return;
  }

  if (withBackup) {
    const backup = await storageService.exportBackup();
    downloadJson(`xkcd-reading-tracker-before-reset-${new Date().toISOString().slice(0, 10)}.json`, backup);
  }

  await storageService.resetTrackerData();
  await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
  await refresh();
  showMessage(withBackup ? 'Backup prepared for download and tracker data reset.' : 'Tracker data reset.');
}

function renderDiagnostics() {
  const section = element('section', { attrs: { id: 'diagnostics' } });
  section.append(element('h2', { text: 'Diagnostics' }));
  const rows = [
    ['Schema version', String(snapshot.meta.schemaVersion)],
    ['Latest known comic', snapshot.meta.latestKnownComicId ? `#${snapshot.meta.latestKnownComicId}` : 'Unknown'],
    ['Latest checked', snapshot.meta.latestCheckedAt ?? 'Never'],
    ['Acknowledged latest', snapshot.meta.acknowledgedLatestComicId ? `#${snapshot.meta.acknowledgedLatestComicId}` : 'None'],
    ['Last new comic', snapshot.meta.lastNewComicId ? `#${snapshot.meta.lastNewComicId}` : 'None'],
    ['Continue point', snapshot.meta.continuePoint ? `#${snapshot.meta.continuePoint}` : 'None'],
    ['Sync storage bytes', storageUsage?.syncBytes == null ? 'Unknown' : String(storageUsage.syncBytes)],
    ['Local storage bytes', storageUsage?.localBytes == null ? 'Unknown' : String(storageUsage.localBytes)],
    ['Extension sync keys', storageUsage ? String(storageUsage.syncKeys) : 'Unknown'],
  ];
  const table = element('table');
  const body = element('tbody');
  for (const [label, value] of rows) {
    body.append(element('tr', {
      children: [
        element('th', { text: label }),
        element('td', { text: value }),
      ],
    }));
  }
  table.append(body);
  section.append(table);
  return section;
}

function render() {
  const sections = [
    ...(shouldSuggestOnboarding(snapshot.meta) ? [renderOnboarding()] : []),
    renderOverview(),
    renderFavorites(),
    renderUnread(),
    renderSettings(),
    renderDataTools(),
    renderDiagnostics(),
  ];
  app.replaceChildren(...sections);
  scheduleHashScroll();
}

function scrollToHashTarget() {
  if (!window.location.hash) {
    return;
  }

  let targetId = window.location.hash.slice(1);
  try {
    targetId = decodeURIComponent(targetId);
  } catch {
    // Keep the raw hash if it was not URI-encoded cleanly.
  }

  document.getElementById(targetId)?.scrollIntoView({ block: 'start' });
}

function scheduleHashScroll() {
  window.requestAnimationFrame(scrollToHashTarget);
}

/**
 * @param {number[]} favoriteIds
 * @returns {Promise<void>}
 */
async function refreshMissingFavoriteMetadata(favoriteIds) {
  if (favoriteMetadataRefreshPending) {
    return;
  }

  const missing = favoriteIds.filter((id) => !metadataById[String(id)]);
  if (missing.length === 0) {
    return;
  }

  favoriteMetadataRefreshPending = true;
  try {
    await chrome.runtime.sendMessage({
      type: 'xrt:cache-favorite-metadata',
      comicIds: missing,
      limit: 250,
    });
    metadataById = await loadDashboardMetadata(favoriteIds);
  } finally {
    favoriteMetadataRefreshPending = false;
    render();
  }
}

async function refresh() {
  snapshot = await storageService.getTrackerSnapshot();
  await loadFavoriteLibraryPreferences();
  applyTheme(snapshot.settings.appearance.theme);
  const favoriteIds = getFavoriteComicIds(snapshot.comics, snapshot.meta.latestKnownComicId);
  metadataById = await loadDashboardMetadata(favoriteIds);
  storageUsage = await storageService.getStorageUsage();
  render();
  refreshMissingFavoriteMetadata(favoriteIds).catch(logNonFatal);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some((key) => key.startsWith('xrt:'))) {
    const changedKeys = Object.keys(changes);
    if (suppressOwnSettingsRefresh && changedKeys.every((key) => key === SETTINGS_KEY || key === META_KEY)) {
      suppressOwnSettingsRefresh = false;
      return;
    }
    refresh().catch((error) => showMessage(String(error), true));
  }
});

window.addEventListener('hashchange', scheduleHashScroll);

refresh().catch((error) => {
  app.replaceChildren(element('p', { className: 'message error', text: String(error) }));
});
