# Local API (Increment 1 contract)

All routes are served by `server/main.ts` on `127.0.0.1` only. Types are in `shared/model.ts`.

Mutating routes (`POST`, `PUT`, `DELETE` under `/api/`) require `Content-Type: application/json` and an `Origin` header equal to the server's own origin (`http://127.0.0.1:<port>` or `http://localhost:<port>`); anything else gets `403`. `/ingest` keeps its existing rules (hooks send no Origin). `POST /ingest?agent=claude-code|codex|opencode` (default `claude-code`) runs the payload through that agent's adapter (`server/adapters.ts`); an unknown agent is `400`. Claude Code, Codex and OpenCode adapters are registered; a payload the adapter does not understand gets `202` and nothing is stored (hooks must never fail the agent).

| Method & path | Body | Returns |
| --- | --- | --- |
| `GET /api/projects` | | `Project[]`, registered projects plus any root that has events, most recent first |
| `POST /api/projects` | `{ "path": "/abs/path", "agents"?: ["claude-code", "codex", "opencode"] }` | `Project`. Path must be absolute, exist, and be a git repository top level (`git rev-parse --show-toplevel` equals its real path); otherwise `400 { error }`. Installs hooks for each listed agent (default Claude Code only) exactly like `pnpm connect --agent`, and registers the project. Posting again with another agent adds it. `Project.agents` lists each installed agent with `status` `installed` (no event yet; for Codex usually waiting for `/hooks` trust) or `receiving`. Disconnect removes every agent's hooks. |
| `POST /api/projects/:id/disconnect` | `{}` | `Project`. Removes Quoli's hooks, keeps data. |
| `DELETE /api/projects/:id` | | `{ events, sessions }` removed. Removes hooks, deletes every event, usage row and transcript offset for the project's sessions, unregisters it, drops its hand-added services, checkpoints the WAL. |
| `POST /api/projects/:id/services` | `{ name, kind, provider, url?, sourceDir?, of? }` | `ManualService[]`. Adds a service by hand, or with `of` renames and links a detected service (one entry per detected service). 400 on an invalid kind (`pipeline` is not allowed), a non-http(s) or credential-bearing `url`, a `sourceDir` leaving the repo, or text over 80 characters. Max 100 per project. |
| `PUT /api/projects/:id/services/:sid` | same fields | `ManualService[]`. Replaces the entry; `of` cannot change. 404 for an unknown entry. |
| `DELETE /api/projects/:id/services/:sid` | | `ManualService[]` remaining. |
| `GET /api/sessions?project=:id` | | `SessionSummary[]`; without `project`, sessions across all projects (newest first, max 500) |
| `GET /api/session?id=:sid` | | `SessionDetail` |
| `GET /api/overview` | | `Overview` |
| `GET /api/usage?days=N&agent=K` | | `UsageReport` for the last N local calendar days (1–365, default 30; otherwise `400`). Optional `agent` (`claude-code`, `codex`, `opencode`) limits it to that agent's sessions; anything else is `400`. |
| `GET /api/insights?days=N&project=:id&agent=K&model=M` | | `InsightsReport` over sessions that started in the last N local calendar days (1–365, default 30; otherwise `400`). `project`, `agent` (`400` if unknown) and `model` (sessions that used it) narrow it; `models` still lists every model in the range. |
| `GET /api/settings` | | `{ settings: Settings, info: ServerInfo }` |
| `PUT /api/settings` | `Partial<Settings>` | same as GET; applies retention immediately |
| `POST /api/redact-preview` | `{ "text": "..." }` | `{ "text": "..." }`, the text after redaction |
| `GET /api/code\|git\|infra?root=` | | unchanged, except `infra` merges the project's hand-added services: `Service.url` (dashboard link) and `Service.manual` (entry id, or null). Hand-added cards have id `manual:<sid>`, `evidence: "added by you"` and never carry metrics. |
| `GET /api/file?root=&path=` | | unchanged |
| `GET /api/stream` | | SSE: `{ type: "event", sessionId }` on ingest, `{ type: "projects" }` when projects change |

Retention runs at startup, hourly, and when settings change.

## Behavior notes

