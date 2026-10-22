# 016: Reconcile overlapping sources without counting activity twice

Status: published as [GitHub #17](https://github.com/ICEQ-JO/quoli/issues/17); this file is the local reference. Milestone: M4. Implemented on `feat/reconciliation`; see [source reconciliation](../source-reconciliation.md).

## User value

A developer can trust totals while inspecting corroborating or conflicting evidence.

## Scope

Implement cross-source joins and canonical projections using the matrix rules. Keep hook/OTel observations separate, choose displayed fields with stated precedence and show source-specific/ambiguous totals when identity is insufficient.

## Non-goals

No text-similarity deduplication, timestamp-only factual joins or destructive history merging.

## Dependencies

[015](015-local-telemetry.md)

## Acceptance criteria

- [x] Matching tool/session IDs yield one logical tool with both evidence sources; retry receipts do not hide corroboration.
- [x] Request usage totals never add counters/status samples or duplicated request observations.
- [x] Missing/conflicting identifiers produce visible ambiguity and combined totals of null when overlap is unresolved.
- [x] Late evidence and producer restarts recompute versioned views deterministically; raw accepted history remains unchanged.

## Test plan

Golden overlap fixtures include hook plus OTel, duplicate retries, conflicting values, process-sequence reset, resumed sessions, missing request IDs and out-of-order arrival.

## Privacy/security considerations

Join only inside a project boundary; no content-based secret hashes and no collection of extra raw text to improve matching.

## Relative size

M
