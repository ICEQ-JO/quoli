import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adapterFor, codexExitCode } from "../server/adapters.ts";
import { createApp, json } from "../server/app.ts";
import { connect, installedAgents } from "../server/connect.ts";
import { Store } from "../server/db.ts";
import { ingest } from "../server/ingest.ts";
import { defaultPrices } from "../server/prices.ts";
import { deriveSession } from "../server/sessions.ts";

// Payloads follow the documented Codex hook fields (learn.chatgpt.com/docs/hooks and the
// generated schemas in openai/codex codex-rs/hooks/schema). All values are synthetic.

function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "quoli-codex-")));
  execFileSync("git", ["init", "-q", dir]);
  return dir;
}

const codex = adapterFor("codex");

test("Codex exit codes are read from the top of a tool result", () => {
  assert.equal(codexExitCode("Exit code: 0\nWall time: 0.1 seconds\nOutput:\nok"), 0);
  assert.equal(codexExitCode("Exit code: 2\nOutput:\nboom"), 2);
  assert.equal(
    codexExitCode("Chunk ID: a1\nWall time: 1.0 seconds\nProcess exited with code 1\nOutput:\nx"),
    1,
  );
  assert.equal(codexExitCode("plain output that mentions Exit code: 3 later on one line"), null);
  assert.equal(codexExitCode({ stdout: "" }), null);
});

test("the Codex adapter marks non-zero exits as inferred failures and passes the rest through", () => {
  assert.ok(codex);
  const post = {
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_response: "Exit code: 1\nOutput:\nfail",
  };
  const failed = codex.normalize(post);
  assert.equal(failed?.hook_event_name, "PostToolUseFailure");
  assert.equal(failed?.quoli_failure_inferred, true);
  assert.equal(failed?.error, post.tool_response);
  const ok = { ...post, tool_response: "Exit code: 0\nOutput:\nfine" };
  assert.equal(codex.normalize(ok), ok);
  const prompt = { hook_event_name: "UserPromptSubmit", prompt: "hi" };
  assert.equal(codex.normalize(prompt), prompt);
});

test("Codex token usage separates cached input and is keyed per request", () => {
  assert.ok(codex?.usage);
  const payload = {
    hook_event_name: "PostModelRequest",
    session_id: "s",
    turn_id: "t1",
    model: "gpt-6.1-sol",
    status: "completed",
    error: null,
    token_usage: {
      input_tokens: 10_000,
      cached_input_tokens: 8_000,
      cache_write_input_tokens: 0,
      output_tokens: 500,
      reasoning_output_tokens: 200,
      total_tokens: 10_500,
    },
  };
  const row = codex.usage(payload, "2026-11-12T10:00:00.000Z");
  assert.deepEqual(row, {
    messageId: "codex:s:t1:2026-11-12T10:00:00.000Z",
    sessionId: "s",
    agentId: "main",
    model: "gpt-6.1-sol",
    at: "2026-11-12T10:00:00.000Z",
    input: 2_000,
    output: 500,
    cacheRead: 8_000,
    cacheWrite: 0,
  });
  assert.equal(codex.usage({ ...payload, token_usage: null }, "x"), null);
  assert.equal(codex.usage({ ...payload, hook_event_name: "Stop" }, "x"), null);
});

