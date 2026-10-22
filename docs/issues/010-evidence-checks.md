# 010: Connect files and recorded checks without claiming correctness

Status: published as [GitHub #11](https://github.com/ICEQ-JO/quoli/issues/11); this file is the local reference. Milestone: M2. Implemented on `feat/evidence-checks`; see [verification evidence](../verification-evidence.md).

## User value

A developer can inspect why a file is linked to a session and which checks remain uncertain.

## Scope

Implement versioned rules for explicit prompt/tool IDs, tool path references, snapshot windows and command-result views. Add one narrow deterministic test-output parser for fixture format with graceful unsupported fallback. Produce template explanations and a verification-evidence panel.

## Non-goals

No hidden reasoning, automatic wasted-work labels, universal test parser or assertion that an exit-zero command proves a feature.

## Dependencies

[007](007-reported-usage.md), [009](009-before-after-diffs.md)

## Acceptance criteria

- [x] Every emitted relation includes basis, input IDs, rule version and uncertainty; temporal file/session links do not assert authorship.
- [x] Command observed/result observed/exit code/test counts are independent nullable facts with supporting evidence.
- [x] Concurrent edits, later changes after a check and missing baseline remain ambiguous or stale; no recorded check is not presented as no testing.
- [x] Rebuilding projections yields the same result without altering recorded observations.

## Test plan

Golden scenarios cover overlapping sessions, external user edits, exit zero with failed assertions in output, nonzero, unsupported output, missing result and post-check edits.

## Privacy/security considerations

Parse output as data only with bounded patterns; do not execute commands, follow links or treat captured instructions as analysis directives.

## Relative size

M
