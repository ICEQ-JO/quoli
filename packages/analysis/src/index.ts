import { createHash } from "node:crypto";
import type { Relationship, StoredEvent, UsageView } from "@traceframe/schema";

export * from "./checks";
export * from "./map";

export function usage(events: StoredEvent[]): UsageView {
  const candidates = events.filter((e) => e.payload.kind === "usage");
  const requests = new Map<string, StoredEvent[]>();
  let omitted = 0;
  for (const e of candidates) {
    if (e.payload.kind !== "usage" || e.payload.temporality !== "request_delta" || !e.requestId) {
      omitted++;
      continue;
    }
    const key = `${e.projectId}/${e.sessionId}/${e.requestId}`;
    const observations = requests.get(key) ?? [];
    observations.push(e);
    requests.set(key, observations);
  }
  const selected: StoredEvent[] = [];
  let conflicts = 0;
  for (const observations of requests.values()) {
    const first = observations[0];
    if (observations.some((e) => JSON.stringify(e.payload) !== JSON.stringify(first.payload)))
      conflicts++;
    selected.push(first);
  }
  const sum = (field: "input" | "output" | "cacheRead" | "cacheWrite") => {
    if (!selected.length || conflicts || omitted) return null;
    let total = 0;
    for (const e of selected) {
      if (e.payload.kind !== "usage" || e.payload[field] === null) return null;
      total += e.payload[field];
      if (!Number.isSafeInteger(total)) return null;
    }
    return total;
  };
  const input = sum("input"),
    output = sum("output"),
    cacheRead = sum("cacheRead"),
    cacheWrite = sum("cacheWrite");
  const denominator =
    input !== null && cacheRead !== null && cacheWrite !== null
      ? input + cacheRead + cacheWrite
      : null;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cacheReadShare: denominator && cacheRead !== null ? cacheRead / denominator : null,
    requests: requests.size,
    evidenceIds: candidates.map((e) => e.id),
    complete:
      selected.length > 0 &&
      !conflicts &&
      !omitted &&
      [input, output, cacheRead, cacheWrite].every((v) => v !== null),
    conflicts,
    omitted,
    rule: "reported-request-sum/v1",
  };
}
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
