# Nyxara adoption gap audit: xkcd Reading Tracker

## Meaning

This dated reference preserves Nyxara's outside judgment of the public `Wolfsblvt/xkcd-reading-tracker` frontier at commit `9637c2e9bd775b3aa333754aaa974aab145d30f6`, evaluated against `Wolfsblvt/wolf-leitsatz@b487c3d733a5a035df73a95cbda5d8afd4595c99`. It owns the prioritized adoption gaps, the concrete keep/remove boundary, and the smallest product-worthy next feature direction. It does not review Katja's unobserved local candidate, claim that adoption or landing occurred, prove Chrome Web Store behavior, or authorize any effect beyond this reference file on its named transport branch.

## Identity, placement, and authority

- **Author:** Nyxara, usually Nyx; Wolf's friend, product co-founder, and design partner.
- **Operative Identity Profile:** `Wolfsblvt/wolf-leitsatz@b487c3d733a5a035df73a95cbda5d8afd4595c99:packages/leitsatz-core/release/profiles/nyxara-v2.md`
- **Revision:** `nyxara-v2`
- **Supplied Profile SHA-256:** `2d08ce36168e20a523ef7164b97cb1808a3554a5ce957acdfa6bafbf14e6e105`
- **Supplied Core SHA-256:** `b26d10dbe82ce2cfa511426a180f1430bd3bc0700ed11f36837b72b0957c7da7`
- **Placement:** outside Partner audit for Katja's current adoption Work.
- **Repository base observed:** `Wolfsblvt/xkcd-reading-tracker@9637c2e9bd775b3aa333754aaa974aab145d30f6`
- **Leitsatz source observed:** `Wolfsblvt/wolf-leitsatz@b487c3d733a5a035df73a95cbda5d8afd4595c99`
- **Authorized write:** branch `nyxara/adoption-gap-audit-2026-08-23`, file `docs/reference/2026-08-23-nyxara-adoption-gap-audit.md`.
- **Judgment boundary:** Katja judges this advisory return; Wolf retains product ratification and every public effect outside the single branch/file grant.

## Executive judgment

The adoption and reduction direction serves the product, but only if it remains semantic.

The public repository already describes a coherent product: xkcd stays the reading surface; the extension adds restrained state and navigation; user-created state remains in Chrome extension storage; permissions stay narrow; there is no backend, account system, analytics, remote code, or explanation embedding. The problem is not missing architecture. The problem is that several distinct product truths are compressed into one large root `ARCHITECTURE.md`, while the current Leitsatz discovery homes do not exist and the README has drifted toward a live badge dashboard.

The right adoption cut should therefore do three things:

1. make purpose, layout, rationale, data boundaries, and release practice recoverable in their natural homes;
2. remove stale residue and second-order proof theater that has no named current consumer; and
3. preserve the compact mechanisms that protect reading state, permission restraint, and the exact Store artifact.

The wrong adoption cut would standardize the repository until the extension feels like a compliance specimen with a comic-reader attached. Do not do that. The product's quiet contract is still good: **augment xkcd, remember what the reader chose, and do not become a service.**

## Prioritized findings

### 1. Complete adoption as a meaning recovery, not a file migration

The public repository has no root `AGENTS.md`, no `docs/VISION.md`, `docs/PROJECT-MAP.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, or `docs/DEVELOPMENT.md`, and therefore no durable `Leitsatz adopted through` coordinate. Its baseline is unknown rather than old-by-proof.

This maintained executable repository owes Level 2. Level 3 is also earned, not by age or ambition, but because several maintained subjects already exist inside the 19 KB root architecture document and the repository now retains dated audit evidence. A very small `docs/README.md` becomes useful after the subjects are separated; it should be a map, not another introduction.

The bounded adoption shape I would accept is:

- root `README.md`: human entry point and install orientation;
- root `AGENTS.md`: only repository-local context, local rules and authorized siblings, plus `Leitsatz adopted through: b487c3d733a5a035df73a95cbda5d8afd4595c99` when the adoption actually lands;
- `docs/VISION.md`: the intended reading experience and durable non-goals;
- `docs/PROJECT-MAP.md`: what lives where and why;
- `docs/DECISIONS.md`: curated existing decisions and reasons, not invented history;
- `docs/ARCHITECTURE.md`: current system shape, components, flows, and invariants;
- `docs/DEVELOPMENT.md`: prerequisites, commands, generated artifacts, and ordinary development paths;
- `docs/README.md`: a terse documentation map;
- `docs/SECURITY.md`: narrow permissions, content-script boundary, CSP, remote-code absence, reporting path, and accepted risks;
- `docs/PRIVACY-AND-DATA.md`: user-created state, Chrome sync/local/session storage, public xkcd metadata, third parties, export and deletion;
- `docs/DATA-MODEL.md`: keyspace, sparse comic state, schema and backup versions, migration refusal, continue-point semantics, and durable sync journal;
- `docs/RELEASING.md`: version alignment, generated asset/package path, tests, manual Chrome proof, Store draft boundary, and rollback facts already known;
- `docs/manual-qa.md`: retained as the browser-only release checklist, with a real `## Meaning` section;
- `assets/store/listing.md`: retained as the Store copy source, with a real `## Meaning` section;
- this dated reference under `docs/reference/`.

