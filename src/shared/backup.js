import { BACKUP_FORMAT, BACKUP_VERSION, SCHEMA_VERSION } from './constants.js';
import { createDefaultMeta, normalizeSettings } from './defaults.js';
import { coerceComicId, normalizeComicStateMap } from './comic-state.js';

/**
 * @param {{ snapshot: import('./types.js').TrackerSnapshot, extensionVersion: string, now?: Date }} input
 * @returns {object}
 */
export function createBackup({ snapshot, extensionVersion, now = new Date() }) {
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    extensionVersion,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    meta: {
      latestKnownComicId: snapshot.meta.latestKnownComicId,
      acknowledgedLatestComicId: snapshot.meta.acknowledgedLatestComicId,
      lastNewComicId: snapshot.meta.lastNewComicId,
      continuePoint: snapshot.meta.continuePoint,
      onboardingCompletedAt: snapshot.meta.onboardingCompletedAt,
    },
    settings: normalizeSettings(snapshot.settings),
    comics: normalizeComicStateMap(snapshot.comics, snapshot.meta.latestKnownComicId),
  };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, data: import('./types.js').TrackerSnapshot } | { ok: false, errors: string[] }}
 */
export function validateBackup(value) {
  const errors = [];
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: ['Backup must be a JSON object.'] };
  }

  const raw = /** @type {Record<string, any>} */ (value);
  if (raw.format !== BACKUP_FORMAT) {
    errors.push('Backup format identifier does not match this extension.');
  }

  if (raw.backupVersion !== BACKUP_VERSION) {
    errors.push(`Unsupported backup version: ${raw.backupVersion ?? 'missing'}.`);
  }

  if (raw.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`Unsupported schema version: ${raw.schemaVersion ?? 'missing'}.`);
  }

  const rawMeta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const latestKnownComicId = coerceComicId(rawMeta.latestKnownComicId);
  const acknowledgedLatestComicId = coerceComicId(rawMeta.acknowledgedLatestComicId);
  const lastNewComicId = coerceComicId(rawMeta.lastNewComicId);
  const continuePoint = coerceComicId(rawMeta.continuePoint);
  const onboardingCompletedAt = typeof rawMeta.onboardingCompletedAt === 'string' ? rawMeta.onboardingCompletedAt : null;
  const meta = createDefaultMeta();
  meta.latestKnownComicId = latestKnownComicId;
  meta.acknowledgedLatestComicId = acknowledgedLatestComicId;
  meta.lastNewComicId = lastNewComicId;
  meta.continuePoint = continuePoint;
  meta.onboardingCompletedAt = onboardingCompletedAt;

  const settings = normalizeSettings(raw.settings);
  const comics = normalizeComicStateMap(raw.comics, latestKnownComicId);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      meta,
      settings,
      comics,
    },
  };
}
