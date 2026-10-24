# OpenCode activity adapter

[QUO-47](https://linear.app/quolii/issue/QUO-47) advances **P2 — Cross-harness evidence** and **P3 — Observable activity and subagents**. This is local capture, not cloud synchronization.

## Connect and remove

OpenCode **2.0.32** and Quoli's supported Node 24 runtime are required. From the source checkout:

```sh
pnpm connect /path/to/repository --agent opencode
pnpm connect /path/to/repository --check
pnpm bridge opencode status /path/to/repository
pnpm bridge opencode uninstall /path/to/repository
```

The installed release uses `quoli connect ... --agent opencode` and `quoli hooks opencode status|uninstall ...`. Restart OpenCode after installing/removing the plugin. Removal preserves evidence; `connect ... --undo PROJECT_ID` additionally purges the registered project. Application uninstall refuses a registered repository's plugin that still references that runtime.

Installation checks the CLI version, writes only `.opencode/plugins/quoli.js`, refuses unrelated files/symlinks, preserves other configuration and is repeatable. No npm plugin dependency, global setting, provider credential or model request is needed. Repository observation remains independently enabled by `connect`.

Prompt/tool text stays disabled by default. Enable categories in Settings explicitly; text needs both its prompt/tool category and code consent. Use matching Quoli data-directory/port configuration for setup and the collector. This does not enable uploads.

## Verified contract

Targets [`v2.0.32`, commit `843a6c514e606b436a7fe713422ace0a93ad3d61`](https://github.com/anomalyco/opencode/tree/843a6c514e606b436a7fe713422ace0a93ad3d61), inspected 2026-10-23. The general plugin guide still shows the earlier callback-function API; this adapter follows the tagged sources:

- [Promise plugin context/definition](https://github.com/anomalyco/opencode/blob/843a6c514e606b436a7fe713422ace0a93ad3d61/packages/plugin/src/promise/plugin.ts): default object with `id`/`setup`, reported app version, async event subscription and cleanup.
- [Module loading](https://github.com/anomalyco/opencode/blob/843a6c514e606b436a7fe713422ace0a93ad3d61/packages/core/src/plugin/module.ts) and [directory discovery](https://github.com/anomalyco/opencode/blob/843a6c514e606b436a7fe713422ace0a93ad3d61/packages/core/src/plugin/source-directory.ts): local JavaScript project plugins.
- [Event envelope](https://github.com/anomalyco/opencode/blob/843a6c514e606b436a7fe713422ace0a93ad3d61/packages/schema/src/event.ts) and [session events](https://github.com/anomalyco/opencode/blob/843a6c514e606b436a7fe713422ace0a93ad3d61/packages/schema/src/session-event.ts): source IDs, timestamps, durable sequence/version and payloads.
- [Usage normalization/calculation](https://github.com/anomalyco/opencode/blob/843a6c514e606b436a7fe713422ace0a93ad3d61/packages/core/src/session/usage.ts): non-cached input, visible output and separate reasoning. OpenCode normalizes absent upstream categories to zero and calculates cost from model rates; Quoli leaves provider-reported cost null.

| Source boundary | Quoli observation | Facts and limits |
| --- | --- | --- |
| `session.created` v1 | `session_start` | Session and reported parent ID. A parent relationship does not prove spawning. |
| `session.inbox.enqueued` v1, user items only | `prompt` | Inbox/message ID and permitted text. Enqueued does not imply delivered. |
| `session.tool.called` v1 | `tool_call` | Call ID, assistant-message/request ID, raw tool name, input and file path. |
| `session.tool.success` / `session.tool.failed` v2 | `tool_result` | Call ID, source success/failure and permitted text/error; exit code stays null. |
| `session.step.ended` / `session.step.failed` v1 | `usage` | Request ID, model/provider and reported token categories. Failure without usage becomes a gap. |

`session.tool.input.started` supplies the name for the exact session/message/call key; `session.step.started` supplies the model for the exact session/assistant-message key. Each in-memory map holds at most 1,000 entries and removes terminal entries. Lost context becomes an `unsupported_source` gap. Raw extension-shaped tool names remain intact with category `Other`; this is invocation evidence, not an installed inventory or an effectiveness claim.

Delivery IDs hash session, event type and source event ID, independent of content/time. Original event IDs stay in the locator. Call IDs use deterministic canonical IDs scoped to session and assistant-message/request, so provider ID reuse cannot join different requests; originals remain in the locator. Source sequence/time remain distinct from receipt order.

Native skill-activation, command and permission events await their activity/extension contracts; extension capture here is limited to collected tool invocations. No inferred turns, prompt-to-request links, parent turns, declared plans/decisions/approvals/corrections, endings or exclusive authorship. Reasoning text, assistant prose, attachment bytes, synthetic inbox items and auxiliary title/compaction usage are omitted. Counts are OpenCode's normalized reports, not proof that every provider supplied each category. Model/provider identifiers outside the current shared identifier vocabulary remain unsupported.

## Privacy, retry and limits

The plugin filters exact directory/workspace scope and forwards selected events to Node over stdin. It never replays commands, reads historical sessions or sends evidence beyond loopback. The worker validates input and applies current policy before delivery. Unregistered, paused, deleted or unreadable project state produces no write.

Failed delivery uses the existing bounded, generation-fenced retry spool and explicit drain (`pnpm bridge drain` / `quoli hooks drain`). Missing call-path context withholds result text; excluded paths suppress it before transmission/persistence. The retry envelope retains an optional consented/redacted result path so policy cleanup/drain can also scrub a later exclusion. This metadata is outside immutable evidence. Retention, purge and category controls still apply.

Unknown runtime versions disable capture with a content-free diagnostic. The worker also maps selected unsupported source/event versions to content-free gaps. Malformed/oversized input is dropped. Workers have a five-second bound; spool limits remain 1,000 events / 10 MiB. Startup, unload, overload, eviction and worker failure can omit evidence. A stopped subscription reports a restart diagnostic; there is no transcript backfill or complete-capture promise.

## Validation boundary

Source-shaped synthetic fixtures cover identities, mappings, children, extension-shaped tools, usage and version/context gaps. Tests run the generated plugin through the real worker, online delivery/replay, disabled-content canaries, offline retries, exclusions/policy changes, pause/purge, setup/remove, collisions and symlink refusal.

A disposable OpenCode 2.0.32 server loaded the generated plugin; a newly created synthetic session produced `session_start` in Quoli's spool. It used isolated XDG directories and test authentication, with no model request or existing session import. Live prompts/tools/usage, paid-provider behavior and macOS remain unverified; those paths use synthetic source-shaped tests.
