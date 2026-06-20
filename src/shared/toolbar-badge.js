export const TOOLBAR_BADGE_KINDS = Object.freeze({
  NONE: 'none',
  SETUP: 'setup',
  NEW_COMIC: 'new-comic',
});

/**
 * @param {{ meta: import('./types.js').TrackerMeta, settings: import('./types.js').TrackerSettings }} snapshot
 * @returns {{ kind: string, text: string, color: string | null, title: string }}
 */
export function getToolbarBadgeState(snapshot) {
  if (!snapshot.meta.onboardingCompletedAt) {
    return {
      kind: TOOLBAR_BADGE_KINDS.SETUP,
      text: 'SET',
      color: '#B86600',
      title: 'Finish setting up xkcd Reading Tracker',
    };
  }

  const acknowledged = snapshot.meta.acknowledgedLatestComicId ?? 0;
  const lastNewComicId = snapshot.meta.lastNewComicId ?? 0;
  if (snapshot.settings.badge.enabled && lastNewComicId > acknowledged) {
    return {
      kind: TOOLBAR_BADGE_KINDS.NEW_COMIC,
      text: 'NEW',
      color: '#6E7B9D',
      title: `New xkcd comic #${lastNewComicId} is available`,
    };
  }

  return {
    kind: TOOLBAR_BADGE_KINDS.NONE,
    text: '',
    color: null,
    title: 'xkcd Reading Tracker',
  };
}
