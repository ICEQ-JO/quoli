import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp, json } from "../server/app.ts";
import { type RawEvent, Store } from "../server/db.ts";
import { seedDemo } from "../server/demo.ts";
import {
  costOf,
  defaultPrices,
  loadPrices,
  priceFor,
  resetPrices,
  savePrices,
  validatePrices,
} from "../server/prices.ts";
import { classifyCommand, countLines } from "../server/report.ts";
import { deriveSession } from "../server/sessions.ts";
import type { PriceTable } from "../shared/model.ts";

const tokens = (input = 0, output = 0, cacheRead = 0, cacheWrite = 0) => ({
  input,
  output,
  cacheRead,
  cacheWrite,
});

test("price matching: exact, prefix, longest prefix, unknown", () => {
  const t = defaultPrices();
  assert.equal(priceFor("claude-sonnet-4-5", t)?.model, "claude-sonnet-4-5");
  assert.equal(priceFor("claude-sonnet-4-5-20250929", t)?.model, "claude-sonnet-4-5");
  // claude-opus-4 must not swallow claude-opus-4-5 or claude-opus-4-1
  assert.equal(priceFor("claude-opus-4-5-20251101", t)?.model, "claude-opus-4-5");
  assert.equal(priceFor("claude-opus-4-1-20250805", t)?.model, "claude-opus-4-1");
  assert.equal(priceFor("claude-opus-4-20250514", t)?.model, "claude-opus-4");
  assert.equal(priceFor("gpt-x", t), null);
  // OpenAI: dated snapshots match, other models sharing a prefix stay unpriced.
  assert.equal(priceFor("gpt-6.1-sol", t)?.input, 2);
  assert.equal(priceFor("gpt-5-2025-08-07", t)?.model, "gpt-5");
  assert.equal(priceFor("gpt-5.3-codex", t)?.model, "gpt-5.3-codex");
  assert.equal(priceFor("gpt-5-codex", t), null);
  assert.equal(priceFor("gpt-5.7", t), null);
  assert.equal(t.prices.length, 36);
  assert.match(t.version, /derived/);
});

test("cost math is exact and leaves unpriced models out", () => {
  const t = defaultPrices();
  const sonnet = tokens(1_000_000, 100_000, 2_000_000, 400_000);
  // 3 + 1.5 + 0.6 + 1.5
  assert.deepEqual(costOf([{ model: "claude-sonnet-4-5-x", tokens: sonnet }], t), {
    usd: 6.6,
    unpriced: [],
  });
  const mixed = costOf(
    [
      { model: "claude-haiku-4-5", tokens: tokens(1_000_000) },
      { model: "mystery", tokens: tokens(5_000_000) },
      { model: null, tokens: tokens(5_000_000) },
    ],
    t,
  );
  assert.deepEqual(mixed, { usd: 1, unpriced: ["mystery"] });
  assert.deepEqual(costOf([{ model: "mystery", tokens: tokens(1) }], t), {
    usd: null,
    unpriced: ["mystery"],
  });
  assert.deepEqual(costOf([], t), { usd: null, unpriced: [] });
});

test("PUT validation and the settings-backed save, load and reset", () => {
  const good: PriceTable = {
    version: "mine",
    currency: "USD",
    prices: [{ model: "m", input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }],
  };
  assert.deepEqual(validatePrices(good), good);
  const row = good.prices[0];
  const bad = (t: unknown, re: RegExp) => assert.throws(() => validatePrices(t), re);
  bad(null, /object/);
  bad({ ...good, currency: "EUR" }, /USD/);
  bad({ ...good, prices: [] }, /1 to 200/);
  bad(
    { ...good, prices: Array.from({ length: 201 }, (_, i) => ({ ...row, model: `m${i}` })) },
    /1 to 200/,
  );
  bad({ ...good, prices: [{ ...row, model: " " }] }, /model/);
  bad({ ...good, prices: [row, row] }, /duplicate/);
  bad({ ...good, prices: [{ ...row, input: -1 }] }, /input/);
  bad({ ...good, prices: [{ ...row, output: 1001 }] }, /output/);
  bad({ ...good, prices: [{ ...row, cacheRead: Number.NaN }] }, /cacheRead/);
  bad({ ...good, prices: [{ ...row, cacheWrite: "1" }] }, /cacheWrite/);
  bad({ ...good, version: 3 }, /version/);

  const store = new Store(":memory:");
  assert.deepEqual(loadPrices(store), defaultPrices());
  savePrices(store, good);
  assert.deepEqual(loadPrices(store), good);
  resetPrices(store);
  assert.deepEqual(loadPrices(store), defaultPrices());
  store.putSetting("prices", "{broken");
  assert.deepEqual(loadPrices(store), defaultPrices());
});

