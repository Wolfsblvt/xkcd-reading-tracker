import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_FAVORITE_PAGE_SIZE,
  FAVORITE_RATING_FILTERS,
  FAVORITE_SORT_MODES,
  buildFavoriteRows,
  exportFavoriteRowsAsCsv,
  exportFavoriteRowsAsJson,
  exportFavoriteRowsAsMarkdown,
  filterFavoriteRows,
  getRandomFavoriteRow,
  normalizeFavoriteLibraryPreferences,
  paginateFavoriteRows,
  sortFavoriteRows,
} from '../src/shared/favorites-library.js';

const metadataById = {
  2: { title: 'Petit Trees', safeTitle: 'Petit Trees', img: 'https://imgs.xkcd.com/comics/petit_trees.png' },
  4: { title: 'Stove Ownership', safeTitle: 'Stove Ownership', img: 'https://imgs.xkcd.com/comics/stove_ownership.png' },
  12: { title: 'Poisson', safeTitle: 'Poisson', img: 'https://imgs.xkcd.com/comics/poisson.png' },
};

test('favorite library rows combine favorite state with cached metadata', () => {
  const rows = buildFavoriteRows({
    latestComicId: 12,
    metadataById,
    comics: {
      1: { r: 1 },
      2: { f: 1, rating: 8 },
      4: { r: 1, f: 1 },
      12: { f: 1, rating: 3 },
    },
  });

  assert.deepEqual(rows, [
    { id: 2, read: false, rating: 8, title: 'Petit Trees', safeTitle: 'Petit Trees', imageUrl: 'https://imgs.xkcd.com/comics/petit_trees.png', metadataCached: true },
    { id: 4, read: true, rating: null, title: 'Stove Ownership', safeTitle: 'Stove Ownership', imageUrl: 'https://imgs.xkcd.com/comics/stove_ownership.png', metadataCached: true },
    { id: 12, read: false, rating: 3, title: 'Poisson', safeTitle: 'Poisson', imageUrl: 'https://imgs.xkcd.com/comics/poisson.png', metadataCached: true },
  ]);
});

test('favorite library search matches comic number and title', () => {
  const rows = buildFavoriteRows({
    latestComicId: 12,
    metadataById,
    comics: {
      2: { f: 1, rating: 8 },
      4: { f: 1 },
      12: { f: 1, rating: 3 },
    },
  });

  assert.deepEqual(filterFavoriteRows(rows, { query: '#12' }).map((row) => row.id), [12]);
  assert.deepEqual(filterFavoriteRows(rows, { query: 'tree' }).map((row) => row.id), [2]);
});

