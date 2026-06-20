# Manual QA Checklist

Use this before publishing a Chrome Web Store update. Automated tests cover the pure logic and packaging shape; this checklist covers Chrome behavior that needs a real browser.

## Fresh Install

- Load the unpacked extension in `chrome://extensions`.
- Confirm the toolbar icon starts muted on a non-xkcd tab.
- Open `https://xkcd.com/1/` and confirm the tracker panel appears below the comic.
- Confirm the toolbar icon switches to the full-color icon on a valid xkcd comic tab.
- Switch between xkcd and non-xkcd tabs and confirm the icon follows the active tab.

## Comic Detection

- Visit a numbered comic URL such as `https://xkcd.com/327/`.
- Visit the homepage `https://xkcd.com/` and confirm the current comic is detected from metadata/permalink.
- Visit `https://xkcd.com/404/` and confirm unavailable comic handling does not show a normal valid-comic state.

## Page Controls

- Mark a comic read/unread from the injected panel.
- Favorite/unfavorite a comic from the injected panel.
- Set and clear/change ratings for both star and 1-10 rating display modes.
- Confirm read/favorite nav-bar buttons work when enabled.
- Disable read/favorite nav-bar buttons in settings and confirm xkcd nav bars stop receiving them.
- Confirm filtered navigation works in all/unread/favorites modes.
- Enable keyboard shortcuts and confirm `R`, `F`, `C`, `P`, `N`, and `E` work on comic pages.
- Confirm keyboard shortcuts do not trigger while focus is inside text inputs or other editable fields.

## Popup

- Open the popup on an xkcd comic tab and confirm current comic title, controls, rating, progress, continue link, latest known comic, and dashboard links render.
- Open the popup on a non-xkcd tab and confirm it still renders without current-tab controls.
- Confirm popup links to dashboard sections land on the correct sections.
- Confirm popup styling follows xkcd/dark-mode styling where possible.

## Dashboard

- Run first-time setup from the dashboard and from the popup nudge.
- Confirm overview progress, continue link title, statistics, favorites library, unread ranges, settings, data tools, and diagnostics render.
- Switch between five-star and 1-10 rating modes and confirm averages, perfect-rating text, ranges, and distribution-chart labels follow the selected scale.
- Search, sort, filter, page through, rate, mark read/unread, unfavorite, and randomly open favorites.
- Confirm the favorites filter row fills the available width, search expands, page size stays right-aligned, and controls wrap cleanly on a narrow viewport.
- Open the favorites Export menu and export the filtered set as CSV, Markdown, and JSON.
- Hover and keyboard-focus favorite thumbnails and confirm the delayed full-size preview stays within the viewport and disappears on exit, blur, resize, or scroll.
- Fetch missing favorite metadata and confirm titles/thumbnails appear.
- Use bulk marking with `1 - 3`, `1-3`, `1..3`, and invalid/reversed ranges.
- Confirm settings autosave without jumping to the top of the page.
- Confirm light, dark, and system dashboard appearance.
- Restore default settings and confirm read state, favorites, ratings, continue point, and cached metadata remain intact.
- Confirm full reset requires `TIME MACHINE` with playful labels and `RESET` with generic labels.
- Copy the diagnostics support snapshot and confirm it does not include the full comic-state map.

## Storage And Data

- Export a backup and import it back into a reset profile.
- Reset with backup and reset without backup.
- Confirm sync storage reset removes tracker data and local metadata cache.
- Confirm malformed or old settings normalize after reload.

## New Comic Badge

- Disable the badge setting and confirm no badge is shown.
- Re-enable the badge setting.
- Use diagnostics or controlled storage edits to simulate a newly discovered comic.
- Confirm the `NEW` badge appears only for an unacknowledged latest comic.
- Confirm opening/marking/acknowledging the new comic clears the badge.

## Release Package

- Run `npm test`.
- Run `npm run package`.
- Confirm the generated `dist/xkcd-reading-tracker-v<version>.zip` matches the version in `manifest.json`.
- Upload that ZIP to the Chrome Web Store draft.
