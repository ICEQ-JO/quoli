# 019: Validate the full local pilot against evidence and privacy guarantees

Status: published as [GitHub #20](https://github.com/ICEQ-JO/quoli/issues/20); this file is the local reference. Milestone: M5. Implemented on `feat/pilot-release`; see the [pilot checklist](../pilot-release.md).

## User value

A developer gets a reproducible MVP whose limitations match what it actually captures.

## Scope

Add a release checklist, supported-platform smoke automation, fixture-only end-to-end script and authorized disposable live walkthrough. Publish local documentation for coverage, privacy, retention, restore-from-backup limits and known integration gaps.

## Non-goals

No GitHub publication, deployment, analytics upload, billing or success claims derived from productivity scoring.

## Dependencies

[018](018-local-setup.md)

## Acceptance criteria

- [x] Clean setup demonstrates prompt/tool/usage/file/diff/map/evidence/uncertainty flows and deletion with no paid API in fixture mode.
- [x] Supported live mode passes documented-version checks; missing evidence remains visible and no correctness/complete-capture claims appear.
- [x] Hostile captured HTML/instructions/paths, CSRF/Host abuse, credential rotation, redaction and deletion races pass targeted checks.
- [x] A deterministic bounded 10,000-event fixture paginates without loading all records; map caps hold and baseline timing/memory results are recorded.
- [x] Document the pilot review script and unresolved limitations; no external release happens automatically.

## Test plan

Run schema/storage/adapter/rule tests, supported-platform smoke and browser E2E; inspect network egress and all local data/log sinks with synthetic canaries, then perform the approved live walkthrough.

## Privacy/security considerations

Use only synthetic artifacts in commits; inspect dependencies/build for outbound reporters. Do not upload a real debugging bundle to validate the pilot.

## Relative size

M
