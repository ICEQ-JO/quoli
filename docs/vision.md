# Quoli product vision

Owner direction: 2026-10-23. **Target product, not delivered capability.** The latest owner clarification supersedes the earlier local-dashboard-only plan. See [current implementation](implementation-progress.md), [target architecture](architecture.md) and [delivery roadmap](work/vision-roadmap.md).

## Product

Quoli is a hosted evidence, change-understanding, architecture-integrity and technical-debt workspace for AI-assisted development. A developer uses their coding agent locally, then opens Quoli in the cloud to understand what happened, what changed, what it cost, which extensions it used and what remains unverified. Teams can use the same evidence to review changes and enforce explicit architecture policies.

The experience is:

```text
OpenCode / Pi / Claude Code / Codex on a developer machine
    → Quoli local connector: capture controls, sanitization, bounded durable delivery
    → authenticated Quoli cloud: tenant-scoped evidence and derived views
    → hosted dashboard: activity, subagents, costs, extensions, change scenes, policies and debt
```

The local connector is required for local activity; a cloud repository connection alone cannot reveal a developer's local prompts, tools or subagents. Each harness needs a verified adapter. “Whatever harness” is the extensible product direction, not a claim of automatic universal support.

## Customer outcomes and pillars

Every issue and PR names one or more pillars or commercial gates.

### P1 — Repositories anywhere

Connect local repositories and cloud repositories: GitHub first, then GitLab and Bitbucket. Select branches, commits and pull/merge requests; inspect bounded tree, blob and comparison observations. Preserve repository/ref/commit identity, rate limits, permission denials and partial-fetch states. Keep read operations separate from the later app permissions needed to publish policy checks.

A provider response is an observation, not a complete repository audit. Unfetched paths and denied scopes remain unknown. Provider credentials use least privilege, scoped encrypted storage and revocation; local credentials use the OS keychain where supported.

### P2 — Cross-harness evidence

Support OpenCode, Pi, Claude Code, Codex and future tools through versioned adapters, a published capability matrix, synthetic fixtures and reversible setup. First integrate Claude Code and OpenCode, then complete Codex and Pi before claiming the full four-harness product. This sequence is a planning choice; change it when a demonstrated user need warrants it.

Capture every event the supported source exposes, with explicit gaps. Installed, detected, supported and connected are different states. A harness may never report exact exit codes, per-request usage or full child scope; the dashboard must show that limit.

### P3 — Observable activity and subagents

Track user prompts, turns, tool calls/results, declared plans and decisions, approvals, corrections and subagents. Preserve raw tool names with normalized categories, parent/child identities, spawn provenance, timing basis and field-level capability/content states.

A decision is an emitted plan, rationale, approval, todo change or correction, or an explicitly marked derived grouping. Never collect or reconstruct hidden chain-of-thought. Do not join activity by text similarity or timestamps when IDs are missing. A missing result or ending stays a gap.

### P4 — Token cost and attribution

Show input, output, cache-read, cache-write and reasoning tokens where reported. Reconcile per-request and cumulative reports without double counting. Explain estimated cost using effective-dated model prices, currency, units and formulas. Separate provider-reported cost, list-price estimates and subscription cost.

Break down by session, turn, request, model, subagent and tool only where evidence supports it. Unknown attribution stays unknown; no invented file/tool allocation. Estimates are not invoices. Old estimates retain the price version that explains them.

### P5 — Plugins, skills and MCP use

Show consented inventories and actual invocation of plugins, skills, MCP servers and commands, including name, version, source and status when exposed. Link invocations to the activity they served. Installed is not invoked, invoked is not effective, and opaque internals remain opaque. Discovery must not execute an extension.

### P6 — Evidence-grounded change language

Explain changes with a constrained, versioned evidence-scene schema, deterministic cited narrative and exact diff drill-down. Native scene data is the source of truth; Mermaid/SVG or other formats can be exports.

Node vocabulary: `turn`, `prompt`, `decision`, `subagent`, `tool`, `file`, `symbol`, `hunk`, `check`, `gap`, `cost`, `capability`. Edge vocabulary: `prompted`, `declared`, `spawned`, `invoked`, `touched`, `changed`, `verified`, `failed`, `cost_of`, `used`.

Every node and edge carries recorded/derived/inferred basis, a generating rule, supporting evidence IDs and uncertainty. The `verified` vocabulary never means feature correctness merely because a command succeeded. Views: Story, Impact, Cost and Timeline. Syntax-aware diffs use bounded tree-sitter parsing for supported languages with file fallback. Hunk-to-prompt/tool links and “why” require supporting IDs or declared rationale. An optional model summary must remain secondary, explicitly consented and citation checked.

### P7 — Architecture integrity and technical-debt control plane

This is part of the full product, with concrete implementation issues after the evidence/cloud foundation. It is not a discovery-only placeholder, and it need not delay the first paid evidence pilot.

