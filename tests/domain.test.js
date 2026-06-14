import assert from 'node:assert/strict';
import test from 'node:test';

import { BROWSE_MODES } from '../src/shared/constants.js';
import {
  calculateNextContinuePoint,
  calculateProgress,
  compressComicState,
  getUnreadComicIds,
  isValidComicId,
  mergeComicStatePatch,
} from '../src/shared/comic-state.js';
import { createDefaultMeta } from '../src/shared/defaults.js';
import { createLatestComicCheckPatch } from '../src/shared/latest-comic.js';
import { calculateNavigation } from '../src/shared/navigation.js';
import { formatRanges, getUnreadRangesFromIds, parseComicRangeInput } from '../src/shared/ranges.js';

test('comic 404 is excluded consistently', () => {
  assert.equal(isValidComicId(404, 500), false);
  assert.equal(isValidComicId(405, 500), true);

  const state = {
    404: { r: 1 },
  };
  const progress = calculateProgress(state, 405);
  assert.equal(progress.total, 404);
  assert.equal(progress.read, 0);
});

test('comic state patches preserve unrelated state', () => {
  const favorite = compressComicState({ favorite: true, rating: 8 });
  const unreadFavorite = mergeComicStatePatch(favorite, { read: false });
  const readFavorite = mergeComicStatePatch(unreadFavorite, { read: true });

  assert.deepEqual(unreadFavorite, { f: 1, rating: 8 });
  assert.deepEqual(readFavorite, { r: 1, f: 1, rating: 8 });
});

test('progress and unread IDs use sparse read state', () => {
  const state = {
    1: { r: 1 },
    2: { f: 1 },
    3: { r: 1, rating: 9 },
  };

  assert.deepEqual(calculateProgress(state, 5), {
    total: 5,
    read: 2,
    unread: 3,
    percent: 40,
  });
  assert.deepEqual(getUnreadComicIds(state, 5), [2, 4, 5]);
});

test('continue point advances only upward and becomes null when caught up', () => {
  assert.equal(calculateNextContinuePoint({
    state: { 1: { r: 1 }, 2: { r: 1 }, 3: { r: 1 } },
    latestComicId: 3,
    continuePoint: 2,
  }), null);

  assert.equal(calculateNextContinuePoint({
    state: { 1: { r: 1 }, 2: { r: 1 }, 4: { r: 1 } },
    latestComicId: 5,
    continuePoint: 2,
  }), 3);

  assert.equal(calculateNextContinuePoint({
    state: { 1: { r: 1 }, 4: { r: 1 } },
    latestComicId: 5,
    continuePoint: 3,
  }), 3);

  assert.equal(calculateNextContinuePoint({
    state: {},
    latestComicId: 5,
    continuePoint: null,
  }), null);
});

test('filtered navigation calculates neighbors around the current comic', () => {
  const state = {
    1: { r: 1 },
    2: { r: 1, f: 1 },
    4: { f: 1 },
    5: { r: 1 },
  };

  assert.deepEqual(calculateNavigation({
    mode: BROWSE_MODES.UNREAD,
    currentId: 3,
    latestComicId: 6,
    state,
    random: () => 0,
  }), {
    first: 3,
    previous: null,
    random: 4,
    next: 4,
    last: 6,
    count: 3,
    includesCurrent: true,
  });

  assert.deepEqual(calculateNavigation({
    mode: BROWSE_MODES.FAVORITES,
    currentId: 3,
    latestComicId: 6,
    state,
    random: () => 0,
  }), {
    first: 2,
    previous: 2,
    random: 2,
    next: 4,
    last: 4,
    count: 2,
    includesCurrent: false,
  });
});

test('range parser normalizes input and reports unavailable comics', () => {
  const parsed = parseComicRangeInput('3-1, 4, 404, nope, 405..406', { latestComicId: 406 });

  assert.deepEqual(parsed.ids, [1, 2, 3, 4, 405, 406]);
  assert.equal(formatRanges(getUnreadRangesFromIds(parsed.ids)), '1-4, 405-406');
  assert.equal(parsed.errors.includes('Comic 404 is not available.'), true);
  assert.equal(parsed.errors.some((error) => error.includes('nope')), true);
});

test('latest-comic check initializes acknowledged latest on first check', () => {
  const meta = createDefaultMeta({ now: new Date('2026-01-01T00:00:00.000Z') });
  const patch = createLatestComicCheckPatch(meta, 3000, '2026-01-02T00:00:00.000Z');

  assert.deepEqual(patch, {
    latestKnownComicId: 3000,
    latestCheckedAt: '2026-01-02T00:00:00.000Z',
    acknowledgedLatestComicId: 3000,
    lastNewComicId: null,
  });
});

test('latest-comic check repairs missing acknowledgement after content bootstrap', () => {
  const meta = createDefaultMeta({ now: new Date('2026-01-01T00:00:00.000Z') });
  meta.latestKnownComicId = 3000;
  const patch = createLatestComicCheckPatch(meta, 3000, '2026-01-02T00:00:00.000Z');

  assert.deepEqual(patch, {
    latestKnownComicId: 3000,
    latestCheckedAt: '2026-01-02T00:00:00.000Z',
    acknowledgedLatestComicId: 3000,
    lastNewComicId: null,
  });
});

test('latest-comic check preserves a new comic as unacknowledged', () => {
  const meta = createDefaultMeta({ now: new Date('2026-01-01T00:00:00.000Z') });
  meta.latestKnownComicId = 3000;
  meta.acknowledgedLatestComicId = 3000;
  const patch = createLatestComicCheckPatch(meta, 3001, '2026-01-02T00:00:00.000Z');

  assert.deepEqual(patch, {
    latestKnownComicId: 3001,
    latestCheckedAt: '2026-01-02T00:00:00.000Z',
    lastNewComicId: 3001,
  });
});
