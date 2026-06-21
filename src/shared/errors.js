const SYNC_WRITE_RATE_LIMIT_PATTERN = /MAX_WRITE_OPERATIONS_PER_MINUTE|write operations per minute|temporarily rate-limiting changes/i;

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? '');
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isSyncWriteRateLimitError(error) {
  return SYNC_WRITE_RATE_LIMIT_PATTERN.test(getErrorMessage(error));
}

/**
 * @param {unknown} error
 * @returns {Error}
 */
export function normalizeSyncWriteError(error) {
  if (isSyncWriteRateLimitError(error)) {
    return new Error('Chrome sync is temporarily rate-limiting changes. Your changes are queued and will retry automatically.');
  }
  return error instanceof Error ? error : new Error(getErrorMessage(error));
}
