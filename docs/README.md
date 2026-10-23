# Quoli planning pack

Planning date: 2026-10-22. Status: the local MVP is implemented and validated: synthetic sessions, explicit repository snapshots, captured file review, recorded verification evidence, a bounded change map, cross-source reconciliation, local capture controls with retention and deletion, a passive hook bridge, a narrow reported-usage receiver and a guided reversible setup. The live collection was verified against Claude Code 2.1.306; the pilot walkthrough on a fresh machine remains the owner's check.

**Owner target:** [Quoli product vision](vision.md) — the paying-customer direction across cloud repositories, multiple harnesses, observable activity and subagents, token cost, plugin/skill use and evidence-grounded change diagrams. It is target direction, not a claim that those capabilities exist; see the [implementation checkpoint](implementation-progress.md) for delivered behavior.

Quoli answers: **“Show me what my coding agent did, what changed, and what remains unverified.”**

The CLI increment adds an [installable CLI and managed production runtime](cli.md). See its [local work record](work/cli-background.md); package distribution remains unpublished. Tracked in [#49](https://github.com/ICEQ-JO/quoli/issues/49).

The repository-history increment adds [automatic repository history](automatic-history.md), independent of agent/editor, with a repository-only connection command. Detailed activity adapters beyond Claude remain planned. See the [local work record](work/automatic-repository-history.md); tracked in [#48](https://github.com/ICEQ-JO/quoli/issues/48).

See the [implementation checkpoint](implementation-progress.md) for delivered, in-progress and planned capabilities.

To run and test the preview, start with [the local demo guide](local-demo.md) and [development/API reference](development.md).

See [captured file review](captured-changes.md) for comparison behavior and limits.

See [verification evidence](verification-evidence.md) for recorded checks, parsed counts and the rules that bind them.

See [change map](change-map.md) for the bounded map that joins captured changes to recorded checks.

See [capture controls, retention and deletion](lifecycle-controls.md) for the local lifecycle controls.

See the [Claude Code runtime verification report](claude-code-runtime-report.md) for the tested version, observed payloads and unsupported values.

See the [hook bridge](hook-bridge.md) for the passive collection of Claude Code hook events.

See the [reported usage receiver](telemetry-receiver.md) for the narrow local OTLP endpoint.

See the [source reconciliation](source-reconciliation.md) for how the two live sources are joined.

See the [live linking guide](live-linking.md) for reading a live session together with the captured repository versions.

See the [local setup guide](local-setup.md) for connecting and removing the integration.

See the [pilot release checklist](pilot-release.md) for the validated local MVP, its guarantees and its limits.

The [whole-product experience rebuild](work/product-experience.md) tracks the coherent landing, repository connection guidance, session investigation and deliberate lifecycle controls under #51–#54. The [landing reference](design/landing-page.md) and [session workspace reference](design/session-workspace.md) describe the implemented surfaces and their synthetic rendering evidence.

The current [session workspace reference](design/session-workspace.md) records work-list, session-document, queue and source-inspection behavior. The [UI research](design/product-ui-research.md) explains the structural direction. The earlier [session-review design reference](design/session-review.md) is historical. The [dashboard redesign review](design/redesign-review.md) includes screenshots, validation and the independent finish verdict. [Product context](../apps/web/PRODUCT.md) and the [visual system](../apps/web/DESIGN.md) guide future dashboard work.

For the target product direction, start with the [product vision](vision.md). For the narrower validated MVP path, review the [repository assessment and implementation plan](implementation-plan.md), [architecture](architecture.md), [Claude Code capability matrix](claude-code-capabilities.md), [ordered issue backlog](issues/README.md), and [founder decisions](founder-decisions.md).

The MVP is a local application for one developer, with one local Git repository per project and agent-independent repository observation and Claude Code as its only detailed live activity integration. This is the first product-validation step toward the proposed SaaS business. Accounts, billing, collaboration, hosting, and cloud synchronization require a separate later product decision; nothing in this plan uploads session evidence.

Work is tracked only in the **Quolii** Linear workspace. The Documentu-ai Linear workspace is a separate project and must not contain Quoli work. GitHub remains the repository and pull-request host; links in the historical MVP backlog continue to identify the original GitHub issues. Local IDs 001–020 are plan references, not Linear issue identifiers. The optional transcript experiment remains a local draft. See [AGENTS.md](../AGENTS.md) for medium-sized issues, PRs, commit identity and revisable documentation agreements.