test("command classification", () => {
  const table: [string, string][] = [
    ["pnpm --filter orders-api test", "test"],
    ["npx vitest run", "test"],
    ["pytest -q", "test"],
    ["go test ./...", "test"],
    ["cargo test", "test"],
    ["node --test tests/", "test"],
    ["pnpm --filter storefront typecheck", "typecheck"],
    ["npx tsc --noEmit", "typecheck"],
    ["mypy .", "typecheck"],
    ["pnpm lint", "lint"],
    ["biome check .", "lint"],
    ["ruff check", "lint"],
    ["prettier --check .", "lint"],
    ["cargo clippy", "lint"],
    ["pnpm build", "build"],
    ["cargo build", "build"],
    ["make all", "build"],
    ["vite build", "build"],
    ["ls -la", "other"],
    ['git commit -am "add test"', "other"],
  ];
  for (const [cmd, kind] of table) assert.equal(classifyCommand(cmd), kind, cmd);
});

test("line counting ignores one trailing newline", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\n"), 1);
  assert.equal(countLines("a\nb"), 2);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("a\n\n"), 2);
});

type Step = { tool: string; input: Record<string, unknown>; fail?: boolean };

/** Derives a session from tool steps in `/r`. */
function session(steps: Step[]) {
  const events: RawEvent[] = [];
  const e = (event: string, payload: Record<string, unknown>) =>
    events.push({
      seq: events.length + 1,
      sessionId: "s",
      root: "/r",
      event,
      at: `2026-01-01T00:00:${String(events.length).padStart(2, "0")}Z`,
      payload,
    });
  e("SessionStart", {});
  steps.forEach((s, i) => {
    e("PreToolUse", { tool_name: s.tool, tool_use_id: `t${i}`, tool_input: s.input });
    e(s.fail ? "PostToolUseFailure" : "PostToolUse", {
      tool_use_id: `t${i}`,
      tool_response: s.fail ? undefined : "ok",
      error: s.fail ? "boom" : undefined,
    });
  });
  const d = deriveSession(events, [], defaultPrices());
  assert.ok(d);
  return d;
}

