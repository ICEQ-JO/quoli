import assert from "node:assert/strict";
import { test } from "node:test";
import { findLoops } from "../server/loops.ts";
import type { ToolCall, ToolCategory, Turn } from "../shared/model.ts";

let n = 0;
const T = (s: number) => new Date(Date.UTC(2026, 10, 12, 10, 0, s)).toISOString();
function call(
  category: ToolCategory,
  opts: { status?: ToolCall["status"]; input?: unknown; file?: string; agent?: string } = {},
): ToolCall {
  const i = n++;
  return {
    id: `c${i}`,
    agentId: opts.agent ?? "main",
    name: category,
    category,
    startedAt: T(i),
    endedAt: T(i),
    status: opts.status ?? "ok",
    summary: "",
    files: opts.file ? [opts.file] : [],
    input: opts.input ?? {},
    output: null,
  };
}
const turn = (calls: ToolCall[]): Turn => ({
  prompt: "p",
  at: calls[0]?.startedAt ?? T(0),
  toolCallIds: calls.map((c) => c.id),
});
const kinds = (calls: ToolCall[], turns: Turn[] = [turn(calls)]) =>
  findLoops(calls, turns).map((f) => f.kind);

test("repeated failure: the same command failing three times, whitespace ignored", () => {
  const fail = (command: unknown) => call("run", { status: "failed", input: { command } });
  const three = [fail("pnpm  test"), call("read"), fail("pnpm test"), fail(["pnpm", "test"])];
  const found = findLoops(three, [turn(three)]);
  assert.deepEqual(
    found.map((f) => [f.kind, f.toolCallIds.length]),
    [["repeated-failure", 3]],
  );
  assert.match(found[0].rule, /3 or more/);
  assert.deepEqual(kinds([fail("pnpm test"), fail("pnpm test"), fail("pnpm lint")]), []);
  // Successful runs of the same command are not failures.
  const ok = (command: string) => call("run", { input: { command } });
  assert.deepEqual(kinds([ok("pnpm test"), ok("pnpm test"), ok("pnpm test")]), []);
});

test("error streak: four failed calls in a row for one agent", () => {
  const f = (agent = "main") => call("read", { status: "failed", agent });
  assert.deepEqual(kinds([f(), f(), f(), f()]), ["error-streak"]);
  assert.deepEqual(kinds([f(), f(), call("read"), f(), f()]), []);
  // Interleaved agents each keep their own streak.
  assert.deepEqual(kinds([f("main"), f("sub"), f("main"), f("sub"), f("main"), f("main")]), [
    "error-streak",
  ]);
});

test("edit churn: five edits to one file after one prompt, and an edit that undoes another", () => {
  const e = (file: string, input: unknown = {}) => call("edit", { file, input });
  const five = [e("a.ts"), e("a.ts"), e("a.ts"), e("a.ts"), e("a.ts")];
  assert.deepEqual(kinds(five), ["edit-churn"]);
  // Spread over two prompts, it is not churn.
  assert.deepEqual(kinds(five, [turn(five.slice(0, 3)), turn(five.slice(3))]), []);
  const there = e("b.ts", { old_string: "x", new_string: "y" });
  const back = e("b.ts", { oldString: "y", newString: "x" });
  const found = findLoops([there, back], [turn([there, back])]);
  assert.deepEqual(
    found.map((f) => [f.kind, f.toolCallIds]),
    [["edit-churn", [there.id, back.id]]],
  );
  // Same text in another file is not a revert.
  const other = e("c.ts", { old_string: "y", new_string: "x" });
  assert.deepEqual(kinds([there, other]), []);
});

test("stall: ten or more reads and searches after a prompt with no edit or command", () => {
  const looking = Array.from({ length: 10 }, (_, i) => call(i % 2 ? "read" : "search"));
  assert.deepEqual(kinds(looking), ["stall"]);
  assert.deepEqual(kinds([...looking, call("edit", { file: "a.ts" })]), []);
  assert.deepEqual(kinds(looking.slice(0, 9)), []);
});
