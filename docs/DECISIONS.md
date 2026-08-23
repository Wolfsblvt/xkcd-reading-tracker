# Decisions

## Meaning

This record preserves the consequential product and engineering choices that make xkcd Reading Tracker recognizable and safe to evolve. It owns rationale that Git and the current source shape cannot recover by themselves; it is curated rather than an implementation diary.

## Prefer Pull Requests on One Durable Public Line

**Date:** 2026-08-23 · **Status:** Current

**Decision.** `main` remains the only durable branch, and pull requests are the ordinary route for material maintainer changes. No independent approval is required while Wolf is the sole eligible maintainer.

**Why.** The project has an official public release and observable Chrome Web Store use, so material changes deserve a visible candidate and exact `test` check before integration. The Store does not publish automatically from `main`, so ongoing source integration does not require a second durable release line.

**Rejected.** Keeping direct integration as the ordinary route after public reliance, imposing a hard PR/self-approval gate, or creating a ceremonial `next` branch without a separately consumed stable line that must remain unchanged.

**Reopen if.** A stable `main` must remain independently consumable while next-release integration continues, another eligible maintainer changes the review consequence, or a hard security/release contract earns `PR required`.

## Package Committed Assets Without Regenerating Them

**Date:** 2026-08-23 · **Status:** Current

**Decision.** `npm run package` consumes committed runtime assets and writes only the allowlisted ZIP under `dist/`; `npm run assets` is the explicit image-regeneration command.

**Why.** Packaging should be a bounded, repeatable release operation. Rewriting tracked icons, promo images, and social media assets on every package run couples unrelated source mutation to a consumer archive.

**Rejected.** Regenerating all image outputs inside packaging. It adds no release assurance once committed dimensions and package entries are already checked.

**Reopen if.** The release artifact is intentionally changed to be generated from uncommitted or parameterized artwork.

## Journal Synchronized Writes Before Acknowledging Them

**Date:** 2026-06-21 · **Status:** Current

**Decision.** User changes are merged into a small local journal before callers are acknowledged, then flushed to `chrome.storage.sync` by the service worker.

**Why.** Chrome Sync throttling and Manifest V3 worker suspension must not silently discard a reader's recent actions. Overlay reads keep queued changes visible while the remote store catches up.

**Rejected.** Independent direct Sync writes from each UI surface. They duplicated work and made temporary quota failures a user-data-loss path.

## Keep User State Local-First

**Date:** 2026-06-13 · **Status:** Current

**Decision.** Reading state uses Chrome extension storage; public xkcd metadata is a rebuildable local cache; the extension operates without a developer account or backend.

**Why.** The product is a personal reading companion. Chrome storage supplies the useful cross-install behavior without transferring reading state to a service Wolf must operate.

**Rejected.** A hosted account system and synchronizing public comic metadata as valuable user state. Both add cost and privacy burden without improving the core reading loop.

**Reopen if.** A concrete supported-browser or synchronization need cannot be served honestly by Chrome storage.

## Keep Read, Favorite, Rating, and Continue Point Independent

**Date:** 2026-06-13 · **Status:** Current

**Decision.** The four kinds of personal state can change independently.

**Why.** Rereading a comic should not move the backlog position; liking a comic does not prove it was read in the current journey; a rating is optional judgment, not a favorite flag.

**Rejected.** Deriving one state from another or treating browser history as the reading model. Those shortcuts erase reader intent.

## Augment xkcd Instead of Replacing It

**Date:** 2026-06-13 · **Status:** Current

**Decision.** Comic pages remain the primary reading surface, with a small popup for quick actions and a dashboard only for collection management.

**Why.** The comic, xkcd navigation, and xkcd's visual language are the experience being supported. A restrained enhancement keeps the product useful without competing with its subject.

**Rejected.** A standalone archive reader or framework-heavy application shell. Either would make the tracker the destination and turn a small companion into a second website.

## Ship Directly Loadable Production Source

**Date:** 2026-06-13 · **Status:** Current

**Decision.** Production code remains plain JavaScript, HTML, and CSS with no runtime dependency installation or application build.

**Why.** The current product is small enough to stay understandable and load directly in Chrome. Tests, asset generation, coverage, and packaging may use repository tooling without becoming runtime architecture.

**Rejected.** A UI framework, TypeScript compilation, or bundler added in anticipation of scale. No current supported behavior earns their operating cost.

**Reopen if.** A concrete feature repeatedly fails to remain clear or testable within the direct-source shape.
