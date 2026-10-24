# Implementation checkpoint

Updated for planning: 2026-10-24. This page distinguishes existing local code and recorded validation from the [target hosted product](vision.md). It does not certify a cloud release.

## Delivered local foundation

| Capability | Implementation/record | Known boundary |
| --- | --- | --- |
| Local collector, SQLite history, normalized evidence and synthetic sessions | `apps/collector`, `packages/schema`, `packages/storage`; [development reference](development.md), [demo](local-demo.md); historical [PR #22](https://github.com/ICEQ-JO/quoli/pull/22) | Local, not tenant-scoped hosted ingestion |
| Local capacity and navigable session pages | [QUO-62 measurements](work/quo-62-capacity.md), `pnpm benchmark:capacity` | Synthetic local load only; 50-session pages, 10,000 events / 50 MiB per project; no hosted SLA |
| Session workspace, source inspection, search and gap queue | `apps/web`; [current workspace](design/session-workspace.md), [product experience record](work/product-experience.md) | Existing loopback session/API assumptions require hosted adaptation |
| Evidence Field workspace design | [QUO-84 adoption](design/workspace-evidence-field.md), owner-approved B — Document first; shared dark/light semantics, local type and contextual source plane | Presentation increment over delivered local workflows; no new hosted, Story, replay or cost functionality |
| Read-only local repository capture and observed history | `packages/repository`, collector observer; [capture](repository-capture.md), [automatic history](automatic-history.md), [work record](work/automatic-repository-history.md) | No automatic authorship; safe file traversal is Linux-specific |
| Captured file diffs and recorded checks | `packages/analysis`; [diffs](captured-changes.md), [verification evidence](verification-evidence.md) | Successful command does not establish correctness or coverage |
| File/check change map | `packages/schema/src/map.ts`, analysis/map and web map; [reference](change-map.md) | Not the full proposed scene language or syntax-aware impact view |
| Evidence-scene contract and change-map compatibility | `packages/schema/src/scene.ts`, `packages/analysis/src/scene.ts`; [contract](evidence-scenes.md) | Definition and legacy conversion only; no scene view, and no producer emits symbol, hunk or cost nodes yet |
| Cited Story projection over activity, checks and captured changes | `packages/schema/src/story.ts`, `packages/analysis/src/story.ts`; [Story](evidence-scenes.md#story-projection) | One scene per session with synthetic tests only; no collector route or view, no symbol/hunk nodes, no model-authored prose |
| Claude hook bridge, narrow reported usage and reconciliation | `apps/bridge`, collector OTLP parser; [versioned runtime report](claude-code-runtime-report.md), [hooks](hook-bridge.md), [receiver](telemetry-receiver.md), [reconciliation](source-reconciliation.md) | Runtime report covers Claude Code 2.1.306 on Linux; current/new versions require verification; OpenCode is a separate adapter below |
| OpenCode 2.0.32 public-event adapter | `apps/bridge/src/opencode*.ts`; [reference](opencode-adapter.md), [validation record](work/quo-47-opencode-adapter.md), [QUO-47](https://linear.app/quolii/issue/QUO-47) | Local version-gated capture; synthetic prompt/tool/usage validation and live plugin/session-create smoke only; no live-provider or macOS certification |
| Versioned list-price cost estimates | `packages/schema/src/cost.ts`, `packages/analysis/src/cost.ts`; [reference](cost-estimates.md), [work record](work/quo-52-model-prices.md) | Synthetic catalog only; no verified production prices, cost view, live FX or billing ledger; cumulative-only usage stays unpriced |
| Static adapter registration and conformance fixtures | `packages/schema/src/adapter.ts`, `apps/bridge/src/adapter.ts`; [adapter contract](adapters.md) | Two static product adapters; OpenCode enforces its runtime version, while Claude hooks do not report one |
| Capture settings, pause, retention and database purge | [controls](lifecycle-controls.md), schema/privacy and storage lifecycle | Policy/epoch-aware retries and project cleanup; [repair record](work/overnight-privacy-results.md), plus OpenCode result-path revalidation |
| Versioned signed artifact tooling | [Signing, trust and limits](releases.md), [QUO-64 record](work/quo-64-signed-releases.md) | Ephemeral-key validation; no production key/public release or automatic verified updates |
| Explicit signed update, interruption recovery and compatible code rollback | [QUO-65 reference](verified-updates.md), CLI update/archive/compatibility helpers | Disposable Linux synthetic validation; no downloader/production key, unattended update, database downgrade or power-loss certification |
| Installable local production CLI and managed runtime | `apps/cli`, release builder; [CLI](cli.md), [work record](work/cli-background.md) | Unpublished Linux local build; not a signed cloud connector distribution |
| Local fixture/release/browser validation records | [pilot record](pilot-release.md), test suite and dated design/work evidence | Not cloud-security certification; fresh-machine/platform results require explicit evidence |

Historical implementation branches and PR references describe how local work was built. The original MVP stack was merged; old per-feature branch names are not current implementation status. New work follows Quolii Linear and the active [backlog](issues/vision/README.md).

## Retry privacy and lifecycle repairs

The planning assessment found that retry persistence bypassed capture policy and database purge left retry data behind. QUO-39/QUO-40 repaired policy-before-write, epoch fencing, project-scoped cleanup and drain revalidation; see the [verified repair record](work/overnight-privacy-results.md). QUO-47 adds result-path context so later path exclusions also scrub OpenCode retry output. These checks use synthetic evidence; they do not certify complete capture or physical erasure.

See the [source-informed assessment](work/vision-repository-assessment.md) for evidence, boundaries and capacity checks still needed.

## Not delivered

Cloud accounts/workspaces, device pairing, consented synchronization, cloud evidence/artifact storage, tenant isolation, hosted queries/dashboard operation, cloud deletion/backup recovery, GitHub remote observations, Codex/Pi adapters, the cost view and billing ledger, extension inventory/invocation views, full evidence scenes/syntax-aware diffs, paid entitlements, signed updates and architecture/debt enforcement remain implementation work. Their presence in the vision or Linear does not mean they run.

## Supporting-agent work

Previous OpenCode support runs used the installed `opencode/minimax-m3.1-flash-free` model for bounded local contributions, reviewed/tested by the primary agent before integration. Verify the installed identifier again before new use. This planning/publication pass uses no supporting agent and uploads no private evidence.
