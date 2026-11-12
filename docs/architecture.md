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
| `server/hook.mjs` | What Claude Code runs. Dependency-free, forwards stdin to the server, always exits 0, prints nothing |
| `server/connect.ts` | `pnpm connect <repo>` — adds/removes Quoli's hooks in `<repo>/.claude/settings.local.json` |
| `server/main.ts` | HTTP server: host guard, static/Vite, hourly retention timer |
| `server/app.ts` | The API ([docs/api.md](api.md)): ingest, projects, sessions, overview, settings, SSE, mutation guard |
| `server/db.ts` | SQLite store: append-only `events`, deduplicated `usage`, transcript read offsets, `projects` registry, `settings` |
| `server/ingest.ts` | Resolves repo root, records the branch at session start, redacts secrets, stores, reads transcripts |
| `server/sessions.ts` | Pure derivation: raw events + usage + price table → session view (turns, tool calls, agents, files, tokens, cost, report) |
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
| `web/src/pages/*` | Dashboard, Sessions, Usage, Projects, Settings (General, Prices, Data, Appearance) and the Board (session list, lens tabs, canvas, details panel, replay bar) |
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

**Local content capture is on.** The old MVP defaulted to metadata-only, which made real sessions unreadable ("Content disabled" everywhere). The product's purpose is to show what the agent did, so prompts and tool I/O are stored locally with redaction. Cloud sync, when built, must be explicit opt-in per project.

## Known limitations

- Claude Code only. Hook payload fields were taken from Claude Code's documented hook contract and exercised with realistic synthetic payloads; verify against your installed version.
- Subagent ↔ spawning `Task` call is matched by launch order (drawn dashed), because hooks do not link them by id.
- Claude Code records some non-human turns as prompts. The Agents lens shows background-task notifications (`<task-notification>`) and slash commands (`<command-name>`) as one-line notices; other injected text still shows as a prompt.
- File-level code map; imports are resolved for relative JS/TS only, so other languages appear in the change map without connections. The change map draws an import between neighbouring columns or between two changed files; imports between two neighbours in the same column are left out, and each neighbour column keeps its 14 best-connected files ("+N more not drawn"). "Changed by this session" comes from recorded Edit/MultiEdit/Write calls, so files changed through Bash are missing there; "Uncommitted" shows them from git.
- Infra is what config files declare, plus what the user adds by hand. Live status comes only from containers running in local Docker. Hosted providers (Vercel, AWS, Azure, Supabase and others) are listed when a file mentions them or the user adds a service there by hand, never as connected. A deploy command in a workflow (for example `gcloud run deploy`) adds an inferred deploy target when no file declares the host. Services added by hand are only what the user typed: Quoli never checks them and never fetches their dashboard links. Provider connections with live status and metrics are roadmap phase 4. What a pipeline deploys is inferred from its workflow steps, not from runs.
- Large repos: the code map lists up to 50,000 paths and reads line counts/imports for up to 5,000 files (≤ 512 KB); the Code lens opens at folder level. Git history pages 200 commits at a time (max 2,000 per request).
- Session lists show the newest 200 sessions per project (board sidebar) and 500 overall (Sessions, Home), and say so when older ones exist. Older sessions are kept, and the Git lens still attributes their commits.
- Transcripts are read in blocks of 8 MB. A single transcript line longer than that (a pasted image, a huge tool result) is skipped, so any usage on it is not counted.
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