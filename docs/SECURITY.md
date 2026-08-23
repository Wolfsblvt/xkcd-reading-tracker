# Security

## Meaning

This document describes xkcd Reading Tracker's current permission, executable-code, input, trust, data-safety, and vulnerability-reporting boundaries. It exists to make the extension's actual security posture inspectable without promising protection the code or maintainer process does not provide; privacy and retention details belong in `PRIVACY-AND-DATA.md`.

## Report A Vulnerability

Use GitHub's private [Report a vulnerability](https://github.com/Wolfsblvt/xkcd-reading-tracker/security/advisories/new) route for a suspected security vulnerability, especially when a report contains exploit details or sensitive information.

Use [public Issues](https://github.com/Wolfsblvt/xkcd-reading-tracker/issues) only for ordinary, non-sensitive bugs. Do not post credentials, private browser or account data, a complete reading-state backup, or exploit details there. This repository publishes no security email address or response-time guarantee.

## Permission Boundary

The Manifest V3 runtime currently requests:

- `storage`, for extension-owned sync, local, and session state;
- `alarms`, for latest-comic checks and pending-sync recovery; and
- host access to `https://xkcd.com/*` and `https://www.xkcd.com/*`.

Content-script injection and web-accessible extension modules are restricted to those same xkcd host patterns. The manifest has no `externally_connectable` declaration and does not request browsing history, broad host access, OAuth, downloads, notifications, or access to Explain xkcd. Explain xkcd is opened as an ordinary user-facing link.

## Executable Code And Content Security Policy

All executable extension code ships in the package. Extension pages use `script-src 'self'` and `object-src 'self'`; there is no remote JavaScript or runtime package loader. The image policy permits packaged/data images and `https://imgs.xkcd.com` so the dashboard can display xkcd-hosted favorite previews.

The extension has no backend, developer-operated account system, analytics, telemetry, advertising, or remote log collector.

The GitHub test job grants `contents: read` and `id-token: write`. Its only configured OIDC consumer is the informational Codecov step, which runs on pushes. Existing third-party Actions are pinned to reviewed release commits, and checkout credentials are not persisted because no workflow step pushes.

## Trust And Input Boundaries

### xkcd pages

The content script runs in Chrome's isolated content-script world against the live xkcd document. It reads comic identity and presentation data from that document and intentionally saves and restores xkcd's original navigation HTML when filtered navigation is toggled. The extension therefore treats the xkcd page structure as host input; it does not claim to sanitize or secure the host page itself.

Tracker and metadata text created by extension surfaces is normally assigned through `textContent`, not HTML interpolation. xkcd metadata image URLs remain source data and are assigned to image elements; the extension-page image policy limits which origins can render there.

### Extension messages

Runtime messaging is designed for the installed content script, popup, dashboard, and service worker. The worker validates the message types and relevant payload shapes it acts on, including browse-mode values, comic IDs, sync-write collections, and bounded metadata batches. It relies on Chrome's extension messaging boundary and internal callers rather than adding application-level sender authentication.

### Network responses and files

Metadata fetch URLs are constructed internally for xkcd `info.0.json` endpoints. Requests omit credentials, require a successful HTTP response, and reject a response without a valid comic number.

Backup import parses a file the reader explicitly selects, requires the current format, backup version, and schema version, and normalizes settings, comic IDs, ratings, and sparse state before replacement. It does not execute backup content.

## User Data And Destructive Operations

Chrome extension storage is the custody boundary; this extension does not add its own account, encryption, or recovery service. Chrome controls synchronization, account protection, retention after uninstall, and cross-device delivery.

Pending synchronized writes are journaled locally before acknowledgement, serialized, and retained for retry across service-worker suspension or Chrome Sync rate limiting. Import writes replacement state before removing stale chunks where possible. Full reset removes only extension-prefixed keys, requires exact typed confirmation in the dashboard, and offers a backup-first path.

The diagnostics snapshot omits the full per-comic state map, but it still includes extension metadata, settings, aggregate statistics, storage usage, and the browser user agent. A reader should inspect it before sharing it publicly.

## Accepted Limits

- Security depends on Chrome's extension isolation, storage, update, and account model; the extension does not implement separate authentication or cryptography.
- A compromised or unexpectedly changed xkcd page can influence the DOM and public metadata the extension reads. Narrow host scope, fixed metadata endpoints, local executable code, normalization, and extension-page CSP contain the extension-owned boundary but do not make the host trustworthy by decree.
- Explain xkcd is currently navigation only. The planned optional permission-backed reading signal in `DIRECTION.md` is not shipped and is not part of the current trust boundary.
- Node tests verify manifest and pure data contracts, not live Chrome isolation, CSP enforcement, service-worker lifecycle, or xkcd DOM behavior. `manual-qa.md` owns the corresponding browser checks.
