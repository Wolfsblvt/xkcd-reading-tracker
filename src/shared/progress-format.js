/**
 * @param {{ read: number, total: number, unread: number, percent: number }} progress
 * @returns {string}
 */
export function formatProgressSummary(progress) {
  return `${progress.read} of ${progress.total} comics read (${progress.percent}%). ${progress.unread} unread.`;
}

/**
 * @param {{ read: number, total: number, percent: number }} progress
 * @returns {string}
 */
export function formatCompactProgressSummary(progress) {
  return `${progress.read} of ${progress.total} comics read (${progress.percent}%).`;
}