test('favorite library filters rated and unrated favorites', () => {
  const rows = [
    { id: 1, read: false, rating: 5, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
    { id: 2, read: false, rating: null, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
    { id: 3, read: false, rating: 10, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
  ];

  assert.deepEqual(filterFavoriteRows(rows, { ratingFilter: FAVORITE_RATING_FILTERS.RATED }).map((row) => row.id), [1, 3]);
  assert.deepEqual(filterFavoriteRows(rows, { ratingFilter: FAVORITE_RATING_FILTERS.UNRATED }).map((row) => row.id), [2]);
});

test('favorite library sorts ratings with unrated favorites last', () => {
  const rows = [
    { id: 1, read: false, rating: 5, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
    { id: 2, read: false, rating: null, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
    { id: 3, read: false, rating: 10, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
  ];

  assert.deepEqual(sortFavoriteRows(rows, FAVORITE_SORT_MODES.RATING_DESC).map((row) => row.id), [3, 1, 2]);
  assert.deepEqual(sortFavoriteRows(rows, FAVORITE_SORT_MODES.RATING_ASC).map((row) => row.id), [1, 3, 2]);
});

test('favorite library title sort keeps uncached metadata last', () => {
  const rows = [
    { id: 1, read: false, rating: null, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
    { id: 2, read: false, rating: null, title: 'Beta', safeTitle: 'Beta', imageUrl: null, metadataCached: true },
    { id: 3, read: false, rating: null, title: 'Alpha', safeTitle: 'Alpha', imageUrl: null, metadataCached: true },
  ];

  assert.deepEqual(sortFavoriteRows(rows, FAVORITE_SORT_MODES.TITLE_ASC).map((row) => row.id), [3, 2, 1]);
  assert.deepEqual(sortFavoriteRows(rows, FAVORITE_SORT_MODES.TITLE_DESC).map((row) => row.id), [2, 3, 1]);
});

test('favorite library random row uses visible favorites', () => {
  const rows = [
    { id: 1, read: false, rating: null, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
    { id: 2, read: false, rating: null, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
    { id: 3, read: false, rating: null, title: null, safeTitle: null, imageUrl: null, metadataCached: false },
  ];

  assert.equal(getRandomFavoriteRow(rows, () => 0.5)?.id, 2);
  assert.equal(getRandomFavoriteRow([], () => 0.5), null);
});

test('favorite library pagination clamps page and uses supported page sizes', () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({
    id: index + 1,
    read: false,
    rating: null,
    title: null,
    safeTitle: null,
    imageUrl: null,
    metadataCached: false,
  }));

  assert.deepEqual(paginateFavoriteRows(rows, { page: 2, pageSize: 10 }), {
    rows: rows.slice(10, 20),
    currentPage: 2,
    pageSize: 10,
    totalPages: 3,
    totalRows: 23,
    startIndex: 11,
    endIndex: 20,
  });

  assert.equal(paginateFavoriteRows(rows, { page: 99, pageSize: 20 }).currentPage, 2);
  assert.equal(paginateFavoriteRows(rows, { page: 1, pageSize: 17 }).pageSize, DEFAULT_FAVORITE_PAGE_SIZE);
});

test('favorite library session preferences reject unsupported values', () => {
  assert.deepEqual(normalizeFavoriteLibraryPreferences({
    ratingFilter: FAVORITE_RATING_FILTERS.RATED,
    sortMode: FAVORITE_SORT_MODES.TITLE_ASC,
    pageSize: 50,
    query: 'not persisted',
    page: 9,
  }), {
    ratingFilter: FAVORITE_RATING_FILTERS.RATED,
    sortMode: FAVORITE_SORT_MODES.TITLE_ASC,
    pageSize: 50,
  });

  assert.deepEqual(normalizeFavoriteLibraryPreferences({
    ratingFilter: 'wat',
    sortMode: 'nope',
    pageSize: 13,
  }), {
    ratingFilter: FAVORITE_RATING_FILTERS.ALL,
    sortMode: FAVORITE_SORT_MODES.RATING_DESC,
    pageSize: DEFAULT_FAVORITE_PAGE_SIZE,
  });
});

test('favorite library exports rows as csv, markdown, and json', () => {
  const rows = [
    {
      id: 2,
      read: true,
      rating: 8,
      title: 'Petit, Trees',
      safeTitle: 'Petit, Trees',
      imageUrl: 'https://imgs.xkcd.com/comics/petit_trees.png',
      metadataCached: true,
    },
    {
      id: 4,
      read: false,
      rating: null,
      title: 'A | B',
      safeTitle: 'A | B',
      imageUrl: null,
      metadataCached: true,
    },
  ];

  const csv = exportFavoriteRowsAsCsv(rows);
  assert.equal(csv.includes('Comic,Title,Rating,Read,xkcd URL,Explain xkcd URL,Image URL'), true);
  assert.equal(csv.includes('2,"Petit, Trees",8,yes,https://xkcd.com/2/,https://www.explainxkcd.com/wiki/index.php/2,https://imgs.xkcd.com/comics/petit_trees.png'), true);

  const markdown = exportFavoriteRowsAsMarkdown(rows);
  assert.equal(markdown.includes('| [#2](https://xkcd.com/2/) | Petit, Trees | 8/10 | yes | [xkcd](https://xkcd.com/2/) / [Explain](https://www.explainxkcd.com/wiki/index.php/2) |'), true);
  assert.equal(markdown.includes('A \\| B'), true);

  const json = JSON.parse(exportFavoriteRowsAsJson(rows));
  assert.deepEqual(json[0], {
    comic: 2,
    title: 'Petit, Trees',
    rating: 8,
    read: true,
    xkcdUrl: 'https://xkcd.com/2/',
    explainXkcdUrl: 'https://www.explainxkcd.com/wiki/index.php/2',
    imageUrl: 'https://imgs.xkcd.com/comics/petit_trees.png',
  });
  assert.equal(json[1].rating, null);
});
