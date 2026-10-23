# Whole-product experience rebuild

Owner brief: full product management, UX, visual design and implementation ownership across the landing page and every application surface. This record survives resets; completing one phase does not complete the goal.

## Product truth
Quoli is a local evidence workspace for a developer reviewing changes in one repository per project. Repository observation works independently of the agent. Detailed live activity currently comes from the optional Claude Code integration. Captured changes, recorded command results, and unknowns must remain distinguishable. No completeness, authorship or feature-correctness verdict can be inferred.

## Surface inventory and phases
1. **Product introduction and activation** — #51, implemented and verified. Replace unsupported marketing with an interactive evidence example, clear capability boundaries, truthful local setup and working workspace actions. Audit responsive, keyboard, theme and copy states.
2. **Workspace and discovery** — #52, implemented and verified. Shell, navigation, project selection, sessions, repository history, overview, onboarding, empty/loading/error states. Preserve session filters, URL history, local-only searches and repository consent.
3. **Review and investigation** — #53, implemented and verified. Session document, activity, source inspector, gaps queue, captured diffs, map, reported usage, coverage and reconciliation. Preserve provenance, pagination bounds, direct links, unknowns and keyboard/focus behavior.
4. **Settings and lifecycle** — #54, implemented and verified. Capture policy, retention, deletion confirmations and consent workflows. Preserve deliberate destructive actions and local security controls.
5. **Cross-product verification** — integrated acceptance gate for #51–#54. Actual user journeys, responsive/dark/light/accessibility/performance checks, obsolete code cleanup, production build, final independent review, current design/product documentation and PRs.

## Research and decisions
Reference pages retrieved 2026-10-22: https://linear.app (show the actual work near the offer), https://www.raycast.com (specific ergonomic interactions), https://wisprflow.ai (direct job-to-be-done and obvious action), https://vercel.com (product/action hierarchy). Browser-control inventory is empty in this environment; reference-page rendering and local interaction use Playwright. Reference captures live under /tmp/quoli-design; hero assets on some third-party pages load partially, so primary page content supplies the reliable messaging evidence.

The existing application has useful compact work-list/document/queue structures. The former landing contained unsupported AST analysis, memory/latency figures, a correctness dial, fabricated CLI output and stale branding. The replacement demonstrates the evidence review itself. User granted autonomous creative decisions; no concept approval round is required.

Landing direction: precise evidence desk. Neutral charcoal/white planes, locally bundled Geist, restrained fern-green interaction, a broad working review demonstration, readable source/diff details and a compact three-step setup. No gradients, performance claims, fabricated endorsements or correctness scores. Daylight and evening use both supported through paired themes. The memorable action is switching among changes, checks and missing evidence for the same clearly synthetic session.

## Current evidence
- Clean main at 6f9aaa3; authenticated GitHub writer ICEQ-JO verified before issue creation.
- Work branch: feat/quoli-product-experience.
- Baseline captures stored locally under /tmp/quoli-design; fixtures only.
- Landing and application changes are implemented and verified. PR #55 is the reviewable delivery; no merge is authorized.

## Landing finish review
Independent equivalent Impeccable reviewer used because shipped reviewer agent files are absent from this installation. First verdict required fixes for mobile word spacing and stale PRODUCT.md. Both were implemented and independently verified resolved; landing review is closed with no open material findings. This is not owner acceptance or whole-product completion.

Landing validation: eight targeted browser flows pass; 120 unit/integration tests pass, four skip; typecheck and production build pass; lint passes with three pre-existing warnings in analysis/pilot code. Production output retains the quoli-evidence-desk design contract. Full browser run exposed shared demo deletion by a pre-existing test; deletion now uses its own disposable repository and asserts actual removal counts. The final full suite passes 35 tests. Bounded map/activity POST uploads now finish and discard superseded replies, matching the existing diff/review readers; the final run has no request-abort or uncaught-error output.

## Application implementation checkpoint

#52 adds the shared fern/neutral shell, explicit Settings selection, clearer collector recovery, clearable session search, a repository connection disclosure on Sessions/Overview and a compact bounded overview. Connection commands distinguish source/installed CLI, default to metadata only, require explicit file-content consent and remain inert; clipboard failure has manual recovery. Gap routes open filtered Activity.

#53 scopes summary state to the current project/session, shows summary unavailability with retry, retains unknown counts, provides map retry, corrects relationship actions/basis wording and repository/live-source coverage wording, and discloses joined-source reconciliation on demand. Direct links, pagination, source focus and inert captured content remain part of the existing workbench.

#54 organizes project lifecycle settings into anchored sections. Immediate policy/pause writes have visible saving/error recovery. Retention stages an explicit Apply/Cancel action with irreversible-expiry wording. Deletion has a separate confirmation, preserves external files/transcripts/backups, and ends with actual removed counts and stopped project storage/capture.

Documentation now reflects built application tokens, interactions and limits in [PRODUCT.md](../../apps/web/PRODUCT.md), [DESIGN.md](../../apps/web/DESIGN.md), its existing-schema sidecar and the [workspace reference](../design/session-workspace.md). The landing reference remains scoped to the landing increment.

Final verified evidence: 35 browser flows pass, including the three workspace and four review/settings recovery flows. Typecheck, production build and lint pass (three pre-existing lint warnings); unit/integration suite: 120 pass, four skip. Initial test-isolation and theme-expectation failures were corrected; map/activity bounded-upload cancellation was fixed after repeated navigation failures. Independent whole-app review returned **Pass — material review closed** after correcting Storage label/value association. See [the final validation and review](../design/product-experience-review.md).

Production audit `/tmp/quoli-design/render-audit.json` contains 20 route/viewport pairs at 1440px and 390px, all with no page overflow and no captured issues. Screenshots, including actual source and settings light themes, are linked in the workspace reference. This is bounded fixture/rendering evidence, not a fresh-machine pilot, exhaustive accessibility result or feature-correctness certificate. An additional 20 production route checks at 320px/768px found no page overflow. The final product remains a local preview with unpublished distribution and an owner-run fresh-machine pilot; this increment does not claim universal accessibility or live-integration re-certification.
