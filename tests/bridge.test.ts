import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hookStatus, installHooks, uninstallHooks } from "../apps/bridge/src/install";
import { normalizeHook } from "../apps/bridge/src/normalize";
import { drainSpool, spool } from "../apps/bridge/src/spool";
import { claudeHookSamples } from "../fixtures/claude";
import {
  type CapturePolicy,
  defaultPolicy,
  eventSchema,
  MAX_BODY,
} from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";

const projectId = "repo_probe";

test("hook payloads normalize into observations with the observed identities", () => {
  const samples = claudeHookSamples();
  const events = samples
    .map((payload) => normalizeHook(payload, { projectId, sessionId: "session-probe" }))
    .filter((event): event is NonNullable<typeof event> => Boolean(event));
  assert.equal(events.length, samples.length - 1); // Stop carries no observation.
  for (const event of events) eventSchema.parse(event);
  const prompt = events.find((event) => event.payload.kind === "prompt");
  assert.ok(prompt);
  assert.equal(prompt.promptId, "22222222-2222-4222-8222-222222222222");
  assert.equal(prompt.sourceTime, null);
  const call = events.find((event) => event.payload.kind === "tool_call");
  assert.ok(call);
  assert.equal(call.toolId, "toolu_synthetic_aaaaaaaaaaaa");
  const result = events.find(
    (event) => event.payload.kind === "tool_result" && event.payload.status === "success",
  );
  assert.ok(result);
  // The runtime reports no numeric exit code, so it stays null.
  assert.equal(result.payload.kind === "tool_result" ? result.payload.exitCode : 1, null);
  const failure = events.find(
    (event) => event.payload.kind === "tool_result" && event.payload.status === "failure",
  );
  assert.ok(failure);
  assert.equal(failure.payload.kind === "tool_result" ? failure.payload.exitCode : 1, null);
  assert.equal(failure.payload.kind === "tool_result" ? failure.payload.status : "", "failure");
  const end = events.find((event) => event.payload.kind === "session_end");
  assert.ok(end);
});

test("content is redacted before it leaves the bridge", () => {
  const sample = claudeHookSamples().find((payload) => payload.hook_event_name === "PreToolUse");
  assert.ok(sample);
  const event = normalizeHook(
    {
      ...sample,
      tool_input: {
        command: "curl -H 'authorization: bearer sk-livecanaryvalue123456' example.invalid",
      },
    },
    { projectId, sessionId: "session-probe" },
  );
  assert.ok(event);
  const text = event.payload.kind === "tool_call" ? event.payload.content.text : null;
  assert.ok(text);
  assert.equal(text.includes("sk-livecanaryvalue123456"), false);
  assert.ok(text.includes("[REDACTED]"));
});

test("a subagent call keeps its scope in the source locator", () => {
  const sample = claudeHookSamples().find((payload) => payload.hook_event_name === "PreToolUse");
  assert.ok(sample);
  const event = normalizeHook(
    { ...sample, agent_type: "Explore", agent_id: "agent-1" },
    { projectId, sessionId: "session-probe" },
  );
  assert.ok(event);
  assert.equal(event.sourceLocator, "claude_hook:PreToolUse:Explore");
});

test("the same payload always produces the same delivery identity", () => {
  const sample = claudeHookSamples().find((payload) => payload.hook_event_name === "PreToolUse");
  assert.ok(sample);
  const first = normalizeHook(sample, { projectId, sessionId: "session-probe" });
  const second = normalizeHook(sample, { projectId, sessionId: "session-probe" });
  assert.ok(first && second);
  assert.equal(first.id, second.id);
  assert.equal(first.deliveryId, second.deliveryId);
  const other = normalizeHook(sample, { projectId, sessionId: "another-session" });
  assert.ok(other);
  assert.notEqual(first.id, other.id);
});

test("normalized observations are accepted by the local store", () => {
  const store = new Store(":memory:");
  store.registerProject(projectId, "probe", false, {
    version: 1,
    prompt: true,
    tool: true,
    code: true,
    maxFieldBytes: 65536,
    excludedPaths: [".env", ".git", "node_modules"],
  });
  const events = claudeHookSamples()
    .map((payload) => normalizeHook(payload, { projectId, sessionId: "session-probe" }))
    .filter((event): event is NonNullable<typeof event> => Boolean(event));
  const result = store.append(events);
  assert.equal(result.accepted, events.length);
  assert.equal(store.allEvents(projectId, "session-probe").length, events.length);
  store.close();
});

