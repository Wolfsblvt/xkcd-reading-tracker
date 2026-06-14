import { coerceComicId, getValidComicIds, isValidComicId } from './comic-state.js';

export const ONBOARDING_MODES = Object.freeze({
  BEGINNING: 'beginning',
  READ_THROUGH: 'read-through',
  CURRENT: 'current',
  CAUGHT_UP: 'caught-up',
});

/**
 * @typedef {object} OnboardingPlan
 * @property {string} mode
 * @property {number[]} readIds
 * @property {number | null} continuePoint
 * @property {number | null} acknowledgedLatestComicId
 * @property {string} summary
 * @property {string} confirmText
 */

/**
 * @param {import('./types.js').TrackerMeta} meta
 * @returns {boolean}
 */
export function shouldSuggestOnboarding(meta) {
  return !meta.onboardingCompletedAt;
}

/**
 * @param {number[]} validIds
 * @param {number} comicId
 * @returns {number | null}
 */
function getNextValidComicIdAfter(validIds, comicId) {
  return validIds.find((id) => id > comicId) ?? null;
}

/**
 * @param {number} count
 * @returns {string}
 */
function formatReadCount(count) {
  return `${count} comic${count === 1 ? '' : 's'}`;
}

/**
 * @param {{ mode: string, latestComicId: number | null | undefined, targetComicId?: number | null | undefined }} input
 * @returns {{ ok: true, plan: OnboardingPlan } | { ok: false, error: string }}
 */
export function createOnboardingPlan({ mode, latestComicId, targetComicId = null }) {
  const latest = coerceComicId(latestComicId);
  if (latest === null) {
    return { ok: false, error: 'Latest known comic is not available yet.' };
  }

  const validIds = getValidComicIds(latest);
  if (validIds.length === 0) {
    return { ok: false, error: 'No valid comics are available yet.' };
  }

  if (mode === ONBOARDING_MODES.BEGINNING) {
    const first = validIds[0];
    return {
      ok: true,
      plan: {
        mode,
        readIds: [],
        continuePoint: first,
        acknowledgedLatestComicId: null,
        summary: `Start tracking from #${first}.`,
        confirmText: `Set the continue point to #${first} without marking any comics read?`,
      },
    };
  }

  if (mode === ONBOARDING_MODES.CAUGHT_UP) {
    return {
      ok: true,
      plan: {
        mode,
        readIds: validIds,
        continuePoint: null,
        acknowledgedLatestComicId: latest,
        summary: `Mark ${formatReadCount(validIds.length)} read and treat you as caught up.`,
        confirmText: `Mark all ${formatReadCount(validIds.length)} through #${latest} as read?`,
      },
    };
  }

  const target = coerceComicId(targetComicId);
  if (target === null || target > latest) {
    return { ok: false, error: 'Choose a valid xkcd comic number.' };
  }

  if (mode === ONBOARDING_MODES.READ_THROUGH) {
    const readIds = validIds.filter((id) => id <= target);
    const continuePoint = getNextValidComicIdAfter(validIds, target);
    const acknowledgedLatestComicId = continuePoint === null ? latest : null;
    return {
      ok: true,
      plan: {
        mode,
        readIds,
        continuePoint,
        acknowledgedLatestComicId,
        summary: continuePoint
          ? `Mark ${formatReadCount(readIds.length)} read and continue at #${continuePoint}.`
          : `Mark ${formatReadCount(readIds.length)} read and treat you as caught up.`,
        confirmText: continuePoint
          ? `Mark ${formatReadCount(readIds.length)} through #${target} as read and continue at #${continuePoint}?`
          : `Mark ${formatReadCount(readIds.length)} through #${target} as read and finish onboarding?`,
      },
    };
  }

  if (mode === ONBOARDING_MODES.CURRENT) {
    if (!isValidComicId(target, latest)) {
      return { ok: false, error: 'Choose a valid xkcd comic number.' };
    }

    const readIds = validIds.filter((id) => id < target);
    return {
      ok: true,
      plan: {
        mode,
        readIds,
        continuePoint: target,
        acknowledgedLatestComicId: null,
        summary: `Mark previous comics read and continue at #${target}.`,
        confirmText: `Mark ${formatReadCount(readIds.length)} before #${target} as read and continue there?`,
      },
    };
  }

  return { ok: false, error: 'Choose a valid onboarding option.' };
}
