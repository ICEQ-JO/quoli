import { type AgentKind, categorize } from "../shared/model.ts";
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

const text = (v: unknown) => (typeof v === "string" ? v : null);

/** What a tool returned, as text: shell output, or the text parts OpenCode shows the model. */
function opencodeResult(p: Record<string, unknown>): string | null {
  const out = p.output as Record<string, unknown> | undefined;
  if (out && typeof out === "object" && typeof out.output === "string") return out.output;
  if (Array.isArray(p.content)) {
    const parts = p.content
      .map((c) => (c && typeof c === "object" ? text((c as { text?: unknown }).text) : null))
      .filter((t): t is string => t !== null);
    if (parts.length) return parts.join("\n");
  }
  return text(p.output);
}

/**
 * OpenCode 2 has no hook commands; Quoli's plugin (`server/opencode-plugin.js`, installed into
 * `.opencode/plugins/`) forwards `opencode_event` records built from the documented plugin API:
 * the session `prompt` hook, `tool.execute.before/after`, and the `session.step.*` and
 * `session.execution.*` events. Fields observed on OpenCode 2.0.32 are recorded in
 * docs/architecture.md. The original OpenCode fields are kept next to the mapped ones.
 */
const opencode: Adapter = {
  agent: "opencode",
  normalize(p) {
    const base = {
      session_id: p.sessionID,
      cwd: p.cwd,
      quoli_agent_version: text(p.version),
      opencode_event: p.opencode_event,
    };
    switch (p.opencode_event) {
      case "session.start":
        return { ...base, hook_event_name: "SessionStart", source: "startup" };
      case "prompt":
        return { ...base, hook_event_name: "UserPromptSubmit", prompt: text(p.text) ?? "" };
      case "tool.before":
      case "tool.after": {
        const name = text(p.tool) ?? "unknown";
        const input = (p.input && typeof p.input === "object" ? p.input : {}) as Record<
          string,
          unknown
        >;
        // OpenCode names a file `path`; for search tools `path` is the folder searched.
        const fileTool = ["read", "edit"].includes(categorize(name));
        const tool_input =
          fileTool && typeof input.path === "string" ? { ...input, file_path: input.path } : input;
        const call = {
          ...base,
          tool_name: name,
          tool_use_id: p.id,
          tool_input,
          opencode_agent: p.agent,
        };
        if (p.opencode_event === "tool.before") return { ...call, hook_event_name: "PreToolUse" };
        const exit = (p.output as { exit?: unknown } | undefined)?.exit;
        const failed = p.status === "error" || (typeof exit === "number" && exit !== 0);
        const result = opencodeResult(p);
        return failed
          ? {
              ...call,
              hook_event_name: "PostToolUseFailure",
              error: text(p.error) ?? result ?? "failed",
            }
          : { ...call, hook_event_name: "PostToolUse", tool_response: result ?? "" };
      }
      case "step.ended":
        return {
          ...base,
          hook_event_name: "PostModelRequest",
          model: text(p.model),
          message_id: p.messageID,
          token_usage: p.tokens,
          opencode_cost: p.cost,
        };
      case "turn.ended":
        return {
          ...base,
          hook_event_name: "Stop",
          outcome: p.outcome,
          last_assistant_message: text(p.text),
        };
      default:
        return null;
    }
  },
  usage(p, at) {
    const t = p.token_usage as Record<string, unknown> | null | undefined;
    if (p.hook_event_name !== "PostModelRequest" || !t || typeof t !== "object") return null;
    if (typeof p.session_id !== "string" || typeof p.message_id !== "string") return null;
    const cache = (t.cache ?? {}) as Record<string, unknown>;
    return {
      messageId: `opencode:${p.message_id}`,
      sessionId: p.session_id,
      agentId: "main",
      model: text(p.model),
      at,
      // OpenCode reports uncached input; reasoning is billed as output.
      input: num(t.input),
      output: num(t.output) + num(t.reasoning),
      cacheRead: num(cache.read),
      cacheWrite: num(cache.write),
    };
  },
};

/**
 * Pi (docs/extensions.md in @earendil-works/pi-coding-agent 0.75): records from Quoli's project
 * extension, server/pi-extension.ts. Tools are read/write/edit/ls with `path`, bash with
 * `command`, grep/find with a `pattern` and an optional folder `path`. `edit` carries
 * `edits: [{ oldText, newText }]`, mapped onto Claude Code's `old_string`/`new_string`.
 * A tool failure is the end event's `isError`.
 */
function piInput(tool: string, input: unknown): Record<string, unknown> {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...i };
  if (["read", "edit"].includes(categorize(tool)) && typeof i.path === "string") {
    out.file_path = i.path;
  }
  if (Array.isArray(i.edits)) {
    const edits = i.edits.map((e) => {
      const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      return { old_string: text(o.oldText) ?? "", new_string: text(o.newText) ?? "" };
    });
    if (edits.length === 1) {
      out.old_string = edits[0].old_string;
      out.new_string = edits[0].new_string;
      delete out.edits;
    } else out.edits = edits;
  }
  return out;
}

const pi: Adapter = {
  agent: "pi",
  normalize(p) {
    if (typeof p.sessionID !== "string" || typeof p.pi_event !== "string") return null;
    const base = { session_id: p.sessionID, cwd: p.cwd, pi_event: p.pi_event };
    switch (p.pi_event) {
      case "session.start":
        return { ...base, hook_event_name: "SessionStart", source: text(p.reason) ?? "startup" };
      case "prompt":
        return { ...base, hook_event_name: "UserPromptSubmit", prompt: text(p.text) ?? "" };
      case "tool.start":
      case "tool.end": {
        const name = text(p.tool) ?? "unknown";
        const call = {
          ...base,
          tool_name: name,
          tool_use_id: p.id,
          tool_input: piInput(name, p.input),
        };
        if (p.pi_event === "tool.start") return { ...call, hook_event_name: "PreToolUse" };
        const output = text(p.output) ?? "";
        return p.isError === true
          ? { ...call, hook_event_name: "PostToolUseFailure", error: output || "failed" }
          : { ...call, hook_event_name: "PostToolUse", tool_response: output };
      }
      case "message.end":
        return {
          ...base,
          hook_event_name: "PostModelRequest",
          model: text(p.model),
          provider: text(p.provider),
          message_id: p.messageID,
          token_usage: p.usage,
          stop_reason: text(p.stopReason),
        };
      case "agent.end":
        return { ...base, hook_event_name: "Stop", last_assistant_message: text(p.text) };
      case "session.shutdown":
        // A reload keeps the same session running.
        return p.reason === "reload"
          ? null
          : { ...base, hook_event_name: "SessionEnd", reason: p.reason };
      default:
        return null;
    }
  },
  usage(p, at) {
    const t = p.token_usage as Record<string, unknown> | null | undefined;
    if (p.hook_event_name !== "PostModelRequest" || !t || typeof t !== "object") return null;
    if (typeof p.session_id !== "string" || typeof p.message_id !== "string") return null;
    return {
      messageId: `pi:${p.session_id}:${p.message_id}`,
      sessionId: p.session_id,
      agentId: "main",
      model: text(p.model),
      at,
      input: num(t.input),
      output: num(t.output),
      cacheRead: num(t.cacheRead),
      cacheWrite: num(t.cacheWrite),
    };
  },
};

/** Agents with a live capture adapter. */
const ADAPTERS: Partial<Record<AgentKind, Adapter>> = {
  "claude-code": claudeCode,
  codex,
  opencode,
  pi,
};

export const adapterFor = (agent: AgentKind): Adapter | null => ADAPTERS[agent] ?? null;
