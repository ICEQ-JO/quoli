# QUO-75 validation record — read-only Bitbucket Cloud observations

Date: 2026-10-26. Local Linux validation only; no live Bitbucket workspace, API token or private repository was used.

## Implemented

- `packages/repository/src/bitbucket.ts`: Atlassian API-token connection (HTTP Basic `email:token`), `/user` verification, keychain record, status and disconnect.
- `packages/repository/src/bitbucket-provider.ts`: pull-request, branch-ref, tree, blob-metadata/content and diffstat reads with commit identity, origin-restricted `next` pagination, caller limits and explicit failure states.
- `apps/cli/src/bitbucket.ts`: `quoli bitbucket connect --email EMAIL|status|disconnect|review`.
- `apps/cli/src/index.ts`: command routing, help and argument guard.
- `tests/bitbucket.test.ts`: 18 tests against a local recorded-shape fake Bitbucket Cloud API 2.0.

## Verified

- Connect: `/user` with Basic auth, email and token stored together, output never containing the token; invalid email and short token refused with no request; keychain failure before any network request; HTTPS requirement with loopback-only HTTP; rejected token cleared by `status`; unreachable Bitbucket kept as connected but unverified.
- Pull request: base/head resolved from destination/source commit hashes, source branch retained as the resolved ref, title/state/draft retained.
- Tree: branch-ref resolution through `/refs/branches/{name}`, two-page `next` pagination, directory/file mapping, entry cap with `truncated`/`omitted`; rate limit (`Retry-After: 25`), denial and missing-ref states; a rejected token is an error rather than a partial read.
- Blob: text content sanitized (the fixture `glpat-` token became `[REDACTED]`); directory, link, submodule and binary metadata reported as `unsupported` without a content request; malformed UTF-8 as `malformed`; missing file as `missing`; excluded `.env` never requested or cached; oversized metadata truncates before the content request and is not cached; cache hit avoids both metadata and content requests; entries are commit-bound; a cache read without code consent returns `disabled`.
- Comparison: pull-request diffstat (merge-base aware) and explicit range diffstat, two-page pagination, rename paths on both sides, entry cap with `omitted`, rate limit as `rate_limited` with a retry delay.
- Cache: Bitbucket and GitLab entries for the same repository name are independent; repository-scoped clear removes only the requested provider/repository.
- CLI review: in-process CLI with a fake API and memory keychain resolved pull request #7, listed three paths (including the rename), opened a sanitized file, wrote one cache entry, printed no token, and `disconnect` cleared the credential and cache. Without a connection it made no request.
- `pnpm typecheck` passed; `pnpm lint` has no errors (17 pre-existing warnings); esbuild bundles the CLI.
- Full `pnpm test`: 292 pass / 5 skipped / 7 fail; the same seven release-signing and update tests fail on `main`.

Commands run:

```sh
node --import tsx --test tests/bitbucket.test.ts
node --import tsx --test tests/gitlab.test.ts tests/github-provider.test.ts tests/github-connection.test.ts
pnpm typecheck
pnpm lint
pnpm test
```

## Not verified

- Live Bitbucket Cloud: all responses come from the published API 2.0 contract and a local fake.
- API-token scope and expiry behaviour. Bitbucket does not expose either through the API, so Quoli cannot prove a token is read-only or show its expiry. The connector documents the three read scopes, implements only GET requests and reports `denied` when a read scope is missing. Use a dedicated token and recreate it before expiry.
- Large diffstats, Bitbucket's `555` timeout response and multi-page tree listings at real scale. At the page or entry cap the read is `truncated`, and omitted counts are a lower bound.
- Tree paths deeper than ten levels (fixed `max_depth=10`) and non-branch refs (tags are not resolved).
- Bitbucket Data Center (out of scope), macOS/Windows keychains (QUO-66) and hosted/tenant-scoped secret storage.
- A real keychain smoke test was not run for Bitbucket: the CLI targets the fixed Bitbucket Cloud API, and no live token was used. The keychain path is exercised by the existing Linux Secret Service tests for GitHub/GitLab, and the Bitbucket CLI is covered in-process with an injected store and fake API.

All fake servers, tokens and temporary cache directories were removed after validation; no keychain item was created for this increment.
