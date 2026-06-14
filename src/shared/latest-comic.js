import { coerceComicId } from './comic-state.js';

/**
 * @param {import('./types.js').TrackerMeta} meta
 * @param {number} latestComicId
 * @param {string} checkedAt
 * @returns {Partial<import('./types.js').TrackerMeta>}
 */
export function createLatestComicCheckPatch(meta, latestComicId, checkedAt) {
  const latest = coerceComicId(latestComicId);
  if (latest === null) {
    throw new Error(`Invalid latest comic id: ${latestComicId}`);
  }

  const previousLatest = coerceComicId(meta.latestKnownComicId);
  const acknowledged = coerceComicId(meta.acknowledgedLatestComicId);
  const lastNew = coerceComicId(meta.lastNewComicId);
  const patch = {
    latestKnownComicId: latest,
    latestCheckedAt: checkedAt,
  };

  if (previousLatest === null) {
    patch.acknowledgedLatestComicId = latest;
    patch.lastNewComicId = null;
    return patch;
  }

  if (latest > previousLatest) {
    patch.lastNewComicId = latest;
    if (acknowledged === null) {
      patch.acknowledgedLatestComicId = previousLatest;
    }
    return patch;
  }

  if (acknowledged === null && lastNew === null) {
    patch.acknowledgedLatestComicId = latest;
    patch.lastNewComicId = null;
    return patch;
  }

  if (lastNew !== null && acknowledged !== null && acknowledged >= lastNew) {
    patch.lastNewComicId = null;
  }

  return patch;
}
