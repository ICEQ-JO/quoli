# QUO-50 validation record — bounded GitHub reads and remote review

Date: 2026-10-25. Local Linux validation only; no live GitHub account, API token or private repository was used.

## Implemented

- `packages/repository/src/github-provider.ts`: pull-request, ref, tree, blob and comparison reads with commit identity, caller limits, pagination and explicit failure states.
- `packages/repository/src/github-cache.ts`: sanitized, commit-keyed local cache with scoped clearing.
- `apps/cli/src/github.ts`: `quoli github review OWNER/REPO --pull N [--path FILE] [--capture-code]`, plus cache clearing on disconnect.
- `tests/github-provider.test.ts`: 15 tests against a local recorded-shape fake GitHub API.

## Verified

- Tree reads: ref resolution through `/commits/{ref}`, entry capping with `truncated`/`omitted`, GitHub's own `truncated` flag, and rate-limit/denial/missing mapping.
- Blob reads: base64 decoding, secret redaction (the fixture token became `[REDACTED]`), binary (`unsupported`) and malformed UTF-8 (`malformed`) content, excluded `.env` path never requested or cached, oversized content not persisted, policy re-applied on a cache hit (code disabled without consent).
- Cache: second read of the same path/repository/commit made no content request; a different commit produced a different entry; repository-scoped clear left another repository's entry; full clear removed the remaining entries and left an unreadable file alone until full clear.
- Comparison: two-page `Link` pagination produced four changed paths including a rename's previous path; capping produced `truncated` with an omitted count; rate limit produced `rate_limited` with an empty path list.
- Pull request: base/head commits resolved from the documented response; a revoked token raised the shared `GithubError` instead of a read state.
- CLI review: local fake provider + temporary data directory listed the PR, changed paths and a sanitized file (`redacted`), never printed the fixture credential, wrote cache entries, and `disconnect` cleared the credential and the cache. Without a connection the command made no GitHub request.
- `pnpm typecheck` passed; `pnpm lint` has no new errors (pre-existing warnings only).

Commands run:

```sh
node --import tsx --test tests/github-provider.test.ts
node --import tsx --test tests/github-connection.test.ts
pnpm typecheck
pnpm lint
```

## Not verified

- Live GitHub API responses, pagination beyond the fixture shape, secondary rate limits and GitHub Enterprise Server.
- GitHub's 300-file comparison cap with a real large diff; the omitted count beyond that cap is a lower bound.
- Web integration of remote diffs into the existing **File changes** review. UI-facing increments are held behind the D01 design reset ([QUO-82](https://linear.app/quolii/issue/QUO-82)); the delivered review surface is the CLI.
- Project-deletion wiring for repository-scoped cache clearing; `clearRepository` is implemented and tested but no remote repository is registered as a project yet.
- macOS keychain/platform support (QUO-66).

All fake providers and temporary cache directories were removed after validation; no credential or private repository content was used.
