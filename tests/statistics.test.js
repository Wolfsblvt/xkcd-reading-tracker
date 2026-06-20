import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateTrackerStatistics } from '../src/shared/statistics.js';

test('tracker statistics summarize progress, favorites, and ratings', () => {
  const stats = calculateTrackerStatistics({
    latestComicId: 5,
    comics: {
      1: { r: 1, rating: 10 },
      2: { f: 1, rating: 8 },
      3: { r: 1, f: 1 },
      4: { rating: 4 },
    },
  });

  assert.equal(stats.total, 5);
  assert.equal(stats.read, 2);
  assert.equal(stats.unread, 3);
  assert.equal(stats.percent, 40);
  assert.equal(stats.favorite, 2);
  assert.equal(stats.readFavorites, 1);
  assert.equal(stats.unreadFavorites, 1);
  assert.equal(stats.rated, 3);
  assert.equal(stats.unrated, 2);
  assert.equal(stats.averageRating, 7.3);
  assert.equal(stats.averageFavoriteRating, 8);
  assert.equal(stats.highestRating, 10);
  assert.equal(stats.lowestRating, 4);
  assert.equal(stats.tenOutOfTen, 1);
  assert.equal(stats.ratingDistribution[10], 1);
  assert.equal(stats.favoriteRatingDistribution[8], 1);
  assert.equal(stats.favoriteRatingDistribution[10], 0);
});

test('rating distribution splits favorites from other rated comics', () => {
  const stats = calculateTrackerStatistics({
    latestComicId: 4,
    comics: {
      1: { rating: 7 },
      2: { f: 1, rating: 7 },
      3: { f: 1, rating: 4 },
    },
  });

  assert.equal(stats.ratingDistribution[7], 2);
  assert.equal(stats.favoriteRatingDistribution[7], 1);
  assert.equal(stats.ratingDistribution[4], 1);
  assert.equal(stats.favoriteRatingDistribution[4], 1);
});
