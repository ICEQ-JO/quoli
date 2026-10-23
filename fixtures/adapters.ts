import { createHash } from "node:crypto";
import { type DeliveryIdentityInput, defineAdapter } from "../packages/schema/src/adapter";

// A second, purely synthetic registration. It exists only to prove that the
// conformance suite checks the contract rather than one hard-coded adapter; it
// is not a supported product adapter and no runtime installs it.

function deliveryId({ sessionId, event, promptId, toolId }: DeliveryIdentityInput): string {
  const parts = [sessionId, event, promptId, toolId];
  return `deliver-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32)}`;
}

export const syntheticAdapter = defineAdapter({
  id: "synthetic-session-log",
  harness: "Synthetic session log",
  source: "synthetic",
  producerId: "synthetic-session-log-v1",
  adapterVersion: "1.0.0",
  sourceVersions: ["2026.10"],
  eventMapping: {
    prompt: "prompt",
    tool_call: "tool_call",
    tool_result: "tool_result",
    usage: "usage",
  },
  capabilities: {
    content: ["prompt", "tool", "code"],
    identifiers: ["session", "prompt", "tool", "request"],
    usage: true,
    sourceTime: true,
    fields: {
      plan: "available",
      decision: "available",
      approval: "unsupported",
      correction: "available",
    },
  },
  failures: { status: "reported", exitCode: "numeric", gaps: ["late_arrival"] },
  delivery: "session_event_source_id",
  install: { mode: "reversible_project_hooks", settingsPath: ".synthetic/hooks.json" },
  deliveryId,
});
