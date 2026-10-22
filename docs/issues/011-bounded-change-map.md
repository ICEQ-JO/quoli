# 011: Explore a bounded map that opens diffs and check evidence

Status: published as [GitHub #12](https://github.com/ICEQ-JO/quoli/issues/12); this file is the local reference. Milestone: M2. Implemented on `feat/change-map`; see [change map](../change-map.md).

## User value

A developer can navigate what changed and see the evidence behind each connection.

## Scope

Generate a deterministic session/file/command graph, display an interactive viewer and accessible list, filters, evidence inspector, bounded expansion and diff/check drill-down. Reuse schema/evidence contracts.

## Non-goals

No custom diagram language, repository-wide call graph, symbol-level dependency promises or runtime behavior analysis.

## Dependencies

[010](010-evidence-checks.md)

## Acceptance criteria

- [x] Default view caps are 100 nodes/200 edges; omitted counts and bounded expansion are explicit.
- [x] Every edge opens its basis, rule and evidence; inferred edges if present are distinct and excluded from factual totals.
- [x] Selecting a file opens the captured diff; selecting a check opens its result and uncertainty.
- [x] Deterministic ordering, stable IDs and an equivalent keyboard/list workflow work for unsupported code languages.

## Test plan

Test projection determinism, dangling/missing evidence, cap boundaries and large synthetic sessions; browser-check file/check navigation and keyboard access.

## Privacy/security considerations

Graph labels are escaped and project-scoped; no remote renderer or embedded captured HTML.

## Relative size

M
