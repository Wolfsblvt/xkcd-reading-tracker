import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultMeta } from '../src/shared/defaults.js';
import { createOnboardingPlan, ONBOARDING_MODES, shouldSuggestOnboarding } from '../src/shared/onboarding.js';

test('onboarding suggestion is controlled by completion timestamp', () => {
  const meta = createDefaultMeta({ now: new Date('2026-01-01T00:00:00.000Z') });
  assert.equal(shouldSuggestOnboarding(meta), true);

  meta.onboardingCompletedAt = '2026-01-02T00:00:00.000Z';
  assert.equal(shouldSuggestOnboarding(meta), false);
});

test('onboarding can start from the beginning without marking comics read', () => {
  const result = createOnboardingPlan({
    mode: ONBOARDING_MODES.BEGINNING,
    latestComicId: 5,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.readIds, []);
  assert.equal(result.plan.continuePoint, 1);
  assert.equal(result.plan.acknowledgedLatestComicId, null);
});

test('onboarding read-through skips unavailable comics and continues after target', () => {
  const result = createOnboardingPlan({
    mode: ONBOARDING_MODES.READ_THROUGH,
    latestComicId: 406,
    targetComicId: 404,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.readIds.includes(404), false);
  assert.equal(result.plan.readIds.at(-1), 403);
  assert.equal(result.plan.continuePoint, 405);

  const valid = createOnboardingPlan({
    mode: ONBOARDING_MODES.READ_THROUGH,
    latestComicId: 406,
    targetComicId: 405,
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.plan.readIds.includes(404), false);
  assert.equal(valid.plan.readIds.at(-1), 405);
  assert.equal(valid.plan.continuePoint, 406);
});

test('onboarding caught-up marks all valid comics and acknowledges latest', () => {
  const result = createOnboardingPlan({
    mode: ONBOARDING_MODES.CAUGHT_UP,
    latestComicId: 5,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.readIds, [1, 2, 3, 4, 5]);
  assert.equal(result.plan.continuePoint, null);
  assert.equal(result.plan.acknowledgedLatestComicId, 5);
});

test('onboarding current comic marks previous comics and continues there', () => {
  const result = createOnboardingPlan({
    mode: ONBOARDING_MODES.CURRENT,
    latestComicId: 6,
    targetComicId: 4,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.readIds, [1, 2, 3]);
  assert.equal(result.plan.continuePoint, 4);
});
