# xkcd Reading Tracker

[![extension version](https://img.shields.io/badge/dynamic/json?color=blue&label=extension%20version&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2FWolfsblvt%2Fxkcd-reading-tracker%2Fmain%2Fmanifest.json)](https://github.com/Wolfsblvt/xkcd-reading-tracker)
[![Install from Chrome Web Store](https://img.shields.io/badge/install-chrome%20web%20store-4285f4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/xkcd-reading-tracker/daemkaclgpcpeekkhnnkleeajbhnbkmd)
[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/daemkaclgpcpeekkhnnkleeajbhnbkmd?label=chrome%20web%20store)](https://chromewebstore.google.com/detail/xkcd-reading-tracker/daemkaclgpcpeekkhnnkleeajbhnbkmd)
[![release](https://img.shields.io/github/v/release/Wolfsblvt/xkcd-reading-tracker?color=lightblue&label=release)](https://github.com/Wolfsblvt/xkcd-reading-tracker/releases/latest)
[![tests](https://github.com/Wolfsblvt/xkcd-reading-tracker/actions/workflows/tests.yml/badge.svg)](https://github.com/Wolfsblvt/xkcd-reading-tracker/actions/workflows/tests.yml)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-4c8eda)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Chrome 120+](https://img.shields.io/badge/chrome-120%2B-4285f4?logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)

A small Chrome extension for tracking xkcd reading progress directly on xkcd.com.

It adds restrained controls to comic pages, keeps state in Chrome extension storage, and provides a compact popup plus a fuller dashboard for management tasks.

![xkcd Reading Tracker on a comic page](assets/store/screenshots/01-comic-page.png)

<details>
<summary>More screenshots</summary>

### Toolbar Popup

![Toolbar popup](assets/store/screenshots/02-popup.png)

### Dashboard Overview

![Dashboard overview](assets/store/screenshots/03-dashboard-overview.png)

### Dashboard Settings

![Dashboard settings](assets/store/screenshots/04-dashboard-settings.png)

### Dashboard Diagnostics

![Dashboard diagnostics](assets/store/screenshots/05-dashboard-diagnostics.png)

</details>

## Features

- Mark individual comics read or unread.
- Favorite comics independently from read state.
- Store an optional canonical 1-10 rating.
- Keep a dedicated continue-reading point.
- Browse normal xkcd, unread comics, or favorite comics.
- Optionally add quick read/favorite toggles to xkcd's own navigation bars.
- Use xkcd-style nav labels (`Got it`, `Neat`, `Huh?`) or generic labels.
- Show xkcd alt text below the comic or after active-viewing delay.
- Open the matching Explain xkcd page with a small `Huh?` or `Explain` link.
- View reading progress and unread ranges.
- Search, filter, sort, page through, preview, and randomly open favorite comics from the dashboard.
- Jump to unread range starts/ends and set a range as the next reading anchor.
- Bulk mark comic numbers or ranges.
- Export and import complete JSON backups of user-created state.
- Reset data with an optional backup-first flow.
- Check for newly published comics and show a toolbar badge.
- Use light, dark, or system appearance for extension pages.

## Local Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository folder.
5. Open an xkcd comic page such as `https://xkcd.com/1/`.

## Usage

On xkcd comic pages, use the injected tracker panel below the comic to mark read state, favorite, rate, set the continue point, change browse mode, open Explain xkcd, and view progress.

Use the toolbar popup for quick progress, current-tab controls, new-comic status, unread preview, and compact bulk marking.

Use the dashboard/options page for settings, searchable favorite comics with lazy thumbnails, unread ranges, import/export, reset, and diagnostics.

## Development

The extension source is loaded directly by Chrome. There is no production build step and no runtime dependency install is required.

Checks:

```powershell
npm test
```

Build the Chrome Web Store upload package:

```powershell
npm run package
```

The package script regenerates image assets first, then writes `dist/xkcd-reading-tracker-v<version>.zip` with only the files needed by the extension.

Regenerate image assets without packaging:

```powershell
npm run assets
```

Source artwork lives in `assets/source/`. Generated runtime icons live in `assets/icons/`. Generated Chrome Web Store promo images live in `assets/store/promo/` and are not included in the extension upload zip.

## Browser Requirements

Chrome 120 or newer is targeted. The extension uses Manifest V3, module extension pages, a module service worker, `chrome.storage`, `chrome.alarms`, and static content-script injection.

## Privacy Policy

Reading state is stored through Chrome extension storage. Chrome may synchronize `chrome.storage.sync` data through the signed-in Google account if browser sync is enabled. The extension does not run a server, does not include analytics or tracking, and does not collect, sell, or share reading state with the developer or third-party services. Public xkcd metadata and thumbnail images may be fetched from xkcd domains.

## Known Limitations

- Browser behavior still needs manual validation after loading or reloading the unpacked extension.
- The first version is Chrome-focused.
- Favorite titles and thumbnail URLs are cached only as needed, so title search and previews improve after metadata is fetched.
- Import replaces current data; merge import is future work.
- Chrome sync is managed by Chrome and may not be immediate or cross-browser.
