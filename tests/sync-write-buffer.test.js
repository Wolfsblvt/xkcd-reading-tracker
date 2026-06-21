import assert from 'node:assert/strict';
import test from 'node:test';

import { isSyncWriteRateLimitError, normalizeSyncWriteError } from '../src/shared/errors.js';
import {
  applyBufferedSyncWrites,
  createEmptySyncWriteBuffer,
  hasBufferedSyncWrites,
  mergeBufferedSyncRemove,
  mergeBufferedSyncSet,
  normalizeSyncWriteBuffer,
} from '../src/storage/sync-write-buffer-state.js';

test('buffered sync writes merge repeated changes with the latest value winning', () => {
  const initial = createEmptySyncWriteBuffer();
  const first = mergeBufferedSyncSet(initial, { settings: { theme: 'light' }, meta: { updated: 1 } }, 'first');
  const second = mergeBufferedSyncSet(first, { settings: { theme: 'dark' } }, 'second');

  assert.deepEqual(second, {
    v: 1,
    setItems: {
      settings: { theme: 'dark' },
      meta: { updated: 1 },
    },
    removeKeys: [],
    updatedAt: 'second',
  });
  assert.equal(hasBufferedSyncWrites(second), true);
});

test('buffered sync set and remove operations cancel conflicting older work', () => {
  const initial = mergeBufferedSyncSet(createEmptySyncWriteBuffer(), { keep: 1, replace: 1 }, 'first');
  const removed = mergeBufferedSyncRemove(initial, ['replace', 'missing'], 'second');
  const replaced = mergeBufferedSyncSet(removed, { replace: 2 }, 'third');

  assert.deepEqual(replaced.setItems, { keep: 1, replace: 2 });
  assert.deepEqual(replaced.removeKeys, ['missing']);
});

test('buffered sync reads overlay queued writes and removals', () => {
  const buffer = normalizeSyncWriteBuffer({
    setItems: { changed: 2, added: 3 },
    removeKeys: ['removed'],
    updatedAt: 'now',
  });

  assert.deepEqual(applyBufferedSyncWrites({ changed: 1, removed: true, untouched: 4 }, buffer), {
    changed: 2,
    added: 3,
    untouched: 4,
  });
});

test('sync write rate-limit errors are recognized without hiding unrelated failures', () => {
  const quotaError = new Error('This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.');

  assert.equal(isSyncWriteRateLimitError(quotaError), true);
  assert.equal(isSyncWriteRateLimitError(new Error('Storage is unavailable.')), false);
  assert.match(normalizeSyncWriteError(quotaError).message, /queued and will retry automatically/i);
});
