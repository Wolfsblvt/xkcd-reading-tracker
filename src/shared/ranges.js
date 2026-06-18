import { coerceComicId, isValidComicId } from './comic-state.js';

/**
 * @typedef {{ start: number, end: number }} ComicRange
 */

/**
 * @param {number[]} ids
 * @returns {ComicRange[]}
 */
export function normalizeRanges(ids) {
  const uniqueIds = [...new Set(ids)].sort((a, b) => a - b);
  const ranges = [];

  for (const id of uniqueIds) {
    const last = ranges.at(-1);
    if (last && last.end + 1 === id) {
      last.end = id;
    } else {
      ranges.push({ start: id, end: id });
    }
  }

  return ranges;
}

/**
 * @param {ComicRange} range
 * @returns {string}
 */
export function formatRange(range) {
  return range.start === range.end ? String(range.start) : `${range.start}-${range.end}`;
}

/**
 * @param {ComicRange[]} ranges
 * @returns {string}
 */
export function formatRanges(ranges) {
  return ranges.map(formatRange).join(', ');
}

/**
 * @param {string} input
 * @param {{ latestComicId: number | null | undefined }} options
 * @returns {{ ids: number[], ranges: ComicRange[], errors: string[] }}
 */
export function parseComicRangeInput(input, { latestComicId }) {
  const errors = [];
  const ids = [];
  const normalizedInput = input
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/(\d+)\s*-\s*(\d+)/g, '$1-$2')
    .replace(/(\d+)\s*\.\.\s*(\d+)/g, '$1..$2');
  if (!normalizedInput) {
    return { ids, ranges: [], errors: ['Enter at least one comic number or range.'] };
  }

  const tokens = normalizedInput.split(/[,\s;]+/).filter(Boolean);
  for (const token of tokens) {
    const match = token.match(/^(\d+)(?:(?:-|\.\.)(\d+))?$/);
    if (!match) {
      errors.push(`Could not parse "${token}". Use numbers or ranges like 10-20.`);
      continue;
    }

    const first = coerceComicId(match[1]);
    const second = match[2] ? coerceComicId(match[2]) : first;
    if (first === null || second === null) {
      errors.push(`Invalid comic number in "${token}".`);
      continue;
    }

    if (second < first) {
      errors.push(`Range "${token}" is reversed. Use the lower number first.`);
      continue;
    }

    const start = first;
    const end = second;
    for (let id = start; id <= end; id += 1) {
      if (isValidComicId(id, latestComicId)) {
        ids.push(id);
      } else {
        errors.push(`Comic ${id} is not available.`);
      }
    }
  }

  const uniqueIds = [...new Set(ids)].sort((a, b) => a - b);
  return {
    ids: uniqueIds,
    ranges: normalizeRanges(uniqueIds),
    errors,
  };
}

/**
 * @param {number[]} unreadIds
 * @returns {ComicRange[]}
 */
export function getUnreadRangesFromIds(unreadIds) {
  return normalizeRanges(unreadIds);
}
