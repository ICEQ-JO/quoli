# QUO-19 — overnight cloud contract result

Issue: [QUO-19](https://linear.app/quolii/issue/QUO-19) · Branch: `docs/quo-19-cloud-contract` · Base: `main` · PR: [#60](https://github.com/ICEQ-JO/quoli/pull/60)

Advances **Commercial: cloud foundation, data controls**.

## Delivered packet

- `docs/cloud/sync-contract.md`: proposed identities/roles, separate capture/upload consent, server-derived scope, versioned batch and receipt examples, stable delivery/idempotency, offline state, primary-versus-projection ownership, lifecycle/tombstone replay, operations and unresolved owner choices.
- `docs/cloud/threat-model.md`: trust boundaries and testable mitigations for scope spoofing, replay, stale consent, signed URL leakage, hostile text, cross-tenant jobs and restored deletion.
- `docs/architecture.md`: narrow link to the proposed packet.

## Validation evidence

| Check | Outcome |
| --- | --- |
| Contract/source consistency | Reviewed against `docs/architecture.md`, `docs/vision.md`, `docs/decisions.md` and C01: cloud is target-only; separate consent, server-derived scope, append-only primary evidence and deletion tombstones are preserved. |
| Synthetic JSON examples | Parsed all three JSON blocks and asserted the receipt delivery ID matches its submitted item plus the expected contract/tombstone versions. |
| Vendor-specific claims | Candidate AWS SQS/S3/RDS claims linked to official documentation and retrieved 2026-10-23; no vendor decision or account created. |
| Threat-model coverage | Reviewed against C01: includes spoofed scope, replay, stale policy, offline retry, hostile payload, signed URL, cross-tenant worker/cache/export and backup resurrection tests. |

## Decisions and limits

The hosted dashboard/local connector direction is settled. The packet recommends a minimal service shape. Buyer, pricing, connector platforms and cloud retention defaults (90 days, adjustable 7–365, with backups expiring 30 days after deletion) are settled in [hosted pilot decisions](../hosted-pilot.md); region/residency, vendor, identity provider, legal wording and the operational backup schedule remain owner choices. No endpoints, cloud accounts, credentials, uploads, deployments or customer data were created.

## Next safe action

Review and approve the contract choices, then use it as the boundary for C02 environment work and C06's policy-aware outbox implementation. Do not treat this proposal as cloud-readiness evidence until the specified synthetic control tests and restore rehearsal run.
