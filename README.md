# xkcd Reading Tracker

A Chrome extension for tracking xkcd reading progress directly on xkcd.com.

The extension is intentionally small: plain JavaScript, Manifest V3, no frontend framework, no runtime dependencies, no analytics, and no backend service.

## Current Status

Initial scaffold. The implementation is being built as a directly loadable unpacked Chrome extension.

## Planned Features

- Mark comics read or unread.
- Favorite comics and optionally rate them.
- Keep a dedicated continue-reading point.
- Browse all, unread, or favorite comics.
- Show alt text accessibly.
- Open the matching Explain xkcd page.
- View progress, unread ranges, and favorites.
- Export, import, and reset extension data.
- Check for newly published xkcd comics with a toolbar badge.

## Local Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository folder.

## Development

The extension source is loaded directly by Chrome. There is no production build step.

Checks:

```powershell
npm test
```

## Browser Requirements

Chrome 120 or newer is targeted. The extension uses Manifest V3, extension storage, alarms, and module-based extension pages/service worker code.

## Privacy

Reading state is stored with Chrome extension storage. Chrome may synchronize `chrome.storage.sync` data through the signed-in Google account if browser sync is enabled. The extension does not run a server, does not include analytics or tracking, and does not transmit reading state to third-party services. Public xkcd metadata may be fetched from xkcd.com.

## Known Limitations

The first version is Chrome-focused. Cross-browser synchronization, Google Drive sync, notes, tags, and Explain xkcd content embedding are intentionally out of scope.

