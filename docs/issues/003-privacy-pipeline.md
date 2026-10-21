# 003: Preview capture policies and sanitize before any persistence

Status: published as [GitHub #4](https://github.com/ICEQ-JO/quoli/issues/4); this file is the local reference. Milestone: M1.

## User value

A developer sees what Traceframe would retain before enabling content capture.

## Scope

Implement a reusable in-memory classifier/filter/redactor/limiter and a synthetic preview command. Add metadata-only defaults, separate prompt/tool/code controls, nested-content handling, path exclusions and explicit omission states. Set configurable limits from architecture.

## Non-goals

No guarantee of perfect secret removal, live hooks, remote redaction or raw debug archives.

## Dependencies

[002](002-event-contracts.md)

## Acceptance criteria

- [x] The same pipeline is usable by bridge, receiver, repository capture and fixtures; no raw payload reaches logs, errors, spool or artifacts.
- [x] Disabled code is removed even inside tool input/output; overlapping categories use the stricter policy.
- [x] Preview shows sanitized values, policy version, redaction/truncation markers and byte counts where known.
- [x] Oversized structures fail safely; redaction precedes allowed-content truncation and uses bounded processing.

## Test plan

Use synthetic fake-secret canaries in nested objects, filenames, multiline output and boundary cases; inspect every persistence/log sink and policy combinations.

## Privacy/security considerations

Never use real credentials in tests. Restrict policy configuration and explain that redaction only reduces risk.

## Relative size

M

## Implementation checkpoint

Implemented conservative in-memory content controls, redaction, truncation, exclusions and synthetic preview. Opaque prompts require prompt + code consent; tool content requires tool + code consent.
