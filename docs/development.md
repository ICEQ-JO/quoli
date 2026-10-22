# Development reference

## Implemented boundaries

- `apps/web`: Next.js App Router, local browser session and server-side collector proxy.
- `apps/collector`: one loopback Node HTTP server; no installed daemon.
- `packages/schema`: Zod contracts and conservative pre-persistence content policy.
- `packages/storage`: Node 24 built-in `node:sqlite`, explicit SQL migration, transactional append and cursor reads.
- `packages/analysis`: deterministic usage and tool-ID evidence rules.
- `packages/ui`: shared display labels and number/time formatting.
- `fixtures/demo.ts`: authored, versioned synthetic evidence; `fixtures/manifest.json` specifies expected usage and omissions.

Other proposed package directories will be introduced when they have working code. The source directories are consumed by TypeScript-aware tools rather than prebuilt packages. Node 24 is required by the current supported runtime; do not substitute an older Node runtime based only on Next.js requirements. SQLite's built-in API remains version-sensitive; this preview pins the runtime range.

Small sanitized artifacts are stored transactionally in SQLite initially. This deliberately avoids a second filesystem commit boundary and orphaned artifact files. Separate blob files, source-file ingestion cursors and their recovery protocol belong to later adapter/snapshot work; accepted delivery receipts and read cursors are represented by event identity and commit sequence today.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm demo
```

`pnpm typecheck` generates Next route/environment types before checking the dashboard; the generated `next-env.d.ts` is ignored because each isolated output directory rewrites its imports.

`pnpm test` uses Node's test runner, disposable stores and a lifecycle startup/restart test. Browser tests use separate ports, a temporary synthetic store, a separate Next output directory and graceful cleanup. No Claude account is used. `pnpm build` creates `.next-build`, separate from `.next` development output. `pnpm format` formats source/config files; Markdown is maintained deliberately rather than rewritten automatically. CSS selector-specificity linting is disabled for the component stylesheet because the rule compares unrelated component selectors; other recommended checks remain enabled.

`pnpm privacy:preview` shows how metadata-only policy filters a synthetic prompt. `pnpm privacy:preview --synthetic-content` displays explicitly enabled fixture content. Never pipe personal sessions into this command.

## Dashboard structure

`apps/web/app/dashboard.tsx` owns local navigation and session review state. `review.ts` serializes only validated project/session/view/event IDs; the local-cookie connection route preserves this state and drops arbitrary return destinations. `components/workspace-home.tsx` owns overview/library presentation and bounded per-session summary reads. Workspace counts derive from the returned retained-session list (currently capped at 50 by storage); they are not universal collection metrics. Summary failures keep gap counts unknown. Project/session metadata loads independently from the selected session summary so one failed summary does not erase the session list.

The root view is Overview; explicit legacy session URLs remain review views. Session-content search stays in a bounded POST body, while session-title search stays in local component state. Geist Variable is bundled from the pinned Fontsource package and served locally: runtime typography makes no third-party font requests. [PRODUCT.md](../apps/web/PRODUCT.md) records product truth; [DESIGN.md](../apps/web/DESIGN.md) records the built visual system.

## HTTP contract, version 1

Collector base: `http://127.0.0.1:4318`. All collector routes require `Authorization: Bearer <local credential>`, including health. The credential is never a URL parameter. Only local server-to-server requests are accepted; Origin-bearing browser requests are rejected. CORS is not enabled.

| Method/path | Response / behavior |
| --- | --- |
| `GET /health` | Metadata-only readiness, rejection and write-failure counters. |
| `POST /v1/demo` | No body. Registers only the fixed synthetic project with its explicit fixture policy, then runs the normal atomic append path. Replays report duplicate counts. |
| `POST /v1/ingest` | `application/json`, body `{events: NormalizedEvent[]}`. Strict runtime validation, 1 MiB body/100-event batch limits, then project-policy filtering and one SQLite transaction. Unknown projects and non-synthetic sources for the demo project are rejected. |
| `GET /v1/projects` | Up to 50 registered projects and their capture policies. |
| `GET /v1/projects/:project/sessions` | Up to 50 sessions; title comes from retained start content. |
| `GET /v1/projects/:project/sessions/:session/events?cursor=N` | Eight events after receipt sequence N; `{events,nextCursor,total}`. Cursor does not use source timestamps. |
| `GET …/events?event=ID` | One project/session-scoped evidence observation. |
| `POST …/events/query` | Strict `{search,kind,order,cursor}` query; session-wide filtering and keyset pagination. Search ≤200 characters; source order uses timestamp and receipt-sequence tie-break. Search stays out of URL/access-log paths. |
| `GET …/summary` | Bounded usage, tool-ID evidence relationships and kind counts over retained session observations. |

Status codes: 400 malformed/unsupported schema, 401 credential required, 403 host/origin denied, 404 missing resource, 409 conflicting identity/unregistered project/write unavailable, 413 transport cap, 415 content type, 429 local request cap, 503 missing credential. Error bodies intentionally do not serialize payloads or exception messages. Global local rate cap is 300 requests/minute; no durable transport spool is implemented in this demo. Producers retry the identical delivery ID after a lost acknowledgment. Never retry changed content under the same identity.

The browser accesses read-only `/api/data` operations on the Next server using its HttpOnly cookie: GET metadata/evidence and POST bounded session queries. The POST body is limited to 4 KiB and strictly validated. It cannot forward arbitrary collector paths or ingestion/control actions. `/api/health` exposes only local readiness. All meaningful access is checked server-side. Next telemetry is disabled in the scripts and no fonts, renderers, analytics or model APIs are fetched at runtime.

## Event and evidence semantics

See `packages/schema/src/index.ts` for the exact strict contract. A normalized event includes a schema version, event/delivery/project/session IDs, source kind, producer and adapter version, source locator, nullable source time/sequence/prompt/tool/request IDs, policy version and a discriminated payload. Unknown or extra fields fail validation; raw data is not archived to debug a parser. Content records preserve omission/truncation state and original byte count when available.

SQLite adds a durable receipt sequence and timestamp. Unique `(project, source, producer, delivery)` prevents retry duplication; equal text is not identity. Attempts to reuse an identity with a different retained observation reject the entire batch. UPDATE/DELETE event triggers prevent normal history mutation. New observations can supplement earlier ones; a future explicit correction envelope/projection rule must be designed before accepting source corrections. Lifecycle deletion will be a privileged, documented exception to the triggers.

`same-session-tool-id/v1` produces derived tool links only for explicit matching IDs inside a project/session. `reported-request-sum/v1` aggregates independently nullable token categories over uniquely identified request deltas. Equal corroborating requests count once; conflicts, unidentified requests or mixed temporality return unknown totals. These are not general cross-source reconciliation guarantees; the verified live-source reconciliation remains GitHub #17.

## Validation at this increment

The test suite covers strict contracts, omitted/nested tool content, fake-secret canaries, UTF-8 truncation, excluded/missing tool context, reported-zero/unknown usage behavior, same-ID joins, rollback, restart persistence, duplicate/conflicting delivery, project isolation, append-only guards, private file modes, HTTP auth/origin/size checks, rotation, lifecycle cleanup, browser pagination/evidence links, mobile width and inert hostile HTML. A browser network assertion rejects non-loopback requests. These checks do not certify live capture, general secret removal or feature behavior in observed repositories.
