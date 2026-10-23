# QUO-47 — OpenCode public-event adapter

Issue: [QUO-47](https://linear.app/quolii/issue/QUO-47) · Branch: `feat/quo-47-opencode` · Pillars: **P2, P3**.

## Delivered behavior

`connect --agent opencode` checks OpenCode 2.0.32 and installs Quoli's own reversible project plugin. The adapter consumes selected scoped public events, preserves source IDs/time/sequence, request-scoped tool identity and parent relationships, and emits v2 observations through the existing collector/retry path. See the [adapter reference](../opencode-adapter.md) for versioned primary sources, the mapping and omissions.

The worker enforces capture policy before local transmission and retry persistence. Result-path context is retained only under code consent and redaction; initial exclusions and later policy cleanup/drain suppress matching result text. Shared spool callers remain compatible. No shared evidence schema or Story analysis/export was changed.

The release bundles the Node worker, supports plugin status/removal and refuses app removal while a registered plugin still references its runtime. No dependency was added. No owner runtime configuration or existing session was used.

## Validation on 2026-10-23

Environment: Linux x64, Node 24.16.0, pnpm 11.12.0, installed OpenCode 2.0.32. Synthetic temporary stores/repositories only.

| Check | Result |
| --- | --- |
| `pnpm lint` | Pass; 17 existing warnings / 4 informational diagnostics outside the implementation changes |
| `pnpm typecheck` | Pass |
| `pnpm test` | 187 pass, 0 fail, 4 release-gated tests skipped |
| Final focused adapter/conformance checks | 14 pass; final fixture/storage drain check also passes in the 7-test OpenCode suite |
| `pnpm release:local` | Pass; standalone build/archive inspection |
| `pnpm test:release` | 4 pass, 0 fail; includes relocated generated-plugin → bundled-worker delivery, restart/recovery and uninstall fencing |
| Installed OpenCode runtime smoke | A disposable authenticated server discovered/activated the plugin, then a new synthetic session's live `session.created` reached Quoli's retry spool |
| Change review | Reviewed normalization, plugin scope/lifetime, setup/remove, persistence/policy/drain callers and release wiring; `git diff --check` passes |

The runtime smoke uses isolated XDG directories and synthetic authentication. Plugin inventory activation is asynchronous after location boot; a first inventory response can be empty, so the probe waited for activation before creating its session. No model request, paid API or historical session read occurred. Temporary artifacts were removed.

## Limits and review findings resolved

- The unversioned public plugin guide describes an earlier API. Implementation follows the verified 2.0.32 tag's default-object Promise plugin and `data` event envelope.
- Tool IDs are canonicalized with session/request scope because shared analysis joins by tool ID; reused provider IDs cannot connect different requests. Original IDs remain in source locators.
- Offline result output retains path provenance for future policy reductions. Missing path context suppresses text rather than guessing permission.
- Unrelated plugin files are preserved; explicit failed removal reports a nonzero exit, while passive capture remains exit-zero and silent.
- Live prompt/tool/provider usage and macOS are unverified. Those mappings have source-shaped fixture coverage. No transcript backfill, inferred turns/endings, hidden reasoning, full extension inventory/native activation feed, cloud sync or complete-capture claim is made.

Linear shared-context/learning endpoints returned “tool not found”; verified integration knowledge is recorded here and in the adapter reference instead.
