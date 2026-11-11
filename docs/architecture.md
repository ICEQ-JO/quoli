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
| `server/sessions.ts` | Pure derivation: raw events + usage → session view (turns, tool calls, agents, files, tokens) |
| `server/transcript.ts` | Token usage from Claude Code transcript JSONL, read incrementally |
| `server/code.ts` | Code map: files from `git ls-files`, line counts, JS/TS relative imports, git status |
| `server/gitstate.ts` | Branches (ahead/behind), recent commits, changed-file count |
| `server/infra.ts` | Service detection from config files; live Docker metrics when available |
| `server/demo.ts` | Builds a sample repo and records three synthetic sessions |
| `web/src/App.tsx` | Shell: project, lens tabs, sidebar, canvas, inspector, timeline, ⌘K |
| `web/src/lenses/*` | The four lenses, all on React Flow via `Board.tsx` |
| `web/src/components/*` | Sidebar, Inspector, Timeline, Palette (⌘K), Diff, Onboarding |

## Data model

- **Events are the record.** Every hook payload is stored as received (after redaction), append-only. All views are derived from events at read time, so improving the derivation improves old sessions too.
- **Tokens come from transcripts.** Claude Code hooks do not carry usage; each hook points at the session transcript, which records per-message usage. Messages repeat once per content block, so rows are keyed by message id and merged with `MAX`.
- **Repository views are computed live** from the working tree (`git`, files on disk). They are not stored.

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
- File-level code map; imports are resolved for relative JS/TS only.
- Infra is what config files declare; hosted metrics need provider connections that do not exist yet.
- Large repos: capped at 1,500 files; folders without activity fold automatically above 220 files.
- Dark theme only.
