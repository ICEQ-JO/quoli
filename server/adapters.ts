import type { AgentKind } from "../shared/model.ts";

/**
 * An adapter turns one agent's hook payload into Quoli's shared event payload: the Claude Code
 * hook shape (`session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`,
 * `tool_response`, `prompt`, `agent_id`). It returns null for payloads it does not understand.
 * Adapters only rename and reshape fields; they never invent values.
 */
export interface Adapter {
  agent: AgentKind;
  normalize(payload: Record<string, unknown>): Record<string, unknown> | null;
}

/** Claude Code's hooks are the shared shape already. */
const claudeCode: Adapter = { agent: "claude-code", normalize: (payload) => payload };

/** Agents with a live capture adapter. Codex (#117) and OpenCode (#118) are added here. */
const ADAPTERS: Partial<Record<AgentKind, Adapter>> = { "claude-code": claudeCode };

export const adapterFor = (agent: AgentKind): Adapter | null => ADAPTERS[agent] ?? null;
