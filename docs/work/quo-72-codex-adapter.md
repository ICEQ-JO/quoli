# QUO-72 — Codex lifecycle-hook adapter

Issue: [QUO-72](https://linear.app/quolii/issue/QUO-72) · Branch: `owner/quo-72-v36-implement-the-verified-codex-activity-adapter` · Pillars: **P2, P3**.

## Delivered behavior

`connect --agent codex` checks Codex CLI 0.163.0, then installs Quoli's own reversible hook groups in the repository's `.codex/hooks.json`. The bridge accepts one extra positional argument (`codex`) so a Codex payload is never normalized as a Claude one, and the same passive contract holds: exit 0, nothing on stdout, because Codex reads hook output as a decision.

Collected events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `SessionEnd`. Not collected: `PermissionRequest`, `PreCompact`, `PostCompact`, `Stop`, `Interrupt`. `transcript_path` is ignored because Codex documents the transcript format as unstable. See the [adapter reference](../codex-adapter.md) for the mapping, omissions and subagent scope caveat.

The Claude installer's JSON merge logic moved to `apps/bridge/src/hook-file.ts` and is shared by both installers: only Quoli-owned groups are added or removed, all other keys, groups and matchers are written back unchanged, and uninstall returns the file to its previous shape. `packages/schema/src/adapter.ts` gained optional `requestId`/`childSessionId` delivery-identity inputs so a second prompt in the same session is a distinct delivery; existing registrations are unaffected.

No dependency was added. Setup and removal also handle Codex in `connect --check` and `connect --undo`; the bridge's `uninstall` and `hooks codex status|uninstall` cover it too. Codex still requires the user to trust the hooks with `/hooks`; the installer reports that instead of implying capture started.

## Validation on 2026-10-24

Environment: Linux x64, Node 22.22.3 (project engine is 24.16; pre-existing local mismatch), pnpm 11.12.0, installed Codex CLI 0.163.0. Synthetic temporary stores, repositories and `CODEX_HOME` only.

| Check | Result |
| --- | --- |
| `pnpm lint` | Pass; 17 pre-existing warnings / 4 informational diagnostics, none introduced |
| `pnpm typecheck` | Pass (root `tsc` plus the web workspace) |
| `tests/codex.test.ts` | 9 pass, 0 fail |
| Focused suites (conformance, bridge, setup, cli, opencode, lifecycle) | 36 pass, 0 fail |
| `pnpm test` | 212 pass, 5 skipped, 7 fail — all 7 failures reproduce on `main` without these changes (`tests/update.test.ts`, `tests/release-signing.test.ts`) |
| `git diff --check` | Clean |
| Offline Codex turn | Codex 0.163.0 fired `SessionStart` → `UserPromptSubmit` → `SessionEnd`; the bridge produced `session_start` (source `startup`), `prompt` (turn UUID as request ID) and `session_end` in the retry spool with source `codex_hook` |
| Offline Codex tool call | A stub provider's `exec` call ran `printf`; hooks fired `PreToolUse` and `PostToolUse` with `tool_name` `Bash`, `tool_input.command`, a string `tool_response` and an `exec-`-prefixed `tool_use_id` |
| Offline Codex subagent | A stub `collaboration.spawn_agent` call fired `PreToolUse`/`PostToolUse` (`tool_name` `collaborationspawn_agent`) and `SubagentStart` with the parent `session_id`, an `agent_id` and the subagent's own `turn_id`; `SubagentStop` did not arrive before the parent ended |

The offline turns used a local OpenAI-compatible stub provider and `--dangerously-bypass-hook-trust` in a disposable project, so they exercised hook discovery, payload shape and the bridge without a model request, credential or private session. The tool/subagent probes also corrected the activity mapping: the earlier code treated a subagent's `turn_id` as the parent turn, which the observed payload disproved. Two intermittent failures appeared in one parallel full-suite run (`lifecycle`, `opencode`) and passed in isolation on both branches; they are not attributed to this change. Temporary artifacts were removed.

## Limits and review findings resolved

- Codex trust is a real user step: writing `.codex/hooks.json` produces no evidence until `/hooks` trust and a trusted project `.codex/` layer. `[features] hooks = false` makes the file inert. Documented in setup, status and the reference.
- `PostToolUse` reports neither a success flag nor an exit code, so results record `status: "unknown"` and `exitCode: null` rather than assuming success.
- `SessionEnd` only ever reports `reason: "other"`; completion is inferred, matching the existing Claude mapping. The reference states this is the weakest claim in the adapter.
- Codex has no separate child session ID, so `agent_id` occupies the child-session slot and the subagent's own `turn_id` fills the child-turn slot. `SubagentStart`/`SubagentStop` declare only the spawned child, because declaring the parent session as well would link a session to itself. Tool calls inside a subagent arrive with the parent session and carry the agent id only in their locator, so they are not attributed to the child.
- No usage, source timestamps, plan/decision/approval/correction fields, extension inventory, transcript replay or complete-capture claim.
- Not verified: a real `SubagentStop` payload, interactive `/hooks` trust, hook timeouts, and macOS.
