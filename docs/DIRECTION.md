# Direction

## Meaning

**Status: Provisional.** The current outcome is to preserve the reliable released Chrome reading loop while making its product purpose, repository shape, release path, and data boundaries cheap to recover. This file is the temporary Git carrier for current direction until a shared workplace takes that role.

## Current Outcome

Adopt the current Leitsatz documentation contract, remove stale or consequence-free machinery, and keep public repository claims aligned with behavior that is actually shipped and observed.

The working rule is simple: retain a mechanism when removing it would break a supported reader behavior, a security or data-loss boundary, an explicit external mutation, or an honest release receipt. File size and prior effort are not reasons by themselves.

## Near-Term Roadmap

1. **Complete and qualify this adoption cut.** Land the Level 2 documentation structure through the repository's PR-preferred `main` route, shorten public orientation, separate asset generation from packaging, and verify tests plus the exact release ZIP boundary.
2. **Add an optional Explain xkcd reading signal.** Offer a local, permission-backed setting that is off by default and requests only `https://www.explainxkcd.com/*` when the reader enables it. Treat a matching explanation page that is fully loaded and active as the signal to mark that comic read. Reuse the existing read-state path; do not add a dwell timer, inject or copy page content, retain visit provenance, or synchronize an enabled bit separately from the browser's permission grant.
3. **Keep release and public metadata coherent.** Preserve the configured social preview, make Store/release/package claims agree, and add only repository metadata that improves discovery without creating another maintained surface. The smallest current candidates are the Store listing as repository homepage and the topics `chrome-extension`, `xkcd`, `manifest-v3`, and `reading-tracker`.
4. **Take the next bounded reduction slice.** Prefer demand-driven network work and smaller module surfaces where current behavior remains unchanged. Keep the durable sync journal, backup/reset protections, package allowlist, manifest checks, and release browser QA.

## Not Now

- user accounts, a developer backend, analytics, telemetry, or social features;
- Google Drive or another external sync provider;
- cross-browser or Firefox work without a selected supported-browser commitment;
- merge import without deliberate conflict semantics;
- a UI framework, generalized renderer, or new workflow/gate system;
- deleting the asset generator until its real editing value is judged separately.

## Revisit the Direction When

The next feature changes permissions or data meaning, the supported browser boundary changes, asset editing creates repeated friction, or a real reader need makes one of the not-now items cheaper than its absence.
