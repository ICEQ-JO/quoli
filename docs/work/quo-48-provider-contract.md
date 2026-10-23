# QUO-48 — bounded repository-provider contract

QUO-48 advances P1 by adding a provider-neutral read contract alongside the existing safe local repository capture.

## Delivered

- Strict repository identity and exact revision selection for refs, commits, and pull requests.
- Tree, blob, and comparison responses carry the requested and resolved revision plus an explicit `available`, `missing`, `denied`, `truncated`, `stale`, `rate_limited`, or `unavailable` state.
- The provider wrapper validates responses and rejects results that exceed the caller's entry or byte caps.

## Validation

On 2026-10-23, `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed. The suite reported 145 passing tests and 4 release-only skips. The synthetic provider test covers exact revision retention, truncated/missing/stale states, a rate-limit retry delay, invalid selection rejection, and entry and byte-cap response rejection.

## Limit

No provider credentials, network requests, remote implementation, full-repository download, or repository-script execution were added. This stacked change depends on QUO-42's compatible v2 contract.
