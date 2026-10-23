# Implementation checkpoint

Updated for planning: 2026-10-23. This page distinguishes existing local code and recorded validation from the [target hosted product](vision.md). It does not certify a cloud release.

## Delivered local foundation

| Capability | Implementation/record | Known boundary |
| --- | --- | --- |
| Local collector, SQLite history, normalized evidence and synthetic sessions | `apps/collector`, `packages/schema`, `packages/storage`; [development reference](development.md), [demo](local-demo.md); historical [PR #22](https://github.com/ICEQ-JO/quoli/pull/22) | Local, not tenant-scoped hosted ingestion |
| Session workspace, source inspection, search and gap queue | `apps/web`; [current workspace](design/session-workspace.md), [product experience record](work/product-experience.md) | Existing loopback session/API assumptions require hosted adaptation |
| Read-only local repository capture and observed history | `packages/repository`, collector observer; [capture](repository-capture.md), [automatic history](automatic-history.md), [work record](work/automatic-repository-history.md) | No automatic authorship; safe file traversal is Linux-specific |
| Captured file diffs and recorded checks | `packages/analysis`; [diffs](captured-changes.md), [verification evidence](verification-evidence.md) | Successful command does not establish correctness or coverage |
| File/check change map | `packages/schema/src/map.ts`, analysis/map and web map; [reference](change-map.md) | Not the full proposed scene language or syntax-aware impact view |
| Claude hook bridge, narrow reported usage and reconciliation | `apps/bridge`, collector OTLP parser; [versioned runtime report](claude-code-runtime-report.md), [hooks](hook-bridge.md), [receiver](telemetry-receiver.md), [reconciliation](source-reconciliation.md) | Runtime report covers Claude Code 2.1.306 on Linux; current/new versions require verification; no other detailed harness adapter delivered |
| Capture settings, pause, retention and database purge | [controls](lifecycle-controls.md), schema/privacy and storage lifecycle | Known retry spool policy/purge gap; see below |
| Installable local production CLI and managed runtime | `apps/cli`, release builder; [CLI](cli.md), [work record](work/cli-background.md) | Unpublished Linux local build; not a signed cloud connector distribution |
| Local fixture/release/browser validation records | [pilot record](pilot-release.md), test suite and dated design/work evidence | Not cloud-security certification; fresh-machine/platform results require explicit evidence |

Historical implementation branches and PR references describe how local work was built. The original MVP stack was merged; old per-feature branch names are not current implementation status. New work follows Quolii Linear and the active [backlog](issues/vision/README.md).

## Confirmed planning-time defects

The bridge normalizes/redacts content but does not consult current project capture settings before failed delivery is written to `bridge-spool.jsonl`. Database purge does not remove that spool. A synthetic temporary check confirmed disabled prompt content remained in the spool and remained after purge; it invoked normalization/spooling directly and did not collect a private session. V02/V03 track repairs. No fix is claimed by this documentation change.

See the [source-informed assessment](work/vision-repository-assessment.md) for evidence, boundaries and capacity checks still needed.

## Not delivered

Cloud accounts/workspaces, device pairing, consented synchronization, cloud evidence/artifact storage, tenant isolation, hosted queries/dashboard operation, cloud deletion/backup recovery, GitHub remote observations, OpenCode/Codex/Pi adapters, request-level cost estimates, extension inventory/invocation views, full evidence scenes/syntax-aware diffs, paid entitlements, signed updates and architecture/debt enforcement remain implementation work. Their presence in the vision or Linear does not mean they run.

## Supporting-agent work

Previous OpenCode support runs used the installed `opencode/minimax-m3.1-flash-free` model for bounded local contributions, reviewed/tested by the primary agent before integration. Verify the installed identifier again before new use. This planning/publication pass uses no supporting agent and uploads no private evidence.
