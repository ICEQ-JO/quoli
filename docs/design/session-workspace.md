# Session workspace

The implemented workspace uses a familiar session work-list/detail workflow informed by [primary-source product research](product-ui-research.md), in the neutral/fern evidence desk direction. The marketing landing has since moved to direction D (black/Inter/Instrument Serif) in [directions/d01](directions/d01/README.md); the workspace is unchanged and keeps this system until its own adoption increment. This reference covers #52 (workspace/discovery), #53 (investigation/recovery) and #54 (settings/lifecycle) under the [whole-product rebuild](../work/product-experience.md). Final full-suite QA passes and the independent material review is closed; implementation is not owner acceptance.

## Main tasks

- **Sessions** is home. Search titles, filter recorded end state, group by capture state or show one list, and order by source date or name. The list includes available observation/gap counts and source dates. An end event is not a feature-correctness verdict.
- A row opens **Review**, a reading surface with captured developer requests, available repository captures, a derived tool reading view, recorded verification evidence, unresolved evidence and a property rail for source, policy and usage. Missing prompts and absent captures remain explicit.
- **Needs review** is a queue of concrete recorded capture gaps across the loaded project. Selecting one preserves the queue while showing a human-readable captured fact, its uncertainty and supporting source. Raw JSON is disclosed on demand. It is not a failure/productivity score or a persisted reviewed/resolved workflow.
- **Activity**, **Changes**, **Map**, **Usage** and **Coverage** remain scoped session views. Source IDs and capture/file selections retain direct local links. Project overview remains secondary: a bounded retained-count ledger, three recent sessions, source-linked recorded gaps and a short review-path explanation. Its gap links open Activity filtered to gaps.
- **Settings** is a stable project destination. It separates new-observation capture policy, pause/resume, staged retention, storage counts and confirmed project-evidence deletion.

## Navigation and inspection

Review source actions open evidence beside the document without leaving Review. Closing or Escape removes the evidence selection and restores focus. Below 1100 pixels, native dialog inspection protects focus; selection remains visible when crossing the breakpoint in either direction. A direct source link can load an observation outside the currently loaded activity page.

Queue selection is encoded in local session/event IDs. Copying its evidence link preserves the queue view. Below 900 pixels, the queue uses separate list/detail states with a Back to recorded gaps action. There are no snooze, resolve or replay actions.

All sessions restores list filters held in memory while navigating the app. Reload resets these transient display/search controls; theme is the only new preference persisted in local storage. Searches never enter URLs. Legacy `?session=...` links still open Activity. The default without a view is Sessions.

## Connection and lifecycle

Sessions and Overview contain an inert **Connect a repository** disclosure, automatically open when an available project has no sessions. Source checkout and installed CLI choices produce `pnpm connect /path/to/repository` or `quoli connect /path/to/repository`. File-content capture is unchecked by default; checking it adds `--capture-code`. Untracked files require separate consent. Copy shows success or manual-copy guidance for four seconds; changing options clears feedback. Nothing is executed by the page. The guide distinguishes agent-independent repository observation from optional detailed Claude Code activity.

Settings has section anchors for Capture policy, Capture state, Retention, Storage and Delete evidence. Prompt/tool/code toggles and pause/resume save immediately with busy/saved/error status; code consent also enables tool output. Failed writes preserve confirmed settings. Existing excluded-path rules are counted, not edited; untracked consent is not a settings toggle. Paused capture rejects new observations while retained evidence stays readable. New policy does not rewrite already retained history.

Retention offers Keep everything, 7, 30 or 90 days. Selection stages a change and shows Apply / Cancel controls with irreversible-expiry wording. A successful change clears staging. Deletion first explains its scope, then requires a distinct confirmation action. It removes project registration and retained observations/captures/artifacts, stops project capture/storage, and reports actual removed counts. Source files, agent transcripts and backups outside Quoli remain outside that deletion. Busy controls disable duplicate writes. Settings load failure offers Retry settings and Back to sessions.

## Evidence and bounds

The reading view does not generate a narrative, access hidden reasoning or infer authorship. A tool request/result pair is shown only when a single explicit-ID relationship has one subject and one object across the returned relationship projection. Ambiguous/unlinked results remain separate observations. Requests retain receipt order; standalone unpaired results are shown separately rather than positioned as causal children. Source actions expose both sides. Reported success/exit codes remain process evidence, not proof that a feature works.

The register and count query share a 50-session bound. The count query returns grouped event kinds without any captured body. Queue reads are limited to four concurrent session requests, initially eight gaps per session, with per-session paging and a 200-record display cap. Failed count/source reads show incomplete/unknown states and retry controls, never an all-clear verdict. The session document pages prompts/tools eight records at a time and caps those display collections at 200; Activity remains the path to further retained records. Captures remain summary-only until the user opens Changes. No new raw session cache or upload path was introduced.

Unknown dirty/usage values remain unknown. Baseline/checkpoint count alone does not establish a code change; the Changes projection handles that comparison. Captured content renders as inert React text, including the new request reading surface.

