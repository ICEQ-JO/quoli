# Architecture

Quoli is one small Node + React app. One process, one port, one SQLite file.

```text
Claude Code ──hook (stdin JSON)──▶ server/hook.mjs ──POST /ingest──▶ server/main.ts
                                                                     │
         transcript .jsonl (token usage) ◀──────── read incrementally┤
                                                                     ▼
                                                     ~/.quoli/quoli.db (SQLite)
                                                                     │
   repo on disk ──git / files──▶ code.ts · gitstate.ts · infra.ts    │
                                                                     ▼
                                 GET /api/* + /api/stream (SSE) ──▶ web/ (React + React Flow)
```

## Layout

| Path | What |
| --- | --- |
| `shared/model.ts` | The shared vocabulary: sessions, agents, tool calls, files, branches, services, links, basis |
| `server/opencode-plugin.js` | The OpenCode 2 plugin `pnpm connect --agent opencode` copies into `<repo>/.opencode/plugins/quoli.js` with the port filled in. Dependency-free; forwards prompts, tool calls and model steps to `/ingest?agent=opencode` in order, never awaits the network in a hook, swallows every error |
| `server/hook.mjs` | What Claude Code and Codex run. Dependency-free, forwards stdin to the server (`/ingest?agent=codex` for Codex), always exits 0, prints nothing |
| `server/connect.ts` | `pnpm connect <repo> [--agent codex|opencode]` — adds/removes Quoli's hooks in `<repo>/.claude/settings.local.json`, for Codex in `<repo>/.codex/hooks.json`, or Quoli's plugin for OpenCode in `<repo>/.opencode/plugins/quoli.js` (the last two are added to `.git/info/exclude` so they are never committed; a plugin file Quoli did not write is never touched) |
| `server/main.ts` | HTTP server: host guard, static/Vite, hourly retention timer |
| `server/app.ts` | The API ([docs/api.md](api.md)): ingest, projects, sessions, overview, settings, SSE, mutation guard |
| `server/db.ts` | SQLite store: append-only `events`, deduplicated `usage`, transcript read offsets, `projects` registry, `settings` |
| `server/adapters.ts` | One adapter per coding agent, mapping its hook payload into the shared Claude Code-shaped event and, where the agent reports it in hooks, a token usage row. Claude Code (identity), Codex and OpenCode are registered |
| `server/ingest.ts` | Runs the agent's adapter, resolves repo root, records the branch at session start, redacts secrets, stores (stamping `quoli_agent` on non-Claude events), reads Claude Code transcripts |
| `server/sessions.ts` | Pure derivation: raw events + usage + price table → session view (turns, tool calls, agents, files, tokens, cost, report) |
| `server/steps.ts` | Pure functions behind the Summary's "Where the time and money went": per-prompt time, tool time, calls, failures, tokens and cost; the slowest calls |
| `server/extensions.ts` | MCP servers, skills and subagent types a session called, from tool names and inputs (contracts in the file header) |
| `server/insights.ts` | Pure cross-session aggregates behind Insights: per-day sessions, cost percentiles, failure rate, tool mix and loops; session length buckets; groups by agent and main model |
| `shared/alerts.ts` | Pure alert triggers (session cost, daily budget, possible loop, quiet, ended) with per-session de-duplication; evaluated in the browser by `web/src/alerts.tsx` |
| `server/loops.ts` | Pure loop and failure detectors behind "Possible loops": repeated failures, edit churn, error streaks and stalls, each with the rule that fired |
| `server/report.ts` | Pure functions behind the Summary: command classification, line counting, changes, review checklist |
| `server/prices.ts` | Built-in list-price table, model matching, `costOf`, PUT validation, load/save via the `settings` table (key `prices`) |
| `server/transcript.ts` | Token usage from Claude Code transcript JSONL, read incrementally |
| `server/code.ts` | Code map: files from `git ls-files`, line counts, JS/TS relative imports, git status and uncommitted line counts (`git diff --numstat HEAD`) |
| `server/gitstate.ts` | Branches (ahead/behind), recent commits, changed-file count, remotes (credentials dropped), last fetch time, one commit's files and diff |
| `server/infra.ts` | Service detection from config files, package dependencies and CI deploy steps; live Docker metrics when available |
| `server/manual.ts` | Services added by hand: validation, local storage per project, merge into the infra map |
| `server/usage.ts` | `GET /api/usage`: spend and tokens per day, model, project and session; cache savings; today/month spend for budgets |
| `server/demo.ts` | Builds a sample repo and records three synthetic sessions |
| `web/src/App.tsx` | Shell: navigation sidebar (Dashboard, Sessions, Usage, projects, Settings) and routes |
| `web/src/pages/*` | Dashboard, Sessions, Usage, Insights, Projects, Settings (General, Prices, Data, Appearance) and the Board (session list, lens tabs, canvas, details panel, replay bar) |
| `web/src/lenses/*` | The four lenses. Agents opens on Steps (one row per call, prompt sections, subagent threads, filters, details in place; `agents/Timeline.tsx`) with Lanes (the graph) as the alternative; Code opens on the change map (`code/changemap.ts`, `code/ChangeMapView.tsx`: the changed files in the middle, what they import on the left, what imports them on the right, one or two steps out) with All files (the folder explorer) as the alternative; Infra draws only things that run (`infra/split.ts`); CI workflows are listed beside the board under Checks and pipelines with what they appear to deploy, next to Hosted connections, which lists providers the repository's files mention and marks every one not connected; services can also be added by hand there (`server/manual.ts`, stored per project in the local settings table, never in the repository), and a detected service can be renamed and given a dashboard link; Code, Git and Infra draw on React Flow via `Board.tsx` |
| `web/src/components/*` | NavSidebar, session Sidebar, Inspector, Timeline (replay bar), Trace (one tick per tool call), SpendChart, Palette (⌘K), Diff, Onboarding |

