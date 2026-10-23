import { createHash } from "node:crypto";
import type { Relationship, StoredEvent } from "@traceframe/schema";

export * from "./activity";
export * from "./checks";
export * from "./cost";
export * from "./map";
export * from "./reconcile";
export * from "./scene";
export * from "./usage";

export function relationships(events: StoredEvent[]): Relationship[] {
  const calls = events.filter((e) => e.payload.kind === "tool_call" && e.toolId);
  // Explicit prompt IDs recorded on both observations bind a request to its tool calls.
  const promptLinks = events.flatMap((prompt) => {
    if (prompt.payload.kind !== "prompt" || !prompt.promptId) return [];
    return events
      .filter(
        (e) =>
          e.payload.kind === "tool_call" &&
          e.promptId === prompt.promptId &&
          e.id !== prompt.id &&
          e.projectId === prompt.projectId &&
          e.sessionId === prompt.sessionId,
      )
      .map((call) => ({
        id: `link-${createHash("sha256")
          .update(JSON.stringify([prompt.projectId, prompt.id, call.id]))
          .digest("hex")
          .slice(0, 24)}`,
        subjectId: prompt.id,
        objectId: call.id,
        basis: "recorded" as const,
        evidenceIds: [prompt.id, call.id],
        rule: "explicit-prompt-id/v1",
        uncertainty:
          "Both observations carry the same explicit prompt ID. The relation does not establish what was done with the request.",
      }));
  });
  const resultLinks = calls.flatMap((call) => {
    const results = events.filter(
      (e) =>
        e.payload.kind === "tool_result" &&
        e.projectId === call.projectId &&
        e.sessionId === call.sessionId &&
        e.toolId === call.toolId,
    );
    return results.map((result) => ({
      id: `link-${createHash("sha256")
        .update(JSON.stringify([call.projectId, call.id, result.id]))
        .digest("hex")
        .slice(0, 24)}`,
      subjectId: call.id,
      objectId: result.id,
      basis: "derived" as const,
      evidenceIds: [call.id, result.id],
      rule: "same-session-tool-id/v1",
      uncertainty:
        "Explicit tool IDs match. A reported result does not establish feature correctness.",
    }));
  });
  return [...promptLinks, ...resultLinks];
}
