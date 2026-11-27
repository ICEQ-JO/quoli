# MVP plan: from proof of concept to product

Status: **delivered** (Increments 1–4 are on `main`). Owner direction 2026-11-12: the rebuilt app proves the pipeline (real Claude Code sessions arrive live with prompts, tool calls and tokens) but feels like a proof of concept. There is no dashboard, no real navigation, no projects or settings, and the lenses break down on a real repository.

This page is the working backlog for the MVP. Each increment is tracked as a GitHub issue (work is tracked on GitHub only). Build them in order. Every increment must keep `pnpm demo`, `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` passing.

## What testing on a real repository showed

Found by the owner running Quoli on the Quoli repository itself:

| Area | Problem |
| --- | --- |
| Structure | One screen with four views. No home, no project list, no settings, no URLs, and connecting a repo needs the terminal. |
| Code lens | A real repo zooms out to an unreadable grey smear. With no files touched it is pure noise. |
| Git lens | Real history turns the branch lanes into a tangle of lines. The layout does not scale past about 10 commits. |
| Infra lens | One truncated card ("PR ba…") and no guidance on what is missing. |
| Agents lens | A single tool call floats in a large empty canvas. |
| Numbers | "4.7M tokens" with 1 tool call is mostly cheap cache reads. Users think in dollars, not raw token sums. |
| Inspector | Shows the same session overview on every lens. |
| Bugs | The missing branch renders a stray "·". Prompts show raw `[Image #4]`. Truncated names have no tooltip. |

## Increment 1: App shell, Home, Projects, Settings (M)

Issue: #91 · Status: **done** (on `main`)

Delivered: History-API routing (`/`, `/projects`, `/sessions`, `/settings`, `/projects/:id[/sessions/:sid]?lens=&sel=`), left navigation with a live indicator, Home, Projects (connect/disconnect/delete from the UI, hook status), Sessions (search, filters, paging), Settings (retention, redaction toggle and preview, install info, per-project delete), projects registry, mutation guard, retention, title and tooltip fixes. API contract: [api.md](api.md).

Decisions made during the build:
- A project board opens with no session selected; pick one from its sidebar. (The proof of concept auto-selected the latest.)
- "Needs review" covers ended sessions from the last 7 days only; a live session is mid-work, so "no command after the last edit" would be noise.
- `DELETE` requests carry a JSON body like every other mutation, so the same guard applies.
- The theme setting moves to Increment 4 together with the light theme.
- Verified: lint, typecheck, 17 tests, build, and a browser run against the real server (connect via the UI, URLs surviving reload and back/forward, no horizontal scroll at 1280 px). Not yet verified against a live Claude Code session.

**User value:** Quoli feels like an app you can find your way around. You land on what matters, manage repos without the terminal, and can link to anything.

**Scope**
- Left navigation: **Home**, **Projects**, **Sessions**, **Settings**. The current board becomes a page you drill into.
- URL routing for every page, session, lens and selection (e.g. `/projects/:id/sessions/:sid?lens=code&file=src/a.ts`). Back/forward and reload keep your place.
- **Home:** live sessions now; spend today and this week; sessions needing review (failed calls, many files changed, no test command run); recent activity across all projects.
- **Projects:** connected repos with hook status ("receiving events, last event 2m ago" / "hooks installed, no events yet" / "not connected"); connect and disconnect from the UI (same behavior as `pnpm connect`); per-project counts.
- **Sessions:** a searchable, filterable list across projects (project, branch, live/ended, failures, date).
- **Settings:** data location, retention (delete sessions older than N days), delete a project's data, redaction on/off and preview, port, theme.
- Fix the known bugs: stray "·" without a branch, `[Image #n]` placeholders in titles, tooltips on all truncated text.

**Non-goals:** cost in dollars (Increment 2), lens redesigns (Increment 3), hosted sync or accounts.

**Dependencies:** none.

**Acceptance criteria**
- Every page above exists and is reachable from the navigation, and its URL survives reload.
- A repo can be connected and disconnected from Projects; the hook file matches what `pnpm connect` writes.
- Hook status reflects reality: it changes to "receiving" within 5 s of the first hook event.
- Retention and project deletion remove events, usage rows and transcript offsets for the affected sessions.
- Home and the Sessions list render correctly with 0, 1 and 200 sessions.

**Test plan:** unit tests for routing state, hook status and retention/deletion; a Playwright pass through each page on the demo and on an empty home directory; a manual run against a real Claude Code session.

**Privacy/security:** connect/disconnect writes files only inside the chosen repo's `.claude/`. The server validates that the path is a git repository the user named, not an arbitrary write target. Deletion is real deletion from SQLite (WAL checkpointed). Everything stays loopback-only.

## Increment 2: Session Summary and cost (M)

Issue: #92 · Status: **done** (on `main`)

Delivered: session header with estimated cost; a Summary tab (first when a session is open) with what you asked, what changed (+/− lines from recorded edits), what it ran (test/build/lint/typecheck), what it cost (per model) and a derived review checklist; lens-specific inspector panels; cost on Home, the Sessions list and the sidebar; Settings → Prices (editable, resettable list-price table, prefix matching for dated model ids).