## Data model

- **Events are the record.** Every hook payload is stored as received (after redaction), append-only. All views are derived from events at read time, so improving the derivation improves old sessions too.
- **Hooks follow the running server.** At startup the server rewrites Quoli's own hook entry in any project whose hooks are installed but point at another port or Quoli checkout. Other hooks and disconnected projects are left alone. Two Quoli servers sharing one data directory on different ports will keep taking the hooks from each other.
- **Tokens come from transcripts.** Claude Code hooks do not carry usage; each hook points at the session transcript, which records per-message usage. Messages repeat once per content block, so rows are keyed by message id and merged with `MAX`.
- **Derived sessions are cached in memory** per session and reused until that session gets a new event or usage row, the price table changes, or it is deleted. `live` is recomputed on every read because it depends on the clock. The cache starts empty on each server start.
- **Repository views are computed live** from the working tree (`git`, files on disk). They are not stored.
- **Costs and the report are derived, not stored.** Cost is computed per read from usage rows and the current price table, so editing prices re-prices history. Costs are estimates at list prices (no discounts, taxes, batch or long-context tiers), not invoices. Usage without a model id, or with a model matching no price row, is excluded and reported as unpriced.

## Security and privacy

- Binds to `127.0.0.1` only. Requests whose `Host` is not `127.0.0.1`/`localhost` are rejected (blocks DNS rebinding).
- Every `POST`/`PUT`/`DELETE` under `/api/` requires `Content-Type: application/json` and an `Origin` of the server itself, so other web pages cannot change settings or delete data.
- Connecting a project requires an absolute path that is a repository top level; hooks are written only to `<repo>/.claude/settings.local.json`. Project and retention deletion really delete rows, then truncate the WAL.
- `/ingest` requires `Content-Type: application/json`, which browsers cannot send cross-origin without a preflight Quoli never answers.
- File reads are limited to known project roots and paths inside them.
- Prompts, tool inputs and outputs are stored locally so the UI can show them. Common credential shapes (API keys, GitHub tokens, AWS keys, private keys) are redacted before storage; redaction is best-effort, not a guarantee.
- Nothing is uploaded anywhere.

## Decisions

**2026-11 — Full rebuild.** The previous codebase (Next.js dashboard, collector, four adapters, three Git-host connectors, signed releases, ~150 docs) had broad scope but a UI the owner found unusable and no single clear workflow. It was removed and replaced by this smaller app built around one board with four lenses. The old code remains in git history (`git log` before the rebuild commit). Carried over as ideas, not code: the passive hook bridge, append-only events with derived views, and the recorded/derived/inferred distinction.

