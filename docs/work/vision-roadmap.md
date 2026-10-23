# Hosted Quoli delivery roadmap

Owner direction: 2026-10-23. Tracking: [QUO-5](https://linear.app/quolii/issue/QUO-5). Target is **cloud dashboard + local connectors**, not a local viewer with cloud indefinitely postponed. See [vision](../vision.md), [architecture](../architecture.md), [assessment](vision-repository-assessment.md) and [implementation issues](../issues/vision/README.md).

## Sequence and demonstrations

| Phase | Demonstration | Main work |
| --- | --- | --- |
| 0 — Repair and decisions | Offline capture respects consent; current docs and CI; cloud trust/data-flow contract | V01–V05, C01 |
| 1 — Compatible evidence and cloud foundation | Synthetic v2 history coexists with v1; authenticated workspaces, isolated storage and device pairing | V06–V09, V12, V15–V16, V19, C02–C05, C08 |
| 2 — Sources and delivery | Claude/OpenCode and GitHub evidence survive offline/retry and arrive once in the right cloud project | V10–V14, V26, C06–C11 |
| 3 — Hosted understanding | Existing review UI runs against cloud queries with subagents, costs, skills, Story, symbol diffs and full lifecycle controls | V17–V25, V27, C12–C15 |
| 4 — Paid evidence pilot | Signed connectors, hosted billing, fresh-machine onboarding, isolation/deletion/restore and operational recovery pass | V28–V35, C16–C19 |
| 5 — Full product and control plane | Codex/Pi and more repository providers; all scene views; sharing; architecture/debt in observation mode, then explicitly enabled deterministic enforcement | V36–V44, A01–A12 |
| 6 — Enterprise/provider expansion | Buyer-backed SSO and GitLab guardrail delivery | V45, A13 |

Issue relations determine start order. Optional model summaries and extra languages stay conditional increments; core cloud functionality and four-harness destination are no longer discovery placeholders. Policy enforcement follows evidence validation but has concrete build issues now. No delivery dates or completed-feature claims are implied.

## Design reset (D01)

[QUO-82](../issues/vision/d01.md) is a cross-cutting design workstream, owner-prioritized 2026-10-23. It will replace the generic current visual system and landing page, and sets the direction that C12, V17, V21, V24, V25, V40 and V41 implement. The first gate is an owner choice among three recorded directions in [docs/design/directions/d01](../design/directions/d01/README.md); implementation waits for that choice. D01 does not hard-block backend, cloud or evidence-contract work, and it must not silently redefine the related feature scopes.

## First actionable batch

1. V02: repair policy-before-spool; V03 follows with deletion/retry fencing.
2. V05: establish CI baseline. V04 is this documentation/backlog alignment, tracked by QUO-5.
3. C01: finalize the hosted data/sync/security contract while V01 settles commercial/launch limits.
4. After V05, implement V06, then V07/V08. After C01, start C02 and cloud account/workspace isolation.
5. Run the D01 direction gate alongside C01/C02. Hold UI-facing increments until the owner chooses; backend and evidence-contract work can continue.
6. Pair devices only after identity/roles and signed connector foundations; build upload delivery only after privacy and lifecycle repairs. Test with synthetic data until hosted readiness gates pass.

## Keep, replace and delete

Keep local SQLite, append-only provenance, capture controls, safe repository observation, existing diffs/checks/reconciliation, UI components, synthetic fixtures and managed CLI.

Replace fixed source/tool/version assumptions through compatible v2 contracts. Adapt loopback-only session/API assumptions in the hosted deployment. Replace the limited file/check map only after scene parity. Add cloud storage/identity/sync alongside the local runtime; do not turn the local collector into a public service.

Delete superseded documentation bodies and contradictory guidance now; retain useful current runtime/validation references. Implementation issues must remove old code paths after replacement parity and caller/reference checks, not accumulate two permanent implementations. No source module or dependency has yet been proven unused; no bulk source deletion is justified.

## Agent coordination

Each issue is relative M and must yield one bounded demonstration and reviewed PR. Re-estimate/split when implementation evidence changes scope. Use an isolated checkout/branch per issue and avoid competing schema/storage edits.

Ownership lanes: evidence/contracts; one adapter/provider; cloud identity/storage/sync; analysis/scenes/cost; design system and brand; hosted experience; architecture/policy/debt; release/security/operations. Shared contracts land before downstream feature branches consume them.

Use required Ponytail/Impeccable/Ponytail Review skills for coding/UI/review. If supporting OpenCode agents are used, verify the installed free MiniMax identifier, bound ownership, isolate checkout and exclude private sessions, captured user code and credentials from prompts. Supporting agents do not publish, merge or alter owner tooling. Primary review and meaningful checks precede integration.

All work is in Quolii Linear, all PRs name a pillar/gate and linked issue, agent commits use the required ICEQ-JO identity, and GitHub writes use the verified account. PR creation is expected; merge remains separately authorized.

## Planning validation

Local issue bodies are checked for required fields, complete/acyclic prerequisites and valid relative links. Published identifiers and blocking relations are read back from Quolii and recorded in the index. Application tests are not claimed for this documentation-only change. A synthetic temporary check confirmed the pre-spool policy/purge gap; it is a repair issue, not a completed fix.

## Two-agent overnight handoffs

Use [Agent 1: privacy/lifecycle](../handoffs/agent-1-privacy.md) for QUO-39, then a dependency-aware QUO-40 draft. Use [Agent 2: CI/cloud contract](../handoffs/agent-2-ci-cloud-contract.md) for separate QUO-41 and QUO-19 increments. The packets define isolated checkouts, non-overlapping ownership, checks, PR bases, stop conditions and morning reports. They authorize neither merges nor production deployment.
