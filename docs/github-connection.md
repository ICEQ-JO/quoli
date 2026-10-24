# Read-only GitHub connection

Status: local implementation of [QUO-49](https://linear.app/quolii/issue/QUO-49/v13-connect-github-with-least-privilege-repository-credentials). It connects a GitHub App account so later repository reads can use least-privilege credentials. It does not read repositories yet; that is [QUO-50](https://linear.app/quolii/issue/QUO-50) and the provider contract in [repository capture](repository-capture.md).

## What is implemented

- GitHub App **device flow** for a user access token. GitHub Apps request fine-grained permissions instead of OAuth scopes, so the connection refuses any installation that grants a permission other than `read`.
- A **local** credential record in the operating-system keychain (Linux Secret Service through `secret-tool`). Tokens are never written to SQLite, the runtime state file, URLs or logs.
- `connect`, `status` and `disconnect` commands that show the account, the app's granted read permissions, repository selection and access expiry.
- Recovery states for denied authorization, an expired device code, a dead refresh token and a token GitHub has revoked.

Contract sources: [Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) and the REST installation listing used for permissions and repository selection. The App needs device flow enabled and read-only `Contents` and `Metadata` permissions; Quoli has no client secret and never asks for one.

## Commands

```sh
quoli github connect --client-id CLIENT_ID
quoli github status
quoli github disconnect
```

`connect` prints the verification address and one-time user code, polls until the authorization is approved, then stores the credential. `--web-url` and `--api-url` exist for GitHub Enterprise and for offline provider tests; the defaults are `https://github.com` and `https://api.github.com`.

`status` reports `not connected`, `connected`, `expired`, `revoked` or an unreadable record, and probes GitHub once to recheck the token. An unreachable GitHub is reported as connected-but-unchecked instead of as a valid or revoked credential. An expired access token is refreshed once when a live refresh token exists; a rejected refresh token clears the credential.

`disconnect` removes the local keychain entry. Revoking the app authorization itself remains a GitHub account action at `https://github.com/settings/apps/authorizations`; the connection never stores a client secret, so it cannot revoke server-side on the user's behalf.

## Storage and privacy

The record is one keychain item (`service quoli`, `account github`) containing the account, installations, granted permissions and the access/refresh tokens. The keychain is the only secret store. A missing or refused keychain fails closed before the device flow starts; there is no plaintext fallback. `quoli uninstall` does not remove this item; run `quoli github disconnect` first when removal is intended.

The access token is sent only in the `Authorization` header. The user code is public. Output never prints a token, and tests assert that no request URL contains one.

## Limits

- Linux Secret Service only. Other platforms report the keychain as unavailable rather than storing secrets in a file; macOS certification is [QUO-66](https://linear.app/quolii/issue/QUO-66).
- No hosted/cloud repository credential storage with tenant scoping or rotation yet; the cloud issues (C-series) own that. This record is local to one operating-system user.
- Only the first page of user installations (100) is read; installations beyond that and per-repository selection lists are not enumerated.
- GitHub can add permissions to an installation after connecting; `status` prints what was recorded at connect time, and non-read permissions are refused at connect time only.
- Device flow must be enabled on the App. Token expiry and refresh are the GitHub App contract (8-hour user tokens when expiring tokens are enabled); a non-expiring token is accepted but cannot be refreshed.
- No live GitHub authorization was performed while building this increment; see the [validation record](work/quo-49-github-connection.md).