test("the installer preserves existing hooks and is reversible", () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-bridge-"));
  try {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    const path = join(settingsDir, "settings.json");
    writeFileSync(
      path,
      JSON.stringify({
        permissions: { allow: ["Bash(ls)"] },
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo existing" }] }],
          Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }],
        },
      }),
    );
    const installed = installHooks(dir, projectId);
    assert.equal(installed.added.length, 6);
    assert.equal(installed.preservedGroups, 2);
    const settings = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(settings.permissions, { allow: ["Bash(ls)"] });
    assert.equal(settings.hooks.PreToolUse.length, 2);
    // Stop is not a Traceframe event: the existing group stays exactly as it was.
    assert.equal(settings.hooks.Stop.length, 1);
    assert.equal(hookStatus(dir).installed, true);
    assert.equal(hookStatus(dir).projectId, projectId);
    const removed = uninstallHooks(dir);
    assert.equal(removed.preservedGroups, 2);
    const after = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(after.hooks.PreToolUse.length, 1);
    assert.equal(after.hooks.PreToolUse[0].hooks[0].command, "echo existing");
    assert.equal(after.hooks.Stop.length, 1);
    assert.equal(hookStatus(dir).installed, false);
    assert.deepEqual(after.permissions, { allow: ["Bash(ls)"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the bridge delivers a payload to the collector without writing to stdout", () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-bridge-run-"));
  try {
    const store = new Store(":memory:");
    store.registerProject(projectId, "probe", false);
    const sample = claudeHookSamples().find((payload) => payload.hook_event_name === "PreToolUse");
    assert.ok(sample);
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "apps/bridge/src/index.ts", projectId],
      {
        input: JSON.stringify(sample),
        env: {
          ...process.env,
          TRACEFRAME_DATA_DIR: dir,
          TRACEFRAME_COLLECTOR_PORT: "1",
        },
        encoding: "utf8",
      },
    );
    // A hook must not answer on stdout: Claude Code reads it as a decision.
    assert.equal(output, "");
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the retry spool keeps undelivered observations and releases them after delivery", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-spool-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  try {
    const sample = claudeHookSamples().find((payload) => payload.hook_event_name === "PreToolUse");
    assert.ok(sample);
    const event = normalizeHook(sample, { projectId, sessionId: "session-probe" });
    assert.ok(event);
    spool(event);
    spool(event);
    const failed = await drainSpool(async () => false);
    assert.equal(failed.sent, 0);
    assert.equal(failed.remaining, 2);
    const delivered = await drainSpool(async () => true);
    assert.equal(delivered.sent, 2);
    assert.equal(delivered.remaining, 0);
    const empty = await drainSpool(async () => true);
    assert.equal(empty.sent, 0);
  } finally {
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

// The retry path runs as a real hook subprocess against an unreachable
// collector port, so these tests exercise process boundaries, not helpers.
const hookScript = "apps/bridge/src/index.ts";

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function runHook(dir: string, input: string, port: number, project = projectId): string {
  return execFileSync(process.execPath, ["--import", "tsx", hookScript, project], {
    input,
    env: {
      ...process.env,
      TRACEFRAME_DATA_DIR: dir,
      TRACEFRAME_COLLECTOR_PORT: String(port),
    },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

function registerIn(dir: string, policy: CapturePolicy = defaultPolicy, paused = false): void {
  const store = new Store(join(dir, "traceframe.sqlite"));
  store.registerProject(projectId, "probe", false, policy);
  if (paused) store.updateSettings(projectId, { paused: true });
  store.close();
}

function spooled(dir: string): unknown[] {
  const path = join(dir, "bridge-spool.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}

function sample(event: string, extra: Record<string, unknown> = {}) {
  const found = claudeHookSamples().find((item) => item.hook_event_name === event);
  assert.ok(found);
  return { ...found, ...extra };
}

test("an offline retry applies the default policy before writing content", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "traceframe-policy-"));
  try {
    registerIn(dir);
    const canary = "traceframe-policy-canary";
    assert.equal(
      runHook(
        dir,
        JSON.stringify(sample("UserPromptSubmit", { prompt: `prompt ${canary}` })),
        port,
      ),
      "",
    );
    runHook(
      dir,
      JSON.stringify(
        sample("PreToolUse", { tool_name: "Bash", tool_input: { command: `echo ${canary}` } }),
      ),
      port,
    );
    runHook(
      dir,
      JSON.stringify(
        sample("PostToolUse", {
          tool_name: "Bash",
          tool_response: { nested: { value: canary } },
        }),
      ),
      port,
    );
    const raw = readFileSync(join(dir, "bridge-spool.jsonl"), "utf8");
    assert.equal(raw.includes(canary), false);
    const events = spooled(dir).map((event) => eventSchema.parse(event));
    assert.equal(events.length, 3);
    for (const event of events) {
      if ("content" in event.payload) {
        assert.equal(event.payload.content.text, null);
        assert.equal(event.payload.content.state, "disabled");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("explicitly permitted content is retried after an offline failure", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "traceframe-allowed-"));
  try {
    registerIn(dir, { ...defaultPolicy, prompt: true, tool: true, code: true });
    const canary = "traceframe-allowed-canary";
    runHook(dir, JSON.stringify(sample("UserPromptSubmit", { prompt: `prompt ${canary}` })), port);
    runHook(
      dir,
      JSON.stringify(
        sample("PostToolUse", {
          tool_name: "Bash",
          tool_response: { nested: { value: canary } },
        }),
      ),
      port,
    );
    const raw = readFileSync(join(dir, "bridge-spool.jsonl"), "utf8");
    assert.ok(raw.includes(canary));
    const events = spooled(dir).map((event) => eventSchema.parse(event));
    assert.equal(events.length, 2);
    for (const event of events) {
      if ("content" in event.payload) assert.equal(event.payload.content.state, "present");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nested tool output requires both tool and code consent", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "traceframe-nested-"));
  try {
    registerIn(dir, { ...defaultPolicy, tool: true });
    const canary = "traceframe-nested-canary";
    runHook(
      dir,
      JSON.stringify(
        sample("PostToolUse", {
          tool_name: "Bash",
          tool_response: { nested: { value: canary } },
        }),
      ),
      port,
    );
    const raw = readFileSync(join(dir, "bridge-spool.jsonl"), "utf8");
    assert.equal(raw.includes(canary), false);
    const [event] = spooled(dir).map((item) => eventSchema.parse(item));
    assert.equal(event.payload.kind, "tool_result");
    if (event.payload.kind === "tool_result") {
      assert.equal(event.payload.content.text, null);
      assert.equal(event.payload.content.state, "disabled");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an excluded path drops its content and recorded path from the retry", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "traceframe-excluded-"));
  try {
    registerIn(dir, { ...defaultPolicy, prompt: true, tool: true, code: true });
    const canary = "traceframe-excluded-canary";
    runHook(
      dir,
      JSON.stringify(
        sample("PreToolUse", {
          tool_name: "Read",
          tool_input: { file_path: "/synthetic/.env", pattern: canary },
        }),
      ),
      port,
    );
    const raw = readFileSync(join(dir, "bridge-spool.jsonl"), "utf8");
    assert.equal(raw.includes(canary), false);
    const [event] = spooled(dir).map((item) => eventSchema.parse(item));
    assert.equal(event.payload.kind, "tool_call");
    if (event.payload.kind === "tool_call") {
      assert.equal(event.payload.path, null);
      assert.equal(event.payload.content.text, null);
      assert.equal(event.payload.content.state, "disabled");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a paused project does not write a retry", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "traceframe-paused-"));
  try {
    registerIn(dir, defaultPolicy, true);
    const canary = "traceframe-paused-canary";
    runHook(dir, JSON.stringify(sample("UserPromptSubmit", { prompt: `prompt ${canary}` })), port);
    assert.equal(existsSync(join(dir, "bridge-spool.jsonl")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unreadable policy withholds content but keeps visible metadata", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "traceframe-unknown-"));
  try {
    const canary = "traceframe-unknown-canary";
    assert.equal(
      runHook(
        dir,
        JSON.stringify(sample("UserPromptSubmit", { prompt: `prompt ${canary}` })),
        port,
      ),
      "",
    );
    const raw = readFileSync(join(dir, "bridge-spool.jsonl"), "utf8");
    assert.equal(raw.includes(canary), false);
    const [event] = spooled(dir).map((item) => eventSchema.parse(item));
    assert.equal(event.payload.kind, "prompt");
    if (event.payload.kind === "prompt") {
      assert.equal(event.payload.content.text, null);
      assert.equal(event.payload.content.state, "unavailable");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("malformed and oversized hook input is dropped without capture or output", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "traceframe-input-"));
  try {
    assert.equal(runHook(dir, "not json", port), "");
    assert.equal(
      runHook(
        dir,
        JSON.stringify(sample("UserPromptSubmit", { prompt: "x".repeat(MAX_BODY) })),
        port,
      ),
      "",
    );
    assert.equal(existsSync(join(dir, "bridge-spool.jsonl")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