test("a Codex session is recorded end to end: commands, patches, failures and cost", () => {
  const dir = repo();
  try {
    const store = new Store(":memory:");
    let s = 0;
    const at = () => new Date(Date.UTC(2026, 10, 12, 10, 0, s++)).toISOString();
    const send = (p: Record<string, unknown>) =>
      ingest(
        store,
        { session_id: "cx", cwd: dir, transcript_path: null, model: "gpt-6.1-sol", ...p },
        at(),
        undefined,
        "codex",
      );
    send({ hook_event_name: "SessionStart", source: "startup" });
    send({ hook_event_name: "UserPromptSubmit", turn_id: "t1", prompt: "Add a greeting" });
    const patch = "*** Begin Patch\n*** Add File: hello.txt\n+hello\n+world\n*** End Patch";
    const call = (id: string, name: string, command: string, response: string) => {
      const base = { turn_id: "t1", tool_name: name, tool_use_id: id, tool_input: { command } };
      send({ hook_event_name: "PreToolUse", ...base });
      send({ hook_event_name: "PostToolUse", ...base, tool_response: response });
    };
    call(
      "c1",
      "apply_patch",
      patch,
      "Exit code: 0\nSuccess. Updated the following files:\nA hello.txt",
    );
    call("c2", "Bash", "pnpm test", "Exit code: 1\nOutput:\n1 failing");
    send({
      hook_event_name: "PostModelRequest",
      turn_id: "t1",
      status: "completed",
      error: null,
      token_usage: {
        input_tokens: 1_000_000,
        cached_input_tokens: 0,
        output_tokens: 100_000,
        reasoning_output_tokens: 0,
        total_tokens: 1_100_000,
      },
    });
    send({ hook_event_name: "Stop", turn_id: "t1", stop_hook_active: false });

    const d = deriveSession(store.events("cx"), store.usage("cx"), defaultPrices());
    assert.ok(d);
    assert.equal(d.agent, "codex");
    assert.equal(d.toolCalls.length, 2);
    assert.deepEqual(
      d.toolCalls.map((c) => [c.name, c.category, c.status]),
      [
        ["apply_patch", "edit", "ok"],
        ["Bash", "run", "failed"],
      ],
    );
    assert.deepEqual(
      d.report.changes.map((c) => [c.path, c.added, c.rewrite]),
      [["hello.txt", 2, true]],
    );
    assert.deepEqual(
      d.report.commands.map((c) => [c.kind, c.status]),
      [["test", "failed"]],
    );
    // gpt-6.1-sol: $2 input + $10 output per million.
    assert.equal(d.cost.usd, 3);
    assert.deepEqual(d.models, ["gpt-6.1-sol"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("connecting Codex writes .codex/hooks.json, keeps it out of Git and removes cleanly", () => {
  const dir = repo();
  try {
    const file = connect(dir, false, "codex");
    assert.equal(file, join(dir, ".codex", "hooks.json"));
    const hooks = JSON.parse(readFileSync(file, "utf8")).hooks;
    assert.deepEqual(Object.keys(hooks).sort(), [
      "PostModelRequest",
      "PostToolUse",
      "PreToolUse",
      "SessionEnd",
      "SessionStart",
      "Stop",
      "SubagentStart",
      "SubagentStop",
      "UserPromptSubmit",
    ]);
    const handler = hooks.PostToolUse[0].hooks[0];
    assert.equal(handler.type, "command");
    assert.equal(handler.timeout, 3);
    assert.match(handler.command, /server\/hook\.mjs" \d+ codex$/);
    assert.match(
      readFileSync(join(dir, ".git", "info", "exclude"), "utf8"),
      /^\/\.codex\/hooks\.json$/m,
    );
    assert.equal(
      execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }),
      "",
    );
    // Connecting again neither duplicates the hook nor the exclude line.
    connect(dir, false, "codex");
    assert.equal(JSON.parse(readFileSync(file, "utf8")).hooks.Stop.length, 1);
    assert.equal(
      readFileSync(join(dir, ".git", "info", "exclude"), "utf8").match(/codex/g)?.length,
      1,
    );
    assert.deepEqual(installedAgents(dir), ["codex"]);
    connect(dir, true, "codex");
    assert.equal(existsSync(file), false);
    assert.deepEqual(installedAgents(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("POST /api/projects connects the chosen agents and projects report each agent's status", async () => {
  const dir = repo();
  // Projects also list agents set up for every repository; keep the real HOME out of it.
  const savedHome = process.env.HOME;
  process.env.HOME = dir;
  const store = new Store(":memory:");
  let port = 0;
  const app = createApp(store, () => port);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!(await app.api(req, res, url))) json(res, 404, {});
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  const post = async (body: unknown) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify(body),
    });
    // biome-ignore lint/suspicious/noExplicitAny: loose JSON in tests
    return { status: res.status, body: (await res.json()) as any };
  };
  try {
    assert.equal((await post({ path: dir, agents: ["cursor"] })).status, 400);
    assert.equal((await post({ path: dir, agents: [] })).status, 400);
    const r = await post({ path: dir, agents: ["claude-code", "codex"] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.agents, [
      { agent: "claude-code", everywhere: false, status: "installed" },
      { agent: "codex", everywhere: false, status: "installed" },
    ]);
    ingest(
      store,
      { session_id: "x", cwd: dir, hook_event_name: "SessionStart" },
      undefined,
      undefined,
      "codex",
    );
    const list = await (await fetch(`http://127.0.0.1:${port}/api/projects`)).json();
    assert.deepEqual(list[0].agents, [
      { agent: "claude-code", everywhere: false, status: "installed" },
      { agent: "codex", everywhere: false, status: "receiving" },
    ]);
  } finally {
    server.close();
    process.env.HOME = savedHome;
    rmSync(dir, { recursive: true, force: true });
  }
});
