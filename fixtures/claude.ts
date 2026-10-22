// Sanitized, source-shaped examples observed on a declared supported version.
//
// These are NOT live captures of a personal session. They were recorded from a
// disposable synthetic repository with Claude Code 2.1.306 on Linux, then
// normalized: identifiers are fixed placeholders, paths are synthetic, prompt
// and answer text is replaced, and personal attributes are removed.
//
// The fixtures exist so the future adapters can be tested against the observed
// payload shape without a Claude account, a network call or a paid API.

export const claudeRuntimeProbe = {
  /** The exact version that was exercised. */
  version: "2.1.306",
  platform: "linux-x64",
  observedAt: "2026-10-22",
  /** Both encodings were exercised against a local receiver. */
  logEncodings: ["http/json", "http/protobuf"] as const,
  /** The encoding the local receiver will use. */
  selectedLogEncoding: "http/json" as const,
  /** Hooks were defined in a disposable project settings file. */
  hookTransport: "command-hook" as const,
  otlpPath: "/v1/logs",
};

export type ClaudeHookSample = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  prompt_id?: string;
  permission_mode?: string;
  effort?: { level: string };
  source?: string;
  reason?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  error?: string;
  is_interrupt?: boolean;
  duration_ms?: number;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  background_tasks?: unknown[];
  session_crons?: unknown[];
  tool_use_id?: string;
};

const session = "11111111-1111-4111-8111-111111111111";
const prompt = "22222222-2222-4222-8222-222222222222";

export function claudeHookSamples(): ClaudeHookSample[] {
  return [
    {
      session_id: session,
      transcript_path: "/synthetic/transcript.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "SessionStart",
      source: "startup",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/transcript.jsonl",
      cwd: "/synthetic/project",
      prompt_id: prompt,
      permission_mode: "default",
      hook_event_name: "UserPromptSubmit",
      prompt: "synthetic probe prompt",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/transcript.jsonl",
      cwd: "/synthetic/project",
      prompt_id: prompt,
      permission_mode: "default",
      effort: { level: "high" },
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo traceframe-probe-ok", description: "Print probe marker" },
      tool_use_id: "toolu_synthetic_aaaaaaaaaaaa",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/transcript.jsonl",
      cwd: "/synthetic/project",
      prompt_id: prompt,
      permission_mode: "default",
      effort: { level: "high" },
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo traceframe-probe-ok", description: "Print probe marker" },
      tool_response: {
        stdout: "traceframe-probe-ok",
        stderr: "",
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
      tool_use_id: "toolu_synthetic_aaaaaaaaaaaa",
      duration_ms: 706,
    },
    {
      session_id: session,
      transcript_path: "/synthetic/transcript.jsonl",
      cwd: "/synthetic/project",
      prompt_id: prompt,
      permission_mode: "default",
      effort: { level: "high" },
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: 'sh -c "exit 3"',
        description: "Run a shell that exits with status 3",
      },
      tool_use_id: "toolu_synthetic_bbbbbbbbbbbb",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/transcript.jsonl",
      cwd: "/synthetic/project",
      prompt_id: prompt,
      permission_mode: "default",
      effort: { level: "high" },
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: {
        command: 'sh -c "exit 3"',
        description: "Run a shell that exits with status 3",
      },
      tool_use_id: "toolu_synthetic_bbbbbbbbbbbb",
      error: "Exit code 3",
      is_interrupt: false,
      duration_ms: 27,
    },
    {
      session_id: session,
      transcript_path: "/synthetic/transcript.jsonl",
      cwd: "/synthetic/project",
      prompt_id: prompt,
      permission_mode: "default",
      effort: { level: "high" },
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "synthetic probe answer",
      background_tasks: [],
      session_crons: [],
    },
    {
      session_id: session,
      transcript_path: "/synthetic/transcript.jsonl",
      cwd: "/synthetic/project",
      prompt_id: prompt,
      hook_event_name: "SessionEnd",
      reason: "other",
    },
  ];
}

export type ClaudeOtlpSample = {
  body: string;
  attributes: Record<string, string | number | boolean>;
};

/**
 * Observed log records. Personal attributes (`user.email`, `user.id`,
 * `organization.id`, `user.account_uuid`, `user.account_id`) are present in the
 * live stream by default and are removed here: the receiver must drop them.
 */
export function claudeOtlpSamples(): ClaudeOtlpSample[] {
  return [
    {
      body: "claude_code.user_prompt",
      attributes: {
        "session.id": session,
        "terminal.type": "Orca",
        "event.name": "user_prompt",
        "event.timestamp": "2026-10-22T13:52:29.951Z",
        "event.sequence": 52,
        "prompt.id": prompt,
        prompt_length: "110",
        prompt: "<REDACTED>",
        prompt_text: "<REDACTED>",
        "message.uuid": "44444444-4444-4444-8444-444444444444",
      },
    },
    {
      body: "claude_code.api_request",
      attributes: {
        "session.id": session,
        "terminal.type": "Orca",
        "event.name": "api_request",
        "event.timestamp": "2026-10-22T13:52:34.036Z",
        "event.sequence": 59,
        "prompt.id": prompt,
        model: "claude-opus-5-5",
        input_tokens: 2,
        output_tokens: 84,
        cache_read_tokens: 10648,
        cache_creation_tokens: 23468,
        cache_creation_5m_tokens: 0,
        cache_creation_1h_tokens: 23468,
        cost_usd: 0.1915616,
        cost_usd_micros: 191562,
        duration_ms: 3836,
        ttft_ms: 3389,
        request_id: "req_synthetic_0001",
        client_request_id: "33333333-3333-4333-8333-333333333333",
        speed: "normal",
        query_source: "sdk",
        effort: "high",
      },
    },
    {
      body: "claude_code.tool_decision",
      attributes: {
        "session.id": session,
        "terminal.type": "Orca",
        "event.name": "tool_decision",
        "event.timestamp": "2026-10-22T13:52:34.104Z",
        "event.sequence": 61,
        "prompt.id": prompt,
        decision: "accept",
        source: "config",
        tool_name: "Bash",
        tool_use_id: "toolu_synthetic_aaaaaaaaaaaa",
        tool_source: "builtin",
        permission_mode: "default",
      },
    },
    {
      body: "claude_code.tool_result",
      attributes: {
        "session.id": session,
        "terminal.type": "Orca",
        "event.name": "tool_result",
        "event.timestamp": "2026-10-22T13:52:34.760Z",
        "event.sequence": 62,
        "prompt.id": prompt,
        tool_name: "Bash",
        tool_use_id: "toolu_synthetic_aaaaaaaaaaaa",
        success: "true",
        duration_ms: "720",
        tool_input_size_bytes: "75",
        tool_result_size_bytes: "21",
      },
    },
    {
      body: "claude_code.assistant_response",
      attributes: {
        "session.id": session,
        "terminal.type": "Orca",
        "event.name": "assistant_response",
        "event.timestamp": "2026-10-22T13:52:36.000Z",
        "event.sequence": 66,
        "prompt.id": prompt,
        response_length: "104",
        response: "<REDACTED>",
        request_id: "req_synthetic_0001",
        "message.uuid": "55555555-5555-4555-8555-555555555555",
        model: "claude-opus-5-5",
        query_source: "sdk",
      },
    },
  ];
}

/** Attributes the local receiver must drop before anything is persisted. */
export const claudePersonalAttributes = [
  "user.id",
  "user.email",
  "organization.id",
  "user.account_uuid",
  "user.account_id",
];
