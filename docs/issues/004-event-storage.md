# 004: Persist and replay a sanitized session without mutating history

Status: published as [GitHub #5](https://github.com/ICEQ-JO/quoli/issues/5); this file is the local reference. Milestone: M1.

## User value

Recorded evidence survives restart and derived views can be rebuilt.

## Scope

Create SQLite migrations, transactional append APIs, artifact metadata, source receipts/cursors, project-scoped keys and paginated queries. Add a replay command for sanitized synthetic observations and migration metadata.

## Non-goals

No live agent transport, full dashboard or general-purpose event bus.

## Dependencies

[003](003-privacy-pipeline.md)

## Acceptance criteria

- [ ] Replaying a stable source delivery ID twice creates one observation; different observations with identical text remain distinct.
- [ ] Normal APIs cannot update/delete accepted events; corrections append and projections are rebuildable.
- [ ] Migration failure is atomic; restart retains event order and evidence/artifact references.
- [ ] Artifacts are owner-only, project-scoped and sanitized; interrupted writes leave no reachable partial artifact and recover or clean orphans.

## Test plan

Integration tests cover migrations on empty/existing stores, rollback, crash/restart, duplicate delivery, cross-project isolation and artifact commit interruption.

## Privacy/security considerations

Use parameterized SQL, restrictive data-directory permissions and sanitized diagnostics. Reserve privileged purge for the lifecycle issue.

## Relative size

M

## Implementation checkpoint

Core SQLite persistence, receipts, paginated queries, atomic artifact values and rollback/restart tests are implemented. File-ingestion cursors and a separate artifact filesystem/recovery protocol remain deferred until adapter/snapshot work; this issue stays open for scope reconciliation.
