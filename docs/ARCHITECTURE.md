# Architecture

## Meaning

This document owns the extension's current runtime components, data flow, and integration boundaries. It summarizes storage only where it participates in those flows; [Data Model](DATA-MODEL.md) owns the exact persisted records, invariants, schema, and compatibility rules. It exists so cross-file runtime decisions can be recovered without reverse-engineering the whole source tree; planned product work belongs in `DIRECTION.md`, not here.

## System Shape

This is a directly loadable Manifest V3 Chrome extension. Production code is plain JavaScript, HTML, and CSS with no bundler, UI framework, runtime dependencies, backend, analytics, or remote code.

The extension augments xkcd rather than replacing it. The xkcd page remains the primary reading surface; the popup is for quick actions; the dashboard/options page is for management.

## Components

- `manifest.json` declares the MV3 service worker, static xkcd content script, popup, options/dashboard page, host access limited to xkcd, and raster icons.
- `src/content/content.js` is a tiny classic content-script bridge. Static manifest content scripts are not module scripts, so it dynamically imports `src/content/page.js`.
- `src/content/page.js` owns xkcd page integration: comic detection, injected controls, active-view timers, per-tab browse mode, filtered navigation, optional keyboard shortcuts, toolbar-icon detection signals, and storage refreshes.
- `src/popup` owns the compact toolbar UI.
- `src/dashboard` owns the full management/options page.
- `src/background/service-worker.js` owns installation setup, latest-comic checks, badge state, toolbar action icon state, and per-tab browse-mode storage.
- `src/shared` contains pure domain logic for validity rules, state normalization, progress, progress formatting, rating-control descriptors, onboarding planning, ranges, navigation, favorites-library filtering/export, statistics, settings, and backup validation.
- `src/storage` is the persistence boundary around Chrome storage and xkcd metadata caching.
- `tests` covers the pure domain logic, backup validation, migration bootstrap, and manifest smoke checks with Node's built-in test runner.

## Data Ownership

User-created data is synchronized with `chrome.storage.sync`:

- read/unread state
- favorites
- ratings
- continue point
- settings
- schema metadata
- latest-comic acknowledgement state
- onboarding completion timestamp
- extension-page appearance preference
- keyboard shortcut preference

Public xkcd metadata is cached in `chrome.storage.local` because it is rebuildable and should not consume sync quota. The cache stores metadata fetched from xkcd `info.0.json` endpoints only when needed, including title and image URL data used by the favorites library. Local storage also holds a small durable journal of pending sync changes; it is removed after those changes reach Chrome Sync.

The active browse mode is scoped per tab through `chrome.storage.session`, mediated by the service worker. It is not synchronized because changing a mode in one xkcd tab should not surprise another tab.

Favorites library preferences for sort mode, rating filter, and page size are also stored in `chrome.storage.session`. Search text and current page are intentionally ephemeral so reopening the dashboard does not feel stuck on a previous narrow search.

The extension deliberately avoids browser `localStorage`; Chrome documents that content scripts share Web Storage with the host page and extension service workers cannot use it.

## Persisted Data Model

`src/storage/storage-service.js` is the application persistence boundary. It presents one normalized tracker snapshot to the content script, popup, dashboard, and service worker while keeping synchronized user state, rebuildable local metadata, pending delivery state, and session-only preferences distinct.

Sync writes are routed through the service worker. Each change is journaled locally before its caller is acknowledged, and reads overlay that journal on Chrome Sync until the serialized writer flushes it. A debounce handles ordinary batching; a Chrome alarm and startup recovery cover service-worker suspension. Rate-limit failures stay queued for retry.

[Data Model](DATA-MODEL.md) owns the exact keys, record shapes, invariants, schema/bootstrap behavior, and backup/import/reset compatibility boundary.

## Comic Validity

Unavailable comics are centralized in `src/shared/constants.js`. Version one excludes comic `404`. Progress, unread ranges, filtered navigation, bulk input parsing, and backup normalization all use the same validity helpers.

If the latest known comic is unavailable, progress cannot be computed meaningfully and stays at zero until xkcd metadata is fetched or a comic page supplies a newer known ID.

## Continue Point

The continue point is separate from read state and browser history.

The user can explicitly set it to the current comic or to the start of an unread range. When the comic at the continue point becomes read, the point advances to the next unread comic with a higher comic number. If no later unread comic exists, the continue point becomes `null`, meaning caught up. Marking an older comic unread later does not pull the continue point backward.

Missing continue points stay missing. This is deliberate: a reset or imported file with no continue point should not silently become comic `#1`. Invalid continue points are normalized to `null`.

