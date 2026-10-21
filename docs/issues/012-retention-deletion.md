# 012: Control capture and delete a project completely from Traceframe

Status: published as [GitHub #13](https://github.com/ICEQ-JO/quoli/issues/13); this file is the local reference. Milestone: M3.

## User value

A developer can limit retained content, pause collection and remove local project evidence.

## Scope

Add settings and CLI for policy preview/update, capture pause, retention and storage usage. Implement project purge with producer fencing, credential epochs, pending-spool cleanup, artifacts/cursors/projections/cache removal and interrupted-job recovery.

## Non-goals

No promise of secure physical erasure, deletion of Claude-owned originals or automatic control of external backups.

## Dependencies

[011](011-bounded-change-map.md)

## Acceptance criteria

- [ ] Policy changes apply before new persistence, including already queued sanitized data rechecked under current policy; historical data is retained or explicitly purged as selected.
- [ ] Retention removes expired data and invalidates dependent evidence without dangling factual claims.
- [ ] Deletion blocks stale producers and in-flight retries, clears project data and WAL recoverably, and remains idempotent after interruption.
- [ ] UI states clearly what is removed, what source files/backups remain outside Traceframe and when storage/capture is stopped.

## Test plan

Integration tests race deletion with ingestion/retry, simulate crash at purge phases, expire evidence with shared references and inspect database/WAL/artifact/spool/cache locations.

## Privacy/security considerations

Treat deletion as the explicit append-only exception. Sensitive policy changes and purge require protected local control routes; never log removed content.

## Relative size

M
