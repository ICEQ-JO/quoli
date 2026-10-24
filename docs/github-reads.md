# Bounded GitHub reads and remote review

Status: local implementation of [QUO-50](https://linear.app/quolii/issue/QUO-50/v14-observe-github-refs-trees-blobs-and-comparisons-locally), using the credential from [QUO-49](https://linear.app/quolii/issue/QUO-49/v13-connect-github-with-least-privilege-repository-credentials). Read-only; no branch, file or comment is ever written.

## What is implemented

`quoli github review OWNER/REPO --pull NUMBER` resolves the pull request, reads a bounded comparison, lists changed paths and can open one changed file:

```sh
quoli github review acme/app --pull 12
quoli github review acme/app --pull 12 --path src/app.ts --capture-code
```

Options: `--path FILE` opens one file, `--capture-code` allows sanitized code text (without it, content is reported as `disabled`), `--max-entries N` (1–1000, default 200) and `--max-bytes N` (1–1048576, default 262144).

The underlying module is `packages/repository/src/github-provider.ts`. It implements the provider contract in `packages/repository/src/provider.ts` (described in [repository capture](repository-capture.md)) against GitHub's documented REST endpoints:

| Read | Endpoint | Resolved identity |
| --- | --- | --- |
| Pull request | `GET /repos/{owner}/{repo}/pulls/{number}` | base and head commits |
| Ref | `GET /repos/{owner}/{repo}/commits/{ref}` | commit SHA |
| Tree | `GET /repos/{owner}/{repo}/git/trees/{commit}?recursive=1` | files, directories and submodules |
| Blob | `GET /repos/{owner}/{repo}/contents/{path}?ref={commit}` | sanitized file content |
| Comparison | `GET /repos/{owner}/{repo}/compare/{base}...{head}?per_page=100&page=N` | changed paths |

Requests send the token in the `Authorization` header only, accept GitHub's JSON media type, follow `Link: rel="next"` pagination, and stop at the caller's entry/byte limits. A missing commit, file or pull request, a permission denial, a rate limit (including `Retry-After` or `X-RateLimit-Reset`) and an unreachable GitHub are explicit read states. A `401` means the credential is revoked and is surfaced as an error rather than a partial read.

## Sanitized local cache

`packages/repository/src/remote-cache.ts` stores one JSON entry per provider, repository, resolved commit and path under `<data dir>/github-cache/` (private directory `0700`, files `0600`, atomic rename). Each entry records its identity, sanitized content and fetch time. GitLab uses the same cache module with a `gitlab` provider identity and its own directory. The cache key is the commit, not the requested branch, so a moved ref cannot serve stale content.

- Content is sanitized by the capture policy before it is written. Excluded paths (the default policy excludes `.env`, `.git`, `node_modules`, `credentials`, `secrets`) are never requested or cached.
- Reading a cached entry re-applies the current policy, so opening the same file later without `--capture-code` cannot return cached code.
- `quoli github disconnect` removes all cached entries with the credential. `clearRepository(provider, owner/name)` removes one repository's entries for project deletion or a future repository-scoped cleanup.
- Oversized and binary content is never persisted.

## Limits

- The GitHub contents API returns file bytes in the JSON response; the byte limit is applied before decoding and persistence, not before transfer. Files above the limit are reported `truncated` without content.
- GitHub caps a comparison's file list (currently 300 files). When that cap or our own entry cap is reached, the result is `truncated` with a known omitted count; beyond GitHub's own cap the omitted count is a lower bound.
- Only one file is opened per command (`--path`); there is no combined diff, syntax view, inline comment or check read.
- The web **File changes** review still renders local snapshot pairs only. Remote review integration is CLI-first while the D01 design reset ([QUO-82](https://linear.app/quolii/issue/QUO-82)) holds UI-facing increments; that is remaining scope, not a delivered web view.
- Paths are printed through the shared redaction filter; cached identity uses the repository-relative path.
- GitHub Enterprise Server was not verified. GitLab and Bitbucket remain out of scope.

## Privacy

Reads are local and read-only. No remote content is uploaded, no write endpoint is called, and no captured text is treated as instructions. The cache is local evidence, not a synchronization source; [capture consent](lifecycle-controls.md) and cloud upload consent remain separate.