## xkcd Page Integration

The content script detects the current comic by:

1. reading the numbered permanent link on the page,
2. falling back to the numbered URL path,
3. falling back to `https://xkcd.com/info.0.json` on the homepage.

This avoids assuming that the homepage URL itself contains the latest comic ID.

The injected panel is inserted below `#comic` when possible. It stays centered like xkcd's own content and avoids forcing a white background or fixed text color. Page controls copy computed button and link styles from xkcd's native navigation, which makes the content-script UI blend with the page and behave better with page-level dark-mode extensions.

Alt text comes from the comic image `title` attribute or fetched metadata. It is displayed above the tracker controls because it belongs to the comic, not to tracker state. Automatic read marking and delayed alt-text reveal use active viewing time only: the document must be visible and focused. Delayed alt text is hidden until the timer completes instead of reserving a placeholder.

Automatic read marking is a one-shot page-load timer. It does not restart from ordinary re-renders or from clicking tracker controls. Explicit tracker interactions cancel the pending auto-read timer so a deliberate user choice is not overwritten a few seconds later.

Comic-page actions update only the affected tracker sections and preserve the injected navigation action nodes. Writes initiated by the page suppress their own `chrome.storage.onChanged` echo, while storage changes from other extension surfaces still trigger a full refresh. This avoids duplicate rendering and visible page-wide control flicker without introducing a client-side state framework.

Read/favorite controls can also be injected into the xkcd navigation bars, near the controls readers use repeatedly. This is enabled by default but can be disabled for users who prefer the original nav bars to stop moving after extension injection. The injected navigation labels default to xkcd-flavored wording (`Got it`, `Neat`, `Huh?`) and can be changed to generic labels (`Read`, `Fav`, `Explain`). The full tracker panel keeps the obvious `Read` and `Fav` actions for discoverability and for the rating control.

Keyboard shortcuts are opt-in and only active on xkcd comic pages. They ignore form fields, contenteditable elements, and browser modifier shortcuts. The first fixed shortcut set covers read/unread, favorite, continue point, previous/next navigation, and Explain xkcd.

## Navigation Filtering

Browse modes are:

- `all`
- `unread`
- `favorites`

All mode preserves xkcd's original navigation HTML, including the original Random behavior, but disables endpoint navigation when the target would be the current comic.

Unread and Favorites modes rewrite the conceptual First, Previous, Random, Next, and Last links in the xkcd navigation bars. Targets are calculated by comic number. Missing actions are rendered as disabled text rather than broken links.

The current mode is per tab/session, with synchronized settings only providing the default mode.

## Popup And Dashboard

The popup reads storage directly through the shared storage service and asks the active tab's content script for current-comic context and page styling when available. It remains compact, follows xkcd's native small-caps/link/button styling, and avoids full catalog management. Its current-comic controls use the same shared rating descriptors as the xkcd page, comic links show cached titles when available, and the new-comic block also exposes the latest known xkcd number. Unread ranges and bulk marking stay on the dashboard because the popup is meant for quick current-context actions. If onboarding has not been completed, the popup shows a concise nudge linking to the guided dashboard setup or allowing setup to be skipped.

The dashboard is the full management surface. It includes onboarding, overview, statistics, a searchable favorites library, unread ranges, bulk marking, settings, import/export, reset, and diagnostics. The guided onboarding flow can start from the beginning, mark comics read through a chosen number, or mark the user caught up while also collecting the rating, alt-text, auto-read, navigation-action, shortcut, and label preferences that vary most by reader. No setup choice is persisted until the final confirmed apply action; completion stores `onboardingCompletedAt`. The overview shows titled comic links when metadata is available and supports direct hash navigation into sections after async render. Statistics summarize progress, favorites, ratings, averages, and rating distribution without adding more persisted state; aggregate values and the compact stacked histogram follow the selected five-star or 1-10 scale, with favorite and non-favorite counts shown as separate segments. The favorites library can search cached titles or comic numbers, filter rated/unrated favorites, sort by rating/number/title, page through results, show lazy remote thumbnails from xkcd image URLs, reveal delayed viewport-bounded full-size previews, edit ratings inline with the shared rating control, toggle read state, remove favorites, open a random visible favorite, export the current filtered set as CSV, Markdown, or JSON, and request missing xkcd metadata. Settings autosave on change, avoid self-triggered full-page refreshes, and are grouped vertically by category. Navigation settings separate filtered-navigation behavior from optional read/favorite button injection. The page is implemented as simple module-driven DOM rendering, not an internal app framework.

