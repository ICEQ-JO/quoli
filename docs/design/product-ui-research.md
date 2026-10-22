# Product UI research: Linear and agent observability

Research date: 2026-10-22. This is a proposed interaction architecture, not a certification of the running UI. The founder rejected both the original spacious dashboard and the subsequent mostly visual restyle. Linear is an explicit reference for product behavior and composition, not permission to use Linear for issue tracking.

## Sources actually inspected

| Product / source | Evidence inspected | What it establishes |
| --- | --- | --- |
| [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) | Full primary-source article; before/concept/after workspace screenshots reproduced by [cofounder Karri Saarinen](https://karrisaarinen.com/posts/how-we-redesigned-the-linear-ui/) | Separate global navigation/chrome, view-specific toolbars, main content and property panels. Layout types serve different tasks. Their process tests complete views/states, not isolated colors. |
| [Linear display options](https://linear.app/docs/display-options) | Documentation and actual control screenshot | Grouping, ordering and visible properties belong to the current work list; grouping and display properties are different from filters. |
| [Linear Inbox](https://linear.app/docs/inbox), [Triage](https://linear.app/docs/triage), [Peek](https://linear.app/docs/custom-views) | Official docs and Inbox/Triage screenshots | A task-oriented queue, selected-item detail, keyboard traversal and temporary preview. Split review is useful in an inbox; it should not dictate every screen. |
| [Langfuse sessions](https://langfuse.com/docs/observability/features/sessions) | Official session screenshot and docs | Readable exchanges with per-trace context and optional structured detail. Its public demo currently leads to signup, so no authenticated walkthrough was performed. |
| [LangSmith trajectories](https://www.langchain.com/blog/langsmith-trajectories-tracing), [observability concepts](https://docs.langchain.com/langsmith/observability-concepts) | Official explanation and thread/trajectory diagram | Separate an understandable session sequence from detailed execution records. Start by finding the meaningful step; inspect exact trace evidence afterward. |

Downloaded reference images were viewed locally under `/tmp/traceframe-ui-research`; third-party artwork is not copied into the product or committed. No account was created, no private workspace was inspected and no cloud session was sent. Reference screenshots can depict older product states; current docs and historical design material are distinguished above.

## Diagnosis of Traceframe

The central failure is object hierarchy. The UI starts at a generic overview and immediately exposes a normalized event ledger. It makes users reconstruct the session from event types. A prompt, command request, command result and usage record receive essentially identical presentation, even though they answer different questions.

The shell repeats orientation: workspace toolbar, back link, large session title, source badge, capture status, observation counts, technical session ID, then tabs. The event inspector repeats the event title and payload label, followed by low-priority metadata and caution text. Much of the first screen explains the machinery instead of helping the developer decide where to inspect.

The recent-session sidebar duplicates the library rather than providing stable destinations. The Overview's introductory banner and product-explanation sections belong in onboarding/help. A theme change and tighter spacing cannot repair this hierarchy.

## Proposed architecture

Stable sidebar:

- Project selector.
- Sessions: default work surface.
- Needs review: recorded capture gaps across retained sessions.
- Project overview: secondary, with factual retained counts.
- Capture/help: setup instructions until working controls exist; no fake settings actions.

The session is the primary object. Events are supporting records inside it. A file comparison is a second primary inspection surface scoped to that session. Review queues are views over retained evidence, not a productivity or quality score.

### Screen 1 — Sessions work list

A compact page header and one view toolbar, then a flat register: capture state, session title, repository, source date and retained observation/gap counts. Search, capture-state filter, grouping and sort operate on this list. Grouping can start with documented capture state. An end event means only “End recorded”; it never means the task succeeded.

Opening a row goes to its full session review. Keyboard preview can later provide temporary inspection without changing the primary route. Preserve list context and selection when returning. Source labels distinguish synthetic from local data. Show unknown counts explicitly when summaries fail. Do not add agents, durations or costs that are not recorded.

### Screen 2 — Session review

A focused document-like page with a compact breadcrumb/header. Main reading area:

1. The developer's captured request, with unavailable content handled explicitly.
2. Available change evidence, with direct entry to before/after file inspection.
3. A readable activity sequence with explicit tool request/result relationships. Only established identities permit grouping; unmatched results remain separate. Chronology alone is not a causal link.
4. Recorded gaps and unresolved evidence, each opening its actual source.

A narrow property rail holds source, session ID, recorded end/capture state, reported usage and capture policy. Exact raw records live behind an Evidence action. This hierarchy is the proposed translation of Linear's item detail and LangSmith's readable session layer; it is not a claim that Traceframe currently provides generated summaries or full trace capture.

### Screen 3 — Needs review

A queue of concrete recorded capture problems. Selecting one keeps the queue visible and opens the relevant session/source context. This is the deliberate split-view workflow. Do not label a session defective merely because it has no recorded end; show the captured fact and its limitation. No invented “reviewed”, snoozed or resolved state until persisted review actions are designed.

### Screen 4 — Changes

Keep a dedicated path list and large code area. Opening a comparison preserves its session/capture pair. Source observations remain one action away; raw ingestion metadata is secondary. The existing bounded diff engine can support this screen without a new backend. Unavailable sides remain explicit and inferred renames keep their basis label.

## Interaction rules

- Global navigation changes product scope; local tabs change the selected session's task.
- Full-screen detail is the normal reading surface. Split detail is reserved for queue triage; a temporary evidence drawer is for exact source inspection.
- Search and display controls remain in the current view toolbar. Path/prompt search never enters URLs.
- Escape closes temporary inspection and returns focus. Browser Back returns to the prior view/selection. Selected evidence survives breakpoint changes.
- At narrow widths, list and detail become separate screens/native inspection; hide optional properties, preserve status and core content, and avoid horizontal document overflow.
- A successful command is a recorded process outcome. It does not establish feature correctness or file-level test coverage.

## Implementation sequence

1. Replace the default overview and duplicated recent-session navigation with the Sessions work list and stable destinations.
2. Introduce the session review reading surface and move low-priority technical properties out of its main content. Preserve direct legacy activity/evidence links.
3. Introduce Needs review as a concrete queue with supporting-source navigation, then reconnect Changes/Usage/Coverage in the new hierarchy.
4. Validate complete tasks: find session → understand request → inspect changed file → follow source → return; find recorded gap → inspect context → return. Then finish typography, light/dark states and responsive details together.

The founder approved this interaction architecture. Implementation is tracked in [GitHub #32](https://github.com/ICEQ-JO/quoli/issues/32); the [workspace reference](session-workspace.md) records the implemented behavior and validation. Existing live capture/analysis features remain separate milestones.
