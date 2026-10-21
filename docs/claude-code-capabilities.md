# Claude Code capability matrix

Research date: **2026-10-22**. Only official documentation supports the findings below. This is documentation discovery, not certification of an installed version. No Claude executable or personal session directory was inspected. Every runtime capability is **unverified** until issue 013 records the tested version, OS, settings and source-shaped sanitized examples.

## Sources and documented surfaces

- [H: Hooks reference](https://code.claude.com/docs/en/hooks#common-input-fields): command/HTTP payloads and event-specific contracts.
- [T: Monitoring](https://code.claude.com/docs/en/monitoring-usage#available-metrics-and-events): OpenTelemetry configuration, events, metrics and correlation.
- [A: Application data](https://code.claude.com/docs/en/claude-directory#application-data): local artifact locations and lifecycle.
- [S: Status line](https://code.claude.com/docs/en/statusline#available-data): callback data and update behavior.
- [C: Costs](https://code.claude.com/docs/en/costs#track-your-costs): reported cost semantics.

**D** = documented interface; **E** = experimental parsing; **U** = unavailable as an established claim. “D” does not promise delivery or support on an untested version. Proposed normalization and fallback columns are Traceframe design decisions.

| Capability | Source / documentation finding | Contract | Proposed normalization / limitation |
| --- | --- | --- | --- |
| Session identity and location | H: `session_id`, `cwd`, `hook_event_name`, `transcript_path` | D | Register repository explicitly; path alone cannot authorize a project. |
| Prompt association | H: optional `prompt_id` matches telemetry `prompt.id` | D | Null before available; never use nearest timestamp as recorded parentage. |
| Submitted prompt | H: `UserPromptSubmit.prompt` | D | Text requires consent; retain metadata when disabled. |
| Tool invocation | H: `PreToolUse`, `tool_use_id`, `tool_name`, `tool_input` | D | Record attempted invocation, not completed action. |
| Tool completion | H: `PostToolUse.tool_response`; tool-dependent shape; optional `duration_ms` | D | Per-tool validation; unknown result fields remain unavailable. |
| Tool failure | H: `PostToolUseFailure.error`, optional `is_interrupt` | D | Failure is separate from missing completion. |
| Session lifecycle / final text | H: `SessionStart`, `SessionEnd`, `Stop.last_assistant_message` | D | Stop is a turn boundary; crashes leave an open/incomplete session. |
| Broader file notifications | H: `FileChanged` is documented | D | Optional later enhancement; repository snapshots remain baseline design. |
| Hook transcript pointer | H: transcript writes may lag callbacks | D pointer / E parser | Do not require transcript reads for the primary path. |
| Content coverage | H: Edit/Write hooks do not cover Bash or external rewrites | D limitation | No complete-capture badge. |
| Reported request usage | T: `claude_code.api_request`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, model/duration/request IDs | D | Preferred request-level usage stream; absent counts stay null. |
| Counter usage | T: `claude_code.token.usage` types input/output/cacheRead/cacheCreation | D | Alternative aggregate observation; never add to request totals. |
| Token meaning | T: non-cache input excludes cache reads/writes | D | Show four categories; any combined sum is labeled derived. |
| Correlation / order | T: `session.id`, `prompt.id`, `request_id`, `event.sequence`; sequence is per process | D | Scope sequence to producer process; missing identity limits deduplication. |
| Tool telemetry | T: `tool_result` reports `tool_use_id`, success and duration | D | Complement hooks; success is a reported tool status. |
| Local telemetry configuration | T: OTLP endpoint/protocol and authorization headers are configurable | D | Verify authenticated local HTTP export in issue 013; no remote exporter required. |
| Detailed telemetry text | T: content/detail logging has explicit gates | D | Leave raw-body logging off; avoid enabling global detail flags just to fill a field. |
| Traces | T: traces are marked beta | D beta | Excluded from MVP transport; logs suffice if runtime gate passes. |
| Status callback | S: stdin JSON includes session/model/cost and context-window usage; callbacks are debounced | D | Not a lossless event feed. Do not replace an existing status line. |
| Status usage semantics | S: context totals describe latest context, including cache input; `current_usage` can be null | D | Do not treat sampled context totals as accumulated session consumption. Optional fallback needs separate design. |
| Transcript artifacts | A: `projects/<project>/<session>.jsonl`, nested subagent transcripts, spilled tool-results | D locations / E record schema | Default off; version-gated importer only under issue 020. |
| Before-edit artifacts | A: `file-history/<session>/` holds checkpoint snapshots | D purpose / E mapping | No stable diff interface assumed; use Traceframe snapshots. |
| Artifact availability | A: application data is plaintext and subject to cleanup | D | No promise of historical recovery; missing source state remains visible. |
| Reported money | C: local cost figures are estimates; subscription billing differs | D | Optional reported estimate only; no invoice claim or file/prompt allocation. |
| Command exit code | H: varies with result/failure shape | D partial | Runtime-check supported command payloads; null if not explicitly available or reliably supported. |
| Test counts / correctness | Captured output plus explicitly supported deterministic parser | Traceframe derived / U correctness | Preserve output basis; parser failure leaves counts null. No assertion that feature works. |
| File authorship | Git observations plus tool path references | Traceframe derived / U exclusive attribution | Link observation windows; concurrent edits and Bash changes remain ambiguous. |
| Hidden reasoning, complete action history, exact prompt/file costs | No verified interface establishes these product claims | U | Do not expose invented values or explanations implying private reasoning. |

The application-data documentation describes artifact existence and purpose. This review did **not** establish a stable public schema for all JSONL records, spill-file references or checkpoint mappings. Treating those internals as experimental is a Traceframe compatibility decision, not a claim that local artifacts do not exist.

## Primary implementation choice

Propose a read-only command-hook bridge for prompts, tools and lifecycle, plus a narrow authenticated local OTLP logs receiver for reported usage. Redact and bound hook content before a sanitized local retry spool. Telemetry is sanitized in receiver memory before persistence. Keep telemetry content/body logging disabled; no raw staging files. Direct HTTP hooks remain an evaluated alternative, not a second transport to build by default.

Status-line capture is not needed for MVP. Experimental transcript parsing is isolated and off by default. Existing user hooks, telemetry destinations and status lines must survive setup; conflicting managed configuration produces instructions and a capability warning rather than forced replacement.

## Overlap and provenance rules (proposed)

1. Keep source observations independently, with source kind, adapter/producer version, delivery identity and source locator. Deduplicate transport retries within a source; do not erase corroborating evidence from another source.
2. Join hook/telemetry tool observations only using project + source session + tool invocation ID. Join prompts only with available explicit prompt IDs. Record the join rule and both evidence IDs.
3. Use uniquely identified request observations as the canonical usage series. Keep counters or status samples as separately labeled reconciliation views. Never sum across these views.
4. A process-local sequence without a known process identity is insufficient for durable event identity. Generate bridge delivery IDs; mark OTLP records with insufficient identity as ambiguous rather than deduplicating by text.
5. If request identity or overlap cannot be established, show source-specific reported totals and a combined total of null. Missing export windows, resets, retries, shutdown loss and late arrival lower coverage; they do not imply zero activity.
6. Conflicting observations remain visible. Source precedence chooses a displayed field with an explanation; it cannot turn a conflict into certainty or overwrite history.

## Runtime verification gate before adapter implementation

Issue 013 must supply a supported-version report, not merely update this table from memory:

- Recheck official contracts; record tested version and configuration, distinguish documented examples from observed fixtures.
- On an explicitly authorized disposable repository, exercise prompt, allowed/failed/interrupted tool activity, denied actions, a resumed session, shutdown, parallel calls and overlapping sources. Never copy real private sessions.
- Verify actual command output and exit-code shapes, identifiers, ordering, authenticated local OTLP wire format, telemetry content gates and producer identity across restart/resume. Mark unsupported values null with reasons.
- Determine which fields can be correlated reliably and which cannot. A feature can ship as unavailable if safely bounded; reliable reported usage must have at least one verified source before the live-usage milestone passes.
- Exercise offline collection and malformed/oversized payloads using synthetic harnesses. Record gap behavior, compatibility range and revalidation triggers.

No plan assumes a complete hook stream, a stable transcript record schema, universally available prompt IDs, or exhaustive subagent capture.
