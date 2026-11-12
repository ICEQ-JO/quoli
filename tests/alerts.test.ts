import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultPrices } from "../server/prices.ts";
import { liveSession } from "../server/steps.ts";
import {
  type AlertConfig,
  type AlertInput,
  DEFAULT_ALERTS,
  evaluateAlerts,
  parseAlertConfig,
} from "../shared/alerts.ts";
import type { LiveSession, SessionDetail, ToolCall } from "../shared/model.ts";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const live = (id: string, o: Partial<LiveSession> = {}): LiveSession => ({
  id,
  agent: "claude-code",
  agentVersion: null,
  projectId: "p1",
  root: "/r",
  title: `Session ${id}`,
  branch: null,
  startedAt: ago(30),
  endedAt: null,
  live: true,
  toolCount: 0,
  filesTouched: 0,
  failures: 0,
  loops: 0,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  models: [],
  cost: { usd: 1, unpriced: [] },
  trace: "",
  lastAt: ago(0),
  step: null,
  recentUsd: null,
  ...o,
});

const all: AlertConfig = {
  cost: { on: true, usd: 5 },
  budget: { on: true },
  loop: { on: true },
  quiet: { on: true, minutes: 5 },
  ended: { on: true },
  system: false,
};

const input = (o: Partial<AlertInput> = {}): AlertInput => ({
  now: NOW,
  live: [],
  previous: null,
  spentToday: null,
  dailyBudget: null,
  today: "2026-11-12",
  projectName: () => "shop",
  ...o,
});

const keys = (c: AlertConfig, i: AlertInput, fired = new Set<string>()) =>
  evaluateAlerts(c, i, fired).map((a) => a.key);

test("nothing fires while alerts are off, which is the default", () => {
  const busy = input({
    live: [live("a", { cost: { usd: 99, unpriced: [] }, loops: 2, lastAt: ago(8) })],
    previous: [live("b")],
    spentToday: 50,
    dailyBudget: 10,
  });
  assert.deepEqual(keys(DEFAULT_ALERTS, busy), []);
});

test("each trigger fires at its threshold, and only then", () => {
  assert.deepEqual(
    keys(all, input({ live: [live("a", { cost: { usd: 4.99, unpriced: [] } })] })),
    [],
  );
  assert.deepEqual(keys(all, input({ live: [live("a", { cost: { usd: 5, unpriced: [] } })] })), [
    "a:cost",
  ]);
  // An unknown cost never counts as crossing.
  assert.deepEqual(
    keys(all, input({ live: [live("a", { cost: { usd: null, unpriced: ["x"] } })] })),
    [],
  );
  assert.deepEqual(keys(all, input({ live: [live("a", { loops: 1 })] })), ["a:loop"]);
  assert.deepEqual(keys(all, input({ live: [live("a", { lastAt: ago(4.9) })] })), []);
  assert.deepEqual(keys(all, input({ live: [live("a", { lastAt: ago(5) })] })), ["a:quiet"]);
  assert.deepEqual(keys(all, input({ spentToday: 9.99, dailyBudget: 10 })), []);
  assert.deepEqual(keys(all, input({ spentToday: 10, dailyBudget: 10 })), ["budget:2026-11-12"]);
  assert.deepEqual(keys(all, input({ spentToday: 10, dailyBudget: null })), []);
});

test("a session ends when it leaves the live list; the first look has nothing to compare", () => {
  assert.deepEqual(keys(all, input({ live: [live("a")], previous: null })), []);
  assert.deepEqual(keys(all, input({ live: [live("a")], previous: [live("a"), live("b")] })), [
    "b:ended",
  ]);
});

test("each alert shows once per session per trigger, and the budget once a day", () => {
  const fired = new Set<string>();
  const loud = input({
    live: [live("a", { cost: { usd: 9, unpriced: [] }, loops: 1 })],
    spentToday: 20,
    dailyBudget: 10,
  });
  assert.deepEqual(keys(all, loud, fired), ["a:cost", "a:loop", "budget:2026-11-12"]);
  assert.deepEqual(keys(all, loud, fired), []);
  assert.deepEqual(keys(all, { ...loud, today: "2026-11-13" }, fired), ["budget:2026-11-13"]);
});

test("alert text carries only the session title and project name", () => {
  const long = "x".repeat(200);
  const [a] = evaluateAlerts(
    all,
    input({ live: [live("a", { title: long, loops: 1 })] }),
    new Set(),
  );
  assert.equal(a.body, `${"x".repeat(79)}… · shop`);
  assert.equal(a.sessionId, "a");
});

test("a stored config is read defensively", () => {
  assert.deepEqual(parseAlertConfig(null), DEFAULT_ALERTS);
  assert.deepEqual(parseAlertConfig("nonsense"), DEFAULT_ALERTS);
  const c = parseAlertConfig({
    cost: { on: true, usd: -3 },
    quiet: { on: "yes", minutes: 30 },
    loop: { on: true },
    system: 1,
  });
  assert.deepEqual(
    [c.cost, c.quiet, c.loop.on, c.ended.on, c.system],
    [{ on: true, usd: 5 }, { on: false, minutes: 5 }, true, false, false],
  );
});

test("the live view of a session shows the running call and spend in the last 10 minutes", () => {
  const call = (id: string, at: number, status: ToolCall["status"], summary: string): ToolCall => ({
    id,
    agentId: "main",
    name: "Bash",
    category: "run",
    startedAt: ago(at),
    endedAt: status === "running" ? null : ago(at - 0.5),
    status,
    summary,
    files: [],
    input: {},
    output: null,
  });
  const usage = (min: number, input: number) => ({
    at: ago(min),
    agentId: "main",
    model: "claude-opus-5-5",
    tokens: { input, output: 0, cacheRead: 0, cacheWrite: 0 },
  });
  const d = {
    ...live("a"),
    agents: [],
    turns: [{ prompt: "go", at: ago(20), toolCallIds: [] }],
    toolCalls: [call("1", 3, "running", "pnpm test"), call("2", 2, "ok", "cat a.ts")],
    files: {},
    usage: [usage(15, 1_000_000), usage(4, 250_000)],
    report: {} as SessionDetail["report"],
  } as SessionDetail;
  const l = liveSession(d, defaultPrices(), NOW);
  assert.equal(l.step?.summary, "pnpm test");
  assert.equal(l.step?.status, "running");
  // claude-opus-5-5 input is $4 per million; only the row 4 minutes ago is recent.
  assert.equal(l.recentUsd, 1);
  assert.equal(l.lastAt, ago(1.5));
  assert.equal("toolCalls" in l, false);
});
