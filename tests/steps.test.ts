import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultPrices } from "../server/prices.ts";
import { coveredMs, slowestCalls, turnStats } from "../server/steps.ts";
import type { ToolCall, Turn, UsagePoint } from "../shared/model.ts";

const T = (s: number) => new Date(Date.UTC(2026, 10, 12, 10, 0, s)).toISOString();

const call = (
  id: string,
  from: number,
  to: number | null,
  status: ToolCall["status"] = "ok",
): ToolCall => ({
  id,
  agentId: "main",
  name: "Bash",
  category: "run",
  startedAt: T(from),
  endedAt: to === null ? null : T(to),
  status,
  summary: id,
  files: [],
  input: {},
  output: null,
});

const use = (at: number, model: string | null, input: number, output = 0): UsagePoint => ({
  at: T(at),
  agentId: "main",
  model,
  tokens: { input, output, cacheRead: 0, cacheWrite: 0 },
});

test("coveredMs counts overlapping intervals once", () => {
  assert.equal(coveredMs([]), 0);
  assert.equal(coveredMs([[0, 10]]), 10);
  assert.equal(
    coveredMs([
      [0, 10],
      [5, 15],
      [20, 25],
      [21, 22],
    ]),
    20,
  );
  assert.equal(coveredMs([[5, 5]]), 0);
});

test("turn stats split time, calls, failures and usage at each prompt", () => {
  const calls = [call("a", 2, 7), call("b", 5, 9, "failed"), call("c", 32, 40)];
  const turns: Turn[] = [
    { prompt: "first", at: T(0), toolCallIds: ["a", "b"] },
    { prompt: "second", at: T(30), toolCallIds: ["c"] },
  ];
  // claude-opus-5-5: $4 input, $20 output per million.
  const usage = [
    use(-5, "claude-opus-5-5", 1_000_000), // before the first prompt: first turn
    use(10, "claude-opus-5-5", 0, 1_000_000),
    use(30, "claude-opus-5-5", 500_000), // exactly at the second prompt: second turn
    use(35, "mystery-model", 1_000),
  ];
  const [one, two] = turnStats(turns, calls, usage, defaultPrices(), T(50));
  assert.deepEqual(
    [
      one.ms,
      one.calls,
      one.failures,
      one.toolMs,
      one.tokens.input,
      one.tokens.output,
      one.cost.usd,
    ],
    [30_000, 2, 1, 7_000, 1_000_000, 1_000_000, 24],
  );
  assert.equal(one.endAt, T(30));
  assert.deepEqual(
    [
      two.ms,
      two.calls,
      two.failures,
      two.toolMs,
      two.tokens.input,
      two.cost.usd,
      two.cost.unpriced,
    ],
    [20_000, 1, 0, 8_000, 501_000, 2, ["mystery-model"]],
  );
});

test("a running call counts until the turn ends, and sessions without prompts have no turns", () => {
  const turns: Turn[] = [{ prompt: "go", at: T(0), toolCallIds: ["r"] }];
  const [only] = turnStats(turns, [call("r", 10, null, "running")], [], defaultPrices(), T(25));
  assert.equal(only.toolMs, 15_000);
  assert.equal(only.cost.usd, null);
  assert.deepEqual(turnStats([], [call("r", 0, 1)], [], defaultPrices(), T(5)), []);
});

test("slowestCalls lists finished calls, longest first", () => {
  const calls = [call("a", 0, 2), call("b", 0, 30), call("c", 0, null, "running"), call("d", 0, 9)];
  assert.deepEqual(slowestCalls(calls, 2), [
    { toolCallId: "b", ms: 30_000 },
    { toolCallId: "d", ms: 9_000 },
  ]);
});
