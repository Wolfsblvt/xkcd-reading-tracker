export const SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'xkcd-reading-tracker-backup';
export const BACKUP_VERSION = 1;

export const STORAGE_PREFIX = 'xrt:';
export const META_KEY = `${STORAGE_PREFIX}meta`;
export const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;
export const CHUNK_KEY_PREFIX = `${STORAGE_PREFIX}chunk:`;
export const LOCAL_METADATA_KEY = `${STORAGE_PREFIX}metadata`;
export const LOCAL_SYNC_WRITE_BUFFER_KEY = `${STORAGE_PREFIX}sync-write-buffer`;
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

export const KEYBOARD_SHORTCUTS = Object.freeze({
  TOGGLE_READ: Object.freeze({
    key: 'r',
    label: 'R',
    description: 'Toggle read/unread',
  }),
  TOGGLE_FAVORITE: Object.freeze({
    key: 'f',
    label: 'F',
    description: 'Toggle favorite',
  }),
  SET_CONTINUE: Object.freeze({
    key: 'c',
    label: 'C',
    description: 'Set continue here',
  }),
  PREVIOUS: Object.freeze({
    key: 'p',
    label: 'P',
    description: 'Previous comic',
  }),
  NEXT: Object.freeze({
    key: 'n',
    label: 'N',
    description: 'Next comic',
  }),
  EXPLAIN: Object.freeze({
    key: 'e',
    label: 'E',
    description: 'Open Explain xkcd',
  }),
});

export const LATEST_COMIC_ALARM = 'xrt:latest-comic-check';
export const SYNC_WRITE_FLUSH_ALARM = 'xrt:sync-write-flush';
export const SYNC_WRITE_SET_MESSAGE = 'xrt:queue-sync-set';
export const SYNC_WRITE_REMOVE_MESSAGE = 'xrt:queue-sync-remove';
export const SYNC_WRITE_DEBOUNCE_MS = 3000;
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
