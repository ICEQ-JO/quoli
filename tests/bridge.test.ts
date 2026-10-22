import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hookStatus, installHooks, uninstallHooks } from "../apps/bridge/src/install";
import { normalizeHook } from "../apps/bridge/src/normalize";
import { drainSpool, spool } from "../apps/bridge/src/spool";
import { claudeHookSamples } from "../fixtures/claude";
import { eventSchema } from "../packages/schema/src/index";
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