The verification section of the review document follows the same reading rules: it shows recorded commands, independent exit-code and count facts, and an explicit uncertainty. See [verification evidence](../verification-evidence.md). It adds no claim that a feature works, that a check covered a file, or that no other verification happened.

## Investigation and recovery

Review keeps verification counts unknown while summary data is loading/unavailable. A recorded command without a result links as **Recorded command**, rather than promising a result. Source reconciliation is disclosed under **Inspect joined sources and reported totals**; unavailable joined counts are em dashes. Summary data is scoped to the selected project/session. Failure shows **Session summary unavailable** with **Retry summary**, while other retained evidence stays accessible. Map failure offers **Retry map** and captured-changes navigation. Source relationship routes say matching tool request/result only for the explicit tool-ID rule; other relations say **Open related observation** and preserve recorded/derived/inferred basis.

Coverage names fixtures, repository-only observation or available session sources without claiming that a retained source is currently connected. Missing session, policy and capture counts remain unavailable. Collector status distinguishes Connecting, Connected and Unavailable. Session search includes Clear session search. Overview failed gap summaries show retry and unknown counts; a loaded zero-gap result still warns that capture may be incomplete.

## Appearance and validation

Dark is the default; the header control enables light. Theme selection is applied through a root attribute so CSS-compiled `light-dark()` values actually repaint. The screenshot evidence includes both actual palettes, not only a changed control label. Fonts are local Geist plus monospace for captured source, paths and identifiers. The document, list and triage layouts are structurally different, with 320/390-pixel navigation checks.

The shell retains a 228px desktop sidebar and a compact toolbar. At 799px and below navigation becomes horizontal; session status remains readable below row titles. Review uses a document/property rail and replaces that rail with exact source inspection. Settings caps at 1100px with a 160px sticky section nav and 48px gap; at 900px the nav wraps in normal flow and anchor clearance increases. The connection guide stacks at 799px. Code and session tabs scroll inside bounded regions rather than widening the page. Current tokens and component rules are in [DESIGN.md](../../apps/web/DESIGN.md).

Final verification (2026-10-22): 35 browser flows pass; 120 unit/integration tests pass and four skip. Typecheck, production build and lint pass; lint has three existing analysis/pilot warnings. The final browser run has no request-abort or uncaught-error output. The map and activity readers finish their bounded POST upload and ignore superseded results, matching the existing captured-diff/review pattern. The independent review returned **Pass — material review closed** after corrected Storage label/value groups were verified in dark/light desktop and mobile captures. See [final validation and review](product-experience-review.md).

Production capture audit `/tmp/quoli-design/render-audit.json` records 20 routes/viewport pairs (ten surfaces at 1440px and 390px), all with `overflow: false` and no captured issues. It is bounded rendering evidence, not universal accessibility, runtime or correctness certification. Fixtures contain no private sessions. The fresh-machine live pilot remains the owner's check.

## Production screenshots

| Surface | Desktop 1440px | Mobile 390px |
| --- | --- | --- |
| Sessions | [Desktop](screenshots/quoli-sessions-1440.png) | [Mobile](screenshots/quoli-sessions-390.png) |
| Overview | [Desktop](screenshots/quoli-overview-1440.png) | [Mobile](screenshots/quoli-overview-390.png) |
| Settings | [Desktop](screenshots/quoli-settings-1440.png) | [Mobile](screenshots/quoli-settings-390.png) |
| Needs review queue | [Desktop](screenshots/quoli-review-1440.png) | [Mobile](screenshots/quoli-review-390.png) |
| Session review | [Desktop](screenshots/quoli-session-1440.png) | [Mobile](screenshots/quoli-session-390.png) |
| Activity | [Desktop](screenshots/quoli-activity-1440.png) | [Mobile](screenshots/quoli-activity-390.png) |
| Changes | [Desktop](screenshots/quoli-changes-1440.png) | [Mobile](screenshots/quoli-changes-390.png) |
| Map | [Desktop](screenshots/quoli-map-1440.png) | [Mobile](screenshots/quoli-map-390.png) |
| Usage | [Desktop](screenshots/quoli-usage-1440.png) | [Mobile](screenshots/quoli-usage-390.png) |
| Coverage | [Desktop](screenshots/quoli-coverage-1440.png) | [Mobile](screenshots/quoli-coverage-390.png) |

Additional actual-theme captures: [source dark](screenshots/quoli-source-dark.png), [source light](screenshots/quoli-source-light.png), [settings light desktop](screenshots/quoli-settings-light.png) and [settings light mobile](screenshots/quoli-settings-mobile-light.png). The [landing reference](landing-page.md) documents its separate screenshots and interactions.

These surfaces do not generate hidden reasoning, infer exclusive authorship, claim exhaustive observation, resolve recorded gaps, allocate precise file cost, or turn process success into feature correctness. Search remains local, captured content inert, unknown values null, and derived views subordinate to retained event history. No session upload or command replay path is introduced.
