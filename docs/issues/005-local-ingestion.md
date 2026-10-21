# 005: Accept authenticated bounded batches on loopback

Status: published as [GitHub #6](https://github.com/ICEQ-JO/quoli/issues/6); this file is the local reference. Milestone: M1.

## User value

A local client can submit evidence safely and recover from temporary collector outages.

## Scope

Expose a versioned ingestion endpoint and authenticated read primitives; generate/rotate a local credential, enforce body/rate/batch limits, run receiver-side policy validation and acknowledge only durable transactions. Define sanitized retry-spool and overload contracts.

## Non-goals

No public bind mode, installed daemon, distributed queue or Claude settings changes.

## Dependencies

[004](004-event-storage.md)

## Acceptance criteria

- [ ] Unauthenticated, stale-credential and wrong-project batches are rejected without exposing payloads.
- [ ] Default binding is loopback; unexpected Host/Origin and cross-site requests are rejected and CORS is restrictive.
- [ ] Clients can retry after lost acknowledgments without duplicate observations; invalid batches have deterministic atomic rejection behavior.
- [ ] Storage-full, queue-full and unsupported-version states expose metadata-only health/gap counters.

## Test plan

HTTP/storage tests cover valid import, replay after lost acknowledgment, credential rotation, cross-origin/Host abuse, request limits, disk errors and restart.

## Privacy/security considerations

Keep tokens out of URLs/browser bundles/logs. Raw requests cannot be spooled; verify redaction on rejection paths.

## Relative size

M

## Implementation checkpoint

Authenticated bounded loopback ingestion, rotation, origin checks and storage/rejection health are implemented. A durable producer spool and fuller overload/gap protocol remain for live-adapter work; this issue stays open for scope reconciliation.
