# Session workspace

The founder's approved direction is a familiar work-list/detail workflow informed by [primary-source product research](product-ui-research.md). This supersedes the spacious municipal-wayfinding dashboard. A neutral palette supports the workflow; it is not the redesign's acceptance result by itself.

## Main tasks

- **Sessions** is home. Search titles, filter recorded end state, group by capture state or show one list, and order by source date or name. The list includes available observation/gap counts and source dates. An end event is not a feature-correctness verdict.
- A row opens **Review**, a reading surface with captured developer requests, available repository captures, a derived tool reading view, recorded verification evidence, unresolved evidence and a property rail for source, policy and usage. Missing prompts and absent captures remain explicit.
- **Needs review** is a queue of concrete recorded capture gaps across the loaded project. Selecting one preserves the queue while showing a human-readable captured fact, its uncertainty and supporting source. Raw JSON is disclosed on demand. It is not a failure/productivity score or a persisted reviewed/resolved workflow.
- **Activity**, **Changes**, **Usage** and **Coverage** remain scoped session views. Source IDs and capture/file selections retain direct local links. Project overview remains a secondary destination.

## Navigation and inspection

Review source actions open evidence beside the document without leaving Review. Closing or Escape removes the evidence selection and restores focus. Below 1100 pixels, native dialog inspection protects focus; selection remains visible when crossing the breakpoint in either direction. A direct source link can load an observation outside the currently loaded activity page.

Queue selection is encoded in local session/event IDs. Copying its evidence link preserves the queue view. Below 900 pixels, the queue uses separate list/detail states with a Back to recorded gaps action. There are no snooze, resolve or replay actions.

All sessions restores list filters held in memory while navigating the app. Reload resets these transient display/search controls; theme is the only new preference persisted in local storage. Searches never enter URLs. Legacy `?session=...` links still open Activity. The default without a view is Sessions.

## Evidence and bounds

The reading view does not generate a narrative, access hidden reasoning or infer authorship. A tool request/result pair is shown only when a single explicit-ID relationship has one subject and one object across the returned relationship projection. Ambiguous/unlinked results remain separate observations. Requests retain receipt order; standalone unpaired results are shown separately rather than positioned as causal children. Source actions expose both sides. Reported success/exit codes remain process evidence, not proof that a feature works.

The register and count query share a 50-session bound. The count query returns grouped event kinds without any captured body. Queue reads are limited to four concurrent session requests, initially eight gaps per session, with per-session paging and a 200-record display cap. Failed count/source reads show incomplete/unknown states and retry controls, never an all-clear verdict. The session document pages prompts/tools eight records at a time and caps those display collections at 200; Activity remains the path to further retained records. Captures remain summary-only until the user opens Changes. No new raw session cache or upload path was introduced.

Unknown dirty/usage values remain unknown. Baseline/checkpoint count alone does not establish a code change; the Changes projection handles that comparison. Captured content renders as inert React text, including the new request reading surface.

The verification section of the review document follows the same reading rules: it shows recorded commands, independent exit-code and count facts, and an explicit uncertainty. See [verification evidence](../verification-evidence.md). It adds no claim that a feature works, that a check covered a file, or that no other verification happened.

## Appearance and validation

Dark is the default; the header control enables light. Theme selection is applied through a root attribute so CSS-compiled `light-dark()` values actually repaint. The screenshot evidence includes both actual palettes, not only a changed control label. Fonts are local Geist plus monospace for captured source, paths and identifiers. The document, list and triage layouts are structurally different, with 320/390-pixel navigation checks.

The implementation checks include complete work-list → review → source → code → back and queue → source → session → back flows; source inspection/focus across responsive breakpoints; unknown summary recovery; inert captured HTML; persisted light/dark paint; scoped count projection and its 50-session/dictionary-key bounds. Final validation: 68 unit/integration tests and 14 browser flows passed, along with type checks, lint and the production build. The independent finish review returned PASS after confirming the two fixes below. These checks do not certify live Claude integration, universal accessibility or feature correctness in captured projects.


## Finish review

| Finding | Result |
| --- | --- |
| Mobile ungrouped rows hid capture state; no-end wording overstated certainty. | Resolved: every mobile row retains capture status; the review says “No end recorded” or “Capture state unavailable.” |
| Missing or failed session metadata left an indefinite loader. | Resolved: explicit unavailable state with Retry review and Choose another session; browser coverage includes recovery. |

The reviewer inspected source and screenshots; the primary agent ran the tests. This is implementation review, not founder approval of the finished design. The single detector pass reported 258 advisory findings, predominantly mismatches against the superseded visual reference; it was not used as a pass/fail certificate. The design reference was reconciled after review.

Screenshots use synthetic fixtures: [dark work list](screenshots/session-workspace-sessions-dark.png), [session review](screenshots/session-workspace-review-dark.png), [source inspection](screenshots/session-workspace-source-dark.png), [gap queue](screenshots/session-workspace-queue-dark.png), [light work list](screenshots/session-workspace-sessions-light.png), [light review](screenshots/session-workspace-review-light.png), [mobile list](screenshots/session-workspace-sessions-mobile.png), [unavailable session](screenshots/session-workspace-unavailable-mobile.png), and [no-end session](screenshots/session-workspace-no-end-mobile.png).
