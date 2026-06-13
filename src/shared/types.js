/**
 * @typedef {'all' | 'unread' | 'favorites'} BrowseMode
 * @typedef {'native' | 'below' | 'delayed' | 'hidden'} AltTextMode
 * @typedef {'hidden' | 'ten-point' | 'five-star'} RatingDisplayMode
 * @typedef {'hidden' | 'text' | 'bar'} ProgressDisplayMode
 * @typedef {'system' | 'light' | 'dark'} AppearanceTheme
 */

/**
 * @typedef {object} ComicState
 * @property {boolean} read
 * @property {boolean} favorite
 * @property {number | null} rating Canonical 1-10 rating.
 */

/**
 * Sparse persisted comic state. Missing properties are false/null.
 *
 * @typedef {object} PersistedComicState
 * @property {1} [r] Read flag.
 * @property {1} [f] Favorite flag.
 * @property {number} [rating] Canonical 1-10 rating.
 */

/**
 * @typedef {Record<string, PersistedComicState>} ComicStateMap
 */

/**
 * @typedef {object} TrackerSettings
 * @property {{ enabled: boolean, delaySeconds: number }} autoMarkRead
 * @property {{ mode: AltTextMode, delaySeconds: number }} altText
 * @property {RatingDisplayMode} ratingDisplay
 * @property {ProgressDisplayMode} progressDisplay
 * @property {{ defaultBrowseMode: BrowseMode, showExplainLink: boolean, updateBothNavBars: boolean, showPageNavActions: boolean }} navigation
 * @property {{ enabled: boolean, checkEveryMinutes: number }} badge
 * @property {{ theme: AppearanceTheme }} appearance
 */

/**
 * @typedef {object} TrackerMeta
 * @property {number} schemaVersion
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {number | null} latestKnownComicId
 * @property {string | null} latestCheckedAt
 * @property {number | null} lastNewComicId
 * @property {number | null} acknowledgedLatestComicId
 * @property {number | null} continuePoint
 */

/**
 * @typedef {object} TrackerSnapshot
 * @property {TrackerMeta} meta
 * @property {TrackerSettings} settings
 * @property {ComicStateMap} comics
 */

/**
 * @typedef {object} ComicMetadata
 * @property {number} num
 * @property {string} title
 * @property {string} safeTitle
 * @property {string} alt
 * @property {string} img
 * @property {string} year
 * @property {string} month
 * @property {string} day
 * @property {string} fetchedAt
 */

export {};