const edit = (file: string, o = "a", n = "b"): Step => ({
  tool: "Edit",
  input: { file_path: `/r/${file}`, old_string: o, new_string: n },
});
const bash = (command: string, fail = false): Step => ({ tool: "Bash", input: { command }, fail });
const lines = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`).join("\n");

test("changes count lines for Edit, MultiEdit and Write", () => {
  const d = session([
    edit("a.ts", "x\ny\n", "x\ny\nz\n"),
    edit("a.ts", "q", "r"),
    {
      tool: "MultiEdit",
      input: {
        file_path: "/r/b.ts",
        edits: [
          { old_string: "1\n2\n3", new_string: "1" },
          { old_string: "", new_string: "new" },
        ],
      },
    },
    { tool: "Write", input: { file_path: "/r/c.ts", content: "a\nb\nc\n" } },
    { tool: "Write", input: { file_path: "/r/empty.ts", content: "" } },
    {
      tool: "Edit",
      input: { file_path: "/r/failed.ts", old_string: "a", new_string: "b" },
      fail: true,
    },
    { tool: "Edit", input: { file_path: "/elsewhere/out.ts", old_string: "a", new_string: "b" } },
  ]);
  assert.deepEqual(
    d.report.changes.map((c) => [c.path, c.added, c.removed, c.rewrite, c.toolCallIds]),
    [
      ["a.ts", 4, 3, false, ["t0", "t1"]],
      ["b.ts", 2, 3, false, ["t2"]],
      ["c.ts", 3, 0, true, ["t3"]],
      ["empty.ts", 0, 0, true, ["t4"]],
    ],
  );
});

test("commands list only run calls with a command", () => {
  const d = session([
    bash("pnpm test"),
    { tool: "Read", input: { file_path: "/r/a" } },
    bash("ls", true),
  ]);
  assert.deepEqual(
    d.report.commands.map((c) => [c.toolCallId, c.kind, c.status]),
    [
      ["t0", "test", "ok"],
      ["t2", "other", "failed"],
    ],
  );
});

const ids = (d: { report: { checklist: { id: string }[] } }) => d.report.checklist.map((i) => i.id);

test("checklist: no test command, then edited after the last test", () => {
  const none = session([edit("a.ts"), edit("b.ts"), edit("a.ts")]);
  assert.equal(none.report.checklist.length, 1);
  assert.equal(none.report.checklist[0].text, "No test command was run");
  assert.deepEqual(none.report.checklist[0].files, ["a.ts", "b.ts"]);
  assert.deepEqual(none.report.checklist[0].toolCallIds, ["t0", "t1", "t2"]);

  const after = session([edit("a.ts"), bash("pnpm test"), edit("b.ts"), bash("pnpm typecheck")]);
  assert.deepEqual(ids(after), ["edited-after-test"]);
  assert.deepEqual(after.report.checklist[0].files, ["b.ts"]);
  assert.match(after.report.checklist[0].text, /edited after the last test command/);

  assert.deepEqual(ids(session([edit("a.ts"), bash("pnpm test")])), []);
  assert.deepEqual(ids(session([bash("pnpm test")])), []);
  assert.deepEqual(ids(session([])), []);
});

test("checklist: failed command flagged unless the same command later succeeds", () => {
  const stuck = session([bash("pnpm test", true), edit("a.ts"), bash("pnpm lint")]);
  assert.ok(ids(stuck).includes("failed-t0"));

  const fixed = session([bash("pnpm test", true), edit("a.ts"), bash("pnpm test")]);
  assert.deepEqual(ids(fixed), []);

  const stillFailing = session([bash("pnpm test", true), bash("pnpm test", true)]);
  assert.deepEqual(ids(stillFailing), ["failed-t0", "failed-t1"]);

  const differentText = session([bash("pnpm test a", true), bash("pnpm test b")]);
  assert.deepEqual(ids(differentText), ["failed-t0"]);
});

test("checklist: a single edit removing 40 or more lines", () => {
  const big = session([edit("a.ts", lines(40), "x"), bash("pnpm test")]);
  assert.deepEqual(ids(big), ["large-deletion-t0"]);
  assert.match(big.report.checklist[0].text, /Large deletion in a\.ts/);
  assert.deepEqual(big.report.checklist[0].files, ["a.ts"]);

  assert.deepEqual(ids(session([edit("a.ts", lines(39), "x"), bash("pnpm test")])), []);
  // Two edits of 25 lines are not a single large deletion.
  assert.deepEqual(
    ids(session([edit("a.ts", lines(25), ""), edit("a.ts", lines(25), ""), bash("pnpm test")])),
    [],
  );
  // A Write has unknown removed lines, so it is never a large deletion.
  assert.deepEqual(
    ids(
      session([
        { tool: "Write", input: { file_path: "/r/a.ts", content: "x" } },
        bash("pnpm test"),
      ]),
    ),
    [],
  );
});

test("session cost and report.costByModel come from usage rows", () => {
  const events: RawEvent[] = [
    {
      seq: 1,
      sessionId: "s",
      root: "/r",
      event: "SessionStart",
      at: "2026-01-01T00:00:00Z",
      payload: {},
    },
  ];
  const row = (model: string | null, input: number) => ({
    sessionId: "s",
    agentId: "main",
    messageId: `${model}`,
    at: "2026-01-01T00:00:01Z",
    model,
    input,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
  const d = deriveSession(
    events,
    [row("claude-haiku-4-5", 1_000_000), row("mystery", 1), row(null, 2)],
    defaultPrices(),
  );
  assert.ok(d);
  assert.deepEqual(d.cost, { usd: 1, unpriced: ["mystery"] });
  assert.deepEqual(
    d.report.costByModel.map((c) => [c.model, c.usd]),
    [
      ["claude-haiku-4-5", 1],
      ["mystery", null],
      [null, null],
    ],
  );
  assert.equal(d.report.priceVersion, defaultPrices().version);
});

test("demo refunds session produces a sensible report", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-demo-"));
  const prev = process.env.QUOLI_HOME;
  process.env.QUOLI_HOME = dir;
  try {
    const store = new Store(":memory:");
    seedDemo(store);
    const d = deriveSession(
      store.events("demo-refunds"),
      store.usage("demo-refunds"),
      defaultPrices(),
    );
    assert.ok(d);
    const tests = d.report.commands.filter((c) => c.kind === "test");
    assert.deepEqual(
      tests.map((c) => c.status),
      ["failed", "ok"],
    );
    assert.equal(d.report.commands.at(-1)?.kind, "typecheck");
    assert.ok(
      !ids(d).some((id) => id.startsWith("failed-")),
      "failed-then-passing test is not flagged",
    );
    const after = d.report.checklist.find((i) => i.id === "edited-after-test");
    assert.ok(after?.files.includes("apps/web/components/order-row.tsx"));
    assert.ok(
      d.report.changes.some((c) => c.path === "apps/api/src/routes/refunds.ts" && c.rewrite),
    );
    assert.ok(d.cost.usd !== null && d.cost.usd > 0);
    assert.deepEqual(d.cost.unpriced, []);
  } finally {
    if (prev === undefined) delete process.env.QUOLI_HOME;
    else process.env.QUOLI_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prices API: guarded mutations, validation, reset, overview cost", async () => {
  const store = new Store(":memory:");
  let port = 0;
  const app = createApp(store, () => port);
  const server = createServer(async (req, res) => {
    if (!(await app.api(req, res, new URL(req.url ?? "/", "http://127.0.0.1")))) json(res, 404, {});
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  const call = async (method: string, path: string, body?: unknown, origin = true) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method !== "GET" && origin ? { Origin: `http://127.0.0.1:${port}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // biome-ignore lint/suspicious/noExplicitAny: loose JSON in tests
    return { status: res.status, body: (await res.json()) as any };
  };
  try {
    assert.deepEqual((await call("GET", "/api/prices")).body, defaultPrices());
    const mine: PriceTable = {
      version: "mine",
      currency: "USD",
      prices: [{ model: "m", input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }],
    };
    assert.equal((await call("PUT", "/api/prices", mine, false)).status, 403);
    const bad = await call("PUT", "/api/prices", { ...mine, currency: "EUR" });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /USD/);
    assert.deepEqual((await call("PUT", "/api/prices", mine)).body, mine);
    assert.deepEqual((await call("GET", "/api/prices")).body, mine);
    assert.deepEqual((await call("DELETE", "/api/prices", {})).body, defaultPrices());
    assert.deepEqual((await call("GET", "/api/prices")).body, defaultPrices());
    const overview = (await call("GET", "/api/overview")).body;
    assert.deepEqual(overview.cost, {
      today: { usd: null, unpriced: [] },
      week: { usd: null, unpriced: [] },
    });
  } finally {
    server.close();
  }
});
