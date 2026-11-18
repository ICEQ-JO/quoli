import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Store } from "../server/db.ts";
import { placeNotes } from "../server/notes.ts";
import { notesFromLines, syncTranscript } from "../server/transcript.ts";
import { explainCall } from "../shared/explain.ts";
import { categorize, type ToolCall } from "../shared/model.ts";

const line = (content: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "assistant",
    uuid: `u${Math.random()}`,
    timestamp: "2026-11-18T10:00:00.000Z",
    message: { id: "msg_1", content },
    ...extra,
  });

test("notes: text and thinking blocks become notes; tool use, empty thinking and other lines do not", () => {
  const rows = notesFromLines(
    [
      line([{ type: "thinking", thinking: "Check the parser first." }]),
      line([{ type: "text", text: "  Let me run the tests.  " }]),
      line([{ type: "thinking", thinking: "", signature: "abc" }]),
      line([{ type: "tool_use", id: "t1", name: "Bash", input: {} }]),
      JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "hi" }] } }),
      "not json",
    ],
    "s1",
    "main",
  );
  assert.deepEqual(
    rows.map((r) => [r.kind, r.text, r.agentId]),
    [
      ["thinking", "Check the parser first.", "main"],
      ["said", "Let me run the tests.", "main"],
    ],
  );
});

test("notes: subagent lines keep their agent; very long text is cut", () => {
  const [row] = notesFromLines(
    [line([{ type: "text", text: "x".repeat(5000) }], { isSidechain: true, agentId: "a7" })],
    "s1",
    "main",
  );
  assert.equal(row?.agentId, "a7");
  assert.equal(row?.text.length, 4000);
  assert.ok(row?.text.endsWith("…"));
});

test("notes: read once from the transcript, redacted, and deleted with the session", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-notes-"));
  try {
    const store = new Store(":memory:");
    const path = join(dir, "t.jsonl");
    writeFileSync(
      path,
      `${line([{ type: "text", text: "Using key sk-abcdefghijklmnopqrstuvwxyz123456 now" }], { uuid: "fixed" })}\n`,
    );
    syncTranscript(store, path, "s1", "main");
    syncTranscript(store, path, "s1", "main");
    const notes = store.notes("s1");
    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.text, "Using key [redacted] now");
    store.deleteSessions(["s1"]);
    assert.equal(store.notes("s1").length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const call = (over: Partial<ToolCall> & { name: string; input?: unknown }): ToolCall => ({
  id: over.id ?? "c",
  agentId: over.agentId ?? "main",
  category: categorize(over.name),
  startedAt: over.startedAt ?? "2026-11-18T10:00:01.000Z",
  endedAt: null,
  status: over.status ?? "ok",
  summary: "",
  files: over.files ?? [],
  output: null,
  ...over,
  input: over.input ?? {},
});

test("notes: placed before the same agent's next call, or null when none followed", () => {
  const calls = [
    call({ id: "a", name: "Read", startedAt: "2026-11-18T10:00:02.000Z" }),
    call({ id: "b", name: "Read", startedAt: "2026-11-18T10:00:05.000Z", agentId: "sub" }),
    call({ id: "c", name: "Read", startedAt: "2026-11-18T10:00:09.000Z" }),
  ];
  const at = (s: number) => `2026-11-18T10:00:0${s}.000Z`;
  const row = (id: string, agentId: string, s: number) => ({
    id,
    sessionId: "s",
    agentId,
    at: at(s),
    kind: "said" as const,
    text: id,
  });
  const placed = placeNotes(
    [row("n1", "main", 1), row("n2", "main", 3), row("n3", "sub", 4), row("n4", "main", 9)],
    calls,
  );
  assert.deepEqual(
    placed.map((n) => n.beforeCallId),
    ["a", "c", "b", "c"],
  );
  assert.equal(placeNotes([row("n5", "main", 9)], calls.slice(0, 2))[0]?.beforeCallId, null);
});

test("explain: one plain sentence per kind of call", () => {
  const cases: [Partial<ToolCall> & { name: string }, string][] = [
    [{ name: "Read", files: ["src/app.ts"], input: { file_path: "/r/src/app.ts" } }, "Read app.ts"],
    [
      { name: "Edit", files: ["src/db.ts"], input: { old_string: "a", new_string: "b\nc" } },
      "Changed db.ts (+2 −1 lines)",
    ],
    [{ name: "Write", files: ["x.md"], input: { content: "a\nb\n" } }, "Wrote x.md (2 lines)"],
    [
      { name: "Grep", input: { pattern: "useData", path: "/r/web" } },
      "Searched the code for “useData” in web",
    ],
    [{ name: "Glob", input: { pattern: "**/*.ts" } }, "Looked for files matching “**/*.ts”"],
    [{ name: "Bash", input: { command: "pnpm vitest run" } }, "Ran the tests"],
    [{ name: "Bash", input: { command: "npx tsc --noEmit" } }, "Checked the code for type errors"],
    [{ name: "Bash", input: { command: "git commit -m x" } }, "Made a Git commit"],
    [{ name: "Bash", input: { command: "pnpm install" } }, "Installed packages"],
    [{ name: "Bash", input: { command: "ls -la" } }, "Looked around the folders"],
    [{ name: "Bash", input: { command: "frobnicate --all" } }, "Ran `frobnicate`"],
    [
      { name: "Bash", input: { command: "x", description: "Start the dev server." } },
      "Start the dev server",
    ],
    [{ name: "exec_command", input: { command: ["bash", "-lc", "cargo test"] } }, "Ran the tests"],
    [
      { name: "WebFetch", input: { url: "https://docs.example.com/a" } },
      "Opened a web page on docs.example.com",
    ],
    [{ name: "WebSearch", input: { query: "node sqlite" } }, "Searched the web for “node sqlite”"],
    [
      { name: "Task", input: { subagent_type: "Explore", description: "Find the auth code" } },
      "Handed a task to a subagent (Explore): Find the auth code",
    ],
    [{ name: "mcp__github__create_issue", input: {} }, "Used create issue from github"],
    [{ name: "TodoWrite", input: {} }, "Updated its to-do list"],
    [{ name: "Mystery", input: {} }, "Used the Mystery tool"],
    [{ name: "Bash", status: "failed", input: { command: "pnpm test" } }, "Ran the tests"],
  ];
  for (const [c, want] of cases) assert.equal(explainCall(call(c)), want, c.name);
});
