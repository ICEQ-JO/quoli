# Hosted sync threat model (proposal)

Status: proposal for [QUO-19](https://linear.app/quolii/issue/QUO-19). It advances **Commercial: cloud foundation, data controls** and tests the boundaries defined by the [sync contract](sync-contract.md). It is not a penetration-test report or a security certification.

## Assets and trust boundaries

| Asset | Boundary | Security objective |
| --- | --- | --- |
| Captured activity and artifact content | Harness → connector → local persistence | Capture only under local category consent; sanitize before local persistence. |
| Upload batch/outbox | Connector → authenticated ingestion | Separate cloud consent, server policy recheck, durable/idempotent delivery. |
| Tenant evidence/artifacts | Ingestion → primary store/object store/projections | Server-derived tenant/project scope; append-only source records; private artifacts. |
| Dashboard/query/export | User session → API/projection/export | Membership/role authorization and scoped cursors/caches/exports. |
| Lifecycle state | Owner/admin action → device/producer/storage/backup | Fence first, delete active data, replay tombstones on restore. |

Captured text is hostile input even when it came from a developer's own tool. It cannot control an agent, worker, database, logger, browser, object key, prompt, query or export. Treat it as data with size/type limits, HTML-safe rendering and no execution/replay path.

## Threat scenarios and testable mitigations

| Scenario | Mitigation | Required synthetic test / observable result |
| --- | --- | --- |
| Connector spoofs another tenant/project/device in JSON | Authenticate device; derive tenant/project permissions server-side; ignore client tenant; bind delivery uniqueness to device/project. | A paired device submits a foreign tenant/project hint and receives denial with no primary row, artifact, receipt, queue job or audit-content leak in the foreign scope. |
| Replayed or reordered batch | Stable delivery ID, digest and commit-before-ack receipt; idempotent primary unique key. | Send one batch twice and simulate a lost response. Exactly one primary record/receipt exists; both successful replies identify that receipt. Send same ID with changed digest and get `idempotency_conflict`. |
| Connector uses stale consent or a policy is reduced mid-drain | Local pre-send check plus ingestion-side current policy/generation check; fail closed. | Queue permitted content, reduce category consent, then reconnect. No removed-category payload is sent/accepted; connector has a content-free gap/fence result. |
| Revoked device continues from an offline outbox | Device generation/credential revocation check at ingestion; device-specific fencing. | Revoke a device, replay its saved synthetic batch, and verify no new receipt/row/job; dashboard shows revocation/last-seen state without payload. |
| Signed object URL leaks into a log or is reused | Re-authorize before minting; one object/method/short expiry; redact query strings; no public prefix/listing. | A viewer without project membership cannot mint URL; an expired URL fails; log fixture is scanned and contains no signed query value; copied URL is treated as an incident/revocation trigger. |
| Captured text exploits renderer, worker or query path | Schema/size bounds, inert storage, parameterized access, safe rendering, no shell/replay. | Ingest a synthetic payload containing HTML, SQL-like text, shell syntax and oversized fields. It renders as text, executes nothing, causes no dynamic query/key, and rejects/bounds oversize input. |
| Background job/cache/export crosses tenants | Tenant/project/deletion generation in job payload, cache key, cursor and export; worker re-authorizes. | Seed two tenants with same project/artifact-shaped IDs; attempt cache/cursor/job/export reuse. Every result remains scoped or is rejected. |
| Deleted evidence returns after backup restore | Tombstone persists through restore horizon; restore replays tombstones before serving/retrying. | Delete synthetic project, restore a pre-delete backup, run tombstone replay, retry old delivery and query artifact/projection. No deleted content becomes readable. |
| Queue duplicates / worker crash | Idempotent projection key, retry/backoff, dead-letter visibility. | Deliver same synthetic job twice and crash after primary read. Projection is one logical result with explicit retry metadata, never a second primary observation. |
| Oversized offline backlog or reconnect storm | Per-project byte/count/age bounds; jitter/backoff; admission limits; content-free drop records. | Fill a disposable outbox past each bound and reconnect many workers. Limits hold, service remains responsive, and drop/limit states disclose no body. |
| Privileged staff or service role reads evidence broadly | Separate least-privilege roles; break-glass audit; no production data in ordinary logs/support fixtures. | Service-role policy test denies direct artifact/list access outside tenant; break-glass simulation emits an auditable metadata-only event. |

## Assumptions and residual risks

- A compromised paired device can submit policy-allowed false observations. Provenance identifies device/connector/version; it does not prove truth, authorship, or complete capture.
- A user who downloads an export or artifact can retain a copy. Revocation stops Quoli access, not external copies.
- Backup providers may retain bytes until their configured lifecycle completes. The selected 30-day post-deletion expiry is recorded in the [hosted pilot decisions](../hosted-pilot.md); recovery limits must still be stated before selling a deletion commitment.
- A signed URL is a capability; restricting it reduces exposure but cannot revoke a copied URL universally without an access proxy/credential change. The initial contract therefore uses short expiry and incident handling.
- This document does not cover payment data, enterprise SSO, legal discovery, customer-managed keys, or country-specific obligations. Those need owner/legal decisions before launch.

## Review gates

Before C02 or production ingestion, the owner must approve vendor/region/legal commitments; buyer, pricing, platforms and retention are recorded in the [hosted pilot decisions](../hosted-pilot.md). Engineering must demonstrate the synthetic tests above, a restore/tombstone rehearsal, dependency/secret review, access-control review, rate/size tests and incident runbook. No real customer/private sessions are needed for these checks.
