# 014: Collect documented Claude Code hooks through a passive bridge

Status: published as [GitHub #15](https://github.com/ICEQ-JO/quoli/issues/15); this file is the local reference. Milestone: M4.

## User value

A developer can see available live session activity without the observer changing the coding task.

## Scope

Implement only verified command-hook payloads for prompt/tool/lifecycle observations and a sanitized bounded retry spool with stable delivery IDs. Provide configuration snippets for disposable manual testing and a compatibility warning.

## Non-goals

No general installer, transcript parsing, permissions decisions, model context injection or command replay.

## Dependencies

[013](013-integration-verification.md)

## Acceptance criteria

- [ ] Verified fixture payloads normalize with provenance; unknown optional fields are ignored safely and unsupported values stay null.
- [ ] Bridge emits no decisions or context, preserves normal hook behavior, has bounded latency and fails open with visible capture-loss health.
- [ ] Retry IDs survive collector outages; raw content is redacted before spool and current policy is rechecked on delivery.
- [ ] Missing start/end, denied or interrupted tool observations, parallel calls and subagent scope limitations are visible.

## Test plan

Adapter contract tests use sanitized observed shapes; fault-inject collector outage, full spool, malformed input, process restart and timeout; manually observe a disposable session after authorization.

## Privacy/security considerations

Do not log inherited environment or modify existing hooks. Restrict spool permissions and keep credentials out of hook command arguments/configuration text.

## Relative size

M