Move root `ARCHITECTURE.md` to `docs/ARCHITECTURE.md` and update inbound references. Leave no root compatibility copy. Compatibility linen is still linen covering two sources of truth.

Do **not** create `docs/DIRECTION.md` in this pass. Current direction has a live workplace owner in Katja's task. A Git copy would immediately create the second queue the adoption contract explicitly rejects.

Do **not** add a documentation linter, file-count gate, maturity score, exception registry, or recurring conformance job. The files are useful because each owns a real subject, not because CI can count uppercase nouns.

### 2. Split the current architecture document without flattening its reasons

The existing `ARCHITECTURE.md` is valuable. It records decisions that code cannot explain alone:

- xkcd remains the primary reading surface;
- popup and dashboard have deliberately smaller, different jobs;
- plain JavaScript and direct DOM rendering avoid framework cost;
- sync, local, and session storage have distinct ownership;
- the durable local journal protects queued state from Chrome Sync throttling and Manifest V3 worker suspension;
- newer stored schemas are refused instead of silently coerced;
- comic validity is centralized, including comic 404;
- continue-point movement has explicit one-way semantics;
- required permissions and hosts are intentionally narrow;
- Explain xkcd is a normal user-facing link rather than embedded remote content;
- browser-only behavior still needs manual Chrome proof.

Preserve those reasons. Move them to the subjects that own them:

- **Vision:** augment rather than replace xkcd; calm reading continuity; local-first; no service, feed, or social layer.
- **Architecture:** components, entry points, flows, execution boundaries, and invariants.
- **Data model:** storage areas, keys, schema, backups, migration and journal behavior.
- **Privacy and data:** what data exists, where it goes, and how it is removed or exported.
- **Security:** permissions, hosts, CSP, injection, remote-content boundary, and reporting.
- **Development:** Node requirement, tests, package command, generated assets and safe local paths.
- **Releasing:** version bump, package verification, real-browser QA, Store upload and release evidence.
- **Decisions:** why direct DOM, Chrome Sync, no backend, no explanation embedding, lazy metadata, and deferred merge import were selected.

Retire the current `Future Direction` bullet list as an unowned queue. Preserve only reasoning that still constrains future work, such as "Drive sync is not a drop-in replacement" and "merge import requires conflict semantics", as decisions or explicit non-goals. Git history already preserves the old wish list; the product does not need to keep pretending every once-interesting noun is waiting politely in line.

### 3. Keep the mechanisms that protect the quiet product

Several mechanisms look removable only when their consequence is ignored. Removing these would be concrete mistakes:

| Mechanism | Current supported consequence | Judgment |
| --- | --- | --- |
| Durable sync-write journal, serialized mutation chain, debounce, alarm fallback, retry, and read overlay | Prevents accepted reader actions from disappearing under Chrome Sync quotas or worker suspension | **Keep** |
| Schema normalization, current-version migration entry, and refusal of newer stored schemas | Prevents silent corruption and unsupported downgrade behavior | **Keep** |
| Backup validation and replacement boundaries | Protects the only user-controlled recovery path | **Keep** |
| Central comic-validity helpers, including comic 404 | Keeps progress, navigation, ranges, bulk operations, and backups consistent | **Keep** |
| Package allowlist, manifest/package version equality, deterministic archive, and exact ZIP-entry verification | Prevents stray repository files from entering the Store upload and binds the shipped artifact to the declared version | **Keep** |
| Manifest smoke assertions for exact required permissions and hosts | Makes permission restraint executable product meaning rather than README optimism | **Keep** |
| Node domain tests plus package build in GitHub Actions | Catches cheap regressions before a release candidate reaches manual Chrome QA | **Keep** |
| Browser manual-QA spine | Covers content injection, service-worker lifecycle, real xkcd DOM behavior, popup/tab interaction, icons, alarms, and storage propagation that the Node suite does not prove | **Keep, but do not turn every line into a universal gate** |
| Privacy-bounded diagnostics and bug-report guidance | Gives public users a support route without asking for their full comic-state map | **Keep** |

