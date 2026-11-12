import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Store } from "../server/db.ts";
import { ingest, recordEvent } from "../server/ingest.ts";
import { defaultPrices } from "../server/prices.ts";
import { commandText } from "../server/report.ts";
import { deriveSession } from "../server/sessions.ts";
import { usageReport } from "../server/usage.ts";
import { categorize } from "../shared/model.ts";

test("categorize maps Claude Code, Codex and OpenCode tool names", () => {
  const cases: [string, string][] = [
    ["Read", "read"],
    ["read", "read"],
    ["Edit", "edit"],
    ["apply_patch", "edit"],
    ["write", "edit"],
    ["Bash", "run"],
    ["shell", "run"],
    ["exec_command", "run"],
    ["Grep", "search"],
    ["glob", "search"],
    ["Task", "agent"],
    ["spawn_agent", "agent"],
    ["web_search", "web"],
    ["mcp__github__list_prs", "web"],
  ];
  for (const [name, category] of cases) assert.equal(categorize(name), category, name);
});

test("commandText reads string and argument-list commands", () => {
  assert.equal(commandText({ command: "pnpm test" }), "pnpm test");
  assert.equal(commandText({ command: ["bash", "-lc", "pnpm test"] }), "bash -lc pnpm test");
  assert.equal(commandText({ command: [1, 2] }), null);
  assert.equal(commandText(null), null);
});

function withDir(fn: (dir: string, store: Store) => void) {
  const dir = mkdtempSync(join(tmpdir(), "quoli-agents-"));
  try {
    fn(dir, new Store(":memory:"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("Claude Code events are stored unchanged and read as Claude Code", () =>
  withDir((cwd, store) => {
    assert.ok(ingest(store, { session_id: "c", cwd, hook_event_name: "SessionStart" }));
    const [e] = store.events("c");
    assert.equal(e.payload.quoli_agent, undefined);
    const d = deriveSession(store.events("c"), [], defaultPrices());
    assert.equal(d?.agent, "claude-code");
    assert.equal(d?.agentVersion, null);
  }));

test("Codex sessions keep their agent, patch files, commands and line counts", () =>
  withDir((cwd, store) => {
    const at = (s: number) => new Date(Date.UTC(2026, 10, 12, 10, 0, s)).toISOString();
    const send = (s: number, p: Record<string, unknown>) =>
      recordEvent(
        store,
        { session_id: "x", cwd, quoli_agent_version: "0.163.0", ...p },
        "codex",
        at(s),
      );
    send(0, { hook_event_name: "SessionStart" });
    const patch = {
      input:
        "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+new\n+more\n*** Add File: src/b.ts\n+one\n*** End Patch",
    };
    send(1, {
      hook_event_name: "PreToolUse",
      tool_name: "apply_patch",
      tool_use_id: "t1",
      tool_input: patch,
    });
    send(2, {
      hook_event_name: "PostToolUse",
      tool_name: "apply_patch",
      tool_use_id: "t1",
      tool_input: patch,
    });
    const run = { command: ["bash", "-lc", "pnpm test"] };
    send(3, {
      hook_event_name: "PreToolUse",
      tool_name: "shell",
      tool_use_id: "t2",
      tool_input: run,
    });
    send(4, {
      hook_event_name: "PostToolUse",
      tool_name: "shell",
      tool_use_id: "t2",
      tool_input: run,
    });

    assert.equal(store.events("x")[0].payload.quoli_agent, "codex");
    const d = deriveSession(store.events("x"), [], defaultPrices());
    assert.ok(d);
    assert.equal(d.agent, "codex");
    assert.equal(d.agentVersion, "0.163.0");
    assert.deepEqual(d.toolCalls[0].files, ["src/a.ts", "src/b.ts"]);
    assert.equal(d.toolCalls[0].category, "edit");
    assert.equal(d.toolCalls[1].summary, "bash -lc pnpm test");
    assert.deepEqual(
      d.report.changes.map((c) => [c.path, c.added, c.removed, c.rewrite]),
      [
        ["src/a.ts", 2, 1, false],
        ["src/b.ts", 1, 0, true],
      ],
    );
    assert.deepEqual(
      d.report.commands.map((c) => [c.command, c.kind]),
      [["bash -lc pnpm test", "test"]],
    );
  }));

test("OpenCode edits use camelCase fields", () =>
  withDir((cwd, store) => {
    const input = { filePath: join(cwd, "src/c.ts"), oldString: "a\nb", newString: "c" };
    const send = (p: Record<string, unknown>) =>
      recordEvent(store, { session_id: "o", cwd, tool_use_id: "t", ...p }, "opencode");
    send({ hook_event_name: "PreToolUse", tool_name: "edit", tool_input: input });
    send({ hook_event_name: "PostToolUse", tool_name: "edit", tool_input: input });
    const d = deriveSession(store.events("o"), [], defaultPrices());
    assert.equal(d?.agent, "opencode");
    assert.deepEqual(
      d?.report.changes.map((c) => [c.path, c.added, c.removed]),
      [["src/c.ts", 1, 2]],
    );
  }));

test("usage can be filtered by agent", () => {
  const store = new Store(":memory:");
  const at = new Date().toISOString();
  store.append({ sessionId: "c", root: "/w/a", event: "SessionStart", at, payload: {} });
  store.append({
    sessionId: "x",
    root: "/w/a",
    event: "SessionStart",
    at,
    payload: { quoli_agent: "codex" },
  });
  const use = (sessionId: string, model: string) =>
    store.upsertUsage({
      messageId: `m-${sessionId}`,
      sessionId,
      agentId: "main",
      model,
      at,
      input: 1000,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  use("c", "claude-opus-5-5");
  use("x", "gpt-5-codex");
  assert.deepEqual([...store.sessionAgents()].sort(), [
    ["c", "claude-code"],
    ["x", "codex"],
  ]);
  const all = usageReport(store, 7, () => []);
  assert.equal(all.total.tokens.input, 2000);
  const codex = usageReport(store, 7, () => [], new Date(), "codex");
  assert.equal(codex.total.tokens.input, 1000);
  assert.equal(codex.total.cost.usd, null);
  assert.deepEqual(codex.total.cost.unpriced, ["gpt-5-codex"]);
  const claude = usageReport(store, 7, () => [], new Date(), "claude-code");
  assert.equal(claude.total.tokens.input, 1000);
});
