# Repository Guidance

## Meaning

This file carries the repository-local facts and working boundaries needed to change xkcd Reading Tracker safely. It owns only context specific to this extension; shared Leitsatz doctrine remains in its installed source.

## Product Boundary

- This is an unofficial, directly loadable Chrome Manifest V3 extension for xkcd.
- The xkcd page is the primary reading surface. The popup is for quick actions; the dashboard is for management.
- Production code is plain JavaScript, HTML, and CSS with no runtime dependencies, bundler, backend, analytics, telemetry, or remote code.
- User-created state lives in Chrome extension storage. Public xkcd metadata is rebuildable local cache data.
- Chrome 120 or newer is the supported browser boundary. Do not preserve hypothetical compatibility with unsupported browsers at the cost of the current path.

## Source and Verification

- Run `npm test` for the repository test suite.
- Run `npm run package` to create the deterministic, allowlisted Store ZIP under `dist/`.
- Run `npm run assets` only when source artwork or generated image outputs intentionally change. Packaging consumes committed assets and must not rewrite them.
- Use `docs/manual-qa.md` before a Chrome Web Store update; Node tests do not prove browser injection, rendering, alarms, icon/badge behavior, or Store upload.
- Repository-generated deliverables belong under `/artifacts/` only when a project command deliberately chooses that shared output root. Tool-owned `coverage/` and `dist/` keep their conventional paths.

## Documentation

- This is a Level 2 maintained executable repository.
- `docs/VISION.md` carries durable product purpose. `docs/DIRECTION.md` temporarily carries current product direction.
- `docs/ARCHITECTURE.md` describes current shipped structure, never a speculative feature wishlist.
- Maintained Markdown documentation other than the root `README.md` begins with a `## Meaning` section. `LICENSE` retains its legal bytes.

## Repository Effects

No sibling repository is authorized for mutation from this checkout. GitHub settings, Store publication, releases, tags, and public pushes remain distinct effects from local source authoring and verification.

## Durable Branch Declaration

`main` is the only durable product branch. The project has a public release and observable Store use, so pull requests are the ordinary route for material maintainer changes. A separate `next` line is not earned while accepted source changes can continue on one integration line without promising immediate Store publication.

```text
main:
  maintainer integration: PR preferred
  external contributions: not currently accepted
  required pre-integration evidence: test
  required approval/review: none
  resolved conversations: no
  automatic CI: Tests
  automatic retained branch effects: none
  other pre-update evidence: none
```

The provider currently runs the `Tests` workflow on pushes to `main` and pull requests, and exposes its job as the `test` check. Required pre-integration evidence binds that check to the exact candidate SHA. Provider rules and settings remain separate read-back truth; this declaration does not claim they mechanically enforce the posture.

## Leitsatz Adoption

Leitsatz adopted through: `b487c3d733a5a035df73a95cbda5d8afd4595c99`.
