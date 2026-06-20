import { calculateProgress, getComicState, getValidComicIds } from './comic-state.js';

/**
 * @param {number[]} values
 * @returns {number | null}
 */
function average(values) {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/**
 * @param {{ comics: import('./types.js').ComicStateMap, latestComicId: number | null | undefined }} input
 * @returns {{
 *   total: number,
 *   read: number,
 *   unread: number,
 *   percent: number,
 *   favorite: number,
 *   readFavorites: number,
 *   unreadFavorites: number,
 *   rated: number,
 *   unrated: number,
 *   ratedFavorites: number,
 *   averageRating: number | null,
 *   averageFavoriteRating: number | null,
 *   highestRating: number | null,
 *   lowestRating: number | null,
 *   tenOutOfTen: number,
 *   ratingDistribution: Record<number, number>,
 *   favoriteRatingDistribution: Record<number, number>,
 * }}
 */
export function calculateTrackerStatistics({ comics, latestComicId }) {
  const progress = calculateProgress(comics, latestComicId);
  const ratingDistribution = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [index + 1, 0])
  );
  const favoriteRatingDistribution = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [index + 1, 0])
  );
  const ratings = [];
  const favoriteRatings = [];
  let favorite = 0;
  let readFavorites = 0;
  let tenOutOfTen = 0;

  for (const id of getValidComicIds(latestComicId)) {
    const state = getComicState(comics, id);
    if (state.favorite) {
      favorite += 1;
      if (state.read) {
        readFavorites += 1;
      }
    }
    if (state.rating !== null) {
      ratings.push(state.rating);
      ratingDistribution[state.rating] += 1;
      if (state.rating === 10) {
        tenOutOfTen += 1;
      }
      if (state.favorite) {
        favoriteRatings.push(state.rating);
        favoriteRatingDistribution[state.rating] += 1;
      }
    }
  }

  return {
    total: progress.total,
    read: progress.read,
    unread: progress.unread,
    percent: progress.percent,
    favorite,
    readFavorites,
    unreadFavorites: favorite - readFavorites,
    rated: ratings.length,
    unrated: Math.max(0, progress.total - ratings.length),
    ratedFavorites: favoriteRatings.length,
    averageRating: average(ratings),
    averageFavoriteRating: average(favoriteRatings),
    highestRating: ratings.length > 0 ? Math.max(...ratings) : null,
    lowestRating: ratings.length > 0 ? Math.min(...ratings) : null,
    tenOutOfTen,
    ratingDistribution,
    favoriteRatingDistribution,
  };
}
