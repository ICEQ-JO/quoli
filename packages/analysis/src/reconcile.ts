import type { StoredEvent, UsageView } from "@traceframe/schema";
import type {
  AmbiguousObservation,
  ReconciledTool,
  ReconciliationView,
  SourceUsage,
} from "@traceframe/schema/reconcile";

/**
 * Cross-source reconciliation.
 *
 * Hook and telemetry observations are kept separately in the history. This
 * projection joins them only through explicit identifiers inside one project,
 * shows the evidence of both sides, and never merges or overwrites the raw
 * observations.
 */

export const RECONCILE_RULE = "explicit-identifier-reconciliation/v1";

const PRECEDENCE = ["claude_hook", "claude_otel"];

function rank(source: string): number {
  const index = PRECEDENCE.indexOf(source);
  return index === -1 ? PRECEDENCE.length : index;
}

export function reconcile(events: StoredEvent[], usage: UsageView): ReconciliationView {
  const groups = new Map<string, StoredEvent[]>();
  const ambiguous: AmbiguousObservation[] = [];
  for (const event of events) {
    if (event.payload.kind !== "tool_result") continue;
    if (!event.toolId) {
      ambiguous.push({
        eventIds: [event.id],
        source: event.source,
        reason: "The result has no tool invocation identity, so it cannot be joined.",
      });
      continue;
    }
    const key = `${event.projectId}/${event.sessionId}/${event.toolId}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const tools: ReconciledTool[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort(
      (a, b) => rank(a.source) - rank(b.source) || a.sequence - b.sequence,
    );
    const statuses = new Set(
      sorted.map((event) =>
        event.payload.kind === "tool_result" ? event.payload.status : "unknown",
      ),
    );
    const conflict = statuses.size > 1;
    const first = sorted[0];
    if (!first || first.payload.kind !== "tool_result") continue;
    const sources = new Map<string, string[]>();
    for (const event of sorted)
      sources.set(event.source, [...(sources.get(event.source) ?? []), event.id]);
    tools.push({
      toolId: key.split("/").at(-1) ?? key,
      toolName: first.payload.toolName,
      sources: [...sources].map(([source, eventIds]) => ({ source, eventIds })),
      status: first.payload.status,
      conflict,
      evidenceIds: sorted.map((event) => event.id),
      uncertainty: conflict
        ? "The sources disagree about this outcome. The displayed status follows the stated precedence; the conflict stays visible."
        : sources.size > 1
          ? "Two sources reported this tool. The observations are corroboration, not a second activity."
          : "One source reported this tool.",
    });
  }
  const sourceUsage: SourceUsage[] = [];
  const sources = [
    ...new Set(
      events.filter((event) => event.payload.kind === "usage").map((event) => event.source),
    ),
  ];
  for (const source of sources) {
    const records = events.filter(
      (event) => event.payload.kind === "usage" && event.source === source,
    );
    const requests = new Set(
      records
        .filter((event) => event.payload.kind === "usage" && event.requestId !== null)
        .map((event) => event.requestId),
    );
    const sum = (field: "input" | "output" | "cacheRead" | "cacheWrite") => {
      let total = 0;
      for (const event of records) {
        if (event.payload.kind !== "usage") continue;
        const value = event.payload[field];
        if (value === null) return null;
        total += value;
      }
      return total;
    };
    sourceUsage.push({
      source,
      events: records.length,
      requests: requests.size,
      input: sum("input"),
      output: sum("output"),
      cacheRead: sum("cacheRead"),
      cacheWrite: sum("cacheWrite"),
    });
  }
  // The combined total is the canonical series, never a sum of per-source totals.
  const unresolved =
    ambiguous.length > 0 ||
    usage.omitted > 0 ||
    usage.conflicts > 0 ||
    sourceUsage.some((entry) => entry.input === null || entry.output === null);
  return {
    tools: tools.sort((a, b) => a.toolId.localeCompare(b.toolId)),
    ambiguous,
    usage,
    sourceUsage,
    combined: unresolved
      ? { input: null, output: null, cacheRead: null, cacheWrite: null }
      : {
          input: usage.input,
          output: usage.output,
          cacheRead: usage.cacheRead,
          cacheWrite: usage.cacheWrite,
        },
    rule: RECONCILE_RULE,
    uncertainty:
      "Sources are joined only by explicit identifiers inside one project. A combined total stays null while an overlap is unresolved, and the raw observations are never merged.",
  };
}
