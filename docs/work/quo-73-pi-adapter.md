# QUO-73 — Pi extension adapter

Issue: [QUO-73](https://linear.app/quolii/issue/QUO-73/v37-add-a-verified-pi-adapter) · Branch: `owner/quo-73-v37-add-a-verified-pi-adapter` · Pillars: **P2, P3**.

## Delivered behavior

`connect --agent pi` checks Pi CLI 0.75.3, then writes Quoli's own reversible extension at `.pi/extensions/quoli.ts`. The extension subscribes to Pi's lifecycle events, forwards one extracted envelope per event to the bridge under the `pi` harness, and the bridge normalizes, redacts, applies capture policy and delivers or spools exactly as the other adapters do.

Collected: `session_start`, `message_end` (user → prompt, assistant → usage), `tool_execution_start`, `tool_execution_end`, `session_shutdown`. Not collected: streaming deltas, tool interception events, context/provider payloads, compaction, tree, model selection, user bash and input. See the [adapter reference](../pi-adapter.md) for the mapping and omissions.

Bounded additions to existing code: a new `pi.ts` / `pi-install.ts` pair, one entry in the shared adapter registry, one harness branch in the bridge, and `--agent pi` plus `hooks pi` wiring in setup and CLI. `usesPackagedRuntime` now also recognises the Pi extension so upgrades reinstall it. No dependency was added; the generated extension uses Node built-ins and Pi's own `VERSION` export.

## Validation on 2026-10-24

Environment: Linux x64, Node 22.22.3 (project engine is 24.16; pre-existing local mismatch), pnpm 11.12.0, installed Pi CLI 0.75.3. Synthetic temporary stores, projects and `PI_CODING_AGENT_DIR` only.

| Check | Result |
| --- | --- |
| `pnpm lint` | Pass; pre-existing warnings only, none introduced |
| `pnpm typecheck` | Pass (root `tsc` plus the web workspace) |
| `tests/pi.test.ts` | 12 pass, 0 fail |
| Shared conformance, CLI and setup suites | Pass |
| Full `pnpm test` | See PR; the seven `update`/`release-signing` failures reproduce on `main` in this environment |
| Offline Pi run (text) | `session_start` → `prompt` → `assistant_message` → `session_end` reached the retry spool with source `pi_extension` |
| Offline Pi run (tool) | A real `read` and a real `bash` call produced `tool_call`/`tool_result` with `Read`/`Bash` categories, result text and `success` status |
| `pi --version` gate | Setup refuses any version other than 0.75.3; the extension refuses at load as well |

The runs used a stub OpenAI-compatible provider, so no model request, credential or private session was involved. Two facts only a live run shows were folded back into the implementation:

1. Pi hands extensions a **stale context** during tool execution and for the messages after it. The first generated extension resolved the session per handler, silently lost all tool events and one usage record, and needed the session cached at `session_start`.
2. Pi does not await every handler, so `session_shutdown` now flushes in-flight deliveries (bounded) before the session end.

Temporary probe artifacts were removed.

## Limits and review findings resolved

- Pi reports no prompt id, turn id, parent/child session or exit code; those stay null or unsupported. There are no built-in subagents, so no child evidence is claimed.
- Cost is computed by Pi from configured rates, so `costUsdMicros` is null rather than presented as spend.
- `session_end` completion is inferred from `session_shutdown`; Pi does not report whether the turn finished.
- Arrival order is not source order because Pi does not await handlers; `sourceSequence` stays null and event sequence is the store's receipt order.
- Not verified: interactive mode, resume/fork, compaction, parallel tool calls, extension hot-reload (`/reload`), and macOS.
