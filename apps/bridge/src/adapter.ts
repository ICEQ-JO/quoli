import { createHash } from "node:crypto";
import { type DeliveryIdentityInput, defineAdapter } from "@traceframe/schema/adapter";
import { BRIDGE_PRODUCER, BRIDGE_VERSION } from "./normalize";

/**
 * The Claude Code hook adapter, described through the shared registration
 * contract. Facts come from docs/claude-code-runtime-report.md: the hook payload
 * reports no timestamp, no numeric exit code and no usage, so those stay
 * explicitly unsupported rather than guessed.
 */

const VERIFIED_CLAUDE_VERSION = "2.1.306";

function deliveryId({ sessionId, event, promptId, toolId }: DeliveryIdentityInput): string {
  const parts: unknown[] = [sessionId, event];
  // Must stay identical to normalizeHook: the event's own source id joins the identity.
  if (event === "UserPromptSubmit") parts.push(promptId);
  if (event === "PreToolUse" || event === "PostToolUse" || event === "PostToolUseFailure")
    parts.push(toolId);
  return `deliver-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32)}`;
}

export const claudeAdapter = defineAdapter({
  id: "claude-code-hook",
  harness: "Claude Code",
  source: "claude_hook",
  producerId: BRIDGE_PRODUCER,
  adapterVersion: BRIDGE_VERSION,
  sourceVersions: [VERIFIED_CLAUDE_VERSION],
  eventMapping: {
    SessionStart: "session_start",
    UserPromptSubmit: "prompt",
    PreToolUse: "tool_call",
    PostToolUse: "tool_result",
    PostToolUseFailure: "tool_result",
    SessionEnd: "session_end",
  },
  capabilities: {
    content: ["prompt", "tool", "code"],
    identifiers: ["session", "prompt", "tool"],
    usage: false,
    sourceTime: false,
    fields: {
      plan: "unsupported",
      decision: "unsupported",
      approval: "unsupported",
      correction: "unsupported",
    },
  },
  failures: { status: "reported", exitCode: "unsupported", gaps: [] },
  delivery: "session_event_source_id",
  install: { mode: "reversible_project_hooks", settingsPath: ".claude/settings.json" },
  deliveryId,
});

/** Adapters this build can install. A second harness registers here when it ships. */
export const adapters = [claudeAdapter] as const;