Build a versioned architecture model covering modules, dependencies, ownership boundaries, database schema and approved patterns. Add validated rules-as-code, deterministic dependency/schema/boundary checks, bounded duplication signals and explainable static blast-radius views. Keep a technical-debt ledger with owner, reason, expiry, evidence and follow-up.

A GitHub app, then GitLab integration, connects pull/merge requests and exact commit identities. Reports provide pass/warn/block outcomes, missing-evidence states, deterministic rule findings and machine-readable fix requests. Only explicitly configured deterministic rules may block; model text may explain or suggest, never gate. PRs without provenance can be analyzed but cannot be labeled agent-created. Stale results cannot approve a newer commit. Run in observation mode and evaluate false positives before enabling enforcement.

A policy gate is not a safety or correctness certification. Static dependency reach is not observed runtime impact. Self-hosting and enterprise certification remain separate demand-driven work.

## Cloud and privacy contract

The hosted dashboard and consented local-to-cloud synchronization are now approved product architecture. This does **not** authorize uploading this repository's existing private sessions or changing anyone's runtime capture settings during development.

- Default to metadata-only collection and synchronization. Prompt text, tool content, code/diffs and extension configuration each need explicit capture and upload controls. Explain when a richer diagram needs content that is disabled.
- Separate permission to retain evidence locally from permission to send it to the cloud. Preview categories, destination, retention and project scope during connector pairing. Deny unknown policy or stale consent generations before any durable outbox write or upload.
- Apply controls and sanitization before local persistence and network transmission; revalidate on the cloud boundary. Redaction reduces risk and cannot guarantee removal of every secret.
- Keep a durable bounded outbox, stable delivery IDs and acknowledge only committed cloud writes. Retries must not duplicate activity or resurrect deleted projects.
- Authenticate users and devices separately. Tenant/project authorization applies to every event, blob, query, job, cache and export; never trust tenant identity supplied in payloads. Encrypt transport and retained cloud data; keep keys and tokens out of evidence.
- Provide device revocation, access audit, export, retention, deletion and documented backup expiry. Delete derived data and caches with primary evidence; fence disconnected producers. Explain that user-exported copies and external backups are outside immediate revocation.
- Treat captured content as inert untrusted data. Never replay commands, execute repository code or follow embedded links during ingestion/analysis.

## Commercial and operational gates

| Gate | Required outcome |
| --- | --- |
| Cloud foundation | Reproducible environments, accounts, tenant isolation, connector pairing, ingestion/storage, hosted query/dashboard path |
| Distribution and platforms | Signed versioned connector downloads, verified updates and rollback, tested Linux/macOS support; Windows explicitly excluded until implemented |
| Licensing and billing | Hosted trial/subscription entitlements, plan limits, cancellation/refund behavior; existing evidence remains readable/exportable after expiry |
| Onboarding | Sign in, create workspace/project, pair device, choose capture/upload settings, connect repository/harness, review first evidence |
| Data controls | Category consent, local/cloud retention and deletion, revoke devices, export, access audit, secure tokens |
| CI and release discipline | Automated synthetic checks, migration/release validation, staging rollout and recovery |
| Security and trust | Threat model, adversarial cross-tenant tests, reviewed legal/privacy/security terms, disclosure and dependency hygiene |
| Operations and support | Content-free service metrics, bounded queues/quotas, backups with tested restore, incident/deletion/recovery runbooks and support |
| Team readiness | Workspace memberships and basic roles for hosted isolation; secure sharing, then enterprise identity as a later increment |

## Delivery sequence

1. Repair retry privacy/lifecycle gaps, establish CI and pin the cloud data/security contract.
2. Migrate evidence contracts compatibly and build cloud identity, isolated storage, pairing, durable sync and authorized queries.
3. Adapt the existing session workspace into the hosted dashboard. Ship Claude/OpenCode, repository connections, subagents, cost, extension use and Story/syntax-aware review behind the cloud gates.
4. Complete signed connectors, lifecycle controls, payment, trust/operations and a fresh-machine hosted paid-pilot demonstration.
5. Complete Codex/Pi, other providers, all scene views, team sharing and the architecture/debt implementation track. Observe policy behavior before enforcing rules.
6. Add more languages, enterprise SSO and optional model summaries according to customer evidence. Self-hosting and certifications require their own decisions.

Exact prerequisite relations live in [the issue index](issues/vision/README.md). A sequenced backlog is not a delivery date or a claim that all features exist.

## Remaining decisions

Cloud dashboard plus local connectors, the full four-harness destination, native evidence scenes and concrete architecture/debt scope are settled owner direction. Do not reopen them as local-only-versus-cloud discovery.

Still decide the first paid buyer, hosting provider/region and data-residency obligations, auth/payment vendors, exact trial/pricing/limits, supported OS versions/architectures, launch retention defaults, initial syntax languages beyond TypeScript/JavaScript, and policy pilot rule set. Record implementation choices in [decisions](decisions.md); verify external contracts before coding integrations.
