# Adapter registration contract

An evidence source is registered as data: what it is, which source versions were actually verified, which source events it maps to which observations, what it can and cannot report, how its delivery identity is derived, and how it is installed. The contract is static. There is deliberately no dynamic plugin loader.

The V08 definition ([QUO-44](https://linear.app/quolii/issue/QUO-44/v08-define-adapter-registration-capabilities-and-conformance-fixtures)) registers Claude Code, the [Codex adapter](codex-adapter.md) ([QUO-72](https://linear.app/quolii/issue/QUO-72)) and the version-gated [OpenCode adapter](opencode-adapter.md) ([QUO-47](https://linear.app/quolii/issue/QUO-47)).

## Where it lives

| Piece | Path |
| --- | --- |
| Contract, `defineAdapter`, version check | `packages/schema/src/adapter.ts` (`@traceframe/schema/adapter`) |
| Claude Code hook registration | `apps/bridge/src/adapter.ts` |
| Codex hook registration | `apps/bridge/src/codex.ts`, `apps/bridge/src/codex-install.ts` |
| Shared JSON hook-file merging | `apps/bridge/src/hook-file.ts` |
| OpenCode public-event registration | `apps/bridge/src/opencode.ts` |
| Synthetic second registration (test only) | `fixtures/adapters.ts` |
| Shared conformance suite | `tests/adapter-conformance.test.ts` |

`defineAdapter` validates a registration against the contract once at module load and freezes it. A registration that breaks the contract fails at import, not at capture time.

## What a registration declares

| Field | Meaning |
| --- | --- |
| `id`, `harness`, `source`, `producerId` | Stable adapter identity and the event `source` it emits. |
| `adapterVersion` | Version of this adapter's normalization. |
| `sourceVersions` | Exact source product versions that were verified. Never an open range. |
| `eventMapping` | Collected source event name → observation kind. An unlisted event is not recorded. |
| `capabilities.content` | Content categories the adapter can report (`prompt`, `tool`, `code`). The capture policy still decides whether text is stored. |
| `capabilities.identifiers` | Source identifiers it can join on (`session`, `prompt`, `tool`, `request`). |
| `capabilities.usage` | Whether it reports request usage. |
| `capabilities.sourceTime` | Whether it reports its own timestamps. |
| `capabilities.fields` | `plan`, `decision`, `approval`, `correction` as `available`, `disabled`, `unsupported` or `unavailable`. Same vocabulary as the v2 event envelope. |
| `failures.status` / `failures.exitCode` | Whether a failed call is reported as a status and whether a numeric exit code exists. |
| `failures.gaps` | Gap reasons the adapter itself emits. |
| `delivery` | Delivery identity rule. Currently only `session_event_source_id`. |
| `install` | Reversible install mode and the project settings file it owns. |

`delivery: "session_event_source_id"` means the durable identity is derived from the session id, the source event name and that event's own source identifier (`prompt_id`, `tool_use_id`, or a source-specific request id such as Codex `turn_id`; optional `requestId`/`childSessionId` inputs cover sources shaped that way). A repeated delivery of the same payload is a duplicate; source sequence numbers and wall-clock time are never part of it. This is the rule described in [the hook bridge](hook-bridge.md#identity-and-joins).

## Claude Code hook registration

| Field | Value |
| --- | --- |
| `id` / `harness` / `source` | `claude-code-hook` / Claude Code / `claude_hook` |
| `adapterVersion` | `0.1.0` |
| `sourceVersions` | `2.1.306` (the version verified in the [runtime report](claude-code-runtime-report.md)) |
| Mapping | `SessionStart`→`session_start`, `UserPromptSubmit`→`prompt`, `PreToolUse`→`tool_call`, `PostToolUse`/`PostToolUseFailure`→`tool_result`, `SessionEnd`→`session_end` |
| Not mapped | `Stop`: it carries the assistant's final turn text, which the capture policy may not allow. |
| Capabilities | content `prompt`/`tool`/`code`; identifiers `session`/`prompt`/`tool`; usage unsupported; source time unsupported; declared plan/decision/approval/correction unsupported |
| Failures | Status reported; numeric exit code unsupported; no adapter-emitted gaps |
| Install | Reversible project hooks in `.claude/settings.json` |

The conformance suite normalizes every recorded hook fixture and asserts the observation kind and delivery identity still match this table, so the declaration cannot drift from the implementation silently.

## Codex hook registration

| Field | Value |
| --- | --- |
| `id` / `harness` / `source` | `codex-hook` / Codex / `codex_hook` |
| `adapterVersion` | `0.1.0` |
| `sourceVersions` | `0.163.0` (the documented hook contract this adapter targets) |
| Mapping | `SessionStart`/`SubagentStart`→`session_start`, `UserPromptSubmit`→`prompt`, `PreToolUse`→`tool_call`, `PostToolUse`→`tool_result`, `SubagentStop`/`SessionEnd`→`session_end` |
| Not mapped | `PermissionRequest`, `PreCompact`, `PostCompact`, `Stop`, `Interrupt` |
| Capabilities | content `prompt`/`tool`/`code`; identifiers `session`/`tool`/`request`; usage unsupported; source time unsupported; declared plan/decision/approval/correction unsupported |
| Failures | Status and numeric exit code unsupported (hook payload reports neither); gap `unsupported_source` |
| Install | Reversible project hooks in `.codex/hooks.json`; Codex still requires `/hooks` trust |

Codex does not report a source version in the hook payload, so live events carry `unreported`; unlike Claude, setup also gates on the installed CLI version before writing anything. The [Codex reference](codex-adapter.md) records the exact event facts, the subagent scope caveat and the validation limits.

## Version handling

`adapterSupportsSourceVersion` returns `{ supported: true }` only for a listed version. Anything else returns an explicit `{ supported: false, reason: "unsupported_source_version", supportedVersions }`; there is no best-effort guess.

The Claude bridge emits v2 evidence with source version `unreported`, its adapter identity, raw tool name/category, null activity identities and explicit unsupported declaration capabilities. The hook payload itself does not report the Claude version, so the registration's `2.1.306` support record applies only to the verified fixture contract; it is never copied into a live event or used as a runtime source-version gate. A future capture gate needs a version reported by the source rather than guessing from the locally installed CLI.

## Installed versus supported state

```sh
pnpm bridge status /path/to/project
```

prints the registered adapter, its adapter version, the source versions it supports, and whether its hooks are installed for that project. A project can therefore be inspected as supported-but-not-installed, installed, or not installed at all.

## Not delivered

- No dynamic adapter loader. Claude Code and OpenCode register statically; the synthetic registration is test-only.
- Claude source-version gating is not enforced at capture (see above). OpenCode gates runtime and selected event versions; Codex gates the installed CLI at setup only; their references record live-validation limits.
- Pi remains its own issue.
