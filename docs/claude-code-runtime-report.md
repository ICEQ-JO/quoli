# Claude Code runtime verification

Verified on **2026-10-22** against **Claude Code 2.1.306** on **Linux x64** (Fedora kernel 7.2.7), using a disposable synthetic Git repository in a temporary directory. No personal session directory was read, no existing configuration was modified, and the temporary hook configuration existed only inside the disposable repository.

This report closes the runtime gate for [issue #14](https://github.com/ICEQ-JO/quoli/issues/14). It separates what the official documentation states from what the runtime actually produced.

## How the check was run

- A disposable repository with two synthetic files and one synthetic commit.
- A project-scoped `.claude/settings.json` inside that disposable directory only, defining command hooks for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop` and `SessionEnd`. The hook wrote the raw payload to a file outside the repository.
- `claude -p` sessions with synthetic prompts only, `--allowedTools "Bash(echo *)" "Bash(sh *)"` so one command succeeded and one exited non-zero.
- A disposable local OTLP receiver on `127.0.0.1` that recorded the export request, its headers and its body.

`claude -p` treats the working folder as trusted, so project hooks run without a trust dialog. Interactive sessions hold settings-file hooks back until the folder is trusted.

## Observed hook payloads

| Event | Observed fields |
| --- | --- |
| `SessionStart` | `session_id`, `cwd`, `transcript_path`, `source` (`startup`, `resume`), `hook_event_name`. No `model` field in the observed runs. |
| `UserPromptSubmit` | Common fields plus `prompt` (text), `prompt_id` (UUID) and `permission_mode` (`default`). |
| `PreToolUse` | Common fields plus `tool_name`, `tool_use_id` (`toolu_…`), `tool_input` (for Bash: `command`, `description`), `effort.level`. |
| `PostToolUse` | The `PreToolUse` fields plus `tool_response` and `duration_ms`. `tool_response` for Bash is `{stdout, stderr, interrupted, isImage, noOutputExpected}`. |
| `PostToolUseFailure` | The `PreToolUse` fields plus `error` (a **string**, e.g. `"Exit code 3"`), `is_interrupt` (boolean) and `duration_ms`. No `tool_response`. |
| `Stop` | Common fields plus `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`. |
| `SessionEnd` | Common fields plus `reason` (`other` for a finished non-interactive run). |

**Exit codes are not a number.** A failing command is reported as `PostToolUseFailure` with `error: "Exit code 3"`. No numeric exit code field exists in the observed payload, so an exit code stays **null** unless the adapter explicitly parses that error string under a versioned rule. The `tool_response` of a successful command has no exit code either.

## Observed telemetry payloads

`POST /v1/logs` with `Content-Type: application/json` (protocol `http/json`) or `application/x-protobuf` (protocol `http/protobuf`). Both encodings were exercised against the local receiver; **`http/json` is selected** for the local receiver because it needs no protobuf decoder. The `Authorization` header configured through `OTEL_EXPORTER_OTLP_HEADERS` arrived unchanged.

| Event | Observed attributes |
| --- | --- |
| `user_prompt` | `session.id`, `prompt.id`, `prompt_length`, `prompt` (`<REDACTED>` while `OTEL_LOG_USER_PROMPTS` is unset), `prompt_text` (`<REDACTED>`), `message.uuid`, `event.sequence`, `event.timestamp`. |
| `api_request` | `session.id`, `prompt.id`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cache_creation_5m_tokens`, `cache_creation_1h_tokens`, `cost_usd`, `cost_usd_micros`, `duration_ms`, `ttft_ms`, `request_id`, `client_request_id`, `speed`, `query_source`, `effort`, `event.sequence`. |
| `tool_decision` | `session.id`, `prompt.id`, `tool_name`, `tool_use_id`, `decision` (`accept`), `source` (`config`), `permission_mode`, `tool_source`. |
| `tool_result` | `session.id`, `prompt.id`, `tool_name`, `tool_use_id`, `success` (string `"true"`), `duration_ms` (string), `tool_input_size_bytes`, `tool_result_size_bytes`. |
| `assistant_response` | `session.id`, `prompt.id`, `request_id`, `response_length`, `response` (`<REDACTED>`), `message.uuid`, `model`. |

Content is off by default: prompt text and assistant text arrive as `<REDACTED>` unless `OTEL_LOG_USER_PROMPTS` is enabled, and tool details stay off unless `OTEL_LOG_TOOL_DETAILS` is enabled. Traceframe keeps them off.

**Personal attributes are present by default.** Every observed record carried `user.email`, `user.id`, `organization.id`, `user.account_uuid` and `user.account_id`. The local receiver must drop these attributes before anything is persisted. The sanitized fixtures in [`fixtures/claude.ts`](../fixtures/claude.ts) list them explicitly.

Resource attributes reported `service.name = claude-code` and `service.version = 2.1.306`, which is a usable provenance record for a captured session.

## Correlation between the two sources

In one session with both transports active, the identifiers matched exactly:

| Hook field | Telemetry attribute | Result |
| --- | --- | --- |
| `session_id` | `session.id` | identical |
| `prompt_id` | `prompt.id` | identical |
| `tool_use_id` | `tool_use_id` | identical |

`event.sequence` is a per-process counter (observed values 52, 59, 61, 62, 66). It is **not** a durable identity and must not be used for deduplication across restarts.

## Gap behavior

- **Resume**: `--resume <session>` produced a `SessionStart` with `source: "resume"` and the **same** `session_id`. A resumed session is the same session, not a new one.
- **Interruption**: killing the CLI with `SIGKILL` produced `SessionStart` and `UserPromptSubmit` but **no** `SessionEnd`. An interrupted session therefore stays open, and Traceframe must record a missing end rather than a completed session.
- **Denial**: an observed `tool_decision` carried `decision: "accept"` with `source: "config"`. A denied call is expected to be reported as a rejection, which is a different observation from a missing result.

## What stays unsupported or null

| Item | Status | Reason |
| --- | --- | --- |
| Numeric command exit code | **null** | Only the `error` string reports it. A versioned parser may read it; otherwise it stays null. |
| Complete action history | **not claimed** | Edit/Write hooks do not cover Bash or external rewrites. |
| Prompt and answer text from telemetry | **off by default** | Redacted unless the content gates are enabled; Traceframe keeps them off. |
| Tool input details from telemetry | **off by default** | Requires `OTEL_LOG_TOOL_DETAILS`. |
| Transcript record schema | **experimental** | Not needed for the primary path; the hook payloads are sufficient. |
| Parallel tool calls | **not separately exercised** | Each call carries its own `tool_use_id`, so parallel calls remain separable, but no parallel sample was recorded. |
| Cost figures | **reported estimate only** | `cost_usd` is an estimate and is not an invoice. |

## Consequences for the adapters

1. The hook bridge can normalize prompts, tool requests, tool results, failures and lifecycle events with explicit `session_id`, `prompt_id` and `tool_use_id` as the join keys. Tool results come from `PostToolUse`/`PostToolUseFailure`, and a missing pair stays a gap.
2. The telemetry receiver keeps `http/json` on `POST /v1/logs`, requires the local credential, drops the five personal attributes, and treats `request_id` as the canonical usage identity. `event.sequence` is never an identity.
3. Overlapping sources are joined only by the three verified identifiers. Conflicting or unmatched observations stay visible instead of being merged.
4. A session without `SessionEnd` stays open, and the usage view of an interrupted session reports what is retained.

## Remaining verification

- The bridge and the receiver are not implemented yet; they are the next increments ([#15](https://github.com/ICEQ-JO/quoli/issues/15), [#16](https://github.com/ICEQ-JO/quoli/issues/16)).
- The setup guide and the pilot validation ([#19](https://github.com/ICEQ-JO/quoli/issues/19), [#20](https://github.com/ICEQ-JO/quoli/issues/20)) still need a fresh-machine run.
