# Local API (Increment 1 contract)

All routes are served by `server/main.ts` on `127.0.0.1` only. Types are in `shared/model.ts`.

Mutating routes (`POST`, `PUT`, `DELETE` under `/api/`) require `Content-Type: application/json` and an `Origin` header equal to the server's own origin (`http://127.0.0.1:<port>` or `http://localhost:<port>`); anything else gets `403`. `/ingest` keeps its existing rules (hooks send no Origin).

| Method & path | Body | Returns |
| --- | --- | --- |
| `GET /api/projects` | | `Project[]`, registered projects plus any root that has events, most recent first |
| `POST /api/projects` | `{ "path": "/abs/path" }` | `Project`. Path must be absolute, exist, and be a git repository top level (`git rev-parse --show-toplevel` equals its real path); otherwise `400 { error }`. Installs hooks exactly like `pnpm connect` and registers the project. |
| `POST /api/projects/:id/disconnect` | `{}` | `Project`. Removes Quoli's hooks, keeps data. |
| `DELETE /api/projects/:id` | | `{ events, sessions }` removed. Removes hooks, deletes every event, usage row and transcript offset for the project's sessions, unregisters it, checkpoints the WAL. |
| `GET /api/sessions?project=:id` | | `SessionSummary[]`; without `project`, sessions across all projects (newest first, max 500) |
| `GET /api/session?id=:sid` | | `SessionDetail` |
| `GET /api/overview` | | `Overview` |
| `GET /api/settings` | | `{ settings: Settings, info: ServerInfo }` |
| `PUT /api/settings` | `Partial<Settings>` | same as GET; applies retention immediately |
| `POST /api/redact-preview` | `{ "text": "..." }` | `{ "text": "..." }`, the text after redaction |
| `GET /api/code\|git\|infra?root=` | | unchanged |
| `GET /api/file?root=&path=` | | unchanged |
| `GET /api/stream` | | SSE: `{ type: "event", sessionId }` on ingest, `{ type: "projects" }` when projects change |

Retention runs at startup, hourly, and when settings change.

## Behavior notes

- `DELETE` also needs `Content-Type: application/json`; send `{}` as the body.
- `hookStatus`: `installed` when a hook command containing `server/hook.mjs` is in `<root>/.claude/settings.local.json`; `receiving` when installed and at least one event exists for the root; otherwise `not_connected`.
- `Overview.needsReview` covers ended sessions that started in the last 7 days (max 20). Reasons are derived: "N failed tool calls", "N files changed" (10 or more edited files), "No command was run after the last edit". They never claim correctness.
- `Overview.tokens` sums transcript usage rows by their own timestamps. `counts.sessionsToday` counts sessions with any event since local midnight.
- `PUT /api/settings` rejects unknown keys and out-of-range values with `400 { error }`. Redaction applies at ingest time only; it never rewrites stored events.
- Retention deletes whole sessions (events, usage rows, transcript offsets) whose last event is older than `retentionDays`, then truncates the WAL.
- `/api/code|git|infra|file` accept any root that has events or is registered.

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
