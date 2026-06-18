import assert from 'node:assert/strict';
import test from 'node:test';

import { BACKUP_FORMAT, BACKUP_VERSION, SCHEMA_VERSION } from '../src/shared/constants.js';
import { createBackup, validateBackup } from '../src/shared/backup.js';
import { createDefaultMeta, createDefaultSettings } from '../src/shared/defaults.js';
import { migrateSyncItems } from '../src/storage/migrations.js';

test('backup round-trip preserves compact comic state', () => {
  const meta = createDefaultMeta({ now: new Date('2026-01-01T00:00:00.000Z') });
  meta.latestKnownComicId = 10;
  meta.continuePoint = 6;
  meta.onboardingCompletedAt = '2026-01-01T12:00:00.000Z';
  const settings = createDefaultSettings();
  settings.ratingDisplay = 'ten-point';

  const backup = createBackup({
    snapshot: {
      meta,
      settings,
      comics: {
        1: { r: 1 },
        2: { f: 1, rating: 7 },
        404: { r: 1 },
      },
    },
    extensionVersion: '0.1.0',
    now: new Date('2026-01-02T00:00:00.000Z'),
  });

  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.backupVersion, BACKUP_VERSION);
  assert.equal(backup.schemaVersion, SCHEMA_VERSION);
  assert.equal(backup.meta.onboardingCompletedAt, '2026-01-01T12:00:00.000Z');
  assert.deepEqual(backup.comics, {
    1: { r: 1 },
    2: { f: 1, rating: 7 },
  });

  const validated = validateBackup(backup);
  assert.equal(validated.ok, true);
  assert.equal(validated.data.meta.onboardingCompletedAt, '2026-01-01T12:00:00.000Z');
  assert.deepEqual(validated.data.comics, {
    1: { r: 1 },
    2: { f: 1, rating: 7 },
  });
});

test('backup validation rejects unrelated JSON', () => {
  const validated = validateBackup({ hello: 'world' });
  assert.equal(validated.ok, false);
  assert.equal(validated.errors.length > 0, true);
});

test('migration bootstrap creates current meta and settings', () => {
  const migrated = migrateSyncItems({});
  assert.equal(migrated.changed, true);
  assert.equal(migrated.updates['xrt:meta'].schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.updates['xrt:settings'].navigation.defaultBrowseMode, 'all');
  assert.equal(migrated.updates['xrt:settings'].navigation.showPageNavActions, true);
  assert.equal(migrated.updates['xrt:settings'].navigation.useXkcdStyleLabels, true);
});

test('migration normalizes malformed stored settings', () => {
  const migrated = migrateSyncItems({
    'xrt:settings': {
      autoMarkRead: {
        enabled: 'false',
        delaySeconds: '7',
      },
      navigation: {
        showExplainLink: 'true',
      },
    },
  });

  assert.equal(migrated.changed, true);
  assert.equal(migrated.updates['xrt:settings'].autoMarkRead.enabled, false);
  assert.equal(migrated.updates['xrt:settings'].autoMarkRead.delaySeconds, 7);
  assert.equal(migrated.updates['xrt:settings'].navigation.showExplainLink, true);
});
