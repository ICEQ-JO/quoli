# Proposed local architecture

## Process and package boundaries

```text
Claude Code hooks / optional local OTLP logs
       ↓ local adapter bridge: classify → redact → bound → validate
127.0.0.1 collector + local credential
       ↓ revalidate policy → transaction → acknowledge durable write
SQLite event history + per-project redacted artifact storage
       ↑
Read-only Git / bounded file snapshots → snapshot observations
       ↓
Versioned deterministic analysis → usage/query views → bounded graph
       ↓ authenticated server-to-server reads
Next.js server → local browser dashboard
```

Two application processes, one collector writer, no broker and no cloud. The collector owns migrations, database writes and artifact access; the dashboard does not open a second database connection for writes. The web server proxies authenticated reads and local control actions. It holds the collector credential server-side; never embed it in browser JavaScript. Both servers bind to loopback by default. Separate data directories and storage keys isolate projects even when the collector hosts several projects.

Use a supported SQLite binding behind `packages/storage`, runtime schemas (proposed: Zod), explicit SQL migrations and parameterized queries. A mature diff renderer and graph viewer may be selected during the relevant issues; neither requires a custom DSL. Use workspace scripts and a small supervisor for local development, with process shutdown and clear port errors. Do not add orchestration infrastructure.

## Proposed tree (not created in this pass)

```text
apps/
  web/                       # Next.js pages, server proxy, local browser access
  collector/                 # loopback API, OTLP subset, writer, lifecycle CLI
packages/
  schema/                    # event, evidence, policy and API contracts
  storage/                   # SQL migrations, append-only writes, read queries
  adapters/claude-code/      # documented hooks/OTel; experimental module isolated
  repository/                # safe Git reads, snapshots and diff artifacts
  analysis/                  # versioned deterministic joins, usage and check views
  graph/                     # bounded evidence-backed projection, no DSL
  ui/                        # timeline, evidence inspector, diff/map primitives
fixtures/
  sessions/                  # synthetic normalized and source-shaped records
  repositories/              # recipes for temporary Git fixtures, no private code
  expected/                  # expected queries, evidence and usage totals
  manifest.json              # synthetic origin, schema/source version, omissions
scripts/                     # developer lifecycle and validation helpers
docs/
  README.md
  implementation-plan.md
  architecture.md
  claude-code-capabilities.md
  founder-decisions.md
  issues/                    # unpublished drafts and dependency index
package.json                 # pinned engines/packageManager and workspace commands
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json
.gitignore
```

## Primary records and provenance

Proposed entities: `projects`, `session_observations`, `event_observations`, `artifacts`, `snapshot_observations`, `evidence_relationships`, `ingestion_receipts`, `source_cursors`, `capture_policies`, and rebuildable `projection_state`. Session status is a view over lifecycle observations, not a mutable claim that a crashed session ended normally. Foreign keys include project identity.

A normalized event envelope has:

- Schema version, locally generated event ID, project ID, source kind, adapter version and producer instance.
- Nullable source session, prompt, tool, message and request identifiers; source timestamp/sequence if reported, plus collector receipt time and commit sequence.
- Discriminated event kind and validated payload; independent numeric usage fields with units, reporting scope and temporality.
- Content state per field: present, disabled, redacted, truncated, unavailable, unsupported or malformed. Missing values are null, not zero or invented text. Include original byte count when known and a truncation marker.
- Provenance locator into the retained sanitized observation (event/payload pointer or artifact range), source identity when available, redaction policy version and capture coverage. Avoid raw secret-bearing hashes and raw payload retention.

An evidence relationship has subject/object IDs, `recorded | derived | inferred`, supporting observation IDs, rule ID/version where applicable, and an uncertainty explanation. Derived claims such as a token sum or a session-to-file time-window link retain the inputs. Inferred claims are optional, visually distinct, and excluded from factual totals; MVP need not produce any. Observing a path in tool input records the reference, not that the file changed. A before/after diff is derived from recorded snapshots. Temporal proximity alone never establishes authorship or test coverage.

Append-only applies within retained history: no in-place edits to accepted observations. Corrections and reconciliation append new observations or versioned relationships. Same-source retry deduplication uses a stable bridge delivery ID persisted before retry, or documented source event identity. New adapters must not treat equal text or timestamps as identity. Different-source overlap retains separate observations and projects one logical action only when IDs establish the match. Conflicts remain inspectable. Unidentified overlaps are kept separate and excluded from an asserted combined total.

## Read APIs and bounded views

