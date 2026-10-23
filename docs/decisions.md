# Product and architecture decisions

## 2026-10-23 — Hosted dashboard with local connectors

Owner direction in the planning conversation: users work in local coding agents and see their evidence in Quoli's cloud dashboard. This supersedes the earlier local-dashboard-only pilot and deferred-cloud proposals.

Settled direction: cloud accounts/workspaces and local connector pairing/sync are foundational; OpenCode, Pi, Claude Code and Codex are target adapters; token attribution, extension use and evidence scenes are core; architecture integrity and technical debt have concrete implementation work after evidence validation. The first evidence pilot can precede policy enforcement. Native evidence scenes remain the source of truth; deterministic rules decide policy.

Rationale: the owner wants a SaaS product that works across locally running agents, not merely a local viewer. Earlier drafts under-scaffolded cloud and architecture work.

Consequences: add tenant isolation, separate capture/upload consent, secure device identity, durable sync, cloud lifecycle/operations and hosted query/dashboard issues. Retain useful local storage/capture/diff code. Product approval does not authorize automatic upload of existing private data.

## Hosted pilot decisions

[Hosted pilot](hosted-pilot.md) records the owner's choices for the first paid buyer, the USD 19 per-seat monthly Pilot plan, connector platforms (Linux x64 and macOS 14+, Windows excluded), the 90-day cloud retention default and the launch success criteria. Trial and plan limits, cancellation/refund, hosting region and data residency, auth/payment vendors and initial policy rules remain open; the record names the owner and follow-on issue for each. Do not mistake proposed vendors, code layouts or dates for owner-approved implementation. Enterprise SSO, more languages, optional model summaries and self-hosting remain later gated increments.

## Documentation cleanup

The original GitHub MVP issues remain historical delivery records. Their duplicated local issue bodies and obsolete empty-repository plan are removed in favor of the [checkpoint](implementation-progress.md), [runtime references](README.md) and [active Linear-backed backlog](issues/vision/README.md). Earlier visual proposal documents are superseded by the implemented session workspace and current visual system; validation evidence is retained.
