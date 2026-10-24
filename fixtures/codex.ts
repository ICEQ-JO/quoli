// Synthetic Codex hook payloads in the shapes Codex 0.163.0 sends.
//
// SessionStart, UserPromptSubmit and SessionEnd were observed on 0.163.0 in a
// disposable project with an isolated CODEX_HOME and a local OpenAI-compatible
// stub provider, so no account, network call or paid API was used. Identifiers,
// paths and text below are replaced with fixed placeholders.
//
// PreToolUse, PostToolUse, SubagentStart and SubagentStop are still
// documented-shape only: that run did not call a tool or spawn a subagent. They
// follow the official event tables and are marked as such in the adapter
// reference; a tool/subagent capture is still owed.

export const codexProbe = {
  version: "0.163.0",
  platform: "linux-x64",
  /** Where the documented contract lives. */
  contract: "https://learn.chatgpt.com/docs/hooks",
  /** Which events were exercised against the real CLI. */
  observedEvents: ["SessionStart", "UserPromptSubmit", "SessionEnd"] as const,
  documentedOnlyEvents: ["PreToolUse", "PostToolUse", "SubagentStart", "SubagentStop"] as const,
  observedAt: "2026-10-24",
  /** How the payloads below were produced. */
  basis: "observed-and-documented-shape" as const,
  hookTransport: "command-hook" as const,
  projectHookFile: ".codex/hooks.json",
};

export type CodexHookSample = {
  session_id: string;
  transcript_path: string | null;
  cwd: string;
  hook_event_name: string;
  model?: string;
  permission_mode?: string;
  turn_id?: string;
  source?: string;
  reason?: string;
  prompt?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  agent_id?: string;
  agent_type?: string;
  agent_transcript_path?: string | null;
  stop_hook_active?: boolean;
  last_assistant_message?: string | null;
};

// Codex reports UUID-shaped session and turn identifiers.
const session = "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
const turn = "018f1a2b-9c8d-7e6f-8a1b-2c3d4e5f6a7b";

export function codexHookSamples(): CodexHookSample[] {
  return [
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "SessionStart",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      source: "startup",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "UserPromptSubmit",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      turn_id: turn,
      prompt: "synthetic probe prompt",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "PreToolUse",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      turn_id: turn,
      tool_name: "Bash",
      tool_use_id: "call_synthetic_aaaaaaaaaaaa",
      tool_input: { command: "echo quoli-codex-probe-ok", description: "Print probe marker" },
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "PostToolUse",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      turn_id: turn,
      tool_name: "Bash",
      tool_use_id: "call_synthetic_aaaaaaaaaaaa",
      tool_input: { command: "echo quoli-codex-probe-ok", description: "Print probe marker" },
      tool_response: "quoli-codex-probe-ok\n",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "PreToolUse",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      turn_id: turn,
      tool_name: "apply_patch",
      tool_use_id: "call_synthetic_bbbbbbbbbbbb",
      tool_input: {
        command: "*** Begin Patch\n*** Add File: probe.txt\n+probe\n*** End Patch\n",
      },
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "SubagentStart",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      turn_id: turn,
      agent_id: "agent_synthetic_1111",
      agent_type: "explorer",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "SubagentStop",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      turn_id: turn,
      agent_id: "agent_synthetic_1111",
      agent_type: "explorer",
      agent_transcript_path: null,
      stop_hook_active: false,
      last_assistant_message: null,
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "PermissionRequest",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      turn_id: turn,
      tool_name: "Bash",
      tool_input: { command: "echo approval", description: "Needs approval" },
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "Stop",
      model: "gpt-5.1-codex",
      permission_mode: "default",
      turn_id: turn,
      stop_hook_active: false,
      last_assistant_message: "synthetic probe answer",
    },
    {
      session_id: session,
      transcript_path: "/synthetic/.codex/sessions/2026/10/24/rollout-synthetic.jsonl",
      cwd: "/synthetic/project",
      hook_event_name: "SessionEnd",
      reason: "other",
    },
  ];
}
