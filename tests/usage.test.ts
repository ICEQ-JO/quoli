import assert from "node:assert/strict";
import { test } from "node:test";
import { usage } from "../packages/analysis/src/index";
import type { V1StoredEvent } from "../packages/schema/src/index";

type UsagePayload = Extract<V1StoredEvent["payload"], { kind: "usage" }>;

let sequence = 0;
function event(payload: UsagePayload, extra: Partial<V1StoredEvent> = {}): V1StoredEvent {
  sequence += 1;
  return {
    schemaVersion: 1,
    id: `ev-${sequence}`,
    deliveryId: `dl-${sequence}`,
    projectId: "demo-quoli",
    sessionId: "s1",
    source: "claude_otel",
    adapterVersion: "0.1.0",
    sourceLocator: "claude_otel:api_request:test",
    producerId: "claude-otel-receiver-v1",
    promptId: null,
    toolId: null,
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

const delta = (
  input: number | null,
  output: number | null = 10,
  extra: Partial<UsagePayload> = {},
): UsagePayload => ({
  kind: "usage",
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  model: "claude-opus-5-5",
  temporality: "request_delta",
  ...extra,
});

const cumulative = (input: number, extra: Partial<UsagePayload> = {}): UsagePayload => ({
  kind: "usage",
  input,
  output: 10,
  cacheRead: 0,
  cacheWrite: 0,
  model: "claude-opus-5-5",
  temporality: "cumulative",
  ...extra,
});

test("request deltas dedupe by request identity and sum reported reasoning", () => {
  const events = [
    event(delta(2, 10, { reasoning: 5 }), { requestId: "req_1" }),
    // The same request reported again by a retry; source cost is not a count conflict.
    event(delta(2, 10, { reasoning: 5, costUsdMicros: 999 }), { requestId: "req_1" }),
    event(delta(3, 20, { reasoning: 7 }), { requestId: "req_2", sessionId: "s2" }),
    event(delta(4, 30, { reasoning: 9 }), { requestId: "req_1", sessionId: "s2" }),
  ];
  const view = usage(events);
  assert.equal(view.requests, 3);
  assert.equal(view.input, 9);
  assert.equal(view.output, 60);
  assert.equal(view.reasoning, 21);
  assert.equal(view.basis, "request_delta");
  assert.equal(view.conflicts, 0);
  assert.equal(view.omitted, 0);
  assert.equal(view.complete, true);
});

test("a corrected request count stays a visible conflict instead of being summed", () => {
  const view = usage([
    event(delta(2, 10), { requestId: "req_1" }),
    event(delta(5, 10), { requestId: "req_1" }),
  ]);
  assert.equal(view.conflicts, 1);
  assert.equal(view.input, null);
  assert.equal(view.output, null);
  assert.equal(view.complete, false);
});

test("repeated cumulative samples count once and a decrease starts a new counter run", () => {
  const repeated = usage([event(cumulative(100)), event(cumulative(150)), event(cumulative(150))]);
  assert.equal(repeated.basis, "cumulative");
  assert.equal(repeated.input, 150);
  assert.equal(repeated.resets, 0);
  assert.equal(repeated.cumulativeScopes, 1);
  assert.equal(repeated.requests, 0);
  assert.equal(repeated.complete, true);

  const reset = usage([
    event(cumulative(100)),
    event(cumulative(150)),
    event(cumulative(20)),
    event(cumulative(60)),
  ]);
  assert.equal(reset.input, 210);
  assert.equal(reset.resets, 1);
  assert.equal(reset.complete, true);
});

test("late cumulative samples are ordered by source time, not arrival order", () => {
  const view = usage([
    event(cumulative(200), { sourceTime: "2026-10-22T10:02:00.000Z" }),
    event(cumulative(100), { sourceTime: "2026-10-22T10:01:00.000Z" }),
  ]);
  assert.equal(view.input, 200);
  assert.equal(view.resets, 0);
});

test("request deltas win over cumulative samples and the overlap stays visible", () => {
  const view = usage([
    event(delta(2, 10), { requestId: "req_1" }),
    event(cumulative(100)),
    event(cumulative(120)),
  ]);
  assert.equal(view.basis, "request_delta");
  assert.equal(view.input, 2);
  assert.equal(view.omitted, 2);
  assert.equal(view.cumulativeScopes, 0);
  assert.equal(view.complete, false);
});

test("counters stay separate per provider and model", () => {
  const view = usage([
    event(cumulative(100, { provider: "anthropic" })),
    event(cumulative(50, { provider: "openai" })),
  ]);
  assert.equal(view.cumulativeScopes, 2);
  assert.equal(view.input, 150);
});

test("zero is a reported count while a null category stays unknown", () => {
  const zero = usage([event(delta(0, 0, { reasoning: null }), { requestId: "req_1" })]);
  assert.equal(zero.input, 0);
  assert.equal(zero.output, 0);
  assert.equal(zero.reasoning, null);
  assert.equal(zero.complete, true);

  const missing = usage([event(delta(5, null), { requestId: "req_1" })]);
  assert.equal(missing.input, 5);
  assert.equal(missing.output, null);
  assert.equal(missing.complete, false);
});

test("a total beyond the safe integer range is unknown", () => {
  const view = usage([
    event(delta(Number.MAX_SAFE_INTEGER, 0), { requestId: "req_1" }),
    event(delta(1, 0), { requestId: "req_2" }),
  ]);
  assert.equal(view.input, null);
  assert.equal(view.complete, false);
});
