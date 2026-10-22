# Traceframe planning pack

Planning date: 2026-10-22. Status: a runnable local preview includes synthetic sessions, explicit repository snapshots, captured file review, recorded verification evidence and a bounded change map; live collection remains planned.

Traceframe answers: **“Show me what my coding agent did, what changed, and what remains unverified.”**

See the [implementation checkpoint](implementation-progress.md) for delivered, in-progress and planned capabilities.

To run and test the preview, start with [the local demo guide](local-demo.md) and [development/API reference](development.md).

See [captured file review](captured-changes.md) for comparison behavior and limits.

See [verification evidence](verification-evidence.md) for recorded checks, parsed counts and the rules that bind them.

See [change map](change-map.md) for the bounded map that joins captured changes to recorded checks.

See [capture controls, retention and deletion](lifecycle-controls.md) for the local lifecycle controls.

See the [Claude Code runtime verification report](claude-code-runtime-report.md) for the tested version, observed payloads and unsupported values.

See the [hook bridge](hook-bridge.md) for the passive collection of Claude Code hook events.

The current [session workspace reference](design/session-workspace.md) records work-list, session-document, queue and source-inspection behavior. The [UI research](design/product-ui-research.md) explains the structural direction. The earlier [session-review design reference](design/session-review.md) is historical. The [dashboard redesign review](design/redesign-review.md) includes screenshots, validation and the independent finish verdict. [Product context](../apps/web/PRODUCT.md) and the [visual system](../apps/web/DESIGN.md) guide future dashboard work.

For product direction, start with the [repository assessment and implementation plan](implementation-plan.md), then review the [architecture](architecture.md), [Claude Code capability matrix](claude-code-capabilities.md), [ordered issue backlog](issues/README.md), and [founder decisions](founder-decisions.md).

The MVP is a local application for one developer, with one local Git repository per project and Claude Code as its only live agent integration. This is the first product-validation step toward the proposed SaaS business. Accounts, billing, collaboration, hosting, and cloud synchronization require a separate later product decision; nothing in this plan uploads session evidence.

Work is tracked in [ICEQ-JO/quoli on GitHub](https://github.com/ICEQ-JO/quoli/issues). Local IDs 001–020 are plan references, not GitHub issue numbers; the backlog index maps each published issue. The optional transcript experiment remains a local draft. See [AGENTS.md](../AGENTS.md) for medium-sized issues, PRs, commit identity and revisable documentation agreements.
