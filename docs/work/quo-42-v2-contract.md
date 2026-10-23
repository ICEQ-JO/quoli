# QUO-42 — v2 evidence contract validation

QUO-42 advances P2 and P3 by adding a strict v2 event envelope while retaining the immutable v1 contract.

## Delivered

- V2 records independent source and adapter versions, an open raw tool name with a normalized category, explicit turn and parent/child identities, field capabilities, and observed plan/decision/approval/correction fields.
- Content-bearing declarations use the existing content state and policy sanitization path. A fail-closed retry marks them unavailable.
- V1 fixtures, producers, stored records, and bare retry-spool entries remain accepted. V2 entries use the same bounded storage and retry validation path.

## Validation

On 2026-10-23, `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed. The suite reported 136 passing tests and 4 release-only skips. The new schema test covers v1 compatibility, unknown raw tools, null/disabled/unsupported capability states, malformed identities, privacy sanitization, fail-closed withholding, and SQLite round-trip storage.

## Limit

No live adapter emits v2 observations in this increment. QUO-44 owns adapter registration and conformance fixtures; existing Claude, OTLP, repository, and synthetic producers remain v1.
