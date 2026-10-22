# 009: Inspect captured before/after code and unavailable sides

Status: published as [GitHub #10](https://github.com/ICEQ-JO/quoli/issues/10); this file is the local reference. Milestone: M2.

## User value

A developer can see exactly which captured versions differ.

## Scope

Produce deterministic file/diff artifacts from snapshot pairs and a dashboard file list with side-by-side/unified inspection, evidence links and line ranges. Keep rename detection heuristic and labeled.

## Non-goals

No edit/restore controls, reconstructed missing baseline or whole-program semantic analysis.

## Dependencies

[006](006-fixture-timeline.md), [008](008-repository-snapshots.md)

## Acceptance criteria

- [x] Display additions/deletions, explicitly inferred rename candidates and changed text from the selected snapshots with provenance for each side.
- [x] Missing baseline, excluded code, redacted lines, binary content and truncated files have explicit placeholders; never claim a complete diff.
- [x] Large diffs are paginated/bounded and safe filenames including spaces and Unicode display correctly.
- [x] Baseline dirty changes remain distinguishable from changes observed between session snapshots.

## Test plan

Golden diff tests cover create/delete/rename, newline-only, Unicode, redaction and partial sides; browser test follows an evidence link from a changed file.

## Privacy/security considerations

Render inert code, keep path access project-scoped and never resolve arbitrary artifact paths from browser input.

## Relative size

M

Implementation: `feat/captured-diffs`. See [captured review behavior](../captured-changes.md). Validation: 65 unit/integration checks, nine browser flows, typecheck, lint and production build. Live Claude integration remains outside this issue.