Deviations and limits:
- The checklist ships three rules (edits after the last test, failed commands never re-run successfully, large deletions). "Edits outside the session's branch" is not implemented: hooks do not report the branch at each edit, and guessing would break the no-inference rule.
- Line counts come from the recorded edit inputs, not from Git, so they can differ from the final diff (the Git diff stays one click away in the Code lens).
- Command kinds are matched by keyword (`test`, `tsc`, `lint`…), so an unusual command can be misclassified.
- Cost is a list-price estimate; cache-write and older cache-read prices are derived from the standard ratios and editable.
- Verified: lint, typecheck, 30 tests, build, and screenshots against the real demo server.

**User value:** Opening a session answers "what did it do, what did it cost, what should I review?" in seconds, before any graph.

**Scope**
- Session page header: title, status, project, branch, duration, model(s), cost.
- **Summary** tab first, then Agents / Code / Git / Infra tabs:
  - What you asked (all prompts).
  - What changed: files with +/- line counts from the recorded edits and the git diff.
  - What it ran: commands with pass/fail; detected test, build and lint runs.
  - What it cost: dollars, with input, output, cache read and cache write shown separately.
  - **Review checklist** (derived, labelled as such): files changed without a later test run, failed commands, edits outside the session's branch, large deletions.
- Cost in dollars from a versioned, editable price table (Settings), labelled "estimate".
- The inspector shows content for the lens you are on, not the same overview everywhere.

**Non-goals:** provider billing reconciliation; a model-written summary (any future summary must be optional and cite evidence).

**Dependencies:** Increment 1 (routing, Settings).

**Acceptance criteria**
- Every Summary claim links to the tool calls or diff that support it.
- The cost shown equals the sum of per-message usage × the price table; unknown models show "price unknown", not $0.
- A checklist item never claims a feature works because a command exited 0.

**Test plan:** unit tests for cost math, the checklist rules and diff stats; Playwright on the demo sessions.

**Privacy/security:** no new data leaves the machine; the price table is local.

## Increment 3: Lenses that work at real scale (M)

Issue: #93 · Status: **done** (on `main`)

Delivered, checked on `pnpm demo --large` (a generated monorepo: ~2,400 files, 560+ commits on six branches with merges, one recorded session):
- **Code:** semantic zoom. Opens at folder level as heatmap tiles (edited / read share, file counts), drills in on click with a breadcrumb back out; untouched folders hidden by default with a "Show all folders" toggle; every file listed (up to 50,000 paths; line counts and imports read for up to 5,000 files ≤ 512 KB, the rest marked "not scanned"). `/api/code` ~55 ms on the large demo.
- **Git:** vertical commit graph (lanes computed client-side, merges drawn), branch strip, uncommitted changes on top, 200 commits per page with "Load more", windowed rendering (first rows ~0.5 s; ~560 commits ~0.25 s more). Sessions appear on the commits they created, matched only from recorded `git commit` output (no time-window guessing).
- **Agents:** Timeline view (prompts as headers, one row per call, subagents grouped, runs of 3+ same-tool calls collapsed, replay dims later calls) next to the Graph view; Timeline is the default up to 60 calls.
- **Infra:** names never truncated; with two or fewer services, a guide lists what was detected, which files Quoli reads and how to add more.

Limits: the Graph view of a large session is still dense (Timeline is the default there); the Code scope is not kept in the URL; the working-tree row in the Git graph is not joined to the branch lane.

**User value:** The map stays readable on a real repo with thousands of files and hundreds of commits.

**Scope**
- **Code:** semantic zoom. Start at folder level as a heatmap of where the agent worked; folders open as you zoom in or click; a breadcrumb shows where you are. Hide untouched noise by default, with a toggle to show all.
- **Git:** replace branch lanes with a vertical commit graph (GitHub Desktop-style); sessions attached to the commits they produced; working-tree changes on top; paginated history.
- **Agents:** a readable vertical timeline list when a session is small; the graph view when it is large; collapse runs of repeated reads.
- **Infra:** an empty state that says what was detected, which files Quoli reads, and how to add more. Full names, never cut off.

**Non-goals:** symbol-level call graphs; hosted metrics.

**Dependencies:** Increment 1.

**Acceptance criteria**
- On the Quoli repository and on one repo with more than 2,000 files and 500 commits, every lens is legible at its default view without zooming.
- The Git graph renders 500 commits in under 1 s.
- No text in any lens is truncated without a tooltip.

**Test plan:** a synthetic large-repo fixture generated in tests (no private code); Playwright screenshots of every lens on the demo, on the Quoli repo and on the large fixture; a timing check for the Git graph.

**Privacy/security:** unchanged.

## Increment 4: Product polish (M)

Issue: #94 · Status: **done** (on `main`)