**2026-11-12 — Agent-neutral events (#116).** Other agents' hooks are mapped by an adapter into the shape Claude Code already sends, so derivation, the lenses and stored Claude Code history stay unchanged. Non-Claude events carry `quoli_agent` (and optionally `quoli_agent_version`); the absence of the field means Claude Code, so no migration was needed.

**Local content capture is on.** The old MVP defaulted to metadata-only, which made real sessions unreadable ("Content disabled" everywhere). The product's purpose is to show what the agent did, so prompts and tool I/O are stored locally with redaction. Cloud sync, when built, must be explicit opt-in per project.

## Known limitations

- Claude Code, Codex and OpenCode can be connected. Codex specifics (contract: learn.chatgpt.com/docs/hooks and the generated schemas in `openai/codex` `codex-rs/hooks/schema`):
  - Codex runs project hooks only after the user trusts them with `/hooks` (or the project's `.codex/` layer is untrusted and nothing runs); until the first event the project shows Codex as waiting for trust.
  - Hosted tools such as WebSearch do not fire Codex hooks, so they are never recorded.
  - Codex has no tool-failure event. A result whose first lines report a non-zero exit (`Exit code: N`, `Process exited with code N`) is stored as a failure marked `quoli_failure_inferred`; other failures read as ok.
  - Token usage comes from `PostModelRequest.token_usage` per model request (`input_tokens` include cached input, so uncached input is stored as `input_tokens − cached_input_tokens`). Rollout files are not read.
  - A Codex subagent that runs under its own session id appears as a separate session.
- OpenCode specifics (OpenCode 2; plugin docs at opencode.ai/docs/plugins and opencode.ai/docs/build/plugins/server). The docs do not list event payloads, so the fields Quoli reads were observed with a logging plugin on OpenCode 2.0.32 in a scratch repository on 2026-11-12:
  - A plugin is a default-exported object `{ id, setup(ctx) }`; `ctx.location.directory` is the project, `ctx.app.version` the OpenCode version. Quoli's plugin never touches `ctx.credential` or OpenCode's database.
  - `ctx.tool.hook("execute.before" | "execute.after")` gives `sessionID`, call `id`, `tool` (`shell`, `read`, `write`, `edit`, `grep`, …), `agent` (the OpenCode agent, such as `build`), `input` (files are `path`, edits `oldString`/`newString`, shell `command`) and, after, `status` (`completed`/`error`), `result.output` (shell: `exit`, `output`) and `error.message`. A call fails when `status` is `error` or the shell exit is non-zero.
  - `ctx.session.hook("prompt")` gives the prompt text. `session.step.started` carries the model; `session.step.ended` carries per-step `tokens` (`input` uncached, `output`, `reasoning`, `cache.read/write`) and OpenCode's own `cost`. Quoli stores reasoning as output tokens and prices steps with its own table (OpenCode's cost is kept on the event, not shown). `session.execution.succeeded/failed` ends a turn.
  - OpenCode 2 runs one shared background service, so the plugin keeps only events for its own directory and sessions it has seen. There is no session-end event: an OpenCode session stops counting as live after ten quiet minutes.
  - Subagents run as child sessions and appear as separate sessions. Free or unlisted models (for example `minimax-m3.1-flash-free`) show as price unknown.
- Sessions, usage, tool categories (`categorize` in `shared/model.ts`, lower-cased names for all three agents) and the Summary report are agent-neutral: they read Codex `apply_patch` bodies and argument-list commands and OpenCode's `oldString`/`newString` edits (its adapter maps OpenCode's `path` to `file_path`). The synthetic demo includes one Codex and one OpenCode session in that shape. Codex and OpenCode sessions get token usage only from what their adapters report (no transcript reading), and a model without a price (for example `gpt-5-codex`) counts in tokens, not in spend. Prices match an exact model id or a dated snapshot of it (`<model>-<digit>…`), so `gpt-5` never prices `gpt-5.3-codex`. Built-in OpenAI prices are the standard tier up to 272K input; longer contexts, Batch, Flex and Fast mode cost differently and are not modelled.
- Hook payload fields were taken from Claude Code's documented hook contract and exercised with realistic synthetic payloads; verify against your installed version.
- Subagent ↔ spawning `Task` call is matched by launch order (drawn dashed), because hooks do not link them by id.
- Claude Code records some non-human turns as prompts. The Agents lens shows background-task notifications (`<task-notification>`) and slash commands (`<command-name>`) as one-line notices; other injected text still shows as a prompt.
- File-level code map; imports are resolved for relative JS/TS only, so other languages appear in the change map without connections. The change map draws an import between neighbouring columns or between two changed files; imports between two neighbours in the same column are left out, and each neighbour column keeps its 14 best-connected files ("+N more not drawn"). "Changed by this session" comes from recorded Edit/MultiEdit/Write calls, so files changed through Bash are missing there; "Uncommitted" shows them from git.
- Infra is what config files declare, plus what the user adds by hand. Live status comes only from containers running in local Docker. Hosted providers (Vercel, AWS, Azure, Supabase and others) are listed when a file mentions them or the user adds a service there by hand, never as connected. A deploy command in a workflow (for example `gcloud run deploy`) adds an inferred deploy target when no file declares the host. Services added by hand are only what the user typed: Quoli never checks them and never fetches their dashboard links. Provider connections with live status and metrics are roadmap phase 4. What a pipeline deploys is inferred from its workflow steps, not from runs.
- Large repos: the code map lists up to 50,000 paths and reads line counts/imports for up to 5,000 files (≤ 512 KB); the Code lens opens at folder level. Git history pages 200 commits at a time (max 2,000 per request).
- Session lists show the newest 200 sessions per project (board sidebar) and 500 overall (Sessions, Home), and say so when older ones exist. Older sessions are kept, and the Git lens still attributes their commits.
- Transcripts are read in blocks of 8 MB. A single transcript line longer than that (a pasted image, a huge tool result) is skipped, so any usage on it is not counted.
- Per-prompt tokens and cost are attributed by time: each usage row (one model request or step) belongs to the prompt it falls after. Agents report usage per request, not per tool call, so Quoli never shows a cost per call. Time outside tool calls mixes model time and waiting for the user, so it is not labelled as either.
- Alerts run in the open Quoli tab only: no tab, no alert. They are evaluated when the overview refreshes (on each recorded event, every 30 seconds, and when a hidden tab is shown again), so a quiet alert can be up to about a minute late in a background tab. Settings and the record of fired alerts live in that browser's storage, so another browser starts fresh and may repeat an alert. "Ended" means the session left the live list: an end event, or 10 quiet minutes. A quiet threshold is therefore 1–9 minutes. The live "spend in the last 10 minutes" counts usage rows by their own time, so a long model request is counted when it finishes.
- Extensions (#135): MCP servers are named from `mcp__<server>__<tool>` (Claude Code and Codex, documented), preferring Claude Code's `mcp_server` field (v2.1.274+); a plugin is named only when Claude Code reports `source: "plugin"`, so older Claude Code versions show plugin servers by their scoped segment (`plugin_<plugin>_<server>`). Skills come from the `Skill` tool's `skill` input: the field is not in the published docs or SDK types and was read from Claude Code's own tool schema, so a rename would make skills disappear rather than be mislabelled. Skills typed as `/name` by the user bypass the tool and are not counted. Subagent types come from `subagent_type` on `Agent`/`Task`; a call without one shows as `default`. OpenCode names MCP tools `<server>_<tool>`, which cannot be split reliably, so they are not attributed.
- Insights reads sessions that started in the range and derives each one (cached per session), so a range with thousands of long sessions costs one derivation each on first load. A session counts on the day it started, even if it ran past midnight. The Sessions list a day links to shows at most the newest 500 sessions. Per-model figures use each session's main model, so a session that switched models counts once, under the model with the most tokens.
- Possible loops are inferred from fixed rules (`LOOP_RULES` in `server/loops.ts`): the same command failing 3 or more times, one file edited 5 or more times after a single prompt, an edit that exactly undoes an earlier one (only when the agent records old and new text, so not Codex patches), 4 or more failed calls in a row for one agent, and 10 or more reads and searches after a prompt with no edit or command. They are prompts to look, not verdicts: a loop can be legitimate (a flaky test retried on purpose), and loops the rules do not describe are missed. Thresholds are not configurable yet.
- Usage and budgets are estimates from transcript usage at list prices, bucketed by the server's local time zone. A budget is a display threshold, not an alert channel or a spending limit.
- The Git lens reads the local repository only. Remote branches are what the last `git fetch` saw, and commits that exist only on a remote are not drawn (the history follows local branches). A commit is tagged with a session only when that session's recorded `git commit` output printed its sha; `git commit -q` prints nothing, so such commits stay untagged.
- Themes: dark and light (System follows the OS). Contrast is enforced by `tests/theme-contrast.test.ts`; accessibility was checked with axe-core (0 violations on every page in both themes on the synthetic large demo at 1280 and 1600 px) and keyboard walkthroughs, not a real screen reader. `prefers-reduced-motion` turns motion off. The design system is recorded in DESIGN.md.
- Cost and the Summary report are heuristics: commands are classified from their text, line counts come from recorded Edit/MultiEdit/Write inputs (a Write's removed lines are unknown), failed edits are ignored, and only edits inside the project root are counted. Edits made through Bash (sed, formatters, generators) are not seen. The checklist lists things worth a look and never says the work is correct.

## Marketing surface

Phase 1 [#107](https://github.com/ICEQ-JO/quoli/issues/107) adds a separate Vite
entry at /landing/ with original pixel artwork and a synthetic four-lens
explorer. The main application still loads at / with its existing theme.
The page reads no captured evidence. Its explicit email submission goes to a
same-origin, size-limited handler, stored separately in waitlist.sqlite;
it sends no email. This is a loopback preview. Public marketing hosting and
delivery require a separate acquisition service, never exposing the private
evidence APIs. See [landing.md](landing.md).
\nThe owner-directed replacement uses original procedural Canvas scenery and a\nphysical recorder rather than generated city artwork. The scene model drives\nrecorder transport and progressive terminal from one clock. Informational\nmarketing views use query navigation within the isolated landing entry.\n