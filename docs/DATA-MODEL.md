# Data Model

## Meaning

This document describes xkcd Reading Tracker's current persisted records, their ownership, and the invariants that keep user-created state recoverable across Chrome's sync and service-worker lifecycle. It owns the schema, migration, backup, import, and reset compatibility boundary for extension version 1.2.0 and schema version 1; privacy consequences belong in `PRIVACY-AND-DATA.md`, while runtime component flow belongs in `ARCHITECTURE.md`.

## Storage Ownership

Every extension-owned key uses the `xrt:` prefix.

| Storage area | Records | Standing |
| --- | --- | --- |
| `chrome.storage.sync` | `xrt:meta`, `xrt:settings`, `xrt:chunk:<index>` | User-created reading state, synchronized settings, and the metadata needed to interpret them. Chrome owns actual cross-device delivery. |
| `chrome.storage.local` | `xrt:metadata`, `xrt:sync-write-buffer` | Rebuildable public xkcd metadata and durable pending delivery state. Neither is a second canonical copy of settled synchronized state. |
| `chrome.storage.session` | `xrt:tab-mode:<tabId>`, `xrt:favorites-library` | Tab- or browser-session presentation state. It is intentionally neither synchronized nor backed up. |

## Synchronized Records

### Tracker metadata

`xrt:meta` has this normalized shape:

```text
schemaVersion: number
createdAt: timestamp string
updatedAt: timestamp string
latestKnownComicId: positive integer or null
latestCheckedAt: timestamp string or null
lastNewComicId: positive integer or null
acknowledgedLatestComicId: positive integer or null
continuePoint: positive integer or null
onboardingCompletedAt: timestamp string or null
```

The extension writes timestamps in ISO format, while current normalization accepts existing strings without re-parsing them. The latest-comic fields mix rebuildable public catalog knowledge with the reader's acknowledgement state. `continuePoint` and onboarding completion are user-specific state.

### Settings

`xrt:settings` contains these current groups:

- `autoMarkRead`: enabled flag and delay;
- `altText`: display mode and delay;
- `ratingDisplay` and `progressDisplay` modes;
- `navigation`: default browse mode plus Explain-link, dual-navigation-bar, injected-action, and label-style flags;
- `keyboardShortcuts`: enabled flag;
- `badge`: enabled flag and latest-check interval; and
- `appearance`: dashboard theme.

Normalization returns this exact current shape. Booleans must be booleans; enumerated values fall back to supported defaults; delays are rounded and clamped from 0 through 3,600 seconds; and the badge interval is at least 30 minutes. The current defaults live in `src/shared/defaults.js` rather than being duplicated as a second settings specification here.

### Sparse comic chunks

`xrt:chunk:<index>` stores 250 comic IDs per chunk:

```json
{
  "v": 1,
  "comics": {
    "3277": {
      "r": 1,
      "f": 1,
      "rating": 8
    }
  }
}
```

`r` means read, `f` means favorite, and `rating` is the canonical integer from 1 through 10. Missing properties mean false or unrated. A comic with entirely default state has no stored entry.

## Local And Session Records

`xrt:metadata` stores a `byId` map of public xkcd metadata plus the largest locally known comic ID. Each entry contains the comic number, title, safe title, alt text, image URL, publication date parts, and fetch timestamp. It is fetched from xkcd `info.0.json` endpoints without credentials, can be rebuilt, is cleared after backup import, and is excluded from backups.

`xrt:sync-write-buffer` has version, pending set items, pending removal keys, and an update timestamp. A requested sync change is merged into this local journal before acknowledgement. Reads overlay pending changes on Chrome Sync, while one serialized service-worker writer debounces and flushes them. The journal remains until delivery succeeds; quota failures schedule a retry.

`xrt:tab-mode:<tabId>` contains `all`, `unread`, or `favorites` and is removed when its tab closes. `xrt:favorites-library` stores rating filter, sort mode, and page size. Search text and the current favorites page remain in memory only.

## Invariants

- Comic-state entries use positive integer IDs, omit the unavailable comic `404`, and are bounded to the latest known comic when that bound is available during normalization.
- A rating is a finite value rounded to an integer from 1 through 10; any other value normalizes to unrated.
- Single-comic writes reject invalid IDs and skip no-op state changes. Bulk writes filter invalid IDs; they currently refresh tracker metadata even when the requested comic-state result is unchanged.
- The continue point must name a valid unread comic. Once that comic becomes read, it advances only to the next higher unread comic or becomes `null`; missing or invalid state never silently becomes comic 1.
- Acknowledgement is monotonic. Marking the current newly published comic read can advance it, and the first observed latest comic is acknowledged rather than announced as new.
- Reads return one normalized effective snapshot, including locally journaled changes that Chrome Sync has not accepted yet.

## Schema And Compatibility

The current persisted schema and backup version are both `1`. There are no historical production schemas.

Storage bootstrap initializes missing metadata, normalizes settings, and updates records whose stored schema or chunk version differs from the current version. A stored schema newer than this extension supports is rejected rather than downgraded. Reads also normalize current-version values; version-triggered migration does not claim to eagerly rewrite every malformed version-1 field.

This repository has no general legacy-compatibility promise. A future persisted-schema or backup-format change must preserve explicitly valued user data, reject unsafe ambiguity, and add only the migration path the real released boundary requires.

## Backup, Import, And Reset

A backup contains its format, backup version, extension version, schema version, export timestamp, selected tracker metadata, normalized settings, and normalized sparse comic state. Export reads the effective snapshot, so pending journaled user changes are represented; the journal record itself, cached xkcd metadata, and session preferences are not included.

Import accepts only the current format, backup version, and schema version. It is replacement, not merge: current metadata, settings, and replacement chunks are written before stale chunks are removed, the continue point is revalidated, and the rebuildable metadata cache is cleared. Session preferences are not imported or cleared by import.

Settings reset preserves comic state and other reader fields while restoring default settings and updating tracker metadata's modification time. Full reset removes extension-owned synchronized state, local cache state, and session state while preserving the delivery journal long enough to carry synchronized removals, then bootstraps fresh defaults. The dashboard requires exact typed confirmation and offers a backup-first path because the removed reading state is user-created and otherwise unrecoverable from this repository.
