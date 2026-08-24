# Development

## Meaning

This guide explains how to load, test, regenerate, and package xkcd Reading Tracker from a clean checkout. It owns the local bootstrap and generated-output boundary so ordinary development does not depend on remembered machine-specific steps.

## Prerequisites

- **Chrome 120 or newer** — the supported browser and Manifest V3 runtime.
- **Node.js 22 or newer** — required by `package.json` for tests and repository tooling.
- **Git** — needed only to clone and contribute; the extension has no production dependency install.

There are no npm runtime or development packages to install.

## Bootstrap

```powershell
git clone https://github.com/Wolfsblvt/xkcd-reading-tracker.git
Set-Location xkcd-reading-tracker
npm test
```

Load the repository root from `chrome://extensions` using **Load unpacked**. After a source change, use Chrome's extension reload control and refresh the affected xkcd or extension page.

## Run and Test

| Task | Command |
| --- | --- |
| Run locally | Load the repository root as an unpacked extension |
| All automated tests | `npm test` |
| One test file | `node --test tests/backup.test.js` |
| Coverage report | `npm run test:coverage` |
| Regenerate committed images | `npm run assets` |
| Build the Store ZIP | `npm run package` |

Use [Manual QA](manual-qa.md) for browser-only behavior and before Store publication.

## Safe Reset

`coverage/` and `dist/` contain reproducible local output and may be deleted from the repository root. Do not delete `assets/icons/`, `assets/store/promo/`, or `assets/social/`: those are committed release and repository inputs.

For extension data, use the dashboard's explicit reset flows. The backup-first option exists because Chrome storage contains user-created reading state.

## Generated Artifacts

- `npm run test:coverage` writes `coverage/`; it is untracked.
- `npm run package` writes `dist/xkcd-reading-tracker-v<version>.zip`; it is untracked and contains only the package allowlist.
- `npm run assets` reads `assets/source/` and updates committed runtime icons, Store promo images, and the GitHub social preview. Inspect those diffs before committing.
- Repository-owned generated deliverables selected by future project tooling belong under `artifacts/`; tool-owned caches keep their conventional paths.

## Common Paths

- Add or change domain behavior in `src/shared/` or `src/storage/` with a focused Node test.
- Change xkcd, popup, dashboard, or service-worker behavior in its owning `src/` directory and exercise the relevant Manual QA section.
- Change Store-facing copy or images under `assets/store/`, then keep [Releasing](RELEASING.md) aligned.
