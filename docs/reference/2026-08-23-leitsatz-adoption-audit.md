# 2026-08-23 Leitsatz Adoption Audit

## Meaning

This dated record preserves the evidence and dispositions behind xkcd Reading Tracker's first explicit Leitsatz adoption. It owns the observed source, documentation, reduction, and public-repository boundary as of 2026-08-23; it is historical evidence, not an active work queue or a claim about later provider state.

## Coordinates and Starting State

- Downstream repository: `Wolfsblvt/xkcd-reading-tracker`.
- Downstream starting commit: `9637c2e9bd775b3aa333754aaa974aab145d30f6` on clean `main`.
- Evaluated Leitsatz coordinate: `Wolfsblvt/wolf-leitsatz@b487c3d733a5a035df73a95cbda5d8afd4595c99`.
- Prior downstream baseline: unknown; no `Leitsatz adopted through` coordinate existed.
- Selected maturity: Level 2 maintained executable repository.
- Installed-client parity with the evaluated source was not established by this repository pass. Source adoption and client installation remain separate facts.

## Documentation Disposition

The repository had a public README, one root architecture document, a manual release checklist, Store listing copy, and a large ignored founding kickoff. It lacked the shared required homes and every maintained Markdown file lacked the fixed `## Meaning` envelope.

This pass:

- created root `AGENTS.md` and `docs/VISION.md`, `docs/DIRECTION.md`, `docs/PROJECT-MAP.md`, `docs/DECISIONS.md`, and `docs/DEVELOPMENT.md`;
- moved root `ARCHITECTURE.md` to `docs/ARCHITECTURE.md`;
- added the Meaning envelope to maintained Markdown surfaces other than the exempt root README;
- created `docs/PRIVACY-AND-DATA.md` because the extension stores and synchronizes user-created reading state;
- created `docs/DATA-MODEL.md` because the persisted schema and migration boundary outlive one release;
- created `docs/SECURITY.md` because the extension has host permissions, untrusted web input, and a live private vulnerability-reporting route;
- created `docs/RELEASING.md` because a versioned Store artifact ships to users;
- did not create `docs/README.md`, because current navigation does not justify Level 3;
- removed the speculative architecture wishlist and placed only selected current direction in `docs/DIRECTION.md`; and
- left `LICENSE` in its canonical AGPL legal form.

## Founding Material Disposition

The ignored founding kickoff was not left as an invisible second product document. Its durable product purpose and settled rationale were curated into `docs/VISION.md` and `docs/DECISIONS.md`; active direction was re-derived in `docs/DIRECTION.md` instead of copying an old plan.

The exact 47,707-byte historical source was preserved outside the repository at `D:\agents\projects\xkcd-reading-tracker\workbench\history\2026-06-13-founding-kickoff.md`, SHA-256 `C999B13B4CE44A2BC94F323B079B3C2615733C5EB462C9771A78A5C198717FFB`. That workbench copy is recoverable provenance, not canonical product truth. The old `.prompts/Kickoff-Prompt.md` carrier and now-empty `.prompts/` directory were removed.

## Reduction Disposition

The audit asked what concrete mistake each removal would cause.

Removed or simplified:

- package-time asset regeneration, so packaging writes only `dist/`;
- duplicate `build` and `check:manifest` command entrances;
- the unreferenced `tools/generate-icons.mjs` wrapper;
- one duplicate comic-page detection message;
- Codecov upload failure as a build gate, while keeping informational coverage; and
- duplicate/static README badge claims and the currently broken Store rating badge.

Retained because removal has a present consequence:

- the durable synchronized-write journal and serialized flush path;
- backup validation, replacement ordering, and backup-first reset;
- storage normalization and schema rejection;
- the package allowlist, version agreement, deterministic ZIP, and entry verification;
- manifest, domain, storage, and asset-contract tests; and
- manual Chrome release QA.

The 540-line image generator remains an explicit tool pending an owner workflow judgment. Its size is not a deletion reason; removing it would lose one-command regeneration when artwork changes.

## Public Repository Observation

The public GitHub repository reported `main` as default, Issues enabled, and Discussions, Wiki, Projects, Pages, and auto-merge absent or disabled. Squash merge and merged-branch deletion were enabled; merge commits and rebase merging were disabled. Update-branch suggestions were disabled.

No ruleset was returned and `main` reported no legacy branch protection. The repository has an official v1.2.0 release and observable Chrome Web Store users, which selects the Leitsatz `PR preferred` maintainer posture. The root declaration therefore names one durable `main` line, the provider-visible `test` check on the exact candidate SHA, no approval requirement, and no automatic retained branch effect.

GitHub's private vulnerability-reporting API reported the feature enabled. `docs/SECURITY.md` names that real private route and keeps public Issues for non-sensitive bugs; no email address or response-time promise was invented.

The existing CI dependencies were advanced to current official releases and pinned to their verified release commits: `actions/checkout` v7.0.1 at `3d3c42e5aac5ba805825da76410c181273ba90b1`, `actions/setup-node` v7.0.0 at `820762786026740c76f36085b0efc47a31fe5020`, and `codecov/codecov-action` v7.0.0 at `fb8b3582c8e4def4969c97caa2f19720cb33a72f`. Checkout credential persistence was disabled because the workflow has no push step. The selected actions use Node 24 internally; GitHub-hosted `ubuntu-latest` is the current runner boundary, while self-hosted runner compatibility was not claimed.

The provider does not yet enforce durable-branch deletion, force-push, or linear-history safeguards. Rebase merge, update-branch suggestions, homepage, topics, and those safeguards remain observed remote differences; this source pass performed no repository-setting mutation.

## Public Assets and Claims

- GitHub's public `og:image` resolved to a 1280×640 PNG byte-identical to `assets/social/github-social-preview.png`, so the preview was live-configured rather than merely present in source.
- The Store rating badge rendered `rating: not found` and was removed.
- Source version, Store version/users, GitHub release, `test`, coverage, and license have distinct truthful targets.
- GitHub detects AGPL-3.0 and the package declares `AGPL-3.0-or-later`; the release ZIP includes `LICENSE`.
- Repository homepage and topics were empty. The earned candidates are the existing Chrome Web Store listing and `chrome-extension`, `xkcd`, `manifest-v3`, and `reading-tracker`.
- GitHub release v1.2.0 had no attached assets although its notes named the generated ZIP. The next release should either attach that exact artifact deliberately or omit the package claim; this pass did not retroactively create a second distribution route.

## Effects Not Performed

No public push, pull request, merge, tag, release, Store upload, social-preview replacement, repository metadata change, ruleset, branch-protection change, or merge-setting mutation was performed by this audit record.
