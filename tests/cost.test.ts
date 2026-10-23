import assert from "node:assert/strict";
import { test } from "node:test";
import { syntheticPriceCatalog } from "../fixtures/prices";
import { estimateCost } from "../packages/analysis/src/index";
import type { V1StoredEvent } from "../packages/schema/src/index";

type UsagePayload = Extract<V1StoredEvent["payload"], { kind: "usage" }>;

let sequence = 0;
function event(payload: UsagePayload, extra: Partial<V1StoredEvent> = {}): V1StoredEvent {
  sequence += 1;
  return {
    schemaVersion: 1,
    id: `cost-ev-${sequence}`,
    deliveryId: `cost-dl-${sequence}`,
    projectId: "demo-quoli",
    sessionId: "s1",
    source: "claude_otel",
    adapterVersion: "0.1.0",
    sourceLocator: "claude_otel:api_request:test",
    producerId: "claude-otel-receiver-v1",
    promptId: null,
    toolId: null,
    requestId: "req-1",
    sourceTime: "2026-02-01T10:00:00.000Z",
    sourceSequence: null,
    policyVersion: 1,
    payload,
    sequence,
    receivedAt: "2026-02-01T10:00:00.000Z",
    ...extra,
  };
}

const payload = (extra: Partial<UsagePayload> = {}): UsagePayload => ({
  kind: "usage",
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  model: "synthetic-alpha",
  temporality: "request_delta",
  ...extra,
});

test("known fixture prices produce exact category subtotals", () => {
  const estimate = estimateCost(
    [
      event(
        payload({
          input: 1_000,
          output: 100,
          cacheRead: 10_000,
          cacheWrite: 2_000,
          reasoning: 0,
          costUsdMicros: 999,
        }),
      ),
    ],
    syntheticPriceCatalog,
  );
  assert.equal(estimate.rule, "list-price-usage/v1");
  assert.equal(estimate.catalogVersion, "synthetic-2026-01");
  assert.equal(estimate.currency, "USD");
  assert.equal(estimate.state, "complete");
  assert.equal(estimate.totalMicros, 75_000);
  assert.equal(estimate.requests[0].catalogModel, "synthetic-alpha");
  assert.equal(estimate.requests[0].subtotalMicros, 75_000);
  assert.equal(estimate.requests[0].reportedCostUsdMicros, 999);
  assert.match(estimate.formula, /round/);
});

test("effective dates switch the price at the boundary", () => {
  const at = (sourceTime: string) =>
    estimateCost(
      [
        event(payload({ input: 1_000_000 }), {
          requestId: `req-${sourceTime}`,
          sourceTime,
        }),
      ],
      syntheticPriceCatalog,
    );
  assert.equal(at("2026-06-30T23:59:59.000Z").totalMicros, 15_000_000);
  assert.equal(at("2026-07-01T00:00:00.000Z").totalMicros, 10_000_000);
});

test("aliases resolve to the canonical catalog model", () => {
  const estimate = estimateCost(
    [event(payload({ model: "alpha", input: 1_000_000 }), { requestId: "req-alias" })],
    syntheticPriceCatalog,
  );
  assert.equal(estimate.requests[0].catalogModel, "synthetic-alpha");
  assert.equal(estimate.totalMicros, 15_000_000);
});

test("an alias matching more than one entry stays unpriced", () => {
  const estimate = estimateCost(
    [event(payload({ model: "shared-alias", input: 1_000 }), { requestId: "req-amb" })],
    syntheticPriceCatalog,
  );
  assert.equal(estimate.state, "unpriced");
  assert.equal(estimate.totalMicros, null);
  assert.equal(estimate.unpricedRequests, 1);
  assert.equal(estimate.requests[0].reason, "ambiguous_model");
});

test("a missing category rate makes the estimate partial, not wrong", () => {
  const estimate = estimateCost(
    [
      event(payload({ model: "synthetic-beta", input: 1_000, reasoning: 5 }), {
        requestId: "req-missing",
      }),
    ],
    syntheticPriceCatalog,
  );
  assert.equal(estimate.state, "partial");
  assert.equal(estimate.totalMicros, 3_000);
  assert.equal(estimate.requests[0].state, "partial");
  assert.equal(estimate.requests[0].reason, "missing_rate");
  const reasoning = estimate.requests[0].categories.find((c) => c.category === "reasoning");
  assert.equal(reasoning?.reason, "missing_rate");
  assert.equal(reasoning?.subtotalMicros, null);
});

test("a zero-token category needs no rate", () => {
  const estimate = estimateCost(
    [event(payload({ model: "synthetic-beta", reasoning: 0 }), { requestId: "req-zero" })],
    syntheticPriceCatalog,
  );
  assert.equal(estimate.state, "complete");
  assert.equal(estimate.totalMicros, 0);
});

test("missing tokens stay visible on the category", () => {
  const estimate = estimateCost(
    [event(payload({ input: null }), { requestId: "req-null" })],
    syntheticPriceCatalog,
  );
  assert.equal(estimate.requests[0].state, "partial");
  assert.equal(estimate.requests[0].reason, "missing_tokens");
  assert.equal(
    estimate.requests[0].categories.find((c) => c.category === "input")?.reason,
    "missing_tokens",
  );
});

