# xkcd Reading Tracker

[![Source version](https://img.shields.io/badge/dynamic/json?color=2f7d32&label=source%20version&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2FWolfsblvt%2Fxkcd-reading-tracker%2Fmain%2Fmanifest.json)](https://github.com/Wolfsblvt/xkcd-reading-tracker/blob/main/manifest.json)
[![Chrome Web Store version](https://img.shields.io/chrome-web-store/v/daemkaclgpcpeekkhnnkleeajbhnbkmd?color=4285f4&label=chrome%20web%20store)](https://chromewebstore.google.com/detail/xkcd-reading-tracker/daemkaclgpcpeekkhnnkleeajbhnbkmd)
[![Chrome Web Store users](https://img.shields.io/chrome-web-store/users/daemkaclgpcpeekkhnnkleeajbhnbkmd?color=34a853&label=users)](https://chromewebstore.google.com/detail/xkcd-reading-tracker/daemkaclgpcpeekkhnnkleeajbhnbkmd)
[![Latest release](https://img.shields.io/github/v/release/Wolfsblvt/xkcd-reading-tracker?color=6f42c1&label=release)](https://github.com/Wolfsblvt/xkcd-reading-tracker/releases/latest)
[![Tests](https://github.com/Wolfsblvt/xkcd-reading-tracker/actions/workflows/tests.yml/badge.svg)](https://github.com/Wolfsblvt/xkcd-reading-tracker/actions/workflows/tests.yml)
[![Unit test coverage](https://codecov.io/gh/Wolfsblvt/xkcd-reading-tracker/graph/badge.svg)](https://codecov.io/gh/Wolfsblvt/xkcd-reading-tracker)
[![License: AGPL-3.0-or-later](https://img.shields.io/github/license/Wolfsblvt/xkcd-reading-tracker?color=0b7285)](LICENSE)

A quiet, local-first Chrome extension for keeping your place in xkcd. It adds restrained controls to comic pages, a compact popup, and a fuller dashboard without replacing xkcd's own reading surface.

[![Install from Chrome Web Store](https://img.shields.io/badge/Install%20from-Chrome%20Web%20Store-4285f4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/xkcd-reading-tracker/daemkaclgpcpeekkhnnkleeajbhnbkmd)

![xkcd Reading Tracker on a comic page](assets/store/screenshots/01-comic-page.png)

## What it does

- Tracks read state, favorites, ratings, and a separate continue-reading point.
- Browses all, unread, or favorite comics through xkcd-style navigation.
- Adds optional quick actions, keyboard shortcuts, accessible alt text, and an Explain xkcd link.
- Provides progress, statistics, unread ranges, bulk actions, and a searchable favorites library.
- Exports favorites and complete JSON backups, validates imports, and offers backup-first reset.
- Notices newly published comics and protects synchronized changes from temporary Chrome Sync throttling.
- Keeps reading data in Chrome extension storage with no account, backend, analytics, telemetry, or remote code.

## Install

Install the published extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/xkcd-reading-tracker/daemkaclgpcpeekkhnnkleeajbhnbkmd), or load this repository directly:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository root.
5. Open an xkcd comic such as [xkcd #1](https://xkcd.com/1/).

Chrome 120 or newer is supported. The extension uses Manifest V3 and has no production build step.

## Use

- On a comic page, use the tracker panel and optional navigation-bar actions.
- Open the toolbar popup for quick current-comic actions and reading progress.
- Open the dashboard for setup, statistics, favorites, unread ranges, settings, backups, reset, and diagnostics.

<details>
<summary>More screenshots</summary>

### Toolbar popup

![Toolbar popup](assets/store/screenshots/02-popup.png)

### Dashboard overview

![Dashboard overview](assets/store/screenshots/03-dashboard-overview.png)

### Favorites library

![Favorites library](assets/store/screenshots/04-dashboard-favorites.png)

### Dashboard settings

![Dashboard settings](assets/store/screenshots/05-dashboard-settings.png)

### Dashboard diagnostics

![Dashboard diagnostics](assets/store/screenshots/06-dashboard-diagnostics.png)

### Dark mode

![Dark mode support](assets/store/screenshots/07-dark-mode-support.png)

</details>

## Privacy

Reading state stays in Chrome extension storage and may synchronize through Chrome when browser sync is enabled. The extension does not request browser-history access or send reading state to the developer. It fetches only public xkcd metadata and images needed for current features.

See [Privacy and data](docs/PRIVACY-AND-DATA.md) for the complete data boundary and [Security](docs/SECURITY.md) for permissions, trust boundaries, and private vulnerability reporting.

## Develop

Node.js 22 or newer is used for repository checks and packaging; the extension itself has no runtime dependencies.

```powershell
npm test
npm run package
```

Asset regeneration is separate and explicit:

```powershell
npm run assets
```

Start with [Development](docs/DEVELOPMENT.md), then use [Architecture](docs/ARCHITECTURE.md) for the system shape. [Product Vision](docs/VISION.md) and [Direction](docs/DIRECTION.md) carry the provisional product lens and current next cuts.

## License

Licensed under [AGPL-3.0-or-later](LICENSE). xkcd Reading Tracker is unofficial and is not affiliated with or endorsed by xkcd or Randall Munroe.
