import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp, mergeSettings } from "../server/app.ts";
import { DEFAULT_SETTINGS, Store } from "../server/db.ts";
import { localDate, usageReport } from "../server/usage.ts";

const NOW = new Date(2026, 10, 12, 15, 0, 0); // 12 Nov 2026, 15:00 local
const daysAgo = (n: number, hour = 12) => new Date(2026, 10, 12 - n, hour, 0, 0).toISOString();

function seed() {
  const store = new Store(":memory:");
  const event = (sessionId: string, root: string, at: string) =>
    store.append({ sessionId, root, event: "SessionStart", at, payload: {} });
  event("a", "/work/alpha", daysAgo(0, 9));
  event("b", "/work/beta", daysAgo(3));
  event("old", "/work/alpha", daysAgo(40));
  const use = (id: string, sessionId: string, model: string | null, at: string, n: number) =>
    store.upsertUsage({
      messageId: id,
      sessionId,
      agentId: "main",
      model,
      at,
      input: n,
      output: n,
      cacheRead: n * 10,
      cacheWrite: 0,
    });
  // claude-opus-5-5: input $4, output $20, cache read $0.2 per million.
  use("m1", "a", "claude-opus-5-5", daysAgo(0, 10), 1_000_000);
  use("m2", "b", "claude-opus-5-5-20261001", daysAgo(3), 500_000);
  use("m3", "b", "mystery-model", daysAgo(3), 1_000);
  use("m4", "b", null, daysAgo(3), 1_000);
  use("m5", "old", "claude-opus-5-5", daysAgo(40), 1_000_000);
  return store;
}

test("usage report buckets by local day and prices like session costs", () => {
  const store = seed();
  const r = usageReport(store, 7, () => [], NOW);
  assert.equal(r.days.length, 7);
  assert.equal(r.days.at(-1)?.date, localDate(NOW));
  // m1: 1M*4 + 1M*20 + 10M*0.2 = $26; m2 half of that = $13.
  assert.equal(r.days.at(-1)?.usd, 26);
  assert.equal(r.days.at(-4)?.usd, 13);
  assert.equal(r.days[0].usd, null);
  assert.equal(r.total.cost.usd, 39);
  assert.deepEqual(r.total.cost.unpriced, ["mystery-model"]);
  // Tokens of unpriced and model-less usage are counted; their cost is not.
  assert.equal(r.total.tokens.input, 1_000_000 + 500_000 + 2_000);
  assert.deepEqual(
    r.byProject.map((p) => [p.name, p.usd]),
    [
      ["alpha", 26],
      ["beta", 13],
    ],
  );
  assert.deepEqual(
    r.topSessions.map((s) => [s.id, s.usd]),
    [
      ["a", 26],
      ["b", 13],
    ],
  );
  // Cache savings: 15M cache-read tokens × ($4 − $0.2) per million.
  assert.equal(r.cacheSavingsUsd, 57);
  assert.equal(r.spend.today, 26);
});

test("month spend counts the calendar month even beyond the range", () => {
  const store = seed();
  const r = usageReport(store, 1, () => [], NOW);
  assert.equal(r.days.length, 1);
  assert.equal(r.spend.month, 39);
});

test("the usage route validates days and budgets are validated settings", async () => {
  const store = seed();
  const app = createApp(store, () => 0);
  const res = { status: 0, body: "" };
  const fake = {
    writeHead: (s: number) => {
      res.status = s;
    },
    end: (b: string) => {
      res.body = b;
    },
  };
  // A minimal request/response pair is enough for a GET route.
  const get = (path: string) =>
    app.api({ method: "GET" } as never, fake as never, new URL(`http://x${path}`));
  await get("/api/usage?days=0");
  assert.equal(res.status, 400);
  await get("/api/usage?days=30");
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).days.length, 30);

  assert.equal(mergeSettings(DEFAULT_SETTINGS, { budgetDailyUsd: 5 }).budgetDailyUsd, 5);
  assert.equal(mergeSettings(DEFAULT_SETTINGS, { budgetMonthlyUsd: null }).budgetMonthlyUsd, null);
  assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { budgetDailyUsd: 0 }));
  assert.throws(() => mergeSettings(DEFAULT_SETTINGS, { budgetMonthlyUsd: "10" }));
});

test("usage project and model context filters rows before totals", () => {
  const store = seed();
  try {
    const project = usageReport(store, 7, () => [], NOW).byProject.find((p) => p.name === "alpha");
    assert.ok(project);
    const r = usageReport(store, 7, () => [], NOW, null, {
      project: project.projectId,
      model: "claude-opus-5-5",
    });
    assert.equal(r.total.cost.usd, 26);
    assert.equal(r.byProject.length, 1);
    assert.equal(r.byModel.length, 1);
    assert.equal(
      usageReport(store, 7, () => [], NOW, null, { project: "missing" }).total.tokens.input,
      0,
    );
  } finally {
    store.db.close();
  }
});
