# Pi adapter

Pi (`pi` / `@earendil-works/pi-coding-agent`) is connected through a project-local **extension**. `connect /path/to/repo --agent pi` checks the installed CLI version, then writes Quoli's own extension at `.pi/extensions/quoli.ts`. `connect --undo` removes it. Nothing global is changed.

```sh
pnpm connect /path/to/repo --agent pi
pnpm connect --check /path/to/repo
pnpm connect --undo /path/to/repo PROJECT_ID
```

The bridge also exposes `hooks pi status` and `hooks pi uninstall`. Removing the extension stops future capture; retained evidence is unaffected.

## Verified contract

Targets Pi `0.75.3`. The extension API, event names and payload fields were confirmed against the installed CLI with a disposable project, an isolated `PI_CODING_AGENT_DIR` and a local OpenAI-compatible stub provider — no account, network call or paid API.

Pi loads `.pi/extensions/*.ts` with jiti and resolves `@earendil-works/pi-coding-agent` for the extension, so the generated module can read `VERSION` without a local `node_modules` entry. The extension subscribes to lifecycle events and pipes one extracted envelope per event to `apps/bridge/src/index.ts` (or the packaged `runtime/quoli-hook-v1.mjs`) under the `pi` harness, mirroring the OpenCode plugin's delivery path. The bridge normalizes, redacts, applies capture policy and delivers to the loopback collector; a failed delivery uses the same bounded retry spool.

| Pi event | Envelope | Quoli observation | Facts and limits |
| --- | --- | --- | --- |
| `session_start` | `session_start` | `session_start` | Session id from the session manager and the reported `reason` (`startup`, `resume`, …) in the locator. |
| `message_end` (user) | `user_message` | `prompt` | Text parts of the user message. Pi reports no prompt id; the message timestamp is the request scope. |
| `tool_execution_start` | `tool_call` | `tool_call` | `toolCallId`, raw tool name and category, bounded argument JSON, `args.path` when present. |
| `tool_execution_end` | `tool_result` | `tool_result` | Same call id, result text and Pi's `isError` as `success`/`failure`. No numeric exit code exists. |
| `message_end` (assistant) | `assistant_message` | `usage` | Input/output/cache counts, model, provider and the provider response id. Cost is computed from configured rates, so `costUsdMicros` stays null. |
| `session_shutdown` | `session_end` | `session_end` | Completion is inferred: Pi reports why the extension runtime stopped, not whether a turn finished. |

Not collected: `message_start`/`message_update` streaming deltas (the final message is authoritative), `tool_call`/`tool_result` interception events (they duplicate execution events and can mutate a call), `context`, `before_provider_request`, `after_provider_response`, compaction, tree navigation, `model_select`, `thinking_level_select`, `user_bash` and `input`. None of them adds activity, usage or subagent evidence that Quoli's observation kinds can carry without capturing more text.

`transcript_path` and Pi's session files are deliberately not read. The adapter takes only the fields above from the in-process events; message content is reduced to text parts, so image bytes, reasoning text and tool-result metadata never leave Pi.

## Extension behavior

- The session id and project scope are resolved once at `session_start`. Pi 0.75.3 hands extensions a **stale context during tool execution and the messages after it**, so a handler that reads `ctx` there fails; the generated extension never does.
- The extension is passive: it exits quietly, writes nothing to Pi's UI, never blocks or rewrites a tool call, and swallows its own errors.
- Pi does not await every handler, so `session_shutdown` waits up to three seconds for in-flight deliveries before sending the session end. As a result, arrival order is not source order; `sourceSequence` stays null and the append-only store is the record of receipt.
- A payload above 1 MiB is dropped rather than truncated mid-event. Argument JSON is capped before it leaves the extension.
- Pi computes a per-message cost from the configured model rates. Quoli does not present that as provider-reported spend.

## Identity

Delivery IDs hash the session id, the envelope type and that event's own identifier: the tool call id for tool events, and the provider response id (falling back to the message timestamp) for usage; the message timestamp for prompts. A re-delivered envelope is a duplicate, a second prompt is not, and nothing depends on wall-clock ordering.

Pi reports no parent session, child session, turn id or prompt id, and has no built-in subagents. `activity` therefore stays empty, `promptId` stays null, and Quoli does not claim a subagent transcript or spawn causality. Parallel tool calls arrive as separate `toolCallId`s.

Capability declarations: content `prompt`/`tool`/`code`, identifiers `session`/`tool`/`request`, usage **reported**, source time **reported**, tool status reported, numeric exit code unsupported, and no declared plans, decisions, approvals or corrections.

## Privacy and limits

Content stays disabled by default. Enable the prompt/tool categories in Settings; text additionally needs code consent. Every stored path is subject to the same exclusion and redaction rules as the other adapters, and captured text is inert data.

Capture depends on Pi loading the extension: a disabled or renamed extension, a modified project, an unsupported Pi version, a crashed bridge or a dropped oversized payload are all gaps. There is no transcript backfill and no complete-capture promise.

## Validation boundary

The committed fixtures in `fixtures/pi.ts` are observed shapes from Pi 0.75.3 for all six envelope types: a real `read` call, a real `bash` call, real assistant usage and a real session start/shutdown. Identifiers, paths, model name and prompts are fixed placeholders, so the suite needs no Pi account, network call or paid API.

A live end-to-end run generated the extension, started Pi in print mode against the stub provider, and produced `session_start`, `prompt`, `tool_call`, `tool_result`, `usage` and `session_end` in Quoli's retry spool with source `pi_extension`.

Not verified here: interactive Pi mode, a resumed or forked session, compaction, parallel tool calls inside one turn, hook-free operation, and macOS. Cost remains unreported by design. See the [validation record](work/quo-73-pi-adapter.md).
