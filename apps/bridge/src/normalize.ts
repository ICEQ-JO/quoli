import { createHash } from "node:crypto";
import type { Content, NormalizedEvent } from "@traceframe/schema";
import { redact } from "@traceframe/schema/privacy";

/**
 * Normalization of Claude Code hook payloads into Traceframe observations.
 *
 * The shapes follow the runtime verification report for Claude Code 2.1.306.
 * Facts the source does not report stay null: the hook payload carries no
 * timestamp and no numeric exit code, so both remain unknown.
 */

export const BRIDGE_PRODUCER = "claude-hook-bridge-v1";
export const BRIDGE_VERSION = "0.1.0";
export const CLAUDE_ADAPTER_ID = "claude-code-hook";
export const CLAUDE_RECORDED_SOURCE_VERSION = "2.1.306";
export const CLAUDE_SOURCE_VERSION = "unreported";

const MAX_TEXT = 65_536;

export type HookPayload = Record<string, unknown> & {
  hook_event_name?: string;
  session_id?: string;
  prompt_id?: string | null;
  tool_use_id?: string | null;
  agent_type?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  error?: unknown;
  is_interrupt?: boolean;
  prompt?: unknown;
  reason?: unknown;
  source?: unknown;
};

function id(prefix: string, parts: unknown[]): string {
  return `${prefix}-${createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 32)}`;
}

/**
 * Bounds and redacts content before it leaves the bridge. The collector
 * sanitizes again under the policy that is active at delivery time.
 */
function text(value: unknown): string | null {
  if (typeof value === "string") return redact(value).slice(0, MAX_TEXT);
  if (value === null || value === undefined) return null;
  try {
    return redact(JSON.stringify(value)).slice(0, MAX_TEXT);
  } catch {
    return null;
  }
}

function content(
  value: string | null,
  state: Content["state"],
  categories: Content["categories"],
): Content {
  return { text: value, state, originalBytes: null, categories };
}

const TOOL_NAMES: Record<string, "Read" | "Write" | "Edit" | "Bash" | "Other"> = {
  Read: "Read",
  Write: "Write",
  Edit: "Edit",
  Bash: "Bash",
};

function toolName(name: unknown): "Read" | "Write" | "Edit" | "Bash" | "Other" {
  return typeof name === "string" ? (TOOL_NAMES[name] ?? "Other") : "Other";
}
function rawToolName(name: unknown): string {
  return typeof name === "string" && name.trim() ? name.slice(0, 200) : "Unknown";
}

function filePath(input: Record<string, unknown> | undefined): string | null {
  const value = input?.file_path;
  return typeof value === "string" ? value.slice(0, 1024) : null;
}

/**
 * Builds the observation for one hook payload, or null when the event carries
 * nothing Traceframe records.
 */
export function normalizeHook(
  payload: HookPayload,
  context: { projectId: string; sessionId: string },
): NormalizedEvent | null {
  const sessionId = context.sessionId;
  const promptId = typeof payload.prompt_id === "string" ? payload.prompt_id : null;
  const toolId = typeof payload.tool_use_id === "string" ? payload.tool_use_id : null;
  const base = {
    schemaVersion: 2 as const,
    projectId: context.projectId,
    sessionId,
    source: "claude_hook",
    sourceVersion: CLAUDE_SOURCE_VERSION,
    adapterId: CLAUDE_ADAPTER_ID,
    adapterVersion: BRIDGE_VERSION,
    sourceLocator: [
      "claude_hook",
      payload.hook_event_name ?? "unknown",
      // A subagent call is recorded, but its scope is only visible here.
      typeof payload.agent_type === "string" ? payload.agent_type : null,
    ]
      .filter(Boolean)
      .join(":"),
    producerId: BRIDGE_PRODUCER,
    promptId,
    toolId,
    requestId: null,
    // The hook payload reports no time of its own; receipt order is the order.
    sourceTime: null,
    sourceSequence: null,
    policyVersion: 1,
    fieldCapabilities: {
      content: "available" as const,
      plan: "unsupported" as const,
      decision: "unsupported" as const,
      approval: "unsupported" as const,
      correction: "unsupported" as const,
    },
    declared: { plan: null, decision: null, approval: null, correction: null },
    activity: {
      turnId: null,
      parentSessionId: null,
      parentTurnId: null,
      childSessionId: null,
      childTurnId: null,
    },
  };
  const event = payload.hook_event_name;
  if (event === "SessionStart")
    return {
      ...base,
      id: id("hook", [sessionId, "SessionStart"]),
      deliveryId: id("deliver", [sessionId, "SessionStart"]),
      tool: null,
      payload: { kind: "session_start", content: content(null, "unavailable", ["prompt", "code"]) },
    };
  if (event === "SessionEnd")
    return {
      ...base,
      id: id("hook", [sessionId, "SessionEnd"]),
      deliveryId: id("deliver", [sessionId, "SessionEnd"]),
      tool: null,
      payload: { kind: "session_end", reason: "completed" },
    };
  if (event === "UserPromptSubmit")
    return {
      ...base,
      id: id("hook", [sessionId, "UserPromptSubmit", promptId]),
      deliveryId: id("deliver", [sessionId, "UserPromptSubmit", promptId]),
      tool: null,
      payload: {
        kind: "prompt",
        content: content(text(payload.prompt) ?? null, "present", ["prompt", "code"]),
      },
    };
  if (event === "PreToolUse") {
    const command = payload.tool_input?.command;
    return {
      ...base,
      id: id("hook", [sessionId, "PreToolUse", toolId]),
      deliveryId: id("deliver", [sessionId, "PreToolUse", toolId]),
      tool: { rawName: rawToolName(payload.tool_name), category: toolName(payload.tool_name) },
      payload: {
        kind: "tool_call",
        toolName: toolName(payload.tool_name),
        content: content(text(command ?? payload.tool_input) ?? null, "present", ["tool", "code"]),
        path: filePath(payload.tool_input),
      },
    };
  }
  if (event === "PostToolUse")
    return {
      ...base,
      id: id("hook", [sessionId, "PostToolUse", toolId]),
      deliveryId: id("deliver", [sessionId, "PostToolUse", toolId]),
      tool: { rawName: rawToolName(payload.tool_name), category: toolName(payload.tool_name) },
      payload: {
        kind: "tool_result",
        toolName: toolName(payload.tool_name),
        content: content(text(payload.tool_response) ?? null, "present", ["tool", "code"]),
        // The runtime reports no numeric exit code for a successful command.
        exitCode: null,
        status: "success",
      },
    };
  if (event === "PostToolUseFailure")
    return {
      ...base,
      id: id("hook", [sessionId, "PostToolUseFailure", toolId]),
      deliveryId: id("deliver", [sessionId, "PostToolUseFailure", toolId]),
      tool: { rawName: rawToolName(payload.tool_name), category: toolName(payload.tool_name) },
      payload: {
        kind: "tool_result",
        toolName: toolName(payload.tool_name),
        content: content(text(payload.error) ?? null, "present", ["tool", "code"]),
        // Only an error string reports the exit status; the code itself is unknown.
        exitCode: null,
        status: payload.is_interrupt === true ? "interrupted" : "failure",
      },
    };
  return null;
}
