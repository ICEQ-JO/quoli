import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionDetail, ToolCall } from "../shared/model.ts";
import {
  callText,
  matchesFilter,
  readableOutput,
  readPrompt,
  took,
} from "../web/src/lenses/agents/helpers.ts";
import { buildSections } from "../web/src/lenses/agents/Timeline.tsx";

let n = 0;
const call = (over: Partial<ToolCall> = {}): ToolCall => ({
  id: `c${n++}`,
  agentId: "main",
  name: "Bash",
  category: "run",
  startedAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
  endedAt: null,
  status: "ok",
  summary: "",
  files: [],
  input: null,
  output: null,
  ...over,
});

test("buildSections puts each prompt over the calls it led to and threads subagents", () => {
  const a = call();
  const b = call({ agentId: "sub" });
  const c = call({ agentId: "sub" });
  const d = call();
  const session = {
    agents: [
      { id: "main", kind: "main" },
      { id: "sub", kind: "subagent", type: "Explore" },
    ],
    turns: [
      { prompt: "first", at: a.startedAt, toolCallIds: [a.id] },
      { prompt: "second", at: d.startedAt, toolCallIds: [d.id] },
      { prompt: "no calls yet", at: "2026-01-01T01:00:00Z", toolCallIds: [] },
    ],
  } as unknown as SessionDetail;
  const sections = buildSections(session, [a, b, c, d]);
  assert.deepEqual(
    sections.map((s) => [s.n, s.groups.map((g) => g.calls.length)]),
    [
      [1, [1, 2]],
      [2, [1]],
      [3, []],
    ],
  );
  assert.equal(sections[0]?.groups[1]?.agent?.kind, "subagent");
});

test("calls before the first prompt get a section without a prompt", () => {
  const a = call();
  const b = call();
  const session = {
    agents: [{ id: "main", kind: "main" }],
    turns: [{ prompt: "later", at: b.startedAt, toolCallIds: [b.id] }],
  } as unknown as SessionDetail;
  const sections = buildSections(session, [a, b]);
  assert.equal(sections[0]?.prompt, null);
  assert.equal(sections[1]?.n, 1);
});

test("filters keep failed calls, edits, commands and subagent work", () => {
  const failed = call({ status: "failed" });
  const edit = call({ category: "edit", name: "Edit" });
  const spawn = call({ category: "agent", name: "Agent" });
  const inSub = call({ agentId: "sub", category: "read" });
  assert.ok(matchesFilter(failed, "failed", "main"));
  assert.ok(!matchesFilter(edit, "failed", "main"));
  assert.ok(matchesFilter(edit, "edits", "main"));
  assert.ok(matchesFilter(failed, "commands", "main"));
  assert.ok(matchesFilter(spawn, "subagents", "main"));
  assert.ok(matchesFilter(inSub, "subagents", "main"));
  assert.ok(!matchesFilter(edit, "subagents", "main"));
});

test("readPrompt turns task notifications and slash commands into short notices", () => {
  assert.deepEqual(
    readPrompt(
      '<task-notification> <task-id>x</task-id> <status>completed</status> <summary>Agent "Find" finished</summary></task-notification>',
    ),
    { kind: "notice", title: 'Agent "Find" finished', detail: "completed" },
  );
  assert.deepEqual(
    readPrompt(
      "<command-message>review</command-message><command-name>/review</command-name><command-args>12</command-args>",
    ),
    { kind: "notice", title: "Ran /review 12", detail: null },
  );
  assert.deepEqual(readPrompt("Fix <b>this</b>"), { kind: "user", text: "Fix <b>this</b>" });
});

test("callText shows the whole command, not the clipped summary", () => {
  const long = `pnpm test && ${"x".repeat(300)}`;
  assert.equal(callText(call({ input: { command: long }, summary: long.slice(0, 140) })), long);
  assert.equal(
    callText(call({ category: "search", input: { pattern: "foo", path: "src" } })),
    "foo  in src",
  );
  assert.equal(callText(call({ files: ["a.ts"], summary: "a.ts", input: {} })), "a.ts");
});

test("took hides sub-second durations", () => {
  assert.equal(
    took(call({ startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:00:00.400Z" })),
    "",
  );
  assert.equal(
    took(call({ startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:00:02.500Z" })),
    "2.5s",
  );
  assert.equal(took(call({ startedAt: "2026-01-01T00:00:00Z", endedAt: null })), "");
});

test("readableOutput unwraps Read results and text blocks, keeps anything else", () => {
  const read = JSON.stringify({
    type: "text",
    file: { filePath: "/r/a.md", content: "# A\nb", numLines: 2, startLine: 1, totalLines: 9 },
  });
  assert.deepEqual(readableOutput(read), { text: "# A\nb", note: "Lines 1–2 of 9" });
  assert.deepEqual(readableOutput(JSON.stringify([{ type: "text", text: "done" }])), {
    text: "done",
    note: null,
  });
  assert.deepEqual(readableOutput("plain"), { text: "plain", note: null });
  assert.deepEqual(readableOutput("{not json"), { text: "{not json", note: null });
  assert.equal(readableOutput(null), null);
});
