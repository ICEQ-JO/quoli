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

// Payload shapes are what server/pi-extension.ts sends, built from the event and message types in
// Pi 0.75's docs (extensions.md, session-format.md). All values here are synthetic.

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "quoli-pi-")));
  execFileSync("git", ["init", "-q", dir]);
  return dir;
}

const pi = adapterFor("pi");

test("the Pi adapter maps extension records to the shared hook shape", () => {
  assert.ok(pi);
  const base = { sessionID: "s1", cwd: "/w" };
  assert.equal(
    pi.normalize({ ...base, pi_event: "session.start" })?.hook_event_name,
    "SessionStart",
  );
  assert.equal(pi.normalize({ ...base, pi_event: "prompt", text: "Fix it" })?.prompt, "Fix it");

  const edit = pi.normalize({
    ...base,
    pi_event: "tool.start",
    id: "t1",
    tool: "edit",
    input: { path: "/w/a.ts", edits: [{ oldText: "a", newText: "b" }] },
  });
  assert.equal(edit?.hook_event_name, "PreToolUse");
  assert.deepEqual(edit?.tool_input, {
    path: "/w/a.ts",
    file_path: "/w/a.ts",
    old_string: "a",
    new_string: "b",
  });
  const multi = pi.normalize({
    ...base,
    pi_event: "tool.start",
    id: "t2",
    tool: "edit",
    input: {
      path: "/w/a.ts",
      edits: [
        { oldText: "a", newText: "b" },
        { oldText: "c", newText: "d" },
      ],
    },
  });
  assert.deepEqual((multi?.tool_input as Record<string, unknown> | undefined)?.edits, [
    { old_string: "a", new_string: "b" },
    { old_string: "c", new_string: "d" },
  ]);
  // grep's `path` is the folder searched, not a file.
  const grep = pi.normalize({
    ...base,
    pi_event: "tool.start",
    id: "t3",
    tool: "grep",
    input: { pattern: "x", path: "/w/src" },
  });
  assert.equal((grep?.tool_input as Record<string, unknown> | undefined)?.file_path, undefined);

  const failed = pi.normalize({
    ...base,
    pi_event: "tool.end",
    id: "t4",
    tool: "bash",
    isError: true,
    output: "ls: cannot access 'missing'",
  });
  assert.equal(failed?.hook_event_name, "PostToolUseFailure");
  assert.equal(failed?.error, "ls: cannot access 'missing'");
  assert.equal(
    pi.normalize({ ...base, pi_event: "tool.end", id: "t5", tool: "bash", output: "ok" })
      ?.hook_event_name,
    "PostToolUse",
  );
  assert.equal(pi.normalize({ ...base, pi_event: "agent.end" })?.hook_event_name, "Stop");
  assert.equal(
    pi.normalize({ ...base, pi_event: "session.shutdown", reason: "quit" })?.hook_event_name,
    "SessionEnd",
  );
  // A reload keeps the session going.
  assert.equal(pi.normalize({ ...base, pi_event: "session.shutdown", reason: "reload" }), null);
  assert.equal(pi.normalize({ ...base, pi_event: "something.new" }), null);
  assert.equal(pi.normalize({ pi_event: "prompt" }), null);
});

test("Pi assistant messages become usage rows", () => {
  assert.ok(pi?.usage);
  const m = pi.normalize({
    sessionID: "s1",
    cwd: "/w",
    pi_event: "message.end",
    messageID: "1731400000000",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    usage: { input: 120, output: 40, cacheRead: 9000, cacheWrite: 300, totalTokens: 9460 },
  });
  assert.ok(m);
  assert.deepEqual(pi.usage(m, "2026-11-12T10:00:00.000Z"), {
    messageId: "pi:s1:1731400000000",
    sessionId: "s1",
    agentId: "main",
    model: "claude-sonnet-4-5",
    at: "2026-11-12T10:00:00.000Z",
    input: 120,
    output: 40,
    cacheRead: 9000,
    cacheWrite: 300,
  });
});

test("a Pi session is recorded end to end", () => {
  const dir = repo();
  try {
    const store = new Store(":memory:");
    let s = 0;
    const send = (p: Record<string, unknown>) =>
      ingest(
        store,
        { sessionID: "pi-1", cwd: dir, ...p },
        new Date(Date.UTC(2026, 10, 12, 10, 0, s++)).toISOString(),
        undefined,
        "pi",
      );
    send({ pi_event: "session.start", reason: "startup" });
    send({ pi_event: "prompt", text: "Say hello world" });
    const edit = {
      id: "e1",
      tool: "edit",
      input: {
        path: join(dir, "hello.txt"),
        edits: [{ oldText: "hello\n", newText: "hello world\n" }],
      },
    };
    send({ pi_event: "tool.start", ...edit });
    send({ pi_event: "tool.end", ...edit, isError: false, output: "Edited hello.txt" });
    send({ pi_event: "tool.start", id: "b1", tool: "bash", input: { command: "ls missing" } });
    send({ pi_event: "tool.end", id: "b1", tool: "bash", isError: true, output: "No such file" });
    send({
      pi_event: "message.end",
      messageID: "1",
      model: "claude-sonnet-4-5",
      usage: { input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 },
    });
    send({ pi_event: "agent.end" });
    send({ pi_event: "session.shutdown", reason: "quit" });

    const d = deriveSession(store.events("pi-1"), store.usage("pi-1"), defaultPrices());
    assert.ok(d);
    assert.equal(d.agent, "pi");
    assert.equal(d.title, "Say hello world");
    assert.deepEqual(
      d.toolCalls.map((c) => [c.name, c.category, c.status, c.files]),
      [
        ["edit", "edit", "ok", ["hello.txt"]],
        ["bash", "run", "failed", []],
      ],
    );
    assert.deepEqual(
      d.report.changes.map((c) => [c.path, c.added, c.removed]),
      [["hello.txt", 1, 1]],
    );
    assert.ok(d.endedAt);
    // claude-sonnet-4-5: $3 input + $15 output per million → 3 + 1.5
    assert.equal(d.cost.usd, 4.5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("connecting Pi installs the extension with the port, out of Git, and removes it", () => {
  const dir = repo();
  try {
    const file = connect(dir, false, "pi");
    assert.equal(file, join(dir, ".pi", "extensions", "quoli.ts"));
    const source = readFileSync(file, "utf8");
    assert.match(source, /quoli-pi-extension/);
    assert.match(source, /const PORT = Number\("\d+"\)/);
    assert.doesNotMatch(source, /__QUOLI_PORT__/);
    assert.equal(
      execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }),
      "",
    );
    assert.deepEqual(installedAgents(dir), ["pi"]);
    connect(dir, true, "pi");
    assert.equal(existsSync(file), false);
    assert.deepEqual(installedAgents(dir), []);

    mkdirSync(join(dir, ".pi", "extensions"), { recursive: true });
    writeFileSync(file, "export default () => {}\n");
    assert.throws(() => connect(dir, false, "pi"), /not Quoli's extension/);
    assert.throws(() => connect(dir, true, "pi"), /not Quoli's extension/);
    assert.equal(readFileSync(file, "utf8"), "export default () => {}\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
