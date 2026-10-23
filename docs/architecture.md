# Quoli target architecture and current boundaries

Status: target design approved in direction, implementation outstanding. The [vision](vision.md) defines outcomes and truth/privacy boundaries. The [checkpoint](implementation-progress.md) describes today's local software. This page does not imply the cloud exists.

The proposed [hosted sync contract](cloud/sync-contract.md) and [threat model](cloud/threat-model.md) make the target consent, tenant, receipt and lifecycle boundaries reviewable. They are C01 proposals, not delivered endpoints, vendor selections or security certification.

## Target data flow

```text
Developer machine                          Quoli cloud
─────────────────                          ───────────
Harness adapters + read-only repo observer
  → classify, capture policy, redact
  → local SQLite history
  → separate upload policy + device epoch
  → bounded durable outbox ── TLS ────────→ device-authenticated ingestion
                                            → tenant/project authorization
                                            → immutable observation commit + receipt
                                            → scoped artifact storage
                                            → versioned replayable projections
                                            → authorized query API
                                                      ↑
                                            hosted Next.js dashboard
                                            user auth + workspace roles

GitHub/GitLab app → signed webhooks → scoped PR/commit observations
  → bounded static architecture analysis → deterministic policy report
  → exact-commit check delivery + technical-debt ledger
```

The connector is passive. Quoli never controls the coding agent or replays captured actions. The web app cannot receive a local collector's bearer credential. Devices authenticate as devices, users as users, and repository apps have separate least-privilege credentials.

## Reuse and rebuild boundaries

| Existing area | Target treatment |
| --- | --- |
| `packages/schema` | Compatible v2 contracts: source versions, open tools, capabilities, turns, children, decisions; retain v1 reading |
| `packages/storage` | Keep local SQLite and immutable observations; separate cloud persistence with explicit tenant/project keys and migration evidence |
| `apps/bridge`, collector source parsers | Retain verified mappings; move behind adapter contracts, repair pre-spool privacy, add OpenCode/Codex/Pi |
| `apps/collector`, observer | Keep local capture/security and repository observation; add a device-bound upload outbox, not a public-bind mode |
| `packages/repository` | Keep safe local reads; add bounded providers and sanitized cache with local/cloud consent separation |
| `packages/analysis` | Reuse pure rules/diffs/checks/reconciliation; version projections for tenant-scoped background processing |
| `apps/web` | Reuse session navigation, inspector, diffs, settings and visual system; replace loopback-only data/session assumptions in the hosted deployment |
| Map schema/rendering | Compatible migration to evidence scenes; remove the old map path only after parity and reference checks |
| CLI/supervisor/install | Keep local lifecycle and identity protections; distribute a signed connector with pairing and verified updates |
| Historical planning docs | Consolidate into current vision/architecture/decisions/backlog; preserve useful runtime/validation references |

Do not add runtime skeleton packages solely because this diagram names responsibilities. Build the smallest service/process layout that satisfies the selected cloud contract. Hosting, database/object-store and auth vendors must be selected and verified in the foundation issue. Do not migrate the local store to a network database or rename `TRACEFRAME_*` compatibility surfaces as a prerequisite.

## Primary records and projections

Accepted observations retain source identity, adapter/schema versions, delivery identity, receipt sequence, timestamps with their basis, project/device generation and sanitized provenance. Append-only is the primary history; corrections append observations. Retention/deletion are explicit exceptions. Acknowledgement follows durable commit; same-delivery retries return the prior receipt.

Cloud tables, object keys, caches, jobs, cursors and query scopes include tenant/project identity. Enforce this server-side from authenticated membership/device registration, not from a client-provided tenant ID. Test cross-tenant access through every surface, including background processing, signed artifact URLs and exports.

Scene, cost, activity and architecture views are bounded versioned derivations with evidence IDs, rule versions and omissions. They can be rebuilt and invalidated when evidence expires. Missing fields remain null with a reason; request deltas and cumulative usage are reconciled before totals. A complete graph cannot be inferred from a partial repository read.

## Local capture and upload

Local metadata-only capture remains the default. Upload is separately enabled per project/category and destination after account pairing. Unknown policy fails closed for content. A local-only project stays local, even when another project is paired. Policy generations travel with outbox entries; pause, reduced consent, retention, project deletion and device revocation fence pending deliveries.

Bound stdin, requests, fields, files, batches and outbox storage before expensive parsing/persistence. Record drops/caps without recording private payloads. Drain with restart-safe cursors, backoff and atomic ownership; a crashed drain cannot lose a concurrent append. Recheck active policy before upload and at cloud ingestion. A restored backup must reapply deletion tombstones before accepting retries.

Local file reads retain descriptor/symlink protections and explicit racy states. Current file traversal is Linux-specific; macOS requires equivalent protections, not a weaker path-string check. Git/provider observations do not establish agent authorship.

## Cloud security and lifecycle

Use authenticated encrypted transport, encrypted retained storage, secure key management, revocable scoped device credentials, user session/CSRF protection, safe origin policy, least-privilege service roles and tenant/project authorization. No public exposure of the existing loopback collector. No secrets in URLs, evidence, logs or frontend bundles.

Deletion coordinates producer fencing, local history/outbox/cache, cloud observations/artifacts/projections/jobs and retention/backup schedules. Exports have explicit selection and content preview; copies outside Quoli cannot be recalled. Audit records minimize content and follow their own approved retention. Clearly communicate active storage deletion versus backup expiry and physical erasure limits.

Service observability uses allowlisted IDs/counters rather than prompt/tool/code payloads. Apply admission/rate/storage limits and project/device health states. Version deployments and migrations, test restore/rollback, and rehearse incident response before paid production ingestion.

## Architecture integrity and debt

PR analysis reads the exact repository installation/ref/SHA using scoped app credentials and verified webhooks. Never execute repository scripts or untrusted rules. Parse bounded supported syntax into versioned static observations for modules, dependencies, ownership and schemas. Architecture models and rules are validated data, reviewed and scoped per repository.

Policy results carry rule/model/engine versions, exact base/head commit, evidence, missing-data state, deterministic verdict and machine-readable fix requests. Only owner-configured deterministic rules block. Missing/stale analysis cannot become a pass. Findings without agent evidence remain unattributed.

Debt records have stable IDs, owner, reason, scope, expiry, evidence, status and follow-up links. Approval/waiver/renewal is append-only audit history, not silent rule suppression. Observe false-positive behavior before activating merge checks. GitLab delivery follows the same exact-revision/reporting contract after GitHub.

## Today's runtime

Today's CLI packages Node entry points, Next standalone output and SQLite migrations. The detached supervisor controls two loopback listeners with identity checks; saved PIDs are not stop targets. The collector owns local writes; the browser uses protected server proxies. No hosted identity, sync or tenant boundary is delivered. See [CLI](cli.md), [development/API reference](development.md), [capture controls](lifecycle-controls.md) and the [repository assessment](work/vision-repository-assessment.md) for existing behavior and known retry gaps.
