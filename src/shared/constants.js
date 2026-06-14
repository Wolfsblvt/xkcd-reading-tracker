export const SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'xkcd-reading-tracker-backup';
export const BACKUP_VERSION = 1;

export const STORAGE_PREFIX = 'xrt:';
export const META_KEY = `${STORAGE_PREFIX}meta`;
export const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;
export const CHUNK_KEY_PREFIX = `${STORAGE_PREFIX}chunk:`;
export const LOCAL_METADATA_KEY = `${STORAGE_PREFIX}metadata`;
export const SESSION_TAB_MODE_PREFIX = `${STORAGE_PREFIX}tab-mode:`;
export const SESSION_FAVORITES_LIBRARY_KEY = `${STORAGE_PREFIX}favorites-library`;

export const CHUNK_SIZE = 250;
export const UNAVAILABLE_COMIC_IDS = Object.freeze([404]);

export const BROWSE_MODES = Object.freeze({
  ALL: 'all',
  UNREAD: 'unread',
  FAVORITES: 'favorites',
});

export const ALT_TEXT_MODES = Object.freeze({
  NATIVE: 'native',
  BELOW: 'below',
  DELAYED: 'delayed',
  HIDDEN: 'hidden',
});

export const RATING_DISPLAY_MODES = Object.freeze({
  HIDDEN: 'hidden',
  TEN_POINT: 'ten-point',
  FIVE_STAR: 'five-star',
});

export const PROGRESS_DISPLAY_MODES = Object.freeze({
  HIDDEN: 'hidden',
  TEXT: 'text',
  BAR: 'bar',
});

export const APPEARANCE_THEMES = Object.freeze({
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark',
});

export const LATEST_COMIC_ALARM = 'xrt:latest-comic-check';
export const DEFAULT_LATEST_CHECK_MINUTES = 360;

/**
 * @param {number} comicId
 * @returns {number}
 */
export function getChunkIndex(comicId) {
  return Math.floor((comicId - 1) / CHUNK_SIZE);
}

/**
 * @param {number} chunkIndex
 * @returns {string}
 */
export function getChunkKey(chunkIndex) {
  return `${CHUNK_KEY_PREFIX}${chunkIndex}`;
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isChunkKey(key) {
  return key.startsWith(CHUNK_KEY_PREFIX);
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isExtensionStorageKey(key) {
  return key.startsWith(STORAGE_PREFIX);
}
