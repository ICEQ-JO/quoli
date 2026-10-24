import type { NormalizedEvent } from "../packages/schema/src/index";
import { storyEvents } from "./story";

/** Inert mixed-harness load: one long session or a wide declared child tree. */
export function capacityEvents(count = 10000, shape: "long" | "wide" = "long"): NormalizedEvent[] {
  const { sequence: _sequence, receivedAt: _receivedAt, ...base } = storyEvents()[0];
  if (base.schemaVersion !== 2) throw new Error("Expected v2 fixture");
  return Array.from({ length: count }, (_, i) => ({
    ...base,
    id: `load-${i}`,
    deliveryId: `load-${i}`,
    projectId: "capacity",
    sessionId: shape === "long" || i === 0 ? "root" : `child-${i}`,
    source: i % 2 ? "fixture_claude" : "fixture_opencode",
    producerId: i % 2 ? "fixture-claude" : "fixture-opencode",
    activity: {
      ...base.activity,
      turnId: `turn-${i}`,
      parentSessionId: shape === "wide" && i > 0 ? "root" : null,
      parentTurnId: null,
      childSessionId: null,
      childTurnId: null,
    },
  }));
}
