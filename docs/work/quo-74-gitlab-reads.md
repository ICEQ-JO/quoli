# QUO-74 validation record — read-only GitLab observations

Date: 2026-10-25. Local Linux validation only; no live GitLab account, token or private project was used.

## Implemented

- `packages/repository/src/gitlab.ts`: personal-access-token connection, scope/expiry/revocation verification, keychain record, status and disconnect.
- `packages/repository/src/gitlab-provider.ts`: merge-request, ref, tree, blob and comparison reads with commit identity, caller limits, `X-Next-Page` pagination and explicit failure states.
- `packages/repository/src/remote-cache.ts`: provider-aware cache extracted from the GitHub increment; the identity now includes the provider so an `owner/repo` on GitHub and GitLab cannot collide.
- `apps/cli/src/gitlab.ts`: `quoli gitlab connect|status|disconnect|review`.
- `tests/gitlab.test.ts`: 19 tests against a local recorded-shape fake GitLab API.
- `packages/schema/src/privacy.ts`: redaction now covers GitLab `glpat-` tokens.

## Verified

- Connect: account and token self-inspection, a read_api token stored and read back, output never containing the token; refusal without storage for `api`, `read_repository` alone and `read_api` + `write_repository`; refusal for inactive, revoked and expired tokens; keychain failure before any network request; HTTPS requirement with loopback-only HTTP; expired/revoked status clears the record; unreachable GitLab leaves a connected-but-unverified record.
- Merge request: base/head resolved from `diff_refs`, source branch retained as the resolved ref.
- Tree: commit resolution through `/repository/commits/{ref}`, two-page `X-Next-Page` pagination, entry cap with `truncated`/`omitted`, and rate-limit/denial/missing states (retry delay 25 seconds from the fixture headers).
- Blob: raw content sanitized (the fixture `glpat-` token became `[REDACTED]`), binary (`unsupported`) and malformed UTF-8 (`malformed`) content, excluded `.env` never requested or cached, oversized content truncated and not persisted, cache hit without a second content request, commit-bound entries, policy re-applied on a cache hit.
- Comparison: rename paths included on both sides, entry cap with `omitted`, `compare_timeout` reported as `truncated`, rate limit as `rate_limited` with a retry delay.
- Cache: GitHub and GitLab entries for the same repository name are independent; repository-scoped clear removes only the requested provider/repository.
- CLI review: local fake provider resolved MR !7, listed three paths (including the rename), opened a sanitized file, wrote one cache entry, printed no token, and `disconnect` cleared the credential and the cache. Without a connection it made no request.
- Real CLI smoke on Node 24.16.0 with the real Secret Service keychain and a local fake GitLab: connect → status → review (3 paths, redacted content, 1 cache entry) → disconnect (0 entries) → status disconnected. No token appeared in the output.
- `pnpm typecheck` passed; `pnpm lint` has no new errors (pre-existing warnings only); esbuild bundles the CLI.
- Full `pnpm test`: 274 pass / 5 skipped / 7 fail; the same seven release-signing and update tests fail on `main`.

Commands run:

```sh
node --import tsx --test tests/gitlab.test.ts
node --import tsx --test tests/github-provider.test.ts tests/github-connection.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

## Not verified

- Live GitLab.com or a self-managed instance; only recorded-shape responses and a local fake API were used.
- GitLab's granular token scopes: refused rather than mapped to read-only, so a granular read token cannot connect yet.
- Large real comparisons and real `compare_timeout` behaviour; the omitted count beyond GitLab's own limits is a lower bound.
- Web integration of remote merge-request diffs into the existing **File changes** review. UI-facing increments are held behind the D01 design reset ([QUO-82](https://linear.app/quolii/issue/QUO-82)); the delivered review surface is the CLI.
- macOS/Windows keychains (QUO-66) and hosted/tenant-scoped secret storage.

All fake servers, tokens and temporary cache directories were removed after validation; the stored keychain item was cleared by the smoke-test disconnect.
