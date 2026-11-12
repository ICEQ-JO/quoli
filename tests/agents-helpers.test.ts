import assert from "node:assert/strict";
import { test } from "node:test";
import type { ToolCall } from "../shared/model.ts";
import { collapseRuns, commonPrefix, runLabel } from "../web/src/lenses/agents/helpers.ts";

let n = 0;
const call = (name: string, over: Partial<ToolCall> = {}): ToolCall => ({
  id: `c${n++}`,
  agentId: "main",
  name,
  category: name === "Read" ? "read" : name === "Agent" ? "agent" : "run",
  startedAt: "2026-01-01T00:00:00Z",
  endedAt: null,
  status: "ok",
  summary: "",
  files: [],
  input: null,
  output: null,
  ...over,
});

const sizes = (g: ToolCall[][]) => g.map((x) => x.length);

test("commonPrefix returns the shared directory, never a partial segment", () => {
  assert.equal(commonPrefix(["a/b/c.ts", "a/b/d/e.ts"]), "a/b");
  assert.equal(commonPrefix(["a/bc/x.ts", "a/bd/y.ts"]), "a");
  assert.equal(commonPrefix(["x.ts", "y/z.ts"]), "");
  assert.equal(commonPrefix(["a/b/c.ts"]), "a/b");
  assert.equal(commonPrefix([]), "");
});

test("collapseRuns groups 3+ consecutive same-tool calls and leaves short runs alone", () => {
  const calls = [
    call("Read"),
    call("Read"),
    call("Read"),
    call("Bash"),
    call("Read"),
    call("Read"),
  ];
  assert.deepEqual(sizes(collapseRuns(calls)), [3, 1, 1, 1]);
});

test("collapseRuns never joins failed calls, other agents or subagent launches", () => {
  const groups = collapseRuns([
    call("Read"),
    call("Read"),
    call("Read", { status: "failed" }),
    call("Read"),
    call("Read", { agentId: "sub" }),
    call("Read", { agentId: "sub" }),
    call("Agent"),
    call("Agent"),
    call("Agent"),
  ]);
  assert.deepEqual(sizes(groups), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(
    sizes(collapseRuns([call("Read"), call("Read"), call("Read"), call("Read")])),
    [4],
  );
});

test("runLabel shows the tool, the count and the shared path", () => {
  const run = ["p/a/x.ts", "p/a/y.ts", "p/a/z/w.ts"].map((f) => call("Read", { files: [f] }));
  assert.equal(runLabel(run), "Read × 3 · p/a/…");
});
