# App product and UX audit — 2026-11-15

Roadmap: Phase 1 product usability and review workflow. Assessment issue:
[#30](https://github.com/ICEQ-JO/quoli/issues/30). Existing implementation backlog:
[#3](https://github.com/ICEQ-JO/quoli/issues/3). This report proposes bounded changes;
it does not change the production interface or promise new team capabilities.

## Verdict

Quoli has a valuable product-specific foundation: session evidence, review context,
semantic activity colors and connections into code, Git and infrastructure. Its
main weakness is the hierarchy between those capabilities. The interface presents
records and controls before explaining which decision the person should make.

Design the working app around three questions, in this order: **what needs my
attention, what changed, and what is the evidence?** Spend supports that workflow.
For team leads, make the distinction between this computer's evidence and shared
team summaries explicit. A browser-hosted page is not automatically a team view.
Keep the app calm and precise; the marketing page's illustrated scenery should not
compete with code, failures or changes in the working interface.

## Evidence and limits

Assessment of main at `10de3f2` and the owner's dashboard screenshot. Read-only
browser walkthroughs used a fresh synthetic large demo, independent of private
session stores. Browser/source coverage included Dashboard, Sessions, Usage,
Insights, Projects, all six Settings sections, Summary, Review, Agents, Map, Git,
Infra, pairing/setup source and the signed-out account entry. Signed-in team
operations were inspected in source and documentation, not performed.

- At 1440px, axe WCAG 2.0/2.1 A/AA reported zero violations on the five primary
  pages and Review/Agents/Map/Git/Infra in both themes (20 scans). This does not
  establish full accessibility or screen-reader usability.
- Main-page resizing covered 390, 760, 780, 1000 and 1440px in both themes.
  Usage overflowed at 390px; Insights at 390/760/780/1000px; Projects at
  390/780px. The tested session lenses had no page overflow at 390px, and all
  six lens tabs stayed within the viewport.
- Inspected desktop and intermediate-width captures. Selected workflows verified
  session filtering, filter reset after reload, the failed-call filter, changing
  search scope, the repository shortcut and a simulated diff-read failure.
- The mechanical Impeccable detector found no flags in pages/components/lenses.
  Manual and browser checks still found the concrete failures below.
- Network changes interrupted some development-page loads; these were retried and
  are not classified as application defects. Graphs and file reads captured while
  still loading are not evidence of broken rendering.
- No private history was uploaded, no real integrations were installed or removed,
  no team sync enabled, no commands replayed and no deletion executed. Authenticated
  team permissions, physical devices, assistive technology and performance under
  sustained production load remain untested.

## Findings and proposed behavior

P1 means a significant workflow or usability problem to address before a broad
release. P2 means a real problem with a workable alternative. These priorities
are product judgments, not claims that every finding is a WCAG violation.

| ID | Priority | Area and evidence | User impact | Proposed behavior |
| --- | --- | --- | --- | --- |
| 1 | P1 | **Responsive page structure.** Usage, Insights and Projects have reproduced overflow. Usage/Insights header actions squeeze explanatory text into very narrow columns at intermediate widths. Sources: `pages/Usage.tsx`, `pages/Insights.tsx`, `pages/Projects.tsx`, shared `PageHead`, `redesign.css`. | Core analysis and project controls are difficult to read or reach on phones, split screens and smaller laptops. | Put title/description above wrapping filters when space is constrained. Set shrinkable grid/flex children explicitly. Keep wide tables in named local scroll regions; do not make the page itself overflow. Verify 320–1920px and 200% text scaling. |
| 2 | P1 | **Dashboard priority is inverted.** `pages/Dashboard.tsx` places the large spend panel before live work, overlap signals and review. | A person checking an agent must scan billing before reaching the work requiring attention. | Lead with live/quiet work and review signals; use one compact spend strip, with the detailed chart in Usage. Avoid repeating the same sessions prominently in three places. |
| 3 | P1 | **Local and team scope is hidden.** `NavSidebar.tsx` has no account/team context or team destination; access is under Settings → Team sync, while the account page is a separate surface. | A team member or lead can mistake local results for the team's activity or struggle to reach the team view. | Label the current scope as this computer/local activity. Add a clear account/team entry with connected/offline/sync status. Keep private evidence and opt-in summaries visibly distinct. Do not expose teammate code or invent shared detailed review. |
| 4 | P2 | **Brand changes between surfaces.** `styles.css .logo` paints two circles; first-run and marketing use the stepped Q. | Setup, marketing and the app feel like different products. | Reuse the existing stepped Q geometry in a restrained app treatment. Keep accessible product names, light/dark contrast and a single mark source; no new logo library or generated bitmap is needed. |
| 5 | P2 | **Sessions are hard to recognize quickly.** Shared rows combine a truncated first-prompt title, branch, time, counts and trace; generic greetings and long instructions make weak labels. `components/ui.tsx`, `SessionHeader.tsx`. | People must repeatedly open sessions to establish which task they represent. | Prioritize task, project, agent and status; keep verbose metadata secondary. Offer a local display-title override while retaining the recorded prompt as evidence. Never rewrite the append-only record to rename a session. |
| 6 | P2 | **Agent identity is inconsistent.** `AgentTag` suppresses Claude Code by default while other agents receive labels. | In a mixed-agent team, absence of a badge requires knowing a hidden default. | Show agent identity consistently in lists and live rows, using the same space and terminology for every supported agent. |
| 7 | P2 | **Session filters do not survive reload or travel with a link.** In `pages/Sessions.tsx`, most filters are component state; only selected incoming parameters initialize state. Browser test: search narrowed eight synthetic rows to three, then reload cleared the query. | People lose their investigation context and cannot share or bookmark the same view. | Put supported filter state in the URL, provide one clear reset action and retain the view across session drill-down/back navigation. Share only local view parameters, not private results. |
| 8 | P2 | **Search scope changes behind the same entry point.** The sidebar's Search opens a page/project/session jump list outside the board; inside a board it searches project code and recorded text. `App.tsx`, `Palette.tsx`. | Identical controls produce different result coverage without a persistent scope cue. | Give the palette an explicit scope selector/label and show available result types. Keep navigation commands distinct from evidence results and label query failures separately from zero results. |
| 9 | P1 | **Chart keyboard travel scales with every day.** `SpendChart` and Insights charts make every day a tabbable button. Browser test counted 90 plot tab stops on the 90-day Usage view. | Keyboard users must cross long series of empty/low-value dates to reach the next section. | Use one chart tab stop with arrow-key exploration and a clearly linked data table. State whether activating a day inspects its value or opens sessions; Usage and Insights currently differ. |
| 10 | P2 | **Analysis is split into Usage and Insights without a shared investigation context.** Different filters and separate range state are implemented in the two pages. | People repeat filtering while switching between spend, failure patterns and agent activity. | Group these as clearly named analysis views with a shared range and relevant project/agent filters. Preserve useful charts and tables; do not remove capability merely to reduce navigation items. |
| 11 | P2 | **Summary's review cue appears late.** `components/Summary.tsx` puts the review checklist after extensive usage/context/extension detail. | A reviewer can read a long report before seeing the actionable reason they opened it. | Put derived review signals and the Review action immediately after the task and outcome context. Keep detailed cost, context-window and extension sections available below or progressively disclosed. |
| 12 | P2 | **Reviewed can be mistaken for a shared team decision.** `ReviewLens.tsx` stores checkmarks only in localStorage; the visible label does not explain that scope. | A person can assume a checked file has been reviewed for the team or on another device. | Label this as a personal, browser-local review checklist. Do not imply approval, correctness, or synchronized sign-off. Shared review is a separate product decision, not a styling change. |
| 13 | P2 | **Individual file-read errors have no retry.** `ReviewLens.FileDetail` drops the refresh function and renders `ErrorState` without retry. Simulated 503 produced the error and zero retry buttons. | A transient failure forces navigation/reload instead of a direct recovery action. | Retain the loader's refresh callback and add Retry within the failed file detail, preserving selected file, sort and personal review progress. |
| 14 | P2 | **Subagents count describes calls, not agents.** `AgentsLens` counts calls matching `matchesFilter`; the subagents filter includes the spawn call and child calls. In the synthetic example one child agent produces a badge of four. | The filter label looks like an agent count and misstates the mental model. | Label it Subagent calls when counting calls, or show the true agent count separately. Keep failure, command and edit filters explicit about the unit. |
| 15 | P2 | **Board controls compete with session context.** Six lenses, project selector, branch state, search, panel toggles and replay live around a repeated session header. | New users must learn several navigation layers before following one task. | Keep a compact session identity, a clear session chooser and stable lens navigation. Reveal detail panels in context and make replay an explicit mode with a clear return to the full session. Preserve current keyboard access and deep links. |
| 16 | P2 | **Map opens with a large exploratory vocabulary.** Explorer, hops, code reader, graph nodes and scope controls appear together; the shared copy alternates Code and Map across surfaces. | New users must understand the graph's controls before knowing what to select. | Use consistent Code map naming, lead with changed files/functions and provide one clear next selection. Keep caller depth and broader exploration secondary. Benchmark actual large graphs before changing their rendering engine. |
| 17 | P2 | **Infra devotes primary space to unavailable providers.** `InfraLens` lists many providers absent from the repository as not connected. | Planned integrations dominate an otherwise useful detected service view and suggest work the user cannot complete. | Show detected services and local Docker status first. Collapse absent/planned providers into an explicitly labelled capability reference. Keep declared/inferred/live distinctions visible and preserve the add-service action. |
| 18 | P2 | **The repository plus action does not start connecting.** `NavSidebar .nav-add` links to Projects, but `ProjectsPage` leaves `.connect-one` closed. Reproduced in browser. | The labelled shortcut adds an extra hunt and click. | Navigate directly to an expanded, focused Connect form with an anchor/query state that survives reload. |
| 19 | P2 | **Project actions have weak separation.** Open, Stop recording, Disconnect and Delete data share each table row, while global setup/removal is above. | It is difficult to predict whether an action stops future capture, removes hooks or erases history. | Keep Open and recording status direct; group maintenance actions with explicit effect descriptions. Keep destructive confirmation and preserve the distinction between local data, repository files and global agent setup. |
| 20 | P2 | **Settings mixes ordinary preferences and administration.** General places stop/remove instructions before budgets; Prices begins as a large editable table. | Routine adjustment is buried among rare operational actions and many editable fields. | Put common preferences first, isolate installation/danger actions, and make prices searchable with a clear live/default/custom source and explicit dirty/save/reset feedback. Do not weaken existing validation or redaction. |
| 21 | P1 | **Cross-time-zone day filtering has mismatched boundaries.** `server/insights.ts` buckets with server-local `localDate`; `pages/Sessions.tsx` applies incoming `day` with browser-local `localDay`. | A day linked from Insights can omit its sessions when browser and server time zones differ. For example 00:30 UTC is the previous calendar day in Los Angeles. | Define and return the reporting time zone, filter using the same boundaries and show that zone in analysis. Keep USD explicit; avoid silently interpreting server-local dates as the viewer's local dates. This is source-traced; no production records were modified to reproduce it. |

## Button and interaction contract

Apply this contract across the app rather than restyling individual buttons in
isolation. Existing keyboard semantics, validation and destructive safeguards must
survive the changes.

| Control | Expected behavior |
| --- | --- |
| Navigation and lens tabs | Active state, predictable scope, real deep links, back/reload preservation, roving focus for tablists. |
| Project/session chooser | Name, agent and status remain distinguishable; selecting a project never silently implies a session or team selection. |
| Search | Visible scope, labelled result type, keyboard selection, Escape/return focus, separate loading/error/no-results states. |
| Filters and chart controls | Persistent query context, clear/reset action, explicit units, one accessible keyboard entry per chart rather than one per date. |
| Review checkboxes | Browser-local scope, keyboard toggle and visible progress; never represented as shared approval. |
| File/source/diff tabs | Preserve the chosen file and view; retry the failed read in place. |
| Replay and graph controls | Name the action, preserve focus, expose selected time/scope, offer return to full/live view and honor reduced motion. |
| Copy actions | Confirm success; show clipboard failure without losing the source text. Existing PR-summary copy feedback is useful. |
| Save/reset actions | Show dirty state, validation, working/success/error feedback and the effective source of values. |
| Connect/setup actions | Explain what will be written, distinguish one repository from global setup, and land on the actual form. |
| Recording/disconnect/delete | Explain future-capture versus hook removal versus permanent history deletion. Retain a focused Cancel action and concrete confirmation. |
| Team link/share controls | Keep off-by-default summary consent, the field allow-list, local/detail boundaries, team membership and owner/member permissions clear. No teammate source-code capture is implied. |

## What should stay

- The activity trace and semantic colors are meaningful, product-specific assets.
- The Review lens joins recorded edits, current Git differences and command order;
  it should become easier to reach, not be replaced by a decorative summary.
- Native labels, focus management, keyboard tabs, error components, provenance
  language and both themes provide a good accessibility foundation.
- Costs are labelled estimates; unknown values and unsupported live infrastructure
  remain distinct. Keep those honesty rules.
- Local-first evidence, explicit opt-in summary sharing and detailed deletion
  confirmation are valuable trust features.

## Bounded delivery sequence

These are proposed M-sized implementation increments under the owner-requested
app review, not claims that new capabilities have shipped. Reconcile them with
#3 before creating duplicate work; #18's paused scope must not be resumed through
an unrelated UI task.

1. **App identity and scope (M, Phase 1):** common stepped Q, consistent agent
   labels, visible local/team context and clear account entry. Acceptance: all
   entry points agree on product identity; local evidence is never presented as
   team results. No new team permissions or uploads.
2. **Decision-first Dashboard and responsive shell (M, Phase 1):** prioritize
   live/review signals, compact spend, fix wrapping headers and overflow on primary
   pages. Acceptance: visible task priorities at 1280/1440px; no page overflow from
   320–1920px; 200% text scaling and both themes. No graph renderer replacement.
3. **Find and analyze (M, Phase 1):** URL-backed session filters, visible search
   scope, chart keyboard navigation and shared reporting-day boundaries. Acceptance:
   reload/back/deep links retain context, keyboard reaches the next section without
   traversing 90 dates, cross-zone day links return the expected sessions. No
   currency-conversion or global private-evidence search service.
4. **Session review workflow (M, Phase 1/Phase 2 usability):** actionable Summary
   hierarchy, compact context/replay affordance, accurate subagent units, explicitly
   local review marks and in-place file retry. Acceptance: select a flagged session,
   inspect its file evidence, recover a failed read and resume review without losing
   state. No shared approval workflow.
5. **Project, infrastructure and settings clarity (M, Phase 1):** real connect
   shortcut, understandable action groups, detected-services-first Infra and focused
   settings forms. Acceptance: each action explains its scope/effect, only relevant
   providers occupy primary space, existing safeguards and form validation remain.
   No implementation of planned provider connections.

Each implementation needs its own scoped issue/branch, relevant unit regressions,
keyboard and accessibility checks, mobile/desktop validation and a PR. Start with
responsive failures and task hierarchy, then finish with visual polish. Do not turn
this audit into one oversized cosmetic rewrite.
