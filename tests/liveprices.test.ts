import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Store } from "../server/db.ts";
import {
  LIVE_SOURCE,
  loadLiveCache,
  parseModelsDev,
  refreshLivePrices,
  setLivePrices,
} from "../server/liveprices.ts";
import {
  costOf,
  defaultPrices,
  effectivePrices,
  priceFor,
  savePrices,
  withLive,
} from "../server/prices.ts";

// A small document in models.dev's shape (providers → models → cost per million tokens).
const DOC = {
  anthropic: {
    models: {
      "claude-sonnet-4-5": { cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } },
      "claude-new-7": { cost: { input: 9, output: 45, cache_read: 0.9, cache_write: 11.25 } },
    },
  },
  openai: {
    models: {
      "gpt-9": { cost: { input: 2, output: 8 } },
      "gpt-free": { cost: {} },
      "bad id with spaces": { cost: { input: 1, output: 1 } },
      "gpt-weird": { cost: { input: -1, output: 1 } },
    },
  },
  // A reseller listing a maker's model at its own price is ignored.
  "some-reseller": { models: { "claude-new-7": { cost: { input: 1, output: 1 } } } },
  deepseek: { models: { "claude-new-7": { cost: { input: 0.1, output: 0.1 } } } },
};

test("models.dev prices come from model makers only, with cache prices defaulting to input", () => {
  const prices = parseModelsDev(DOC);
  assert.deepEqual(
    prices.map((p) => p.model),
    ["claude-sonnet-4-5", "claude-new-7", "gpt-9"],
  );
  assert.deepEqual(prices[1], {
    model: "claude-new-7",
    input: 9,
    output: 45,
    cacheRead: 0.9,
    cacheWrite: 11.25,
  });
  assert.equal(prices[2].cacheRead, 2);
  assert.equal(prices[2].cacheWrite, 2);
  assert.deepEqual(parseModelsDev(null), []);
  assert.deepEqual(parseModelsDev({ anthropic: { models: "nope" } }), []);
});

test("live prices replace built-in rows but never a table the user edited", () => {
  const live = [
    { model: "claude-sonnet-4-5", input: 2, output: 9, cacheRead: 0.2, cacheWrite: 2.5 },
    { model: "claude-new-7", input: 9, output: 45, cacheRead: 0.9, cacheWrite: 11.25 },
  ];
  const builtIn = withLive(defaultPrices(), live, false);
  assert.equal(priceFor("claude-sonnet-4-5", builtIn)?.input, 2);
  assert.equal(priceFor("claude-sonnet-4-5-20250929", builtIn)?.input, 2);
  assert.equal(priceFor("claude-new-7", builtIn)?.output, 45);
  assert.equal(priceFor("claude-opus-4-1", builtIn)?.input, 15);

  const edited = withLive(defaultPrices(), live, true);
  assert.equal(priceFor("claude-sonnet-4-5", edited)?.input, 3);
  assert.equal(priceFor("claude-new-7", edited)?.output, 45);
  assert.deepEqual(withLive(defaultPrices(), null, false), defaultPrices());
  assert.deepEqual(withLive(defaultPrices(), [], false), defaultPrices());
});

test("costs use live prices when they are on, and the user's prices first", () => {
  const store = new Store(":memory:");
  const rows = [
    { model: "claude-new-7", tokens: { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 } },
  ];
  try {
    assert.deepEqual(costOf(rows, effectivePrices(store)).unpriced, ["claude-new-7"]);
    setLivePrices({
      source: LIVE_SOURCE,
      fetchedAt: "2026-11-12T00:00:00.000Z",
      prices: parseModelsDev(DOC),
    });
    assert.equal(costOf(rows, effectivePrices(store)).usd, 9);
    assert.match(effectivePrices(store).version, /models\.dev prices fetched 2026-11-12/);

    store.saveSettings({ ...store.settings(), livePrices: false });
    assert.equal(costOf(rows, effectivePrices(store)).usd, null);
    store.saveSettings({ ...store.settings(), livePrices: true });

    savePrices(store, {
      version: "mine",
      currency: "USD",
      prices: [{ model: "claude-new-7", input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }],
    });
    assert.equal(costOf(rows, effectivePrices(store)).usd, 1);
  } finally {
    setLivePrices(null);
  }
});

test("a refresh fetches at most once a day, caches to disk and rejects bad answers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-live-"));
  const file = join(dir, "prices-live.json");
  let calls = 0;
  const answer = (body: unknown, status = 200) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      calls++;
      assert.equal(String(url), LIVE_SOURCE);
      assert.equal(init?.method, undefined);
      assert.equal(init?.body, undefined);
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
  const many = {
    anthropic: {
      models: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`claude-x-${i}`, { cost: { input: i, output: i } }]),
      ),
    },
  };
  try {
    setLivePrices(null);
    const now = Date.parse("2026-11-12T10:00:00Z");
    await assert.rejects(refreshLivePrices(file, { fetchImpl: answer(DOC), now }), /too few/);
    await assert.rejects(refreshLivePrices(file, { fetchImpl: answer({}, 503), now }), /503/);
    const live = await refreshLivePrices(file, { fetchImpl: answer(many), now });
    assert.equal(live?.prices.length, 12);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).prices.length, 12);

    const before = calls;
    assert.equal(
      await refreshLivePrices(file, { fetchImpl: answer(many), now: now + 3_600_000 }),
      null,
    );
    assert.equal(calls, before);
    await refreshLivePrices(file, { fetchImpl: answer(many), now: now + 86_400_000 });
    assert.equal(calls, before + 1);

    setLivePrices(null);
    assert.equal(loadLiveCache(file)?.prices.length, 12);
    assert.equal(loadLiveCache(join(dir, "missing.json")), null);
  } finally {
    setLivePrices(null);
    rmSync(dir, { recursive: true, force: true });
  }
});
