# Direction

## Meaning

**Status: Provisional.** The current outcome is to add the next small reader improvement without broadening the extension's permission boundary, while keeping release claims coherent and continuing only evidence-based reduction. This file is the temporary Git carrier for current direction until a shared workplace takes that role.

## Current Outcome

Add an optional tracker-owned Explain action signal through the existing reading-state path, then keep the next public release and repository metadata aligned with what is actually shipped and observed.

The working rule is simple: retain a mechanism when removing it would break a supported reader behavior, a security or data-loss boundary, an explicit external mutation, or an honest release receipt. File size and prior effort are not reasons by themselves.

## Near-Term Roadmap

1. **Add the tracker-owned Explain action signal.** Offer an off-by-default setting that marks a comic read when the reader uses any tracker-owned Explain action, including the visible link and keyboard shortcut. Reuse the existing read-state path and continue-point rules; do not claim the explanation was read, fetch or embed Explain xkcd content, watch browser history, or request another host permission.
2. **Qualify the reader-visible slice.** Preserve the setting and read-state rules with focused tests, then exercise the visible link, keyboard shortcut, continue point, and disabled setting in Chrome. Node evidence does not replace that browser path.
3. **Keep release and public metadata coherent.** Preserve the configured social preview, make Store/release/package claims agree, and add only repository metadata that improves discovery without creating another maintained surface. The smallest current candidates are the Store listing as repository homepage and the topics `chrome-extension`, `xkcd`, `manifest-v3`, and `reading-tracker`.
4. **Take the next bounded reduction slice.** Prefer demand-driven network work and smaller module surfaces where current behavior remains unchanged. Keep the durable sync journal, backup/reset protections, package allowlist, manifest checks, and release browser QA.

## Not Now

- user accounts, a developer backend, analytics, telemetry, or social features;
- Google Drive or another external sync provider;
- cross-browser or Firefox work without a selected supported-browser commitment;
- passive observation of independently opened Explain pages or another host permission before the tracker-owned signal proves insufficient;
- merge import without deliberate conflict semantics;
- a UI framework, generalized renderer, or new workflow/gate system;
- deleting the asset generator until its real editing value is judged separately.

## Revisit the Direction When

The Explain signal changes reading-state meaning in an unexpected way, direct-page observation becomes a concrete reader need, the supported browser boundary changes, asset editing creates repeated friction, or a real reader need makes one of the other not-now items cheaper than its absence.