test("unknown model, unknown date and cumulative counters stay unpriced", () => {
  const unknown = estimateCost(
    [event(payload({ model: "no-such-model" }), { requestId: "req-unknown" })],
    syntheticPriceCatalog,
  );
  assert.equal(unknown.requests[0].reason, "unknown_model");
  const noDate = estimateCost(
    [event(payload(), { requestId: "req-date", sourceTime: null })],
    syntheticPriceCatalog,
  );
  assert.equal(noDate.requests[0].reason, "missing_date");
  const cumulative = estimateCost(
    [event(payload({ temporality: "cumulative", input: 100 }), { requestId: "req-cum" })],
    syntheticPriceCatalog,
  );
  assert.equal(cumulative.requests.length, 0);
  assert.equal(cumulative.state, "unpriced");
  assert.equal(cumulative.omittedUsageObservations, 1);
});

test("corroborated observations price once; conflicting counts do not price", () => {
  const corroborated = estimateCost(
    [
      event(payload({ input: 1_000 }), { requestId: "req-same" }),
      event(payload({ input: 1_000, costUsdMicros: 5 }), { requestId: "req-same" }),
    ],
    syntheticPriceCatalog,
  );
  assert.equal(corroborated.requests.length, 1);
  assert.equal(corroborated.totalMicros, 15_000);
  const conflict = estimateCost(
    [
      event(payload({ input: 10 }), { requestId: "req-conflict" }),
      event(payload({ input: 11 }), { requestId: "req-conflict" }),
    ],
    syntheticPriceCatalog,
  );
  assert.equal(conflict.requests.length, 1);
  assert.equal(conflict.requests[0].reason, "conflicting_usage");
  assert.equal(conflict.totalMicros, null);
});

test("subtotals round half-up to whole micros", () => {
  const estimate = estimateCost(
    [event(payload({ cacheRead: 333 }), { requestId: "req-round" })],
    syntheticPriceCatalog,
  );
  // 333 tokens at 1,500,000 micros per million = 499.5 micros.
  assert.equal(
    estimate.requests[0].categories.find((c) => c.category === "cacheRead")?.subtotalMicros,
    500,
  );
});

test("an overflowing product stays unpriced", () => {
  const estimate = estimateCost(
    [event(payload({ input: Number.MAX_SAFE_INTEGER }), { requestId: "req-overflow" })],
    syntheticPriceCatalog,
  );
  const input = estimate.requests[0].categories.find((c) => c.category === "input");
  assert.equal(input?.reason, "overflow");
  assert.equal(input?.subtotalMicros, null);
  assert.equal(estimate.requests[0].reason, "overflow");
});

test("provider-specific entries require the reported provider", () => {
  const without = estimateCost(
    [event(payload({ model: "provider-only" }), { requestId: "req-provider-1" })],
    syntheticPriceCatalog,
  );
  assert.equal(without.requests[0].reason, "unknown_model");
  const withProvider = estimateCost(
    [
      event(payload({ model: "provider-only", provider: "provider-one" }), {
        requestId: "req-provider-2",
      }),
    ],
    syntheticPriceCatalog,
  );
  assert.equal(withProvider.requests[0].catalogModel, "synthetic-epsilon");
});

test("an estimate keeps the catalog version and rates it was calculated with", () => {
  const before = estimateCost(
    [event(payload({ input: 1_000 }), { requestId: "req-old" })],
    syntheticPriceCatalog,
  );
  const updated = {
    ...syntheticPriceCatalog,
    version: "synthetic-2026-02",
    models: syntheticPriceCatalog.models.map((model) =>
      model.canonical === "synthetic-alpha" && model.effectiveFrom === "2026-01-01"
        ? { ...model, rates: { ...model.rates, input: 99_000_000 } }
        : model,
    ),
  };
  estimateCost([event(payload({ input: 1_000 }), { requestId: "req-new" })], updated);
  assert.equal(before.catalogVersion, "synthetic-2026-01");
  assert.equal(
    before.requests[0].categories.find((c) => c.category === "input")?.microsPerMillionTokens,
    15_000_000,
  );
});

test("a mix of priced and unpriced requests yields a partial total", () => {
  const estimate = estimateCost(
    [
      event(payload({ input: 1_000 }), { requestId: "req-priced" }),
      event(payload({ model: "no-such-model", input: 1_000 }), {
        requestId: "req-unknown",
      }),
    ],
    syntheticPriceCatalog,
  );
  assert.equal(estimate.state, "partial");
  assert.equal(estimate.totalMicros, 15_000);
  assert.equal(estimate.unpricedRequests, 1);
});

test("an unknown catalog currency stays unpriced", () => {
  const estimate = estimateCost([event(payload({ input: 1_000 }), { requestId: "req-currency" })], {
    ...syntheticPriceCatalog,
    currency: null,
  });
  assert.equal(estimate.currency, null);
  assert.equal(estimate.state, "unpriced");
  assert.equal(estimate.totalMicros, null);
  assert.equal(estimate.requests[0].reason, "unknown_currency");
});

test("an invalid catalog is rejected", () => {
  assert.throws(() => estimateCost([], { ...syntheticPriceCatalog, currency: "usd" }));
});
