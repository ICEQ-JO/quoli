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
