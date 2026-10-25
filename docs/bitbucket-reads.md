# Read-only Bitbucket Cloud access

Status: local implementation of [QUO-75](https://linear.app/quolii/issue/QUO-75/v39-add-bitbucket-read-only-repository-observations). Read-only; no branch, file, pull request or comment is written.

## Scope

- **Edition:** Bitbucket Cloud only, REST API **2.0** (`https://api.bitbucket.org/2.0`). Bitbucket Data Center is out of scope and its `/rest/api/1.0` contract is not implemented.
- **Credential:** an Atlassian **API token** with privilege scopes `read:user:bitbucket`, `read:repository:bitbucket` and `read:pullrequest:bitbucket`. App passwords are deprecated by Atlassian and are not accepted or documented here.

## Connect

Create an API token at **id.atlassian.com → Security → API tokens** with only the three read scopes above, then:

```sh
quoli bitbucket connect --email you@example.com
# paste the API token, then press Ctrl-D

quoli bitbucket status
quoli bitbucket disconnect
```

Connect uses HTTP Basic (`email:token`) against `GET /2.0/user` before storing anything. The email is needed for every request and is kept with the token in one Linux Secret Service item (`service quoli`, `account bitbucket`). A missing or refused keychain fails closed before the network request; there is no plaintext fallback.

The API token is read from stdin, never from argv or a URL. `status` verifies the stored token against `/user`; a `401` clears it and reports a rejected token (expired, revoked and invalid are indistinguishable in this API). `disconnect` removes the credential and cached Bitbucket review files. Revoke the token in Atlassian settings when intended.

### What cannot be verified

Bitbucket does not expose API-token scopes or expiry through the API, and a token cannot be inspected after creation. Quoli therefore cannot prove that a token lacks write scopes or show when it expires. It mitigates this by:

- documenting the exact read scopes and refusing to run without an account read;
- issuing **only GET** requests, with no write endpoint implemented or reachable from this module;
- storing the credential only in the OS keychain;
- reporting `denied` when the token lacks a repository or pull-request read scope.

Use a dedicated token with only the three read scopes and recreate it before its maximum one-year expiry.

## Review

```sh
quoli bitbucket review WORKSPACE/REPOSITORY --pull-request 12
quoli bitbucket review WORKSPACE/REPOSITORY --pull-request 12 --path src/app.ts --capture-code
```

Options: `--path FILE`, `--capture-code` (sanitized code text; without it content is `disabled`), `--max-entries N` (1–1000, default 200) and `--max-bytes N` (1–1048576, default 262144).

The provider in `packages/repository/src/bitbucket-provider.ts` implements the same contract as the GitHub and GitLab readers:

| Read | Endpoint | Resolved identity |
| --- | --- | --- |
| Pull request | `GET /repositories/{workspace}/{repo}/pullrequests/{id}` | `destination.commit.hash` and `source.commit.hash` |
| Branch ref | `GET /repositories/{workspace}/{repo}/refs/branches/{name}` | `target.hash` |
| Tree | `GET /repositories/{workspace}/{repo}/src/{commit}/?max_depth=10&pagelen=100` | files, directories and submodules |
| Blob metadata | `GET /repositories/{workspace}/{repo}/src/{commit}/{path}?format=meta` | type, size, attributes |
| Blob content | `GET /repositories/{workspace}/{repo}/src/{commit}/{path}` | sanitized bytes |
| Pull request comparison | `GET /repositories/{workspace}/{repo}/pullrequests/{id}/diffstat` | changed paths, both sides of a rename, merge-base aware |
| Explicit comparison | `GET /repositories/{workspace}/{repo}/diffstat/{base}..{head}` | changed paths for a commit range |

Review uses the pull request's own diffstat, which is merge-base aware and works for fork sources; an explicit base/head comparison uses the commit-range diffstat. Pagination follows the API's opaque `next` link, restricted to the configured API origin, for at most 10 pages. Missing refs/files, denial, rate limits (`Retry-After`) and an unreachable Bitbucket become explicit states. A `401` is a rejected token and an error, not a partial read.

## Content and privacy

- Excluded paths (default: `.env`, `.git`, `node_modules`, `credentials`, `secrets`) are never requested or cached.
- Metadata is read before content, so directories, links, submodules, binary files and Git LFS pointers are reported as `unsupported` without downloading file bytes.
- Content is sanitized by the capture policy before display and caching, and a cache read re-applies the current policy so cached code cannot bypass a later `--capture-code` withdrawal.
- Oversized files are truncated by metadata size when available and again by `Content-Length`/byte count, and are not cached.
- Cache entries are keyed by provider, repository, resolved commit and path under `<data dir>/bitbucket-cache/` (private `0700`, files `0600`, atomic rename), shared with the GitHub and GitLab readers. A moved ref or a same-named repository on another provider cannot serve stale content.
- Reads are local and read-only. Nothing is uploaded and no captured text is treated as instructions.

## Limits

- The tree uses a fixed `max_depth=10`; paths deeper than ten levels are not listed. A directory listing that Bitbucket rejects as too large becomes an explicit failure, not a partial success.
- `requestedRef` resolves **branch names only**. Tags and arbitrary refs are not resolved; use a full commit SHA or a pull request.
- Bitbucket's diffstat may itself be paginated or incomplete for very large ranges; at the 10-page or entry cap the read is `truncated`, and the omitted count is a lower bound.
- Only one file is opened per command; there is no combined diff, comment, pipeline, status or approval read.
- The web **File changes** view still renders local snapshot pairs only. UI-facing remote-review work remains held by the D01 design reset ([QUO-82](https://linear.app/quolii/issue/QUO-82)); the delivered surface is the CLI.
- No live Bitbucket workspace, token or private repository was used for validation; response shapes come from the published API 2.0 contract and a local fake API.
