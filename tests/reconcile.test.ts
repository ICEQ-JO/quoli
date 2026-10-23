import assert from "node:assert/strict";
import { test } from "node:test";
import { usage } from "../packages/analysis/src/index";
import { reconcile } from "../packages/analysis/src/reconcile";
import type { V1StoredEvent } from "../packages/schema/src/index";

let sequence = 0;
function event(
  source: "claude_hook" | "claude_otel",
  sessionId: string,
  toolId: string | null,
  payload: V1StoredEvent["payload"],
  extra: Partial<V1StoredEvent> = {},
): V1StoredEvent {
  sequence += 1;
  return {
    schemaVersion: 1,
    id: `ev-${sequence}`,
    deliveryId: `dl-${sequence}`,
    projectId: "demo-quoli",
    sessionId,
    source,
    adapterVersion: "0.1.0",
    sourceLocator: `${source}:test`,
    producerId: source === "claude_hook" ? "claude-hook-bridge-v1" : "claude-otel-receiver-v1",
    promptId: null,
    toolId,
    requestId: null,
    sourceTime: "2026-10-22T10:00:00.000Z",
    sourceSequence: null,
    policyVersion: 1,
    payload,
    sequence,
    receivedAt: "2026-10-22T10:00:00.000Z",
    ...extra,
  };
}

const result = (status: "success" | "failure") => ({
  kind: "tool_result" as const,
  toolName: "Bash" as const,
  content: {
    text: "output",
    state: "present" as const,
    originalBytes: null,
    categories: ["tool" as const],
  },
  exitCode: null,
  status,
});

test("two sources reporting one tool yield one logical tool with both evidence sources", () => {
  const events = [
    event("claude_hook", "s1", "toolu_1", result("success")),
    event("claude_otel", "s1", "toolu_1", result("success")),
  ];
  const view = reconcile(events, usage(events));
  assert.equal(view.tools.length, 1);
  const tool = view.tools[0];
  assert.equal(tool.toolId, "toolu_1");
  assert.deepEqual(tool.sources.map((source) => source.source).sort(), [
    "claude_hook",
    "claude_otel",
  ]);
  assert.equal(tool.sources[0].eventIds.length + tool.sources[1].eventIds.length, 2);
  assert.equal(tool.conflict, false);
  assert.equal(tool.evidenceIds.length, 2);
  assert.ok(tool.uncertainty.includes("corroboration"));
  assert.deepEqual(view.ambiguous, []);
});

test("a disagreement between the sources stays visible", () => {
  const events = [
    event("claude_hook", "s1", "toolu_2", result("success")),
    event("claude_otel", "s1", "toolu_2", result("failure")),
  ];
  const view = reconcile(events, usage(events));
  assert.equal(view.tools.length, 1);
  assert.equal(view.tools[0].conflict, true);
  // The displayed status follows the stated precedence: the hook first.
  assert.equal(view.tools[0].status, "success");
  assert.ok(view.tools[0].uncertainty.includes("disagree"));
});

test("a result without an identity is ambiguous and the combined total stays null", () => {
  const events = [
    event("claude_hook", "s1", null, result("success")),
    event(
      "claude_otel",
      "s1",
      null,
      {
        kind: "usage",
        input: 5,
        output: 6,
        cacheRead: 0,
        cacheWrite: 0,
        model: "claude-opus-5-5",
        temporality: "request_delta",
      },
      { requestId: "req_9" },
    ),
  ];
  const view = reconcile(events, usage(events));
  assert.equal(view.ambiguous.length, 1);
  assert.equal(view.ambiguous[0].eventIds.length, 1);
  assert.equal(view.combined.input, null);
  assert.equal(view.combined.output, null);
  assert.equal(view.sourceUsage.length, 1);
  assert.equal(view.sourceUsage[0].requests, 1);
});

test("reported usage is never summed across sources or duplicated", () => {
  const usagePayload = {
    kind: "usage" as const,
    input: 2,
    output: 10,
    cacheRead: 100,
    cacheWrite: 50,
    model: "claude-opus-5-5",
    temporality: "request_delta" as const,
  };
  const events = [
    event("claude_otel", "s1", null, usagePayload, { requestId: "req_1" }),
    // The same request reported again by a retry.
    event("claude_otel", "s1", null, usagePayload, { requestId: "req_1" }),
  ];
  const view = reconcile(events, usage(events));
  assert.equal(view.usage.requests, 1);
  assert.equal(view.usage.input, 2);
  assert.equal(view.sourceUsage[0].requests, 1);
  assert.equal(view.combined.input, 2);
  // A counter sample is not added to the request series.
  const withCounter = [
    ...events,
    event("claude_otel", "s1", null, {
      kind: "usage",
      input: 999,
      output: 999,
      cacheRead: 0,
      cacheWrite: 0,
      model: "claude-opus-5-5",
      temporality: "cumulative",
    }),
  ];
  const counterView = reconcile(withCounter, usage(withCounter));
  assert.equal(counterView.usage.omitted, 1);
  assert.equal(counterView.combined.input, null);
});

test("the reconciliation is a pure projection of the retained observations", () => {
  const events = [
    event("claude_hook", "s1", "toolu_4", result("success")),
    event("claude_otel", "s1", "toolu_4", result("success")),
  ];
  const before = JSON.stringify(events);
  const first = reconcile(events, usage(events));
  const second = reconcile(events, usage(events));
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(events), before);
});
