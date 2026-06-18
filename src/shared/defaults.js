import {
  ALT_TEXT_MODES,
  APPEARANCE_THEMES,
  BROWSE_MODES,
  DEFAULT_LATEST_CHECK_MINUTES,
  PROGRESS_DISPLAY_MODES,
  RATING_DISPLAY_MODES,
  SCHEMA_VERSION,
} from './constants.js';

export const DEFAULT_SETTINGS = Object.freeze({
  autoMarkRead: Object.freeze({
    enabled: false,
    delaySeconds: 5,
  }),
  altText: Object.freeze({
    mode: ALT_TEXT_MODES.BELOW,
    delaySeconds: 3,
  }),
  ratingDisplay: RATING_DISPLAY_MODES.HIDDEN,
  progressDisplay: PROGRESS_DISPLAY_MODES.BAR,
  navigation: Object.freeze({
    defaultBrowseMode: BROWSE_MODES.ALL,
    showExplainLink: true,
    updateBothNavBars: true,
    showPageNavActions: true,
    useXkcdStyleLabels: true,
  }),
  keyboardShortcuts: Object.freeze({
    enabled: false,
  }),
  badge: Object.freeze({
    enabled: true,
    checkEveryMinutes: DEFAULT_LATEST_CHECK_MINUTES,
  }),
  appearance: Object.freeze({
    theme: APPEARANCE_THEMES.SYSTEM,
  }),
});

/**
 * @returns {import('./types.js').TrackerSettings}
 */
export function createDefaultSettings() {
  return {
    autoMarkRead: { ...DEFAULT_SETTINGS.autoMarkRead },
    altText: { ...DEFAULT_SETTINGS.altText },
    ratingDisplay: DEFAULT_SETTINGS.ratingDisplay,
    progressDisplay: DEFAULT_SETTINGS.progressDisplay,
    navigation: { ...DEFAULT_SETTINGS.navigation },
    keyboardShortcuts: { ...DEFAULT_SETTINGS.keyboardShortcuts },
    badge: { ...DEFAULT_SETTINGS.badge },
    appearance: { ...DEFAULT_SETTINGS.appearance },
  };
}

/**
 * @param {{ now?: Date }} [options]
 * @returns {import('./types.js').TrackerMeta}
 */
export function createDefaultMeta({ now = new Date() } = {}) {
  const timestamp = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    latestKnownComicId: null,
    latestCheckedAt: null,
    lastNewComicId: null,
    acknowledgedLatestComicId: null,
    continuePoint: null,
    onboardingCompletedAt: null,
  };
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeDelaySeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 5;
  }

  return Math.max(0, Math.min(3600, Math.round(number)));
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {Record<string, T>} allowed
 * @param {T} fallback
 * @returns {T}
 */
function normalizeEnum(value, allowed, fallback) {
  const allowedValues = new Set(Object.values(allowed));
  return allowedValues.has(/** @type {T} */ (value)) ? /** @type {T} */ (value) : fallback;
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * @param {unknown} value
 * @returns {import('./types.js').TrackerSettings}
 */
export function normalizeSettings(value) {
  const defaults = createDefaultSettings();
  const raw = value && typeof value === 'object' ? /** @type {Record<string, any>} */ (value) : {};
  const autoMarkRead = raw.autoMarkRead && typeof raw.autoMarkRead === 'object' ? raw.autoMarkRead : {};
  const altText = raw.altText && typeof raw.altText === 'object' ? raw.altText : {};
  const navigation = raw.navigation && typeof raw.navigation === 'object' ? raw.navigation : {};
  const keyboardShortcuts = raw.keyboardShortcuts && typeof raw.keyboardShortcuts === 'object' ? raw.keyboardShortcuts : {};
  const badge = raw.badge && typeof raw.badge === 'object' ? raw.badge : {};

  return {
    autoMarkRead: {
      enabled: normalizeBoolean(autoMarkRead.enabled, defaults.autoMarkRead.enabled),
      delaySeconds: normalizeDelaySeconds(autoMarkRead.delaySeconds ?? defaults.autoMarkRead.delaySeconds),
    },
    altText: {
      mode: normalizeEnum(altText.mode, ALT_TEXT_MODES, defaults.altText.mode),
      delaySeconds: normalizeDelaySeconds(altText.delaySeconds ?? defaults.altText.delaySeconds),
    },
    ratingDisplay: normalizeEnum(raw.ratingDisplay, RATING_DISPLAY_MODES, defaults.ratingDisplay),
    progressDisplay: normalizeEnum(raw.progressDisplay, PROGRESS_DISPLAY_MODES, defaults.progressDisplay),
    navigation: {
      defaultBrowseMode: normalizeEnum(navigation.defaultBrowseMode, BROWSE_MODES, defaults.navigation.defaultBrowseMode),
      showExplainLink: normalizeBoolean(navigation.showExplainLink, defaults.navigation.showExplainLink),
      updateBothNavBars: normalizeBoolean(navigation.updateBothNavBars, defaults.navigation.updateBothNavBars),
      showPageNavActions: normalizeBoolean(navigation.showPageNavActions, defaults.navigation.showPageNavActions),
      useXkcdStyleLabels: normalizeBoolean(navigation.useXkcdStyleLabels, defaults.navigation.useXkcdStyleLabels),
    },
    keyboardShortcuts: {
      enabled: normalizeBoolean(keyboardShortcuts.enabled, defaults.keyboardShortcuts.enabled),
    },
    badge: {
      enabled: normalizeBoolean(badge.enabled, defaults.badge.enabled),
      checkEveryMinutes: Math.max(30, normalizeDelaySeconds(badge.checkEveryMinutes ?? defaults.badge.checkEveryMinutes)),
    },
    appearance: {
      theme: normalizeEnum(raw.appearance?.theme, APPEARANCE_THEMES, defaults.appearance.theme),
    },
  };
}
