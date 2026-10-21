# Session review surface

Mode: Operate. Scope: improve the existing explorer inside its established visual identity. This is not a rebrand or a new product capability claim.

## Review path

1. Choose a session from desktop navigation or the mobile Session select.
2. Read its recorded boundary state. Use Review gaps to filter the complete retained session to explicit capture gaps.
3. Scan Activity. Commands, Files, Prompts, Gaps and Usage are reversible filters. The search covers all retained observations rather than only the current page.
4. Select an observation. Inspect its escaped source payload before opening optional provenance and normalized metadata. Explicit tool-ID matches link requests and results; the deterministic rule and supporting IDs remain available.
5. Copy a local evidence link to return to that project, session, view and event. Session/view changes survive reload. Browser Back/Forward restores the URL state.
6. Read Usage and Coverage for source-reported counts and explicit limitations. Neither view certifies complete capture or feature behavior.

## Layout assessment and resolution

The original 10–13px-heavy interface spent the top of the page on an introductory title, notice and four large counters. It reduced the space available to the actual review task. The evidence panel mixed source metadata ahead of the payload, and mobile stacked the inspector below the entire event list. Search only matched already-loaded rows, while reload lost the selected session.

The revised layout leads with the session title and a review action, keeps counts compact, increases the activity/payload hierarchy, makes provenance progressively available and keeps the inspector beside the list on desktop. Mobile uses a focus-managed native evidence dialog; ordinary browsing and filtering remain inline. It retains the incumbent neutral/green system and icon vocabulary.

The activity list and inspector deliberately have different roles: repeated observations are rows; captured content is a readable detail surface. Coverage is a comparison list rather than repeated decorative cards. Usage uses a table for counts with a labeled input-composition bar and formula explanation.

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

Query tests exercise matches beyond the first page, file/command/gap filters, project isolation, literal SQL-looking text and stable source-order cursors. Browser checks cover evidence links and reload, session-wide search, empty recovery, usage nulls, keyboard tabs, mobile dialog focus and deep links, query Retry and hostile HTML. Desktop, 390px mobile and an intermediate viewport were inspected in one batched pass, then confirmed after the observed mobile/header defects were corrected. The design detector reported no findings.
