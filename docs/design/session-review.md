# Session review surface

Mode: Operate. Scope: workspace overview, session library and focused evidence review. This redesign changes information architecture and visual identity while preserving product/evidence boundaries.

## Review path

1. Start on Overview, use the capture-gap queue or open the searchable Sessions library. Choose a session from the register, recent navigation, or mobile Session select.
2. Read its recorded boundary state. Use Review gaps to filter the complete retained session to explicit capture gaps.
3. Scan Activity. Commands, Files, Prompts, Gaps and Usage are reversible filters. The search covers all retained observations rather than only the current page.
4. Select an observation. Inspect its escaped source payload before opening optional provenance and normalized metadata. Explicit tool-ID matches link requests and results; the deterministic rule and supporting IDs remain available.
5. Copy a local evidence link to return to that project, session, view and event. Session/view changes survive reload. Browser Back/Forward restores the URL state.
6. Read Usage and Coverage for source-reported counts and explicit limitations. Neither view certifies complete capture or feature behavior.

## Workspace and review layout

The founder requested a full redesign after the initial session-first refinement. The current experience replaces the muted green interface with an ink navigation rail, cool-white workspace and cobalt selection. The overview orients the developer before a review: retained counts, a recent-session register, and a queue based solely on explicit gap observations. The separate Sessions library offers title search and capture-boundary filters. No dummy navigation is provided for unavailable diffs, graphs or live integrations.

Opening a session leads to its Activity, Usage and Coverage views. Activity pairs a searchable register with the evidence inspector at desktop widths. Tool payloads use a dark code surface; prompt text stays on a light reading surface. The relationship route shows the two supporting observation IDs and its deterministic basis. This is an evidence join, not a causal graph.

Below 1100px the inspector becomes a native dialog. The rail condenses below 800px and becomes top navigation below 560px. The overview columns stack and session rows reflow; tables remain legible without shrinking the entire application. The session picker remains available on phones.

## States and constraints

- Search is debounced and submitted in a bounded POST body. It is not written into browser navigation URLs or request-path logs. Clearing search does not alter stored observations.
- Search/filter changes reset the explicit evidence selection so the inspector follows the new review context. Following an evidence link may inspect an event outside the current loaded page; its full payload is fetched separately.
- Source-order pagination uses timestamp plus receipt sequence; receipt order uses durable sequence. Switching order restarts the page. Late-arriving evidence can require Refresh.
- Skeletons communicate activity loading; Load more is disabled during its request. Abort/generation guards discard stale requests across session/filter changes.
- Empty searches offer Clear filters. Collector/query errors offer Retry and an explicit route back to the demo session.
- Copy has success/error feedback. Clipboard permissions may be unavailable; the local address remains a fallback.
- Tab arrows change views. Activity arrows move focus on desktop. Native dialog Escape restores focus to the invoking activity; direct mobile links open their evidence automatically.
- Retained text is untrusted and escaped. No recorded command is executed and no external content is fetched.

## Verification

15 unit/integration checks and six browser flows cover retained evidence semantics, overview and library navigation, source links, reload, fresh-cookie deep links, search outside the first page, unknown usage, tab keys, mobile dialog focus, untrusted captured HTML and retry recovery. The summary-failure flow verifies unknown gap counts with a working retry instead of a false zero. Desktop and mobile screenshots were inspected; overflow checks covered 1280, 900, 768, 390 and 320px. Typecheck and production build passed. The mechanical detector returned no findings. Independent finish review is recorded in the redesign review reference.