Delivered:
- **Design tokens** for colour, type (11/12/13/15/18/24) and spacing; stray literal colours replaced in CSS and lens code.
- **Light theme** plus Settings → Appearance (System / Dark / Light, per viewer, applied before first paint; React Flow follows it).
- **Contrast:** a unit test checks token pairs in both themes (text and secondary text ≥ 4.5:1, faint small labels ≥ 4.5:1, accents ≥ 3:1). An axe-core scan (`axe-core` 4.11.0) of Home, Projects, Sessions, Settings and the five session tabs reports **0 violations in both themes** on the demo.
- **Keyboard:** `?` shortcut overlay, lens tabs as a real tablist with arrow keys, one tab stop per canvas/list with arrow-key movement, timeline slider keys (←/→, Home/End, Space), skip link, focus moved to the main region on navigation, dialogs that trap and restore focus; shortcuts never fire while typing or under an open dialog.
- **Screen readers:** labels on file chips, folder tiles, tool calls, commit rows and service cards; polite live region announcing new tool calls in a live session (batched every 4 s).
- **States:** error-with-retry where a fetch can fail on every lens, the session board, sidebar and inspector; empty and loading states everywhere.

Limits: loading states are text, not skeletons; tested with axe and keyboard walkthroughs, not with a real screen reader; the spacing scale exists but most padding is still literal.

**User value:** It feels finished and trustworthy.

**Scope**
- A design-system pass: type scale, spacing, color tokens, and a **light theme**.
- Loading skeletons, error states with retry, and an empty state for every view.
- A keyboard shortcut overlay (`?`), with shortcuts discoverable in tooltips.
- Accessibility: focus order, contrast AA, screen-reader labels on canvas nodes.
- Responsive down to laptop widths (1280 px) without horizontal scroll.

**Non-goals:** a mobile app.

**Dependencies:** Increments 1–3.

**Acceptance criteria:** both themes pass AA contrast; every view has loading, empty and error states; there is no horizontal scroll at 1280 px.

**Test plan:** Playwright screenshots in both themes at 1280 px and 1600 px; an automated accessibility check (axe) on each page.

**Privacy/security:** unchanged.

## Increment 5: Usability, clarity and trust (planned)

Status: **planned**. Source: local design/value audit (2026-11-28) on the demo app. The MVP has the core pipeline, but a developer new to Quoli cannot quickly see what happened, what is trustworthy, and what needs review. This increment makes the existing value legible before adding more surface area.

Split into concrete GitHub issues before implementation; each issue names the phase/track it advances and stays M-sized or smaller.

**User value:** A developer can open Quoli and understand, in seconds, what agents did, what needs attention, and how much to trust the numbers.

**Scope**
- **Trust states:** Replace ambiguous `$0.00`, `—`, and `0 tokens` with explicit states: estimated from list prices, no usage reported, unpriced model, or no cost data. Show cost confidence (priced/unpriced coverage) where spend is shown.
- **Dashboard value clarity:** Make Home answer "what should I look at now?" with review queues that explain why a session needs attention (failed commands, wide edits, loops, long-running, unpriced/missing usage). Keep empty states educational, not blank.
- **Navigation and noise:** Reduce sidebar/global-nav load. Collapse "Record every repository" after setup. Group/hide agent worktrees and internal worktree noise by default. Make hook status compact, with detail on demand.
- **Lens jobs and onboarding:** Give Summary/Review/Agents/Code/Git/Infra clear job labels, first-use guidance, and empty states. Summary should lead with decisions; Review with trust-before-merge; Code with a "start here" path.
- **Visual/status language:** One consistent status vocabulary and legend for live/receiving/not recording/ended/failed/estimated/inferred. Make trace colors understandable without hover-only meaning.
- **Provenance visible:** Surface recorded/derived/inferred labels where users make decisions. Never present missing capture as zero activity or zero cost.

**Non-goals:** New agent integrations, hosted sync, symbol-level call graph, mobile app, or controlling agents. No invented summaries; any future model-written summary must be optional and cite evidence.

**Dependencies:** Increments 1–4; Observability (#127–#130) for richer review signals where applicable.

**Acceptance criteria**
- A first-time user can identify live work, review-needed work, and cost confidence from Home without opening docs.
- No spend view presents missing usage/price as `$0.00` without an explicit qualifier.
- Trace/status colors have a visible legend or text equivalent in context.
- Projects default view hides internal agent/worktree noise; users can reveal it.
- Each lens has a clear empty state describing what it shows and how to populate it.

**Test plan:** Playwright screenshots of Home, Sessions, Projects, Settings, and each session lens in dark/light at 1280 px and 390 px; axe checks; unit tests for cost/trust-state formatting and project grouping; manual walkthrough with a person unfamiliar with Quoli.

**Privacy/security:** unchanged. No new data leaves the machine; provenance labels must not expose raw captured sensitive content.

## After the MVP

These come from the [vision roadmap](vision.md#roadmap) and are not in MVP scope: more agents (Codex, OpenCode, Pi), symbol-level code map, hosted provider metrics, hosted sync and teams.
