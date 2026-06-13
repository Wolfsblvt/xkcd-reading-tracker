# Architecture

This extension is a focused Manifest V3 Chrome extension that augments xkcd pages without replacing the site. It uses plain JavaScript modules, native browser and extension APIs, and directly loadable source files rather than a build pipeline.

## Main Components

- `manifest.json` declares a small permission set, static xkcd content-script injection, the toolbar popup, the dashboard/options page, and an ES module service worker.
- `src/content` owns integration with xkcd comic pages. A tiny classic content-script bridge dynamically imports the module implementation because static manifest content scripts are not module scripts.
- `src/popup` owns the compact toolbar dashboard.
- `src/dashboard` owns the larger options/dashboard page for settings, favorites, unread ranges, import/export, reset, and diagnostics.
- `src/background` owns installation initialization, per-tab browse-mode storage, latest-comic checks, and badge updates.
- `src/shared` contains pure domain logic that can be tested outside Chrome.
- `src/storage` is the persistence boundary around Chrome storage and xkcd metadata caching.

## Data Ownership

User-created reading state is synchronized with `chrome.storage.sync`. Rebuildable public comic metadata is cached in `chrome.storage.local`. Per-tab browsing mode is session-scoped and handled by the background service worker with `chrome.storage.session`.

The extension does not use browser localStorage because content scripts share Web Storage with the host page and service workers cannot use it.

## Storage Model

The storage model is versioned from the first implementation. Comic state is partitioned into bounded chunks rather than one oversized object or one key per comic property. Each chunk stores sparse state only for comics with user-created data.

The planned synchronized keys are:

- `xrt:meta` for schema version, latest known comic, new-comic acknowledgement, and continue point.
- `xrt:settings` for synchronized user settings.
- `xrt:chunk:<index>` for sparse comic-state chunks.

Chunking keeps each synchronized item comfortably below Chrome's per-item quota and keeps writes focused when only a few comics change.

## xkcd Integration

The content script identifies the current comic from the page's numbered permanent link first, then falls back to the URL and `info.0.json` for the homepage. This avoids treating the homepage URL itself as a comic ID.

The integration should preserve xkcd's original behavior in All mode. Filtered modes update navigation targets but do not permanently destroy the original navigation.

## Permissions

The extension requests:

- `storage` for synchronized state, local metadata cache, and session browse mode.
- `alarms` for periodic latest-comic checks.
- `activeTab` so the popup can inspect or communicate with the active xkcd tab after user invocation.
- Host access to `xkcd.com` and `www.xkcd.com` for content-script integration and metadata fetches.

It does not request browsing history, broad host access, OAuth, downloads, or permissions for Explain xkcd.

## Important Constraints

Chrome synchronized storage is limited to roughly 100 KB total and 8 KB per item, so the extension stores compact sparse user state and keeps public metadata local. Synchronization is managed by Chrome and is not guaranteed to be immediate or cross-browser.

Known unavailable comics, starting with comic 404, are centralized in shared domain logic. Progress, ranges, navigation, and validation use the same validity rules.

## Testing Strategy

Pure domain logic is tested with Node's built-in test runner. Browser behavior still needs manual validation in Chrome because content-script injection, popup lifecycle, service-worker alarms, badge updates, and extension storage events are browser features.

## Non-Goals

Version one does not implement accounts, a backend service, analytics, telemetry, social features, full archive mirroring, Explain xkcd embedding, Google Drive sync, complex conflict resolution, or a framework-driven UI.

## Future Direction

Possible future work includes Google Drive application-data sync, cross-browser support, merge-based imports, tags, notes, richer favorite sorting, reading statistics, keyboard shortcuts, optional notifications, and importing data from other xkcd extensions. External sync is deliberately deferred because it would need real conflict handling, revision tracking, offline behavior, and authentication lifecycle management.

