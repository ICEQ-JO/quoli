# Ordered issue backlog

The 19 original MVP issues are published on GitHub; the optional experiment remains a local draft. Ongoing implementation work is tracked in Linear. IDs 001–020 are stable plan references, distinct from both the historical GitHub issue numbers and current Linear issue identifiers. Update the Linear issue and these references when scope changes. All published work is medium-sized (M): a bounded, demonstrable capability. Oversized work is split and tiny related tasks are grouped. Follow the listed prerequisites; issue order is a recommended topological delivery order.

Every core issue inherits the [architecture](../architecture.md), [MVP scope](../implementation-plan.md), and [capability gate](../claude-code-capabilities.md). In particular: events are primary; unsupported data is null; capture is incomplete; captured content is inert; no automatic command replay or outbound session upload.

| ID | Title | Size | Prerequisites | Milestone | GitHub |
| --- | --- | --- | --- | --- | --- |
| [001](001-scaffold.md) | Run an empty local workspace with a health page | M | — | M1 | [#2](https://github.com/ICEQ-JO/quoli/issues/2) |
| [002](002-event-contracts.md) | Define nullable events and inspectable evidence contracts | M | 001 | M1 | [#3](https://github.com/ICEQ-JO/quoli/issues/3) |
| [003](003-privacy-pipeline.md) | Preview capture policies and sanitize before any persistence | M | 002 | M1 | [#4](https://github.com/ICEQ-JO/quoli/issues/4) |
| [004](004-event-storage.md) | Persist and replay a sanitized session without mutating history | M | 003 | M1 | [#5](https://github.com/ICEQ-JO/quoli/issues/5) |
| [005](005-local-ingestion.md) | Accept authenticated bounded batches on loopback | M | 004 | M1 | [#6](https://github.com/ICEQ-JO/quoli/issues/6) |
| [006](006-fixture-timeline.md) | Explore a synthetic session timeline with evidence details | M | 005 | M1 | [#7](https://github.com/ICEQ-JO/quoli/issues/7) |
| [007](007-reported-usage.md) | Display reported token and cache usage with honest gaps | M | 006 | M2 | [#8](https://github.com/ICEQ-JO/quoli/issues/8) |
| [008](008-repository-snapshots.md) | Capture a read-only baseline from a disposable Git repository | M | 005 | M2 | [#9](https://github.com/ICEQ-JO/quoli/issues/9) |
| [009](009-before-after-diffs.md) | Inspect captured before/after code and unavailable sides | M | 006, 008 | M2 | [#10](https://github.com/ICEQ-JO/quoli/issues/10) |
| [010](010-evidence-checks.md) | Connect files and recorded checks without claiming correctness | M | 007, 009 | M2 | [#11](https://github.com/ICEQ-JO/quoli/issues/11) |
| [011](011-bounded-change-map.md) | Explore a bounded map that opens diffs and check evidence | M | 010 | M2 | [#12](https://github.com/ICEQ-JO/quoli/issues/12) |
| [012](012-retention-deletion.md) | Control capture and delete a project completely from Traceframe | M | 011 | M3 | [#13](https://github.com/ICEQ-JO/quoli/issues/13) |
| [013](013-integration-verification.md) | Verify Claude Code contracts on a declared supported version | M | 012 | M4 | [#14](https://github.com/ICEQ-JO/quoli/issues/14) |
| [014](014-claude-hooks.md) | Collect documented Claude Code hooks through a passive bridge | M | 013 | M4 | [#15](https://github.com/ICEQ-JO/quoli/issues/15) |
| [015](015-local-telemetry.md) | Receive reported Claude usage through a narrow local OTLP endpoint | M | 014 | M4 | [#16](https://github.com/ICEQ-JO/quoli/issues/16) |
| [016](016-source-reconciliation.md) | Reconcile overlapping sources without counting activity twice | M | 015 | M4 | [#17](https://github.com/ICEQ-JO/quoli/issues/17) |
| [017](017-live-snapshot-linking.md) | Link live sessions to observed repository snapshots and checks | M | 016 | M4 | [#18](https://github.com/ICEQ-JO/quoli/issues/18) |
| [018](018-local-setup.md) | Guide local setup and reversible Claude connection | M | 017 | M5 | [#19](https://github.com/ICEQ-JO/quoli/issues/19) |
| [019](019-pilot-release.md) | Validate the full local pilot against evidence and privacy guarantees | M | 018 | M5 | [#20](https://github.com/ICEQ-JO/quoli/issues/20) |
| [020](020-experimental-transcripts.md) | Evaluate an opt-in version-gated historical transcript importer | M | 019 | Deferred | Deferred draft |

## Follow-up UI work

[021 — Session review UX](021-session-review-ux.md), [GitHub #23](https://github.com/ICEQ-JO/quoli/issues/23), is a medium-sized refinement of the implemented preview. It adds session-wide search, local evidence links, gap review and responsive inspection; the original MVP issue IDs remain unchanged.

## Implementation checkpoint

The MVP is implemented: the [synthetic local preview](../local-demo.md), the recorded [verification evidence](../verification-evidence.md), the bounded [change map](../change-map.md), the local [capture controls](../lifecycle-controls.md), the [Claude Code runtime report](../claude-code-runtime-report.md) for the tested version, the passive [hook bridge](../hook-bridge.md), the narrow [reported usage receiver](../telemetry-receiver.md), the [source reconciliation](../source-reconciliation.md), the [live linking guide](../live-linking.md), the [local setup guide](../local-setup.md) and the [pilot checklist](../pilot-release.md). Historical GitHub issue checklists and the implementation PRs record the exact completed criteria. A feature must not be inferred to exist merely because it appears in this index.

## Dependency rationale

The synthetic dashboard (006) precedes all live adapter work. Repository snapshots (008) need ingestion/storage but can be built independently of usage UI; the recommended sequence delivers usage first. Evidence linking (010) needs inspected snapshots/diffs and consistent usage contracts. Map generation (011) consumes those established relationships rather than inventing new ones. Lifecycle controls (012) precede runtime discovery (013) and all live data paths.

Discovery in 013 is a runtime compatibility gate; the initial official-documentation review is already in the planning pack. Hooks (014) and OTLP usage (015) are separate demonstrable increments. Reconciliation (016) must pass before integrated live file linking (017). Reversible setup (018) and final validation (019) close the pilot. Experimental parsing (020) is deliberately post-MVP and requires a separate scope decision.

The owner authorized GitHub setup and issue publication after the initial planning pass. Live checks, configuration installation and merges still require the appropriate explicit instruction. Published issues describe future implementation work, not completed capabilities. Repository setup is tracked separately in [GitHub #1](https://github.com/ICEQ-JO/quoli/issues/1).

## Dashboard redesign increments

- [#25 — Workspace overview and searchable session library](https://github.com/ICEQ-JO/quoli/issues/25)
- [#26 — Session evidence workbench and visual system](https://github.com/ICEQ-JO/quoli/issues/26)

Both are medium-sized increments in the dashboard redesign. See the [design review and captures](../design/redesign-review.md) for delivered behavior and validation. They do not expand the live-ingestion or repository-analysis scope.