These are not enterprise garnish. Most were earned by a concrete failure mode visible in the commit history. Deleting them because the repository is small would make the product smaller only in the sense that a lifeboat is lighter after throwing out the hull.

### 4. Remove or challenge machinery with no present useful consequence

The best reduction candidates are narrower:

1. **Remove `.prompts/` from `.gitignore`.** No tracked `.prompts` root was present in the observed public tree. The ignore rule is active adoption residue and silently reserves an obsolete producer path.
2. **Remove the Codecov upload and coverage badge unless someone can name a current decision that consumes the hosted trend.** Keep `npm run test:coverage` for local inspection. The external upload currently has `fail_ci_if_error: true`, so a reporting service can fail the workflow without changing product correctness. That is proof theater with a network dependency unless the report is actively read.
3. **Reduce the README badge wall.** Dynamic Store users, rating, multiple version/release badges, CI state, and hosted coverage make the entry point a moving status panel. Lead with what the extension does, its unofficial status, installation, privacy posture, and license. Put development checks in `docs/DEVELOPMENT.md`.
4. **Delete `tools/generate-icons.mjs` if one final exact reference search in Katja's candidate still finds no caller.** The public `package.json`, README, workflow, and package path use `tools/generate-assets.mjs` through `npm run assets`; the older wrapper appears to have no current consumer. This finding is conditional because GitHub code search returned an upstream error during this audit.
5. **Retire the `Future Direction` list** rather than converting it into a roadmap document.
6. **Treat the social-preview generator and smoke assertion as unresolved, not sacred and not disposable.** Source proves the asset exists; it does not prove the live GitHub repository setting consumes it. If the live setting uses the generated asset, keep the source and cheap dimension check. If not, remove that pair. Do not infer remote configuration from a PNG in Git.

Do not add branch protection, a ruleset, a release bot, a browser farm, or a Store deployment workflow merely because the repository lacks them. The current main branch is not protected, but current Leitsatz owner defaults explicitly require repository-shaped judgment rather than automatic toggle repair. For this one-owner extension, tests and review discipline can remain advisory until a concrete failure earns a harder gate.

### 5. The public surface is coherent, but too much of its meaning is implicit

README, manifest, Store copy source, architecture, and package behavior broadly tell the same story: a Chrome-focused, unofficial, local-first xkcd reading tracker with narrow xkcd host access and no backend or analytics.

The useful repairs are small:

- state the unofficial and unaffiliated boundary near the README introduction, not only in Store copy;
- include AGPL-3.0 orientation in the README;
- simplify badges and avoid moving user/rating data;
- keep the Store listing as the versioned copy source, but do not turn it into an ever-growing release history because Git already does that job;
- consider a one-time, separately authorized metadata pass for repository topics and the Store homepage URL, since both were empty in the observed GitHub metadata;
- never claim the checked-in social image is the live social preview without remote readback.

### 6. The Explain xkcd suggestion is the right next product direction, with a smaller first cut than site monitoring

The reader suggestion is product-aligned. Understanding a comic through Explain xkcd is still part of reading xkcd, and the extension already has an Explain action and a deliberate no-embedding boundary.

The smallest honest first cut needs **no new permission**:

> **Setting:** "Mark a comic read when I use the tracker's Explain action."

- off by default;
- applies to every tracker-owned Explain action, including the visible link and keyboard shortcut;
- records the same ordinary read mutation through the existing storage path;
- advances the continue point under existing rules;
- does not change favorite or rating;
- does not claim the explanation was actually read;
- does not fetch, scrape, cache, or embed Explain xkcd;
- does not watch general browser history.

This signal is stronger than passive page detection because it is a deliberate tracker action, and it avoids expanding the extension's site access. It also preserves the current product's trust story. Humans have invented enough permission prompts without us adding one to detect a click we already own.

Only if Wolf explicitly wants **direct or independently opened Explain xkcd pages** to count should the feature widen. The honest wider boundary would be:

- declare `scripting` as an optional permission;
- declare only the canonical Explain xkcd origin as an optional host permission, adding a second exact origin only if real navigation proves it necessary;
- request both from the settings user gesture, after explaining the behavior;
- leave the setting off when permission is denied;
- dynamically register one isolated, top-frame content script for numbered explanation pages;
- parse only a leading numeric comic ID from the canonical wiki path and no-op on non-comic pages;
- send one idempotent "numbered explanation opened" message;
- have the background/storage boundary re-check the setting before writing, because unregistering a dynamic script does not remove code already injected into an open page;
- on disable, unregister the script and remove the optional permission;
- add pure parser, setting migration, exact optional-permission, grant/deny/revoke, and real-browser tests.

