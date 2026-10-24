import { createHash } from "node:crypto";
import type { NormalizedEvent } from "@traceframe/schema";
import { defineAdapter } from "@traceframe/schema/adapter";
import { boundedText, hookContent } from "./normalize";

/**
 * Codex CLI lifecycle-hook adapter.
 *
 * Facts come from the Codex 0.163.0 hook documentation (event tables, common
 * input fields and tool coverage). The hook payload reports no source version,
 * no timestamp, no token usage and no exit status, so those stay explicitly
 * unsupported rather than guessed. `transcript_path` is deliberately ignored:
 * the documentation says the transcript format is not a stable interface.
 */

export const CODEX_VERSION = "0.163.0";

/** Hook event to observation kind. Unlisted events are not collected. */
export const CODEX_EVENTS = {
  SessionStart: "session_start",
  UserPromptSubmit: "prompt",
  PreToolUse: "tool_call",
  PostToolUse: "tool_result",
  SubagentStart: "session_start",
  SubagentStop: "session_end",
  SessionEnd: "session_end",
} as const;

function identity(parts: unknown[]): string {
  return `cdx-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32)}`;
}

export const codexAdapter = defineAdapter({
  id: "codex-hook",
  harness: "Codex",
  source: "codex_hook",
  producerId: "codex-hook-bridge-v1",
  adapterVersion: "0.1.0",
  sourceVersions: [CODEX_VERSION],
  eventMapping: CODEX_EVENTS,
  capabilities: {
    content: ["prompt", "tool", "code"],
    // Documented identifiers only: session_id, turn_id (request scope) and
    // tool_use_id. Codex reports no prompt id and no child session id.
    identifiers: ["session", "tool", "request"],
    usage: false,
    sourceTime: false,
    fields: {
      plan: "unsupported",
      decision: "unsupported",
      approval: "unsupported",
      correction: "unsupported",
    },
  },
  failures: { status: "unsupported", exitCode: "unsupported", gaps: ["unsupported_source"] },
  delivery: "session_event_source_id",
  install: { mode: "reversible_project_hooks", settingsPath: ".codex/hooks.json" },
  deliveryId: ({ sessionId, event, toolId, requestId, childSessionId }) =>
    identity([sessionId, event, toolId ?? null, requestId ?? null, childSessionId ?? null]),
});

/** Accepts only the documented free-form identifiers; anything else is a gap. */
export function codexId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
}

/** Extracts `0.163.0` from `codex-cli 0.163.0`, or null when unparseable. */
export function codexSourceVersion(output: string | null | undefined): string | null {
  const match = /(\d+\.\d+\.\d+)/.exec(output ?? "");
  return match ? match[1] : null;
}

type ToolCategory = "Read" | "Write" | "Edit" | "Bash" | "Other";
const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Bash: "Bash",
  apply_patch: "Edit",
  Read: "Read",
  Write: "Write",
  Edit: "Edit",
};

