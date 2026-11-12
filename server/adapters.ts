import type { AgentKind } from "../shared/model.ts";
import type { UsageRow } from "./db.ts";

/**
 * An adapter turns one agent's hook payload into Quoli's shared event payload: the Claude Code
 * hook shape (`session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`,
 * `tool_response`, `prompt`, `agent_id`). It returns null for payloads it does not understand.
 * Adapters only rename and reshape fields; they never invent values.
 */
export interface Adapter {
  agent: AgentKind;
  normalize(payload: Record<string, unknown>): Record<string, unknown> | null;
  /** Token usage carried by the event itself, for agents that report it in hooks. */
  usage?(payload: Record<string, unknown>, at: string): UsageRow | null;
}

/** Claude Code's hooks are the shared shape already. */
const claudeCode: Adapter = { agent: "claude-code", normalize: (payload) => payload };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * The exit code Codex prints at the top of a tool result: "Exit code: 1" (shell, apply_patch)
 * or "Process exited with code 1" (unified exec). Null when the text has neither.
 */
export function codexExitCode(response: unknown): number | null {
  if (typeof response !== "string") return null;
  const m = /^(?:Exit code: |Process exited with code )(-?\d+)\s*$/m.exec(
    response.split("\n").slice(0, 6).join("\n"),
  );
  return m ? Number(m[1]) : null;
}

/**
 * Codex hooks (learn.chatgpt.com/docs/hooks; schemas in openai/codex codex-rs/hooks/schema)
 * already use Claude Code's field names. Shell and unified exec calls arrive as `Bash` with a
 * `command` string, patches as `apply_patch` with the patch text in `command`. Codex has no
 * failure event, so a PostToolUse whose result reports a non-zero exit code is stored as
 * PostToolUseFailure and marked `quoli_failure_inferred`. WebSearch and other hosted tools do
 * not fire hooks, so they are never recorded.
 */
const codex: Adapter = {
  agent: "codex",
  normalize(payload) {
    if (payload.hook_event_name !== "PostToolUse") return payload;
    const code = codexExitCode(payload.tool_response);
    if (code === null || code === 0) return payload;
    return {
      ...payload,
      hook_event_name: "PostToolUseFailure",
      error: payload.tool_response,
      quoli_failure_inferred: true,
    };
  },
  usage(payload, at) {
    const u = payload.token_usage as Record<string, unknown> | null | undefined;
    if (payload.hook_event_name !== "PostModelRequest" || !u || typeof u !== "object") return null;
    if (typeof payload.session_id !== "string") return null;
    // Codex input_tokens include cached_input_tokens; Quoli counts uncached input separately.
    const cached = num(u.cached_input_tokens);
    return {
      messageId: `codex:${payload.session_id}:${typeof payload.turn_id === "string" ? payload.turn_id : ""}:${at}`,
      sessionId: payload.session_id,
      agentId: typeof payload.agent_id === "string" ? payload.agent_id : "main",
      model: typeof payload.model === "string" ? payload.model : null,
      at,
      input: Math.max(0, num(u.input_tokens) - cached),
      output: num(u.output_tokens),
      cacheRead: cached,
      cacheWrite: num(u.cache_write_input_tokens),
    };
  },
};

/** Agents with a live capture adapter. OpenCode (#118) is added here. */
const ADAPTERS: Partial<Record<AgentKind, Adapter>> = { "claude-code": claudeCode, codex };

export const adapterFor = (agent: AgentKind): Adapter | null => ADAPTERS[agent] ?? null;