- `DELETE` also needs `Content-Type: application/json`; send `{}` as the body.
- `hookStatus`: `installed` when a hook command containing `server/hook.mjs` is in `<root>/.claude/settings.local.json`; `receiving` when installed and at least one event exists for the root; otherwise `not_connected`.
- `Overview.needsReview` covers ended sessions that started in the last 7 days (max 20). Reasons are derived: "N failed tool calls", "N files changed" (10 or more edited files), "No command was run after the last edit". They never claim correctness.
- `Overview.tokens` sums transcript usage rows by their own timestamps. `counts.sessionsToday` counts sessions with any event since local midnight.
- `PUT /api/settings` rejects unknown keys and out-of-range values with `400 { error }`. Redaction applies at ingest time only; it never rewrites stored events.
- `Settings.budgetDailyUsd` / `budgetMonthlyUsd`: `null` (no budget) or a number > 0 and ≤ 1,000,000. Budgets are local and only shown against estimated spend; Quoli never stops or throttles an agent.
- `UsageReport` buckets transcript usage rows by the server's local day and prices each row with the current table: `days` (every day in range, `usd: null` when nothing was priced), `total`, `byModel`, `byProject`, the 10 most expensive `topSessions`, `cacheSavingsUsd` (cache reads × (input price − cache-read price), priced models only) and `spend.today` / `spend.month`, which ignore the range.
- `SessionDetail.report.turns`: one `TurnStat` per prompt: `ms` from the prompt to the next prompt (or the session's last event), `calls`, `failures`, `toolMs` (time with at least one of the turn's calls running; parallel calls count once), and `tokens`/`cost` from the usage rows whose time falls in the turn (rows before the first prompt count for the first). `report.slowest`: up to five finished calls, longest first, as `{ toolCallId, ms }`.
- `Overview.live` lists `LiveSession`s: a `SessionSummary` plus `lastAt` (last recorded activity), `step` (the running call, otherwise the latest one: `name`, `category`, `summary`, `status`, `startedAt`; `null` before the first call) and `recentUsd` (estimated spend of usage recorded in the last 10 minutes, `null` when none was priced).
- `InsightsReport` buckets sessions by the server-local day they started. `days[]` has `sessions`, `medianUsd`/`p90Usd` (nearest-rank, over sessions whose every model has a price; `unpricedSessions` counts the rest, never as $0), `calls`, `failures`, `loops` and `mix` (calls per tool category). `total` adds `medianMs`/`p90Ms`: first event to last recorded activity, live sessions left out. `durations` counts ended sessions in five buckets. `byAgent` and `byModel` group sessions by agent and by main model (the model with the most tokens; `key` `""` when none was reported).
- `SessionDetail.report.loops`: inferred `LoopFinding`s (`kind` `repeated-failure`, `edit-churn`, `error-streak` or `stall`), each with `text`, the `rule` that fired, the `toolCallIds` involved and `files`. `SessionSummary.loops` is their count. Rules are listed in [architecture.md](architecture.md#known-limitations).
- `SessionSummary.agent`: `claude-code`, `codex` or `opencode`, from the `quoli_agent` field stamped on stored events; events without it (every Claude Code event) read as Claude Code. `agentVersion` is the version an adapter reported, or `null`.
- `SessionSummary.trace`: one character per tool call in time order (first 400): `r` read, `e` edit, `c` run, `s` search, `a` subagent, `w` web/MCP, `o` other, `f` failed (`TRACE_CODES` in `shared/model.ts`).
- Retention deletes whole sessions (events, usage rows, transcript offsets) whose last event is older than `retentionDays`, then truncates the WAL.
- `/api/code|git|infra|file` accept any root that has events or is registered.
- `GitState.remotes`: each fetch remote as `host/owner/repo` (credentials in the URL are dropped) and a browser link for GitHub, GitLab and Bitbucket; `lastFetch` is FETCH_HEAD's modification time. Quoli never calls a Git host.
- `GET /api/commit?root=&sha=` returns `CommitDetail`: the commit's files with added/removed lines (`null` for binary) and its diff, clipped to 300,000 characters (`truncated`). `sha` must be 4–40 hex characters, otherwise `404`.
- `CodeFile.diff`: uncommitted `{ added, removed }` lines against HEAD from `git diff --numstat HEAD`; untracked text files count all their lines as added; `null` when clean or binary.

## Increment 2 additions

| Method & path | Body | Returns |
| --- | --- | --- |
| `GET /api/prices` | | `PriceTable` (the saved table, or the built-in default) |
| `PUT /api/prices` | `PriceTable` | `PriceTable`. Validates: currency `USD`, 1–200 rows, non-empty unique `model`, every price a finite number ≥ 0 and ≤ 1000. 400 with a readable `error` otherwise. |
| `DELETE /api/prices` | `{}` | `PriceTable`, after resetting to the built-in default |

- `SessionSummary.cost`, `SessionDetail.report` and `Overview.cost` are computed with the current table. Changing prices re-prices every session (costs are derived, not stored) and broadcasts `{ type: "projects" }`.
- Price matching: exact model id first, then the longest `model` that is a prefix of the usage id (so `claude-sonnet-4-5` prices `claude-sonnet-4-5-20250929`). Unmatched models go to `unpriced` and are excluded from `usd`.
- `report.changes`: per file, from recorded tool inputs. Edit/MultiEdit: removed = lines in `old_string`, added = lines in `new_string`. Write: added = lines in `content`, `rewrite: true`. Sorted by path.
- `report.commands`: every `run`-category call with a `command` input, classified by text: test (`test`, `jest`, `vitest`, `pytest`, `go test`, `cargo test`, `rspec`, `node --test`), typecheck (`tsc`, `typecheck`, `mypy`, `pyright`), lint (`lint`, `eslint`, `biome`, `ruff`, `flake8`, `clippy`, `prettier --check`), build (`build`, `cargo build`, `go build`, `make`, `vite build`, `next build`), else other.
- `report.checklist` rules (each item cites the tool calls and files behind it):
  1. Files edited after the last test command (or "No test command was run" when there was none and files were edited), listing those files.
  2. Each failed command not followed by a later successful run of the same command text.
  3. Any single edit removing 40 or more lines ("Large deletion in <file>").
  The wording never says a feature works or that tests passed in general; a successful command is only "ran and reported success".

### Implementation notes (Increment 2)

- `DELETE /api/prices` returns the default table. A saved table that fails validation on load falls back to the default.
- Sums are rounded to 1e-9 USD. Usage rows with no model id are excluded from `usd` and not listed in `unpriced` (they have no id); their `costByModel` row has `usd: null`.
- `report.changes` skips failed edit calls and files outside the project root. `report.commands` skips `run` calls without a string `command` (e.g. BashOutput). Commands starting with `git` are classified `other`, so commit messages mentioning "test" are not misread.
- Checklist ids: `edited-after-test`, `failed-<toolCallId>`, `large-deletion-<toolCallId>`. "Last test command" is the last `test`-kind command whatever its status; a failed one is also covered by rule 2.
