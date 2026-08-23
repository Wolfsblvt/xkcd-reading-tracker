# Project Map

## Meaning

xkcd Reading Tracker is a directly loadable browser extension whose runtime, tests, release inputs, and durable documentation deliberately stay visible in one small repository. This map owns the layout and entry points a newcomer needs before reading individual modules.

## Layout

| Path | Holds | Why it is separate |
| --- | --- | --- |
| `manifest.json` | Chrome MV3 entry points, permissions, resources, and version | Chrome loads this contract directly and the release package verifies it explicitly. |
| `src/content/` | Classic content-script bridge and the xkcd page integration | Static MV3 content scripts cannot be declared as modules, so the bridge imports the module implementation. |
| `src/popup/` | Compact toolbar UI | Quick current-context actions stay separate from full collection management. |
| `src/dashboard/` | Options page, onboarding, statistics, favorites, settings, and data tools | The larger management experience should not inflate the popup or comic page. |
| `src/background/` | Service worker, alarms, latest-comic state, toolbar state, and tab-scoped mediation | Browser-lifecycle and cross-surface responsibilities have one owner. |
| `src/shared/` | Pure domain rules and reusable presentation descriptors | Logic that does not require Chrome or the DOM remains cheap to test. |
| `src/storage/` | Chrome storage, migration, cache, and durable sync-write journal | Persistence and quota behavior stay behind one explicit boundary. |
| `tests/` | Node tests for domain, storage, manifest, and asset contracts | Fast deterministic checks are separate from browser-only QA. |
| `tools/` | Explicit asset generation, coverage reporting, and deterministic packaging | Development and release tooling does not become production runtime code. |
| `assets/` | Source artwork, committed runtime/store outputs, screenshots, listing copy, and social preview | Store and GitHub inputs are versioned without entering the extension ZIP unless allowlisted. |
| `docs/` | Documentation map, Vision, direction, architecture, data model, security, decisions, development, privacy, release, manual QA, and dated evidence | Durable product and maintenance context stays navigable without inflating the public entry point or source modules. |
| `.github/` | GitHub intake and CI configuration | Provider-specific repository behavior remains visible and reviewable. |

## Entry Points

- **Load the extension:** select the repository root with Chrome's **Load unpacked** flow.
- **Comic page:** `src/content/content.js` imports `src/content/page.js`.
- **Toolbar:** `src/popup/popup.html` loads `src/popup/popup.js`.
- **Dashboard:** `src/dashboard/dashboard.html` loads `src/dashboard/dashboard.js`.
- **Background:** `src/background/service-worker.js` is the MV3 module service worker.
- **Tests:** `npm test`.
- **Release package:** `npm run package`.
- **Documentation:** `docs/README.md`.

## Layout Decisions Worth Keeping

- Production source is directly loadable; there is no generated application bundle.
- Shared domain modules do not depend on the DOM or Chrome APIs unless the boundary is their stated job.
- Store promo images and the GitHub social preview are repository assets, not extension package contents.
- Root files are conventional entry points. Durable product documentation lives under `docs/`.
