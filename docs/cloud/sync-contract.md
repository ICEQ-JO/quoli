# Hosted sync contract (proposal)

Status: proposal for [QUO-19](https://linear.app/quolii/issue/QUO-19). It advances **Commercial: cloud foundation, data controls**. It describes the intended boundary for a hosted dashboard and consented local connectors; it does not create an endpoint, provision a vendor, or certify a security control.

## Decisions, recommendations, and open owner choices

| Kind | Item |
| --- | --- |
| Settled direction | The hosted Quoli dashboard receives consented evidence from local connectors for OpenCode, Pi, Claude Code and Codex. Local capture remains useful while offline. |
| This contract | A connector uploads only a versioned, policy-allowed batch after it has paired with an account and project. The server derives tenant scope from the authenticated device. |
| Recommendation | Start with one regional deployment, one managed relational primary store, private object storage, and one durable work queue. Do not split evidence across more services until a measured limit requires it. |
| Settled by [hosted pilot decisions](../hosted-pilot.md) | Buyer (individual developers and teams of 2–10), one Pilot plan at USD 19/seat/month, connector platforms (Linux x64, macOS 14+), 90-day cloud retention adjustable 7–365, a 30-day export window, and backups expiring 30 days after deletion. |
| Owner decision required | Region and residency commitments, legal deletion SLA and customer-facing wording, identity provider, cloud vendor, and the operational backup schedule inside the stated expiry. |

No vendor is selected. The candidate notes below are facts about documented services, not a procurement decision: standard SQS can redeliver, so consumers must be idempotent; S3 presigned URLs are bearer-style, time-limited capabilities; and RDS point-in-time restore retains data for the configured backup window. Sources were retrieved on 2026-10-23: [SQS delivery](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html), [S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), and [RDS restore](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html).

## Scope and identities

The server assigns opaque IDs. A connector may name an intended project during pairing, but it never supplies an authoritative tenant or workspace ID.

| Identity | Authority and boundary |
| --- | --- |
| User | Authenticated account identity. A user belongs to one or more workspaces. |
| Workspace / tenant | The authorization boundary. `tenant_id` is derived by the server from membership or device registration. |
| Role | `owner` manages billing, roles and deletion; `admin` manages projects/devices/policy; `member` reads permitted projects and pairs own devices; `viewer` reads explicitly granted projects. Fine-grained repository policy comes later. |
| Project | A workspace-scoped evidence and policy container. Deletion and policy generations are project-specific. |
| Device | A separately revocable paired connector identity, bound to one user and workspace. Its credentials carry a device ID, expiry and key version; the server loads current membership and device state. |
| Repository | A project-scoped identity with a canonical remote when known and a local root fingerprint only when consented. It is evidence metadata, not proof of authorship. |
| Producer | A `(device_id, connector_instance_id)` process identity. Reinstalling or restoring a connector makes a new instance ID. |

Role removal, device revocation, project deletion and account deletion are server-enforced fences. A connector's cached role, tenant, project, policy, receipt or signed URL never overrides current server state.

## Consent and policy

Capture and upload are distinct actions:

1. Local capture decides whether a category may enter local SQLite/history. Existing local metadata-only defaults stay intact.
2. Upload decides whether an already permitted local category may leave the device for a named workspace/project/destination.

Each project policy has a monotonic `policy_generation`; device revocation has a monotonic `device_generation`; deletion has a monotonic `deletion_generation`. An outbox entry stores all three values and the category decision that admitted it. Before sending, the connector rechecks its latest policy and removes or suppresses entries now disallowed. Ingestion independently loads the current server policy/device/project state and rejects a stale, paused, reduced-consent, revoked or deleted upload. Unknown policy and unsupported category fail closed for content. Metadata may be represented only when its category is expressly allowed; otherwise the connector records a local, content-free gap reason.

Backfill is never implicit. The user selects a bounded project, categories, receipt/time range, and estimated item/byte count in the connector. That selection creates a local `backfill_selection_id`, is revalidated against current policy before each batch, and is included in the batch as provenance. A new policy generation can shorten or cancel the selection; it cannot silently expand it.

## Wire contract v1

The transport is authenticated TLS. The server accepts JSON batches up to separately documented request, item and byte limits; invalid or oversized fields are rejected before persistence. Raw captured text is untrusted input: it is treated as inert data, never as instructions, HTML, SQL, log format strings, object keys or executable content.

`delivery_id` is a UUID generated once per durable local outbox record. It is stable across retries. `batch_id` identifies one transport attempt grouping and can change when a batch is split. The durable uniqueness key is `(tenant_id, project_id, device_id, delivery_id)`. The server validates ownership, policy and schema, writes accepted primary records plus a receipt in one committed transaction, then returns the receipt. It never acknowledges a record before that commit. A retry of the same key returns the original receipt only when the normalized payload digest and contract version match; a mismatch is an `idempotency_conflict`, never an overwrite.

```json
{
  "contract_version": "quoli.sync/v1",
  "batch_id": "2c6b4c92-a1ca-4e88-a2c1-4f03cc9976ec",
  "connector": {"instance_id": "b4d11802-5640-4ff4-8bae-571a116a3ef5", "version": "0.1.0"},
  "project_hint": "prj_demo_01",
  "policy_generation": 7,
  "device_generation": 3,
  "items": [{
    "delivery_id": "acff9d65-c5f8-49dd-bbb3-1dac31ffb9dd",
    "source_event_id": "evt_local_001",
    "category": "activity_metadata",
    "basis": "recorded",
    "captured_at": "2026-10-23T01:00:00Z",
    "backfill_selection_id": null,
    "payload": {"kind": "tool_call", "tool_name": "Bash", "content": null}
  }]
}
```

```json
{
  "contract_version": "quoli.sync/v1",
  "batch_id": "2c6b4c92-a1ca-4e88-a2c1-4f03cc9976ec",
  "receipt_sequence": 8142,
  "accepted": [{
    "delivery_id": "acff9d65-c5f8-49dd-bbb3-1dac31ffb9dd",
    "receipt_id": "rcpt_01JAMOCK0000000000000001",
    "state": "committed",
    "committed_at": "2026-10-23T01:00:02Z"
  }],
  "rejected": [],
  "server_policy_generation": 7,
  "server_device_generation": 3
}
```

Receipt sequence is per project and is an ordering aid, not a claim about source-time order. The dashboard labels source timestamp basis separately. A `receipt_id` is the durable acknowledgement. A response lost after commit is harmless: the connector retries the identical `delivery_id` and gets that receipt. Partial batches are allowed; each rejected item remains local with a content-free reason, and only accepted items are removed from the outbox.

| State | Meaning and connector action |
| --- | --- |
| `committed` | Primary record and receipt are durable; remove the outbox entry. |
| `duplicate` | Prior equivalent delivery is committed; use the returned original receipt and remove the entry. |
| `retry_later` | Transient network/service limit; retain entry and use bounded exponential backoff with jitter. |
| `policy_denied` / `device_revoked` / `project_deleted` | Do not retry payload. Refresh policy, fence the entry and record a content-free local gap. |
| `unsupported_contract` / `unsupported_category` | Do not downgrade or reinterpret content; retain a capability gap until an explicit compatible connector update or user action. |
| `idempotency_conflict` | Preserve the original local record and require operator/support investigation; never replace it. |

## Offline, queues, and derived work

The connector owns a bounded, encrypted-at-rest-if-supported local outbox. Bounds are count, bytes, age and per-project share; exceeding a bound drops the oldest eligible content only under the local policy, and records a content-free drop observation. It drains with one atomic owner, restart-safe cursor and backoff. A reconnect fetches policy/device state before normal drain. The server may place committed record IDs on a durable queue for projections, but queue delivery cannot create or change primary observations.

Projection workers are idempotent by `(tenant_id, projection_name, projection_version, primary_record_id)`. A projection failure is visible as a gap/retry state, never a reason to retract a committed receipt. A queue job includes tenant, project and deletion generation; workers re-authorize current lifecycle state before reading/writing. A provider queue with at-least-once delivery still needs these keys; provider deduplication windows are not the evidence idempotency guarantee.

## Primary records, artifacts and scope propagation

| Class | Primary owner | Rebuildable? | Required scope |
| --- | --- | --- |
| Accepted observation, delivery digest, receipt, consent/deletion/revocation audit event | Relational primary store | No, except retention/deletion lifecycle | tenant, workspace, project, device, receipt/deletion generations |
| Large sanitized artifact body | Private object store plus relational manifest | Body no; previews/indexes yes | tenant/project/device in manifest and object key; object access only through re-authorized service path |
| Activity, cost, scene, architecture and debt views | Versioned projections | Yes from retained primary evidence | tenant/project, source receipt IDs, projection/rule version and omissions |
| Queue job, cache, cursor, export job | Ephemeral operational state | Yes or expires | tenant/project/device/deletion generation; never a global cache key |

Object keys use opaque scoped components such as `tenants/{tenant_id}/projects/{project_id}/artifacts/{artifact_id}`. Object metadata is not authorization. The download service verifies current membership, project permission, artifact lifecycle and generation before minting a one-object, one-method, short-expiry URL. URLs are not placed in logs, telemetry, browser history, receipts or exports. Direct browser listing of a bucket/prefix is disallowed.

Every query, cursor and export has server-derived tenant/project scope. A cursor encodes an authenticated query fingerprint and scope; a scope mismatch is rejected. Background workers and cache keys include the same scope. Exports require an explicit selection and preview, are encrypted/short-lived according to the owner-approved policy, and show that copies already downloaded cannot be recalled.

## Lifecycle and deletion

Pause is a policy change: stop admitting content locally and uploading content remotely, but leave retained evidence readable according to role and retention. Reducing consent fences queued/backfill entries for the removed categories before the next send. Device revocation invalidates credentials and prevents later ingestion; its local outbox is not remotely drained. A disconnected or uninstalled producer therefore leaves an explicit last-seen/pending-or-unknown state rather than a claim that it is clean.

Project and account deletion create a server tombstone before destructive work begins. The tombstone contains scope, deletion generation, effective time and audit ID; it fences upload, artifact reads, projections, queues, caches, cursors and exports. Deletion workers remove active primary/artifact/projection/queue/cache data under the tombstone. Backups retain tombstones at least through their restore window. On restore, a replay job reapplies tombstones before any producer retry or projection serves data. This prevents restored evidence from becoming visible after deletion.

```json
{
  "type": "quoli.lifecycle_tombstone/v1",
  "tenant_id": "ten_demo_01",
  "project_id": "prj_demo_01",
  "deletion_generation": 9,
  "effective_at": "2026-10-23T02:00:00Z",
  "scope": "project",
  "audit_id": "audit_01JAMOCK0000000000000002"
}
```

Active deletion, backup expiry and physical-media erasure are distinct stages. Cloud retention defaults (90 days, adjustable 7–365) and the 30-day post-deletion backup expiry are recorded in the [hosted pilot decisions](../hosted-pilot.md); customer-facing legal wording and any legal holds remain owner/legal decisions. This contract does not invent exceptions.

## Minimum service responsibilities

| Responsibility | Initial approach | Operator must prove before production |
| --- | --- | --- |
| Identity and device pairing | Managed user identity plus server-issued, revocable device credentials | membership/role checks, token rotation/revocation, session/CSRF/origin controls |
| Primary evidence | Managed relational store with transaction support | scoped constraints/indexes, migrations, encrypted backups, restore and tombstone replay drill |
| Artifacts | Private encrypted object store and manifest table | no public listing, scoped signed-access tests, expiry/log-redaction controls |
| Projections | One durable queue and idempotent workers | dead-letter/retry visibility, cross-tenant job tests, load/backpressure bounds |
| Hosted API/dashboard | Authenticated service and server-rendered/app API | tenant-scoped queries/cursors/exports, audit logging without captured content |
| Observability | Allowlisted counters/IDs only | no prompts/code/tool output in logs, alerting and incident response rehearsal |

## Verification plan and known limits

Use synthetic data only. Contract tests must cover commit-before-ack, lost-response retry, duplicate delivery, changed-payload conflict, stale policy, category reduction, revocation, bounded offline queue, reconnect, cross-tenant query/job/cache/cursor/export attempts, signed-URL expiry/leak handling, hostile text and backup tombstone replay. See [threat model](threat-model.md) for specific pass conditions.

This contract does not claim universal harness fields, exact source order, a completed cloud data model, a selected vendor, data-residency compliance, physical deletion timing, or that a successful command establishes full capture. Unsupported fields remain `null` with a capability/gap reason.
