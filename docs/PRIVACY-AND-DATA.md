# Privacy and Data

## Meaning

xkcd Reading Tracker keeps personal reading state inside Chrome extension storage and has no developer-operated data service. This document owns the current collection, storage, network, sharing, export, and deletion boundary a reader or reviewer needs to understand.

## Data the Reader Creates

The extension stores:

- read and unread state;
- favorites and ratings;
- the continue-reading point;
- synchronized settings and onboarding completion;
- latest-comic acknowledgement state; and
- a small durable journal of changes waiting for Chrome Sync.

Complete JSON backups add format, extension, schema, and export metadata so an import can be validated.

## Where Data Lives

- `chrome.storage.sync` holds user-created reading state and synchronized settings. Chrome may synchronize it through the reader's signed-in Google account when browser sync is enabled.
- `chrome.storage.local` holds rebuildable public xkcd metadata and the pending-write journal.
- `chrome.storage.session` holds tab/session-scoped browse mode and short-lived dashboard preferences.

The extension does not use the xkcd page's `localStorage` and does not run a backend.

## Network Access

The extension accesses only xkcd hosts declared in `manifest.json`. It fetches public xkcd metadata and displays xkcd-hosted images when current features need them. Opening Explain xkcd is currently an ordinary user-facing link; the extension does not read or embed that site's content.

The GitHub README, Chrome Web Store, Shields.io, and Codecov are public project surfaces, not runtime destinations for extension reading state.

## What Is Not Collected

The extension has no analytics, telemetry, advertising, account system, developer-operated logs, or remote executable code. It does not request Chrome's browsing-history permission and does not inspect unrelated pages.

## Export, Import, and Deletion

The dashboard can export a complete JSON backup of user-created state. Import validates the format and replaces current tracker data; merge semantics are not implemented.

Restoring default settings preserves reading data. Full reset removes synchronized tracker state, cached metadata, and session-scoped state, then initializes defaults. The UI requires explicit typed confirmation and offers a backup-first path.

Uninstalling the extension and Chrome Sync retention behavior are controlled by Chrome; this repository does not claim a developer-side deletion mechanism because no developer service receives the data.
