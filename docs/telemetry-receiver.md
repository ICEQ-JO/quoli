# Reported usage receiver

The collector exposes one narrow OTLP endpoint for the usage Claude Code reports about its own requests: `POST /v1/logs`. It accepts the `http/json` encoding, requires the local credential and stores only request-usage observations.

## Enable it

Claude Code exports telemetry when these variables are set in the environment that starts it (or in your user settings, never in a repository settings file, which Claude Code ignores for these variables):

```sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=none
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://127.0.0.1:4318/v1/logs
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <local credential>"
```

The credential is the local one in your private data directory. The collector must know which project the telemetry belongs to: start it with `TRACEFRAME_PROJECT_ID=<registered project id>`, or let it fall back to the single registered local project.

Nothing else is enabled. `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_TOOL_CONTENT` and `OTEL_LOG_RAW_API_BODIES` stay off, so prompt text, answer text, tool details and raw API bodies are redacted at the source and never leave Claude Code.

## What is received

Only the `api_request` record is used. It carries the reported request identity, the model and the four token categories:

| Reported attribute | Observation |
| --- | --- |
| `session.id` | The session the request belongs to. |
| `prompt.id` | The request's prompt identity, so usage joins the prompt and its tool calls. |
| `request_id` | The request identity, used to deduplicate a repeated export. |
| `input_tokens` | Non-cache input. |
| `output_tokens` | Output. |
| `cache_read_tokens` | Cache reads. |
| `cache_creation_tokens` | Cache writes. |
| `model` | The reported model. |
| `event.timestamp` | The source time of the request. |

The four counts are independent: a missing count stays null and the usage view reports the total as unknown rather than as zero.

## What is dropped

Every record also carries `user.email`, `user.id`, `organization.id`, `user.account_uuid` and `user.account_id` by default. The receiver drops these attributes before anything is stored, and the stored observation contains only the fields listed above. Records that are not request-usage records are ignored: this receiver is deliberately narrow, and the hook bridge is the source for prompts, tools and lifecycle.

`event.sequence` is a per-process counter. It is recorded for reference but never used as an identity, so a restart cannot merge or lose a request.

## Bounds

The endpoint accepts up to 8 MiB per export and only the `application/json` content type; a protobuf export is rejected with an explicit error rather than being half-read. A repeated export of the same request is recognised as a duplicate and does not change the totals. A request that cannot be stored is reported as a conflict and is never counted twice.

## Validation

`tests/otel.test.ts` covers the mapping of a reported request, the removal of personal attributes, the ignoring of other record kinds, the rejection of an unauthenticated or wrongly encoded export and the duplicate handling. The receiver was exercised end to end against Claude Code 2.1.306: a real session produced two usage observations and the usage view reported the summed categories with a complete record.

See the [runtime verification report](claude-code-runtime-report.md) for the observed record shapes.
