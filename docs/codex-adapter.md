# Codex activity adapter

[QUO-72](https://linear.app/quolii/issue/QUO-72) advances **P2 — Cross-harness evidence** and **P3 — Observable activity and subagents**. This is local capture, not cloud synchronization.

## Connect and remove

Codex CLI **0.163.0** and Quoli's supported Node 24 runtime are required. From the source checkout:

```sh
pnpm connect /path/to/repository --agent codex
pnpm connect /path/to/repository --check
pnpm bridge codex status /path/to/repository
pnpm bridge codex uninstall /path/to/repository
```

The installed release uses `quoli connect ... --agent codex` and `quoli hooks codex status|uninstall ...`. Removal preserves evidence; `connect ... --undo PROJECT_ID` additionally purges the registered project.

Setup reads `codex --version` and refuses to install for any other version. It writes only `.codex/hooks.json`, adds only Quoli's own hook groups, preserves every other key, hook and matcher byte-for-byte outside those groups, and is repeatable. No Codex plugin, MCP server, provider credential or model request is involved.

**Trust is required before capture starts.** Codex runs project hooks only after you review and trust them with `/hooks`, and only when the repository's `.codex/` config layer is trusted. Until then Quoli's entries exist in the file and produce no evidence. Codex also honours `[features] hooks = false`; if hooks are disabled the file is inert. The installer cannot and does not approve hooks for you.

Prompt/tool text stays disabled by default. Enable categories in Settings explicitly; text needs both its prompt/tool category and code consent. Use matching Quoli data-directory/port configuration for setup and the collector. This does not enable uploads.

## Verified contract

Targets Codex CLI `0.163.0` (the [hooks reference](https://learn.chatgpt.com/docs/hooks) is written as that release's behaviour). The installed CLI confirmed the version and the hook surface, and a disposable offline turn fired `SessionStart`, `UserPromptSubmit` and `SessionEnd` with exactly the documented fields. Tool and subagent payloads below remain documented-shape; see [Validation boundary](#validation-boundary).

Codex discovers `hooks.json` next to a config layer: `~/.codex/hooks.json` or inline `[hooks]` in `~/.codex/config.toml` for the user, and `.codex/hooks.json` or inline `[hooks]` in `<repo>/.codex/config.toml` for a project. Quoli writes only the project file. Every hook receives JSON on stdin with `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model` and `permission_mode`; turn-scoped events add `turn_id`.

| Source event | Quoli observation | Facts and limits |
| --- | --- | --- |
| `SessionStart` | `session_start` | Session ID and `source` (`startup`, `resume`, …) in the locator. Start is reported, not inferred. |
| `UserPromptSubmit` | `prompt` | Permitted `prompt` text; `turn_id` recorded as the request ID. Codex reports no prompt ID. |
| `PreToolUse` | `tool_call` | `tool_use_id`, raw tool name and category, permitted input text, `tool_input.file_path` when present. |
| `PostToolUse` | `tool_result` | Same call ID and permitted result text. Codex reports no success flag and no numeric exit code, so `status` is `unknown` and `exitCode` is null. |
| `SubagentStart` | `session_start` | Parent session and turn plus the subagent's `agent_id`/`agent_type`. |
| `SubagentStop` | `session_end` | Same parent/child scope, so the child closes without claiming a result. |
| `SessionEnd` | `session_end` | Codex reports only `reason: "other"`, so completion is inferred and recorded as `completed`. |

`PermissionRequest`, `PreCompact`, `PostCompact`, `Stop` and `Interrupt` are exposed by Codex but **not collected** in this increment: none of them adds activity, usage or subagent evidence that Quoli's observation kinds can carry without inventing meaning.

`transcript_path` is deliberately ignored. The documentation states the transcript format is not a stable interface for external consumers, so Quoli does not read or parse it and does not backfill from it.

Delivery IDs hash session, event name, request (`turn_id`), tool call and subagent ID, so a second prompt in the same session is a distinct delivery and a re-delivered hook is not. Source sequence and time stay null: the payload reports neither, and receipt time is not source time. `requestId` and `childSessionId` are the optional delivery-identity inputs added to the V08 contract for sources shaped like this.

Capability declarations stay conservative: usage `false`, source time `false`, source version `"unreported"` (the payload carries none; the installer gates the CLI version), failure status and exit code `unsupported`, and no declared plans, decisions, approvals or corrections. Uncollected events and unknown fields become gaps rather than guesses.

Subagents keep one scope caveat: Codex reports no separate child session ID, so `agent_id` occupies the child-session slot and the parent session and turn are recorded as the parent. Tool calls made inside a subagent still arrive with the parent `session_id`; they are not attributed to the child. Quoli does not claim a complete subagent transcript or spawn causality.

## Privacy, retry and limits

Codex passes each hook payload to the bridge over stdin; the bridge normalizes, redacts and applies current capture policy before delivery to the loopback collector. It never replays commands, reads Codex session transcripts or sends evidence beyond loopback. Unknown, paused, deleted or unregistered project state produces no write.

The bridge is passive by construction: it exits 0 and writes nothing to stdout or stderr on the capture path, because Codex reads hook stdout as a decision or context. A failing hook can therefore not block or steer a turn.

Failed delivery uses the existing bounded, generation-fenced retry spool and explicit drain (`pnpm bridge drain` / `quoli hooks drain`). Excluded paths suppress content before transmission and persistence; retention, purge and category controls still apply.

Capture depends on the Codex runtime actually invoking hooks: a disabled hooks feature, untrusted project config, a non-allowlisted hook type, hook timeouts or a crashed bridge can omit evidence. There is no transcript backfill and no complete-capture promise.

## Validation boundary

The committed fixtures in `fixtures/codex.ts` mix both levels and say which is which. `SessionStart`, `UserPromptSubmit` and `SessionEnd` are observed shapes from Codex 0.163.0; `PreToolUse`, `PostToolUse`, `SubagentStart` and `SubagentStop` are documented-shape from the official event tables. Identifiers, paths and text are fixed placeholders or invented, so the suite needs no Codex account, network call or paid API.

The observed run used a disposable project, an isolated `CODEX_HOME` and a local OpenAI-compatible stub provider, so no model request left the machine and no existing session or credential was read. It produced `session_start` (source `startup`), `prompt` (`turn_id` recorded as the request ID) and `session_end` in Quoli's retry spool with source `codex_hook`, after which the temporary project was removed.

Tests cover: every collected event against its declared mapping, review/compaction/stop events dropped, no claimed usage/timestamp/exit status, `unknown` result status, version gate acceptance and refusal, delivery-identity stability across redelivery and distinctness across turns, subagent scope, secret redaction, store acceptance, installer preservation/uninstall reversal, and the real bridge subprocess spooling a Codex payload while the Claude path is unchanged.

Not verified here: `PreToolUse`/`PostToolUse` during a real tool call, subagent capture during a real run, interactive `/hooks` trust in the TUI (the run used `--dangerously-bypass-hook-trust` in a disposable project), hook timeouts, and macOS. Those remain owed; see the [validation record](work/quo-72-codex-adapter.md).
