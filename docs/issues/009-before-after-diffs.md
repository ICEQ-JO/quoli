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

- [ ] Display additions/deletions, observed renames and changed text from the selected snapshots with provenance for each side.
- [ ] Missing baseline, excluded code, redacted lines, binary content and truncated files have explicit placeholders; never claim a complete diff.
- [ ] Large diffs are paginated/bounded and safe filenames including spaces and Unicode display correctly.
- [ ] Baseline dirty changes remain distinguishable from changes observed between session snapshots.

## Test plan

Golden diff tests cover create/delete/rename, newline-only, Unicode, redaction and partial sides; browser test follows an evidence link from a changed file.

## Privacy/security considerations

Render inert code, keep path access project-scoped and never resolve arbitrary artifact paths from browser input.

## Relative size

M
