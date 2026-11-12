import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adapterFor } from "../server/adapters.ts";
import { connect, installedAgents } from "../server/connect.ts";
import { Store } from "../server/db.ts";
import { ingest } from "../server/ingest.ts";
import { defaultPrices } from "../server/prices.ts";
import { deriveSession } from "../server/sessions.ts";

// Payload shapes are what server/opencode-plugin.js sends, built from what OpenCode 2.0.32
// delivered to a plugin in a scratch repository (tool hooks, prompt hook, session.step.* events).
// All values here are synthetic.

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "quoli-opencode-")));
  execFileSync("git", ["init", "-q", dir]);
  return dir;
}

const opencode = adapterFor("opencode");

test("the OpenCode adapter maps plugin records to the shared hook shape", () => {
  assert.ok(opencode);
  const base = { sessionID: "ses_1", cwd: "/w", version: "2.0.32" };
  assert.equal(
    opencode.normalize({ ...base, opencode_event: "session.start" })?.hook_event_name,
    "SessionStart",
  );
  const prompt = opencode.normalize({ ...base, opencode_event: "prompt", text: "Add a greeting" });
  assert.equal(prompt?.hook_event_name, "UserPromptSubmit");
  assert.equal(prompt?.prompt, "Add a greeting");
  assert.equal(prompt?.quoli_agent_version, "2.0.32");

  const write = {
    tool: "write",
    id: "call_1",
    agent: "build",
    input: { path: "/w/a.txt", content: "a\n" },
  };
  const before = opencode.normalize({ ...base, opencode_event: "tool.before", ...write });
  assert.equal(before?.hook_event_name, "PreToolUse");
  assert.deepEqual(before?.tool_input, { path: "/w/a.txt", content: "a\n", file_path: "/w/a.txt" });
  // A search tool's `path` is the folder searched, not a file.
  const grep = opencode.normalize({
    ...base,
    opencode_event: "tool.before",
    tool: "grep",
    id: "c",
    input: { pattern: "x", path: "/w/src" },
  });
  assert.equal((grep?.tool_input as Record<string, unknown>).file_path, undefined);

  const shellOk = opencode.normalize({
    ...base,
    opencode_event: "tool.after",
    tool: "shell",
    id: "call_2",
    input: { command: "cat a.txt" },
    status: "completed",
    output: { exit: 0, output: "a\n", truncated: false },
  });
  assert.equal(shellOk?.hook_event_name, "PostToolUse");
  assert.equal(shellOk?.tool_response, "a\n");
  const shellFail = opencode.normalize({
    ...base,
    opencode_event: "tool.after",
    tool: "shell",
    id: "call_3",
    input: { command: "ls missing" },
    status: "completed",
    output: { exit: 2, output: "ls: cannot access 'missing'\n" },
  });
  assert.equal(shellFail?.hook_event_name, "PostToolUseFailure");
  assert.equal(shellFail?.error, "ls: cannot access 'missing'\n");
  const errored = opencode.normalize({
    ...base,
    opencode_event: "tool.after",
    tool: "edit",
    id: "c4",
    status: "error",
    error: "oldString not found",
  });
  assert.equal(errored?.error, "oldString not found");
  assert.equal(opencode.normalize({ ...base, opencode_event: "something.new" }), null);
});

test("OpenCode step usage counts reasoning as output and keeps uncached input", () => {
  assert.ok(opencode?.usage);
  const step = opencode.normalize({
    sessionID: "ses_1",
    cwd: "/w",
    opencode_event: "step.ended",
    messageID: "msg_9",
    model: "claude-sonnet-4-5",
    tokens: { input: 284, output: 84, reasoning: 12, cache: { read: 16384, write: 10 } },
    cost: 0.01,
  });
  assert.ok(step);
  assert.deepEqual(opencode.usage(step, "2026-11-12T10:00:00.000Z"), {
    messageId: "opencode:msg_9",
    sessionId: "ses_1",
    agentId: "main",
    model: "claude-sonnet-4-5",
    at: "2026-11-12T10:00:00.000Z",
    input: 284,
    output: 96,
    cacheRead: 16384,
    cacheWrite: 10,
  });
});

test("an OpenCode session is recorded end to end", () => {
  const dir = repo();
  try {
    const store = new Store(":memory:");
    let s = 0;
    const send = (p: Record<string, unknown>) =>
      ingest(
        store,
        { sessionID: "ses_x", cwd: dir, version: "2.0.32", ...p },
        new Date(Date.UTC(2026, 10, 12, 10, 0, s++)).toISOString(),
        undefined,
        "opencode",
      );
    send({ opencode_event: "session.start" });
    send({ opencode_event: "prompt", text: "Edit hello" });
    const edit = {
      tool: "edit",
      id: "call_e",
      agent: "build",
      input: { path: join(dir, "hello.txt"), oldString: "hello\n", newString: "hello world\n" },
    };
    send({ opencode_event: "tool.before", ...edit });
    send({
      opencode_event: "tool.after",
      ...edit,
      status: "completed",
      content: [{ type: "text", text: "Edited hello.txt" }],
    });
    send({
      opencode_event: "step.ended",
      messageID: "msg_1",
      model: "claude-sonnet-4-5",
      tokens: { input: 1_000_000, output: 100_000, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    send({ opencode_event: "turn.ended", outcome: "succeeded" });

    const d = deriveSession(store.events("ses_x"), store.usage("ses_x"), defaultPrices());
    assert.ok(d);
    assert.equal(d.agent, "opencode");
    assert.equal(d.agentVersion, "2.0.32");
    assert.equal(d.title, "Edit hello");
    assert.deepEqual(
      d.toolCalls.map((c) => [c.name, c.category, c.status, c.files]),
      [["edit", "edit", "ok", ["hello.txt"]]],
    );
    assert.deepEqual(
      d.report.changes.map((c) => [c.path, c.added, c.removed]),
      [["hello.txt", 1, 1]],
    );
    // claude-sonnet-4-5: $3 input + $15 output per million → 3 + 1.5
    assert.equal(d.cost.usd, 4.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("connecting OpenCode installs the plugin with the port, out of Git, and removes it", () => {
  const dir = repo();
  try {
    const file = connect(dir, false, "opencode");
    assert.equal(file, join(dir, ".opencode", "plugins", "quoli.js"));
    const source = readFileSync(file, "utf8");
    assert.match(source, /quoli-opencode-plugin/);
    assert.match(source, /const PORT = Number\("\d+"\)/);
    assert.doesNotMatch(source, /__QUOLI_PORT__/);
    assert.equal(
      execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }),
      "",
    );
    assert.deepEqual(installedAgents(dir), ["opencode"]);
    connect(dir, true, "opencode");
    assert.equal(existsSync(file), false);
    assert.deepEqual(installedAgents(dir), []);

    // Someone else's file at the same path is never overwritten or removed.
    mkdirSync(join(dir, ".opencode", "plugins"), { recursive: true });
    writeFileSync(file, "export default {}\n");
    assert.throws(() => connect(dir, false, "opencode"), /not Quoli's plugin/);
    assert.throws(() => connect(dir, true, "opencode"), /not Quoli's plugin/);
    assert.equal(readFileSync(file, "utf8"), "export default {}\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
