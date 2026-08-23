# Releasing

## Meaning

This guide carries the current path from a reviewed source candidate to a Chrome Web Store upload package and aligned public repository surfaces. It owns repository-side release preparation and evidence; Store publication, GitHub releases, tags, and remote settings remain separate public effects.

## Prepare the Candidate

1. Update `manifest.json` and `package.json` to the same version.
2. Update user-facing copy, [Store listing source](../assets/store/listing.md), screenshots, and durable documentation whose truth changed.
3. Run `npm run assets` only when source artwork or generated image outputs intentionally changed. Inspect and commit those outputs before packaging.
4. Run `npm test`.
5. Run `npm run package`.

The package command consumes committed assets, checks version agreement, writes a deterministic archive, and verifies the exact allowlisted entries.

## Qualify the Browser Boundary

Complete [Manual QA](manual-qa.md) against the candidate in Chrome. Node tests and a valid ZIP do not prove content-script injection, extension page rendering, storage propagation, worker suspension recovery, alarms, toolbar state, or Store acceptance.

Upload `dist/xkcd-reading-tracker-v<version>.zip` to a Chrome Web Store draft and inspect the draft before publication. A successful local package is not Store publication.

## Keep Public Surfaces Aligned

- `assets/store/listing.md` is the versioned copy source; Google's fields are the submitted live surface.
- `assets/store/screenshots/` contains Store and GitHub screenshots. The listing names the preferred five-image Store set.
- `assets/store/promo/` contains Store promo images.
- `assets/social/github-social-preview.png` is the source for the GitHub repository social preview. The 2026-08-23 adoption audit confirmed that GitHub serves byte-identical 1280×640 PNG content; read it back again after any replacement.
- README badges must link to a current, truthful target. Informational Codecov reporting is not a test or release gate.
- If release notes name an upload ZIP, either attach that exact artifact to the GitHub release or make clear that the ZIP is a locally generated Store input.

## Public Effects

Creating a tag, publishing a GitHub release, uploading or publishing in the Chrome Web Store, changing repository metadata, and replacing the GitHub social preview are separate public effects. Record which were actually performed and bind remote claims to the exact candidate; do not promote local test or package evidence into publication.

Material maintainer changes use the PR-preferred `main` posture declared in root `AGENTS.md`. A green local suite is candidate evidence; the provider-visible `test` check must bind to the exact pull-request candidate before integration.
