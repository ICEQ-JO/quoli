import { createHash } from "node:crypto";
import type { Relationship, StoredEvent, UsageView } from "@traceframe/schema";

export * from "./activity";
export * from "./checks";
export * from "./map";
export * from "./reconcile";
export * from "./scene";

type UsageField = "input" | "output" | "cacheRead" | "cacheWrite" | "reasoning";
const USAGE_FIELDS: UsageField[] = ["input", "output", "cacheRead", "cacheWrite", "reasoning"];
const CORE_FIELDS: UsageField[] = ["input", "output", "cacheRead", "cacheWrite"];

function compareUsage(a: StoredEvent, b: StoredEvent): number {
  const aTime = a.sourceTime ? Date.parse(a.sourceTime) : Number.NaN;
  const bTime = b.sourceTime ? Date.parse(b.sourceTime) : Number.NaN;
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
  return a.sequence - b.sequence || a.id.localeCompare(b.id);
}

/** Compares only the identities and counts; source cost stays per observation. */
function usageIdentity(event: StoredEvent): string {
  if (event.payload.kind !== "usage") return "";
  const p = event.payload;
  return JSON.stringify([
    p.temporality,
    p.model,
    p.provider ?? null,
    p.input,
    p.output,
    p.cacheRead,
    p.cacheWrite,
    p.reasoning ?? null,
  ]);
}

/**
 * Sums the segment maxima of ordered cumulative counters. A decrease starts a
 * new segment; repeated or duplicate samples never add twice.
 */
function cumulativeTotal(
  series: StoredEvent[][],
  field: UsageField,
): { total: number | null; resets: number } {
  let total = 0;
  let resets = 0;
  let seen = false;
  for (const observations of series) {
    let segmentMax: number | null = null;
    for (const event of observations) {
      if (event.payload.kind !== "usage") continue;
      const value = event.payload[field] ?? null;
      if (value === null) return { total: null, resets };
      seen = true;
      if (segmentMax === null) {
        segmentMax = value;
      } else if (value < segmentMax) {
        total += segmentMax;
        resets++;
        segmentMax = value;
      } else {
        segmentMax = value;
      }
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(segmentMax))
        return { total: null, resets };
    }
    if (segmentMax !== null) total += segmentMax;
    if (!Number.isSafeInteger(total)) return { total: null, resets };
  }
  return { total: seen ? total : null, resets };
}

export function usage(events: StoredEvent[]): UsageView {
  const candidates = events.filter((e) => e.payload.kind === "usage");
  const requests = new Map<string, StoredEvent[]>();
  const counters = new Map<string, StoredEvent[]>();
  let omitted = 0;
  for (const e of candidates) {
    if (e.payload.kind !== "usage") continue;
    if (e.payload.temporality === "request_delta") {
      if (!e.requestId) {
        omitted++;
        continue;
      }
      const key = `${e.projectId}/${e.sessionId}/${e.requestId}`;
      requests.set(key, [...(requests.get(key) ?? []), e]);
      continue;
    }
    if (e.payload.temporality === "cumulative") {
      // A counter belongs to one source, provider and model inside a session.
      const key = [
        e.projectId,
        e.sessionId,
        e.source,
        e.payload.provider ?? "",
        e.payload.model,
      ].join("/");
      counters.set(key, [...(counters.get(key) ?? []), e]);
      continue;
    }
    omitted++;
  }
  const selected: StoredEvent[] = [];
  let conflicts = 0;
  for (const observations of requests.values()) {
    const first = observations[0];
    if (observations.some((e) => usageIdentity(e) !== usageIdentity(first))) conflicts++;
    selected.push(first);
  }
  const basis: UsageView["basis"] = requests.size
    ? "request_delta"
    : counters.size
      ? "cumulative"
      : null;
  if (basis === "request_delta")
    // Cumulative samples are not added to request deltas; the overlap stays visible.
    omitted += [...counters.values()].reduce(
      (count, observations) => count + observations.length,
      0,
    );

  const deltaSum = (field: UsageField) => {
    if (!selected.length || conflicts) return null;
    let total = 0;
    for (const e of selected) {
      if (e.payload.kind !== "usage") return null;
      const value = e.payload[field] ?? null;
      if (value === null) return null;
      total += value;
      if (!Number.isSafeInteger(total)) return null;
    }
    return total;
  };
  const series =
    basis === "cumulative"
      ? [...counters.values()].map((observations) => [...observations].sort(compareUsage))
      : [];
  const cumulativeTotals = new Map<UsageField, number | null>();
  let resets = 0;
  for (const field of USAGE_FIELDS) {
    const result = cumulativeTotal(series, field);
    cumulativeTotals.set(field, result.total);
    resets = Math.max(resets, result.resets);
  }
  const value = (field: UsageField) =>
    basis === "request_delta"
      ? deltaSum(field)
      : basis === "cumulative"
        ? (cumulativeTotals.get(field) ?? null)
        : null;
  const input = value("input"),
    output = value("output"),
    cacheRead = value("cacheRead"),
    cacheWrite = value("cacheWrite"),
    reasoning = value("reasoning");
  const denominator =
    input !== null && cacheRead !== null && cacheWrite !== null
      ? input + cacheRead + cacheWrite
      : null;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    reasoning,
    cacheReadShare:
      denominator !== null && denominator > 0 && cacheRead !== null
        ? cacheRead / denominator
        : null,
    requests: requests.size,
    cumulativeScopes: basis === "cumulative" ? counters.size : 0,
    evidenceIds: candidates.map((e) => e.id),
    complete:
      basis !== null &&
      !conflicts &&
      !omitted &&
      CORE_FIELDS.every((field) => value(field) !== null),
    conflicts,
    omitted,
    resets: basis === "cumulative" ? resets : 0,
    basis,
    rule: "reported-request-sum/v2",
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
