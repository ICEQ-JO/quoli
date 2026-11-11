# MVP plan: from proof of concept to product

Status: **planned**. Owner direction 2026-11-12: the rebuilt app proves the pipeline (real Claude Code sessions arrive live with prompts, tool calls and tokens) but feels like a proof of concept. There is no dashboard, no real navigation, no projects or settings, and the lenses break down on a real repository.

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

Issue: #91 · Status: **not started**

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

Issue: #92 · Status: **not started**

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

Issue: #93 · Status: **not started**

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

Issue: #94 · Status: **not started**

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

## After the MVP

These come from the [vision roadmap](vision.md#roadmap) and are not in MVP scope: more agents (Codex, OpenCode, Pi), symbol-level code map, hosted provider metrics, hosted sync and teams.
