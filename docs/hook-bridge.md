# Claude Code hook bridge

The bridge collects documented Claude Code hook events from a project you explicitly register and stores them as ordinary Traceframe observations. It is **passive**: it never blocks the agent, never runs a recorded command and never influences what Claude does.

## Install and remove

```sh
pnpm bridge install /path/to/project PROJECT_ID   # adds the hook entries
pnpm bridge status /path/to/project                # reports what is installed
pnpm bridge uninstall /path/to/project             # removes only Traceframe's entries
```

`PROJECT_ID` is the id of a repository you registered with `pnpm repository register`. The installer writes into the project's own `.claude/settings.json` and:

- keeps every existing setting, hook group, telemetry destination and status line;
- adds one command hook per collected event: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure` and `SessionEnd`;
- writes absolute paths, so the hook works whatever directory the agent runs in;
- can be reversed with `pnpm bridge uninstall`, which removes only Traceframe's entries and reports how many other groups were left untouched.

Nothing outside that project file is touched. Your global `~/.claude/settings.json` is never modified.

## What is collected

| Hook event | Observation | Notes |
| --- | --- | --- |
| `SessionStart` | `session_start` | The session identity is the Claude session id. |
| `UserPromptSubmit` | `prompt` | The prompt text, stored only under a policy that allows prompts. |
| `PreToolUse` | `tool_call` | The tool name, its invocation id and the tool input. A file path is recorded when the tool reports one. |
| `PostToolUse` | `tool_result` | The reported output. |
| `PostToolUseFailure` | `tool_result` | The reported failure, including an interrupted call. |
| `SessionEnd` | `session_end` | The session is closed. |

Facts the source does not report stay unknown: the hook payload carries **no timestamp**, so observations are ordered by receipt, and it carries **no numeric exit code**, so the exit code of a command stays null. A failing command is recorded as a reported failure, not as a number.

A `Stop` event is not collected: it carries the assistant's final text for the turn, which the privacy policy may not allow.

## Delivery and retry

The bridge posts each observation to the local collector over the loopback interface with the local credential. If the collector is not reachable, the observation is kept in a bounded retry spool inside the private local data directory (mode 0600, at most 1,000 observations and 10 MiB). The spool only ever holds observations that already passed the privacy pipeline.

```sh
pnpm bridge drain
```

retries the spooled observations and removes the ones that arrive. The spool is a retry buffer, not a second source of truth: the collector's event history stays the primary record.

## Identity and joins

The bridge generates its own event and delivery identities from the session, the event name and the source identifiers, so a repeated delivery of the same hook payload is recognised as a duplicate instead of a second observation. The recorded `prompt_id` and `tool_use_id` are the source identities and are what joins a request to its tool calls and a tool call to its result.

## Honesty rules kept

- The bridge never blocks or answers the agent: it writes nothing to stdout and always exits 0, because Claude Code reads stdout as a hook decision.
- Captured text is inert data. It is never executed, and instructions inside it are never followed.
- A missing result stays a gap. The bridge does not invent a result for a call that has none.
- The hook input never becomes a command. Only the recorded tool input is stored as text.

## Validation

`tests/bridge.test.ts` covers the normalization of every observed event shape, the stability of the delivery identity, acceptance by the local store, a reversible installation that preserves existing hooks, the empty stdout contract and the retry spool. The bridge was exercised end to end against Claude Code 2.1.306 in a disposable repository: a session produced a start, a prompt, a tool call, a tool result and an end observation, and the retry spool released the observations that were captured while the collector was unreachable.

See the [runtime verification report](claude-code-runtime-report.md) for the observed payload shapes.