function toolCategory(name: string): ToolCategory {
  return TOOL_CATEGORIES[name] ?? "Other";
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function inputPath(input: Record<string, unknown> | undefined): string | null {
  const value = input?.file_path;
  return typeof value === "string" ? value.slice(0, 1024) : null;
}

/**
 * Builds the observation for one Codex hook payload, or null when the event
 * carries nothing Quoli records.
 */
export function normalizeCodex(
  payload: Record<string, unknown>,
  context: { projectId: string; sessionId: string },
): NormalizedEvent | null {
  const event = payload.hook_event_name;
  if (typeof event !== "string" || !Object.hasOwn(CODEX_EVENTS, event)) return null;
  const sessionId = context.sessionId;
  const turnId = codexId(payload.turn_id);
  const toolId = codexId(payload.tool_use_id);
  const agentId = codexId(payload.agent_id);
  const agentType =
    typeof payload.agent_type === "string" ? payload.agent_type.slice(0, 100) : null;
  const source = typeof payload.source === "string" ? payload.source.slice(0, 100) : null;
  const subagent = event === "SubagentStart" || event === "SubagentStop";
  const base = {
    schemaVersion: 2 as const,
    projectId: context.projectId,
    sessionId,
    source: codexAdapter.source,
    // The hook payload carries no product version; the installer gates it.
    sourceVersion: "unreported",
    adapterId: codexAdapter.id,
    adapterVersion: codexAdapter.adapterVersion,
    producerId: codexAdapter.producerId,
    // The agent id is the only marker a subagent's own tool calls carry.
    sourceLocator: ["codex_hook", event, agentType ?? source, agentId].filter(Boolean).join(":"),
    promptId: null as string | null,
    toolId: null as string | null,
    requestId: turnId,
    sourceTime: null,
    sourceSequence: null,
    policyVersion: 1,
    tool: null as { rawName: string; category: ToolCategory } | null,
    // Codex sends the parent session with the subagent's own turn. The parent
    // turn is not reported, and this session already owns the event, so only the
    // spawned child is declared to avoid a self-link.
    activity: {
      turnId: subagent ? null : turnId,
      parentSessionId: null,
      parentTurnId: null,
      childSessionId: subagent ? agentId : null,
      childTurnId: subagent ? turnId : null,
    },
    fieldCapabilities: {
      content: "available" as const,
      plan: "unsupported" as const,
      decision: "unsupported" as const,
      approval: "unsupported" as const,
      correction: "unsupported" as const,
    },
    declared: { plan: null, decision: null, approval: null, correction: null },
  };
  const deliveryId = (ids: { tool?: string | null; child?: string | null }) =>
    codexAdapter.deliveryId({
      sessionId,
      event,
      promptId: null,
      toolId: ids.tool ?? null,
      requestId: turnId,
      childSessionId: ids.child ?? null,
    });
  if (event === "SessionStart" || event === "SubagentStart")
    return {
      ...base,
      id: deliveryId({ child: subagent ? agentId : null }),
      deliveryId: deliveryId({ child: subagent ? agentId : null }),
      payload: {
        kind: "session_start",
        content: hookContent(null, "unavailable", ["prompt", "code"]),
      },
    };
  if (event === "SessionEnd" || event === "SubagentStop")
    return {
      ...base,
      id: deliveryId({ child: subagent ? agentId : null }),
      deliveryId: deliveryId({ child: subagent ? agentId : null }),
      // Codex reports only `reason: "other"`, so completion is inferred.
      payload: { kind: "session_end", reason: "completed" },
    };
  if (event === "UserPromptSubmit")
    return {
      ...base,
      id: deliveryId({}),
      deliveryId: deliveryId({}),
      payload: {
        kind: "prompt",
        content: hookContent(
          boundedText(payload.prompt),
          payload.prompt == null ? "unavailable" : "present",
          ["prompt", "code"],
        ),
      },
    };
  if (!toolId || typeof payload.tool_name !== "string" || !payload.tool_name.trim()) return null;
  const rawName = payload.tool_name.slice(0, 200);
  const category = toolCategory(rawName);
  const tool = { rawName, category };
  const input = record(payload.tool_input);
  if (event === "PreToolUse")
    return {
      ...base,
      id: deliveryId({ tool: toolId }),
      deliveryId: deliveryId({ tool: toolId }),
      toolId,
      tool,
      payload: {
        kind: "tool_call",
        toolName: category,
        content: hookContent(boundedText(input?.command ?? input), "present", ["tool", "code"]),
        path: inputPath(input),
      },
    };
  if (event === "PostToolUse")
    return {
      ...base,
      id: deliveryId({ tool: toolId }),
      deliveryId: deliveryId({ tool: toolId }),
      toolId,
      tool,
      payload: {
        kind: "tool_result",
        toolName: category,
        content: hookContent(boundedText(payload.tool_response), "present", ["tool", "code"]),
        // Codex hooks report neither a numeric exit code nor a success flag.
        exitCode: null,
        status: "unknown",
      },
    };
  return null;
}
