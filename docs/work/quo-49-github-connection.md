# QUO-49 validation record — read-only GitHub connection

Date: 2026-10-24. Local Linux validation only; no live GitHub App, account or paid API was used.

## Implemented

- `packages/repository/src/github.ts`: device-flow client, token refresh, account and installation checks, read-only enforcement, connection record parsing, status states.
- `packages/storage/src/keychain.ts`: Linux Secret Service keychain through `secret-tool`, with fail-closed errors.
- `apps/cli/src/github.ts`: `quoli github connect|status|disconnect` and its output.
- `tests/github-connection.test.ts`: 16 tests against a local HTTP fake provider, an in-memory credential store and the real Secret Service.

## Verified

- `node --import tsx --test tests/github-connection.test.ts`: 16 pass, 0 fail. Cases: successful connect (account, installations, permissions, repository selection, no token in output or request URLs), `authorization_pending` and `slow_down` polling, denied authorization, expired device code and expired refresh token, unavailable keychain (no device-code request is made), non-read installation permission refused, refresh, revoked token detected and cleared, unreachable GitHub reported unverified, disconnect, unknown options, and a real keychain store/read/clear roundtrip.
- Real Linux Secret Service roundtrip with a temporary service name (`quoli-test`), then cleared.
- CLI smoke on Node 24.16.0 against a local fake provider listening on `127.0.0.1`: `connect` stored the credential in the real keychain and printed `local-user`, `contents=read, metadata=read` and `local-org (selected repositories)`; `status` rechecked it; `disconnect` cleared it; a following `status` reported not connected. No token appeared in any output.
- Fail-closed check: with `DBUS_SESSION_BUS_ADDRESS` empty, `quoli github status` printed `Secure credential storage is unavailable; no credential was stored or read.` and exited 1.
- `pnpm typecheck` passed; `pnpm lint` has no new errors (pre-existing warnings remain).

## Not verified

- A live GitHub App authorization, real token exchange, refresh or revocation. This needs the owner's app registration and account; the documented contract and the exact response fields used were checked against GitHub's documentation only.
- Hosted/cloud scoped encrypted secret storage (no hosted service yet) and macOS/Windows keychains.
- Installation listing beyond the first page and per-repository names.
- Device-flow behavior on GitHub Enterprise Server.

Probe artifacts: the fake provider and any keychain test items were removed after validation; no credential or private session was stored.
