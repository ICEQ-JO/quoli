# Phase 2 code journey — checkpoint

Issue: https://github.com/ICEQ-JO/quoli/issues/50
Branch: feat/code-journey-prototype
Persistent checkout: /home/iceq/Dev/quoli-worktrees/code-journey

Owner approved the four-increment code-understanding rework. Current scope is increment 1 only: a clickable synthetic shop prototype, separate from the production Map. Open /prototype/index.html through Vite/dev once the build is validated. The normal app build includes this entry; the public landing build does not.

Implemented: overview; POST /orders -> createOrder -> saveOrder -> orders; optional totalCents and related test branches; stable node positions/path; coordinated source reader using existing highlighter; back/reset; dark/light toggle; responsive styles; explicit synthetic/static provenance and no evidence API access.

Validation at checkpoint: all 224 tests passed (221 existing + 3 new), and the latest TypeScript check passed. Lint still fails: use semantic section elements for scroll regions and place the keyboard-scroll suppression at the exact tabIndex diagnostic; fix syntax-token array-index key suppression. Last diagnostics are in the conversation. Browser/layout/accessibility checks, build, design detector, final review and architecture/vision updates remain outstanding. No real user comprehension testing has occurred.

Tooling: node_modules is symlinked to the main checkout. pnpm 11 attempts an unsafe cross-project install before scripts and refuses it, then runs scripts; prefer direct node_modules/.bin tools or per-command pnpm configuration without modifying user config. OpenCode models were inspected: MiniMax identifiers exist only as OpenRouter models without a free marker. Do not assume those are free or delegate to a paid model. CUA browser was unavailable during research; retry for visual QA.

Next: finish lint, inspect/render prototype, fix visual/behavior defects, run meaningful checks, update architecture/vision, review diff, update issue acceptance criteria and mark the draft PR ready only when complete. No merge authorization. Existing scratch-test.md in the main checkout belongs to the user and was untouched. This is an unfinished checkpoint, not a release.