Diagnostics show aggregate state and storage information, including the number and timestamp of locally queued sync changes. The support snapshot intentionally includes metadata, settings, aggregate statistics, and storage usage, but not the full sparse comic-state map.

The dashboard supports light, dark, and system appearance. The popup and content-script UI do not use that setting because they should visually follow the xkcd page; the popup uses a page-style snapshot from the active xkcd tab when possible and falls back to system dark/light colors.

## Latest Comic Checks And Badge

The background service worker uses `chrome.alarms` to check xkcd's latest `info.0.json` endpoint. The default interval is six hours. First install records the current latest comic as acknowledged so existing backlog is not treated as newly published.

Until onboarding is completed, the toolbar badge shows `SET` regardless of the optional new-comic badge setting. This setup reminder takes precedence over new-comic state. After onboarding, the badge shows `NEW` only when `lastNewComicId` is greater than `acknowledgedLatestComicId` and the badge setting is enabled.

The toolbar action icon defaults to a muted generated icon. When the content script detects a valid xkcd comic page, it sends the comic ID to the service worker, which sets the normal icon for that tab and mirrors the icon globally when that tab is active. Navigation resets the tab and active global icon back to muted until another valid comic is detected. Runtime `chrome.action.setIcon` paths are extension-root paths because MV3 service-worker calls are stricter than manifest icon declarations. This keeps the `NEW` badge reserved for new-comic state instead of mixing page-detection status into badge text.

Opening the new comic, marking it read, or explicitly acknowledging it clears the new-comic state. Opening the popup alone does not acknowledge it.

## Import, Export, And Reset

The dashboard exposes backup export, validated replacement import, settings reset, and full reset. It requires typed confirmation for full reset and offers a backup-first path. [Data Model](DATA-MODEL.md) owns the exact backup contents, replacement ordering, record effects, and compatibility rules.

## Permissions And Trust Boundaries

The runtime is limited to extension storage, alarms, and the two xkcd HTTPS host patterns. It ships local executable files, does not request browsing history or broad host access, and does not execute remote code. [Security](SECURITY.md) owns the exact permission, content-security-policy, input-validation, trust, and vulnerability-reporting boundary.

## Testing Strategy

Automated tests cover logic that is cheap and valuable to verify outside Chrome:

- unavailable comic handling,
- progress calculation,
- unread range calculation,
- favorite library search/filter/sort behavior,
- favorite library export formatting,
- favorite library pagination and session preference normalization,
- aggregate statistics,
- filtered navigation,
- continue-point advancement,
- bulk range parsing,
- onboarding planning,
- backup validation,
- migration bootstrap,
- buffered sync-write merging and quota classification,
- manifest smoke checks.

`npm run test:coverage` uses Node's built-in test coverage and LCOV reporter, with no additional coverage runtime. The main-branch GitHub Actions workflow uploads that report to Codecov using GitHub OIDC as informational reporting; an upload outage does not invalidate tests or packaging. The reported percentage intentionally describes modules exercised by the Node suite; browser-only content-script, popup, dashboard, and service-worker glue is validated manually and is not presented as covered code.

`npm run package` consumes the committed runtime assets and writes a deterministic, allowlisted ZIP under `dist/`. Asset regeneration is an explicit `npm run assets` operation so packaging does not rewrite tracked source-tree files.

Manual Chrome validation is still required for content-script injection, extension page rendering, service-worker alarms, badge/icon updates, storage-change propagation, active-tab popup behavior, dark-mode inheritance, and real xkcd DOM integration.

## Trade-Offs

The extension uses direct DOM rendering rather than a framework. The UI surface is small enough that a framework would add more operational cost than value.

The metadata cache is intentionally lazy. Favorites may initially show comic numbers without titles or thumbnails until metadata is cached or fetched from the dashboard. Favorite title search only sees cached metadata, while comic-number search works immediately.

Favorite thumbnails are loaded directly from xkcd image URLs rather than cached in Chrome storage. This avoids sync quota issues, local cache eviction policy, and blob cleanup complexity. Thumbnail caching remains possible later if there is a clear offline or performance reason.

Chrome sync is used as the first sync provider. It is simple and browser-native, but synchronization timing and cross-browser behavior are controlled by Chrome. The local journal protects pending writes from worker suspension, but another device only receives them after Chrome accepts a flush.

## Non-Goals

Version one does not implement user accounts, a backend service, analytics, telemetry, social features, comments, recommendations, machine learning, full archive scraping, offline mirroring, Explain xkcd content embedding, mobile app support, collaborative lists, or a framework-driven design system.
