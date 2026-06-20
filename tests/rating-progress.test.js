import assert from 'node:assert/strict';
import test from 'node:test';

import { RATING_DISPLAY_MODES } from '../src/shared/constants.js';
import { formatCompactProgressSummary, formatProgressSummary } from '../src/shared/progress-format.js';
import { formatPreviewRatingValue, formatRatingForDisplay, getRatingButtons } from '../src/shared/rating-control.js';

test('rating descriptors preserve five-star full and half-step behavior', () => {
  const buttons = getRatingButtons(RATING_DISPLAY_MODES.FIVE_STAR, 8);

  assert.equal(buttons.length, 5);
  assert.deepEqual(buttons.map((button) => button.text), ['★', '★', '★', '★', '☆']);
  assert.equal(buttons[3].rating, 7);
  assert.equal(buttons[4].rating, 10);
});

test('rating descriptors render ten-point dots and preview labels', () => {
  const buttons = getRatingButtons(RATING_DISPLAY_MODES.TEN_POINT, 3);

  assert.equal(buttons.length, 10);
  assert.deepEqual(buttons.slice(0, 4).map((button) => button.text), ['●', '●', '●', '○']);
  assert.equal(buttons[2].pressed, true);
  assert.equal(formatPreviewRatingValue(3, 7), '7/10');
  assert.equal(formatPreviewRatingValue(null, null), '0/10');
});

test('aggregate ratings follow the selected display scale', () => {
  assert.equal(formatRatingForDisplay(7.3, RATING_DISPLAY_MODES.TEN_POINT), '7.3');
  assert.equal(formatRatingForDisplay(5.5, RATING_DISPLAY_MODES.FIVE_STAR), '2.75');
  assert.equal(formatRatingForDisplay(null, RATING_DISPLAY_MODES.FIVE_STAR), '-');
});

test('progress summaries include consistent counts and percentage', () => {
  const progress = { read: 40, total: 100, unread: 60, percent: 40 };

  assert.equal(formatProgressSummary(progress), '40 of 100 comics read (40%). 60 unread.');
  assert.equal(formatCompactProgressSummary(progress), '40 of 100 comics read (40%).');
});
