# Read-only GitLab access

Status: local implementation of [QUO-74](https://linear.app/quolii/issue/QUO-74/v38-add-gitlab-read-only-repository-observations). Read-only; no branch, file, merge request or comment is written.

## Connect

Create a personal access token in GitLab (**Preferences → Access tokens**) with the **`read_api`** scope only, then feed it on stdin so it never appears in shell history or a process argument:

```sh
quoli gitlab connect
# paste the token, then press Ctrl-D

# self-managed instance (accepted, not certified)
quoli gitlab connect --base-url https://gitlab.example.com
```

Connect verifies the account and the token before storing anything:

- `GET /api/v4/user` resolves the account.
- `GET /api/v4/personal_access_tokens/self` must report `active: true`, `revoked: false`, an unexpired `expires_at`, and a `read_api` scope.
- Any other scope (`api`, `write_repository`, `read_repository` alone, runner or admin scopes) is refused, so a write-capable token is never stored.
- The token is one Linux Secret Service item (`service quoli`, `account gitlab`). A missing or refused keychain fails closed before the network request; there is no plaintext fallback.
- `status` reports connected, expired, revoked, unreadable or unreachable; expired/revoked records are cleared. There is no refresh, so reconnecting is required.
- `disconnect` removes the credential and all cached GitLab review files. Revoke the token in GitLab when that is intended.

GitLab.com is the default. A self-managed base URL is accepted over HTTPS (HTTP only on loopback); support is not certified. Tokens using GitLab's granular scopes are refused until their read-only mapping is verified.

## Review

```sh
quoli gitlab review GROUP/PROJECT --merge-request 12
quoli gitlab review GROUP/PROJECT --merge-request 12 --path src/app.ts --capture-code
```

Options: `--path FILE` opens one file, `--capture-code` allows sanitized code text (without it content is reported as `disabled`), `--max-entries N` (1–1000, default 200) and `--max-bytes N` (1–1048576, default 262144). Subgroups are supported (`group/subgroup/project`).

The provider in `packages/repository/src/gitlab-provider.ts` implements the same contract as the GitHub reader:

| Read | Endpoint | Resolved identity |
| --- | --- | --- |
| Merge request | `GET /projects/{project}/merge_requests/{iid}` | `diff_refs.base_sha`, `diff_refs.head_sha` (fallback `sha`) |
| Ref | `GET /projects/{project}/repository/commits/{ref}` | commit SHA |
| Tree | `GET /projects/{project}/repository/tree?ref={commit}&recursive=true&per_page=100&page=N` | files, directories and submodules |
| Blob | `GET /projects/{project}/repository/files/{path}/raw?ref={commit}` | sanitized file content |
| Comparison | `GET /projects/{project}/repository/compare?from={base}&to={head}` | changed paths, both sides of a rename |

Requests send the token in the `PRIVATE-TOKEN` header only, follow `X-Next-Page` pagination, and stop at the caller's entry/byte limits. Missing refs/files, denial, rate limits (`Retry-After` or `RateLimit-Reset`) and an unreachable GitLab become explicit states. A `401` is a revoked token and an error, not a partial read.

## Cache and privacy

Provider reads share `packages/repository/src/remote-cache.ts` with GitHub. Entries are keyed by provider, repository, resolved commit and path, stored under `<data dir>/gitlab-cache/` (private `0700`, files `0600`, atomic rename), and record sanitized content and fetch time. A moved ref cannot serve stale content because the commit is part of the key; the same repository name on GitHub and GitLab cannot collide.

- Content is sanitized by the capture policy (including GitLab `glpat-` tokens) before caching. Excluded paths (default: `.env`, `.git`, `node_modules`, `credentials`, `secrets`) are never requested or cached.
- A cache read re-applies the current policy, so a later read without `--capture-code` cannot return cached code.
- Oversized and binary content is not persisted.
- Reads are local and read-only. Nothing is uploaded and no captured text is treated as instructions.

## Limits

- GitLab's compare response has no pagination; `compare_timeout: true` is reported as `truncated`, and a large comparison can omit paths without a count.
- The raw file endpoint is bounded by `Content-Length` when present and by the byte count otherwise, so transfer is not always pre-bounded.
- Token inspection requires a GitLab version that exposes `/personal_access_tokens/self`; older self-managed versions fail closed.
- Only one file is opened per command; there is no combined diff, discussion, pipeline or approval read.
- The web **File changes** review still renders local snapshot pairs only. Remote-review UI work is held with the D01 design reset ([QUO-82](https://linear.app/quolii/issue/QUO-82)) and tracked by [QUO-85](https://linear.app/quolii/issue/QUO-85); the delivered surface is the CLI.
- GitLab webhooks, hosted analysis and certified self-managed support remain out of scope.