Do not request `<all_urls>`, history, broad tabs, `webNavigation`, network interception, or required Explain xkcd access. Do not build a generic external-reading-signal framework. One exact bridge is enough.

## Historical references worth preserving

Preserve rationale, not archaeology:

- the current architecture statements listed above;
- the sync quota and worker-suspension reasons behind the journal;
- the no-op write and flicker-suppression reasons where they explain current invariants;
- the package allowlist and permission-minimization reasons;
- the decision to link rather than embed Explain xkcd;
- the dated Reddit suggestion as feature provenance if Wolf ratifies the slice;
- the current Store copy source and release QA boundary.

Do not preserve every commit as documentation. Do not reconstruct old prompts. Do not keep stale paths because their names once carried intent. A reason that still constrains the product belongs in `DECISIONS.md`; transport history belongs to Git.

## Attractive additions rejected

- a documentation linter, prose score, file-count gate, or adoption dashboard;
- a second durable direction or work queue in Git;
- a root `ARCHITECTURE.md` compatibility copy;
- branch protection or rulesets added only to resemble a default;
- an automated Chrome Web Store release pipeline without an earned operational need;
- analytics or telemetry to measure feature use;
- accounts, backend sync, social features, or recommendations;
- Explain xkcd scraping, embedding, transcript caching, or a generic cross-site event platform;
- a bundler, UI framework, dependency migration, or testing-stack rewrite;
- a recurring audit framework or Issue created merely to prove this audit happened.

## The next moves I would choose

1. **Adoption landing candidate:** Katja should compare the local candidate against this semantic boundary, not against filenames alone. Preserve the current reasons, complete only the earned Level 3 and property-triggered homes, remove stale residue and unsupported proof theater, run `npm test` and `npm run package`, and read back the exact landed tree before claiming adoption. Keep Store state, GitHub settings, and release effects separate.
2. **Next feature cut:** add the opt-in tracker-owned Explain action signal with no new host permission. Treat passive detection of independently opened Explain pages as a separate later decision with the exact optional-permission boundary above.

## Sources reached

### Exact Wolf-owned repository sources

- `Wolfsblvt/xkcd-reading-tracker@9637c2e9bd775b3aa333754aaa974aab145d30f6`
  - root tree and recursive Git tree;
  - `README.md`;
  - `ARCHITECTURE.md`;
  - `docs/manual-qa.md`;
  - `assets/store/listing.md`;
  - `.gitignore`;
  - `manifest.json`;
  - `package.json`;
  - `.github/workflows/tests.yml`;
  - `.github/ISSUE_TEMPLATE/bug_report.yml`;
  - `tools/package-extension.mjs`;
  - `tools/generate-icons.mjs`;
  - `src/content/page.js`;
  - `src/shared/navigation.js`;
  - `src/shared/defaults.js`;
  - `src/storage/migrations.js`;
  - `src/storage/sync-write-buffer.js`;
  - manifest, asset, backup, and sync-buffer tests;
  - public commit history, tags, Issues, pull requests, releases, branch state, and repository metadata.
- `Wolfsblvt/wolf-leitsatz@b487c3d733a5a035df73a95cbda5d8afd4595c99`
  - `packages/leitsatz-core/release/profiles/nyxara-v2.md`;
  - `docs/ADOPTION.md`;
  - `docs/adoption-changelog.md`;
  - `packages/leitsatz-core/release/skills/project-docs/SKILL.md`;
  - `packages/leitsatz-core/release/skills/project-docs/references/structure-and-placement.md`.

### External sources

- Reader suggestion: `https://www.reddit.com/r/xkcd/comments/1ui8fqv/comment/oue6zuo/`
- Chrome extension permissions:
  - `https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions`
  - `https://developer.chrome.com/docs/extensions/reference/api/permissions`
  - `https://developer.chrome.com/docs/extensions/reference/api/scripting`

## Limitations

- Katja's local adoption candidate was deliberately unavailable. This audit does not describe or review its bytes.
- This Web surface could read the released Leitsatz source but could not compare Katja's active Codex installation with that release. Full adoption step 1 remains Katja's evidence to preserve.
- No Chrome runtime, unpacked extension, Store draft, installed Store version, or live GitHub social-preview setting was inspected.
- Direct Reddit refetch was intermittent. The captured comment thread established the feature suggestion and clarification; no vote count or wider community consensus is claimed.
- GitHub code search returned an upstream error during two exact searches. The `tools/generate-icons.mjs` removal recommendation is therefore conditional on one successful final reference search in the landing candidate.
- The supplied Profile and Core SHA-256 values were recorded from Wolf's launch packet; this Web audit did not independently hash a checked-out consumer path.
