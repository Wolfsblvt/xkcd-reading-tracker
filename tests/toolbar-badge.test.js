import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultMeta, createDefaultSettings } from '../src/shared/defaults.js';
import { TOOLBAR_BADGE_KINDS, getToolbarBadgeState } from '../src/shared/toolbar-badge.js';

function createSnapshot() {
  return {
    meta: createDefaultMeta({ now: new Date('2026-01-01T00:00:00.000Z') }),
    settings: createDefaultSettings(),
  };
}

test('incomplete onboarding always shows the setup badge', () => {
  const snapshot = createSnapshot();
  snapshot.settings.badge.enabled = false;
  snapshot.meta.lastNewComicId = 3001;
  snapshot.meta.acknowledgedLatestComicId = 3000;

  const badge = getToolbarBadgeState(snapshot);

  assert.equal(badge.kind, TOOLBAR_BADGE_KINDS.SETUP);
  assert.equal(badge.text, 'SET');
});

test('new-comic badge follows its setting after onboarding', () => {
  const snapshot = createSnapshot();
  snapshot.meta.onboardingCompletedAt = '2026-01-02T00:00:00.000Z';
  snapshot.meta.lastNewComicId = 3001;
  snapshot.meta.acknowledgedLatestComicId = 3000;

  assert.equal(getToolbarBadgeState(snapshot).kind, TOOLBAR_BADGE_KINDS.NEW_COMIC);

  snapshot.settings.badge.enabled = false;
  assert.equal(getToolbarBadgeState(snapshot).kind, TOOLBAR_BADGE_KINDS.NONE);
});
