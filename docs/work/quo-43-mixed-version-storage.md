# QUO-43 — mixed-version evidence storage

QUO-43 advances P2/P3 and the data-controls gate by making stored event version
explicit without rewriting append-only evidence bodies.

## Delivered

- Migration 005 adds a checked `events.schema_version` column and index, then derives it
  from each retained event body inside the migration transaction.
- Existing v1 JSON bodies, receipt sequence, delivery identity and provenance are
  read through the shared versioned event union unchanged.
- New v2 events store version metadata alongside their original serialized body.
- Migrations now run only once per recorded version. A failed migration rolls back
  its schema changes and leaves the database available for recovery.

## Recovery boundary

If migration 005 fails, the store does not open and writes are blocked. Correct
the local database problem or restore the local database backup, then reopen the
store. Quoli does not rewrite retained event bodies to repair an invalid record.

## Validation

On 2026-10-23, `pnpm lint` passed with three existing warnings, `pnpm typecheck`
passed, and `pnpm test` reported 154 passing tests with four release-only skips.
The dedicated upgrade test creates a v1-shaped database, injects a migration
failure, verifies the unchanged v1 body, completes the recovery, and then appends
and reads v2 evidence.
