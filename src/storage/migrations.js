import { META_KEY, SCHEMA_VERSION, SETTINGS_KEY, isChunkKey } from '../shared/constants.js';
import { createDefaultMeta, normalizeSettings } from '../shared/defaults.js';
import { coerceComicId, normalizeComicStateMap } from '../shared/comic-state.js';

/**
 * @param {unknown} raw
 * @returns {import('../shared/types.js').TrackerMeta}
 */
export function normalizeMeta(raw) {
  const defaults = createDefaultMeta();
  const value = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : defaults.createdAt,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : defaults.updatedAt,
    latestKnownComicId: coerceComicId(value.latestKnownComicId),
    latestCheckedAt: typeof value.latestCheckedAt === 'string' ? value.latestCheckedAt : null,
    lastNewComicId: coerceComicId(value.lastNewComicId),
    acknowledgedLatestComicId: coerceComicId(value.acknowledgedLatestComicId),
    continuePoint: coerceComicId(value.continuePoint),
    onboardingCompletedAt: typeof value.onboardingCompletedAt === 'string' ? value.onboardingCompletedAt : null,
  };
}

/**
 * Current schema migration entry point. There are no historical production
 * schemas yet, but this keeps the bootstrap/idempotent normalization path
 * separate from feature code.
 *
 * @param {Record<string, any>} items
 * @returns {{ updates: Record<string, any>, changed: boolean }}
 */
export function migrateSyncItems(items) {
  const updates = {};
  let changed = false;

  const rawMeta = items[META_KEY];
  const rawVersion = Number(rawMeta?.schemaVersion ?? 0);
  if (rawVersion > SCHEMA_VERSION) {
    throw new Error(`Stored schema version ${rawVersion} is newer than this extension supports.`);
  }

  const meta = normalizeMeta(rawMeta);
  if (!rawMeta || rawVersion !== SCHEMA_VERSION) {
    updates[META_KEY] = meta;
    changed = true;
  }

  if (!items[SETTINGS_KEY]) {
    updates[SETTINGS_KEY] = normalizeSettings(items[SETTINGS_KEY]);
    changed = true;
  }

  for (const [key, value] of Object.entries(items)) {
    if (!isChunkKey(key)) {
      continue;
    }

    const rawChunk = value && typeof value === 'object' ? value : {};
    if (rawChunk.v === SCHEMA_VERSION) {
      continue;
    }

    updates[key] = {
      v: SCHEMA_VERSION,
      comics: normalizeComicStateMap(rawChunk.comics, meta.latestKnownComicId),
    };
    changed = true;
  }

  return { updates, changed };
}
