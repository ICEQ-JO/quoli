# 018: Guide local setup and reversible Claude connection

Status: published as [GitHub #19](https://github.com/ICEQ-JO/quoli/issues/19); this file is the local reference. Milestone: M5. Implemented on `feat/local-setup`; see the [local setup guide](../local-setup.md).

## User value

A developer can install, understand, enable and remove the integration without losing existing configuration.

## Scope

Build CLI/dashboard onboarding for root registration, credential creation, capture-policy preview and capability checks. Show a precise project-local configuration diff for hooks and telemetry, then apply only after user confirmation. Add disable/uninstall and troubleshooting.

## Non-goals

No cloud signup, background daemon installation, forced exporter replacement or support beyond the verified matrix.

## Dependencies

[017](017-live-snapshot-linking.md)

## Acceptance criteria

- [x] Fresh setup reaches a fixture demo first, then an optional explicitly enabled live connection with documented required Claude access.
- [x] Configuration merge preserves unrelated hooks, status line and exporters; conflicting managed policy stops with instructions.
- [x] Disable stops new capture; uninstall removes only Traceframe-owned entries and revokes credentials without erasing user configuration.
- [x] Offline, missing Claude/Git, incompatible version, permissions and port-conflict states have actionable diagnostics.

## Test plan

Use configuration fixtures with preexisting hooks/exporters and concurrent edits; test repeated enable/disable/uninstall and fresh supported-platform setup.

## Privacy/security considerations

Never commit credentials or transmit session data. Preview is sanitized, backups are protected if required, and changes need explicit local user action.

## Relative size

M
