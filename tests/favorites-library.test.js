import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FAVORITE_RATING_FILTERS,
  FAVORITE_SORT_MODES,
  buildFavoriteRows,
  filterFavoriteRows,
  getRandomFavoriteRow,
  sortFavoriteRows,
} from '../src/shared/favorites-library.js';

const metadataById = {
  2: { title: 'Petit Trees', safeTitle: 'Petit Trees' },
  4: { title: 'Stove Ownership', safeTitle: 'Stove Ownership' },
  12: { title: 'Poisson', safeTitle: 'Poisson' },
};

test('favorite library rows combine favorite state with cached metadata', () => {
  const rows = buildFavoriteRows({
    latestComicId: 12,
    metadataById,
    comics: {
      1: { r: 1 },
      2: { f: 1, rating: 8 },
      4: { f: 1 },
      12: { f: 1, rating: 3 },
    },
  });

  assert.deepEqual(rows, [
    { id: 2, rating: 8, title: 'Petit Trees', safeTitle: 'Petit Trees', metadataCached: true },
    { id: 4, rating: null, title: 'Stove Ownership', safeTitle: 'Stove Ownership', metadataCached: true },
    { id: 12, rating: 3, title: 'Poisson', safeTitle: 'Poisson', metadataCached: true },
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
    { id: 1, rating: 5, title: null, safeTitle: null, metadataCached: false },
    { id: 2, rating: null, title: null, safeTitle: null, metadataCached: false },
    { id: 3, rating: 10, title: null, safeTitle: null, metadataCached: false },
  ];

  assert.deepEqual(filterFavoriteRows(rows, { ratingFilter: FAVORITE_RATING_FILTERS.RATED }).map((row) => row.id), [1, 3]);
  assert.deepEqual(filterFavoriteRows(rows, { ratingFilter: FAVORITE_RATING_FILTERS.UNRATED }).map((row) => row.id), [2]);
});

test('favorite library sorts ratings with unrated favorites last', () => {
  const rows = [
    { id: 1, rating: 5, title: null, safeTitle: null, metadataCached: false },
    { id: 2, rating: null, title: null, safeTitle: null, metadataCached: false },
    { id: 3, rating: 10, title: null, safeTitle: null, metadataCached: false },
  ];

  assert.deepEqual(sortFavoriteRows(rows, FAVORITE_SORT_MODES.RATING_DESC).map((row) => row.id), [3, 1, 2]);
  assert.deepEqual(sortFavoriteRows(rows, FAVORITE_SORT_MODES.RATING_ASC).map((row) => row.id), [1, 3, 2]);
});

test('favorite library title sort keeps uncached metadata last', () => {
  const rows = [
    { id: 1, rating: null, title: null, safeTitle: null, metadataCached: false },
    { id: 2, rating: null, title: 'Beta', safeTitle: 'Beta', metadataCached: true },
    { id: 3, rating: null, title: 'Alpha', safeTitle: 'Alpha', metadataCached: true },
  ];

  assert.deepEqual(sortFavoriteRows(rows, FAVORITE_SORT_MODES.TITLE_ASC).map((row) => row.id), [3, 2, 1]);
  assert.deepEqual(sortFavoriteRows(rows, FAVORITE_SORT_MODES.TITLE_DESC).map((row) => row.id), [2, 3, 1]);
});

test('favorite library random row uses visible favorites', () => {
  const rows = [
    { id: 1, rating: null, title: null, safeTitle: null, metadataCached: false },
    { id: 2, rating: null, title: null, safeTitle: null, metadataCached: false },
    { id: 3, rating: null, title: null, safeTitle: null, metadataCached: false },
  ];

  assert.equal(getRandomFavoriteRow(rows, () => 0.5)?.id, 2);
  assert.equal(getRandomFavoriteRow([], () => 0.5), null);
});
