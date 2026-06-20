import { RATING_DISPLAY_MODES } from './constants.js';
import { normalizeRating } from './comic-state.js';

/**
 * @typedef {object} RatingButtonDescriptor
 * @property {number} rating
 * @property {string} text
 * @property {string} className
 * @property {boolean} pressed
 * @property {string} title
 */

/**
 * @param {number | null | undefined} rating
 * @returns {string}
 */
export function formatRatingValue(rating) {
  const normalized = normalizeRating(rating);
  return normalized ? `${normalized}/10` : '0/10';
}

/**
 * @param {number | null | undefined} currentRating
 * @param {number | null | undefined} previewRating
 * @returns {string}
 */
export function formatPreviewRatingValue(currentRating, previewRating) {
  return formatRatingValue(previewRating ?? currentRating);
}

/**
 * Formats canonical 1-10 values, including calculated averages, for the selected UI scale.
 * @param {number | null | undefined} rating
 * @param {import('./types.js').RatingDisplayMode} displayMode
 * @returns {string}
 */
export function formatRatingForDisplay(rating, displayMode) {
  if (rating == null) {
    return '-';
  }
  const value = Number(rating);
  if (!Number.isFinite(value)) {
    return '-';
  }

  if (displayMode === RATING_DISPLAY_MODES.FIVE_STAR) {
    return String(Number((value / 2).toFixed(2)));
  }
  return String(Number(value.toFixed(1)));
}

/**
 * @param {number | null | undefined} currentRating
 * @returns {RatingButtonDescriptor[]}
 */
function getStarRatingButtons(currentRating) {
  const rating = normalizeRating(currentRating) ?? 0;
  const buttons = [];
  for (let star = 1; star <= 5; star += 1) {
    const fullValue = star * 2;
    const halfValue = fullValue - 1;
    const starState = rating >= fullValue ? 'full' : rating === halfValue ? 'half' : 'empty';
    buttons.push({
      rating: rating === fullValue ? halfValue : fullValue,
      text: starState === 'full' ? '★' : starState === 'half' ? '⯨' : '☆',
      className: `xrt-rating-button xrt-star-button xrt-star-${starState}`,
      pressed: rating >= halfValue,
      title: rating === fullValue ? `Set ${star - 0.5} stars` : `Set ${star} stars`,
    });
  }
  return buttons;
}

/**
 * @param {number | null | undefined} currentRating
 * @returns {RatingButtonDescriptor[]}
 */
function getTenPointRatingButtons(currentRating) {
  const rating = normalizeRating(currentRating) ?? 0;
  const buttons = [];
  for (let value = 1; value <= 10; value += 1) {
    buttons.push({
      rating: value,
      text: rating && value <= rating ? '●' : '○',
      className: 'xrt-rating-button xrt-dot-button',
      pressed: rating === value,
      title: `Set rating to ${value}/10`,
    });
  }
  return buttons;
}

/**
 * @param {import('./types.js').RatingDisplayMode} displayMode
 * @param {number | null | undefined} currentRating
 * @returns {RatingButtonDescriptor[]}
 */
export function getRatingButtons(displayMode, currentRating) {
  if (displayMode === RATING_DISPLAY_MODES.FIVE_STAR) {
    return getStarRatingButtons(currentRating);
  }
  if (displayMode === RATING_DISPLAY_MODES.TEN_POINT) {
    return getTenPointRatingButtons(currentRating);
  }
  return [];
}