Propose `/v1/projects`, project-scoped session lists, cursor-paginated events, evidence, usage, snapshots, diff artifacts and graph views. `/v1/ingest` handles normalized batches; a separate narrow `/v1/otel/v1/logs` handles the verified OTLP format. Publish endpoint contracts before implementation. Unknown fields/event versions are rejected or counted as unsupported without logging payloads.

A graph initially has session, file and command/check nodes with observed tool references and snapshot-backed relationships. No whole-repository call graph. Default per-view caps: 100 nodes and 200 edges, with an omitted-count indicator, deterministic sort and filters. Expanding a region is another bounded query. Each selection opens the underlying source, rule and captured diff/check evidence; keyboard users have an equivalent list. Unsupported languages still receive file-level explanations.

Usage displays separately reported non-cache input, output, cache-read and cache-write tokens. Missing components remain null. A displayed cache-read share is explicitly `cache_read / (input + cache_read + cache_creation)` when every denominator component is known and positive; otherwise it is null. It is a token share, not a request cache-hit rate. No cross-source summation of cumulative snapshots and request deltas. Reported monetary estimates, if retained, are not invoices or per-file costs.

Checks have independent statuses: command observed, result observed, exit code if available, parsed test counts for an explicitly supported format, snapshot association, and coverage unknown. “Exit 0 reported” cannot become “feature verified.” A later file change makes an earlier check stale relative to that file version. Lack of a check is shown as “no recorded check,” not “not tested.”

## Privacy and local security

Default to metadata-only capture. Prompt text, tool input/output and code each require explicit project controls; disabling one class also removes it from nested tool arguments, telemetry attributes, diffs and diagnostic paths. Text can contain several classes. Apply the most restrictive matching policy. Filtering and redaction happen in memory before any queue/spool, SQLite write, artifact, diagnostic log or exception serialization; receiver policy is a second boundary. Redaction is best-effort risk reduction, not guaranteed secret removal.

Proposed initial limits, configurable within hard ceilings: 64 KiB per captured text field, 1 MiB request body, 100 events per batch, 1 MiB per code file, 20 MiB per snapshot operation, 50 MiB per project spool, 1 GiB project storage. Mark policy omissions explicitly; reject oversized transport before parsing, then redact complete allowed fields before safe truncation so regex boundaries do not leak partial secrets. Streaming raw unbounded records to disk is forbidden. Full queues cause visible capture-loss counters; they do not stall the coding agent indefinitely.

Generate an ingestion credential from secure randomness on first local setup; store outside the repository with owner-only permissions and rotate/revoke it. Never put credentials in URLs, committed config, payloads or logs. Authenticate ingestion, read and control routes. Reject unexpected Host/Origin, cross-site requests and permissive CORS; protect the local browser session and control endpoints against CSRF and DNS rebinding. Loopback authentication protects against web-origin abuse, not an already compromised same-user process. Do not expose public bind mode in MVP.

Artifacts and database live under a platform-appropriate user-data directory outside the observed repo, owner-only and ignored if a development override is used. Store project-scoped redacted blobs using opaque/content IDs derived only after sanitization. No externally loaded fonts, analytics, session uploads, error reporters or generated explanations requiring remote models. Live Claude's own network use is separate from Traceframe.

All captured content is untrusted: escaped text only, no HTML execution, fetched URLs, automatic link opening, shell interpolation or recorded-command replay. Git access uses fixed argument arrays, read-only commands, disabled external diff/text conversion, no hooks, no checkout/fetch, and safe path resolution. Do not follow artifact pointers, symlinks or tool paths outside registered roots. Explicitly reject nested submodule traversal for initial snapshots. Git metadata and filenames are untrusted too.

Project deletion and retention are explicit exceptions to event immutability. Pause and fence producers, reject old credential epochs, purge database rows, blobs, queues, cursors, projections and caches, checkpoint the WAL and handle interrupted deletion idempotently. Explain that filesystem snapshots, user backups and secure physical erasure are outside the guarantee. Propose a configurable 30-day retention default; expose storage usage and avoid quietly deleting data when the storage cap is reached. Retention invalidates dependent evidence instead of leaving dangling factual claims.

## Repository observations

Capture baseline working-tree state including staged/unstaged changes and explicitly allowed untracked files; HEAD alone is not a baseline. Keep HEAD/index identities and snapshot timing. Collect checkpoints at session boundaries and bounded tool-result/debounced intervals; these are observations, not atomic filesystem snapshots. Detect moving HEAD, file changes during reads and overlapping sessions; mark racy observations and ambiguous ownership. Missed beginnings produce an unavailable baseline, never a fabricated before-state. Handle deleted, renamed, binary, oversized and ignored paths with explicit states. Snapshots must not stage or alter user files.
