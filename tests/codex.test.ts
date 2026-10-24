import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CODEX_EVENTS,
  codexAdapter,
  codexSourceVersion,
  normalizeCodex,
} from "../apps/bridge/src/codex";
import {
  codexHookStatus,
  codexHooksPath,
  installCodexHooks,
  uninstallCodexHooks,
} from "../apps/bridge/src/codex-install";
import { codexHookSamples, codexProbe } from "../fixtures/codex";
import { adapterSupportsSourceVersion } from "../packages/schema/src/adapter";
import { defaultPolicy, eventSchema, type NormalizedEvent } from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";

const projectId = "repo_probe";

function normalize(samples = codexHookSamples()) {
  return samples
    .map((payload) => normalizeCodex(payload, { projectId, sessionId: payload.session_id }))
    .filter((event): event is NormalizedEvent => event !== null);
}

/** Every normalized Codex observation is v2; narrow so the test can read v2 fields. */
function v2(event: NormalizedEvent) {
  assert.equal(event.schemaVersion, 2);
  if (event.schemaVersion !== 2) throw new Error("expected a v2 observation");
  return event;
}

test("every collected Codex event maps to its declared observation", () => {
  for (const payload of codexHookSamples()) {
    const event = normalizeCodex(payload, { projectId, sessionId: payload.session_id });
    const declared =
      (CODEX_EVENTS as Record<string, string>)[payload.hook_event_name ?? ""] ?? null;
    assert.equal(
      event?.payload.kind ?? null,
      declared,
      `${payload.hook_event_name} mapping drifted`,
    );
    if (!event) continue;
    eventSchema.parse(event);
  }
  // Review, compaction and stop events are exposed but deliberately not collected.
  for (const event of ["PermissionRequest", "Stop", "PreCompact", "Interrupt"])
    assert.equal((CODEX_EVENTS as Record<string, string>)[event], undefined);
});

test("the registration does not claim facts the hook payload lacks", () => {
  assert.equal(codexAdapter.capabilities.usage, false);
  assert.equal(codexAdapter.capabilities.sourceTime, false);
  assert.equal(codexAdapter.failures.status, "unsupported");
  assert.equal(codexAdapter.failures.exitCode, "unsupported");
  assert.equal(codexAdapter.install.settingsPath, codexProbe.projectHookFile);
  assert.ok(normalize().length >= 6);
  for (const payload of codexHookSamples()) {
    const event = normalizeCodex(payload, { projectId, sessionId: payload.session_id });
    if (!event) continue;
    const observed = v2(event);
    assert.equal(observed.sourceVersion, "unreported");
    assert.equal(observed.sourceTime, null);
    assert.equal(observed.requestId, payload.turn_id ?? null);
    assert.equal(JSON.stringify(observed).includes("transcript_path"), false);
  }
  for (const event of normalize()
    .map(v2)
    .filter((item) => item.payload.kind === "tool_result")) {
    if (event.payload.kind !== "tool_result") continue;
    assert.equal(event.payload.exitCode, null);
    // Codex hooks report no success flag, so a result is never declared successful.
    assert.equal(event.payload.status, "unknown");
  }
});

test("only verified Codex versions are accepted", () => {
  assert.equal(codexSourceVersion("codex-cli 0.163.0"), "0.163.0");
  assert.equal(codexSourceVersion("codex 0.164.1\n"), "0.164.1");
  assert.equal(codexSourceVersion("not a version"), null);
  assert.deepEqual(adapterSupportsSourceVersion(codexAdapter, "0.163.0"), { supported: true });
  assert.deepEqual(adapterSupportsSourceVersion(codexAdapter, "0.164.1"), {
    supported: false,
    reason: "unsupported_source_version",
    supportedVersions: ["0.163.0"],
  });
});

test("delivery identity is stable per source event and survives repeated prompts", () => {
  const [prompt] = codexHookSamples().filter(
    (payload) => payload.hook_event_name === "UserPromptSubmit",
  );
  assert.ok(prompt);
  const first = normalizeCodex(prompt, { projectId, sessionId: prompt.session_id });
  const second = normalizeCodex(prompt, { projectId, sessionId: prompt.session_id });
  assert.ok(first && second);
  assert.equal(first.deliveryId, second.deliveryId);
  // A second turn is a distinct delivery even in the same session.
  const nextTurn = normalizeCodex(
    { ...prompt, turn_id: "018f1a2b-9c8d-7e6f-8a1b-000000000002" },
    { projectId, sessionId: prompt.session_id },
  );
  assert.ok(nextTurn);
  assert.notEqual(first.deliveryId, nextTurn.deliveryId);
  assert.equal(
    first.deliveryId,
    codexAdapter.deliveryId({
      sessionId: prompt.session_id,
      event: "UserPromptSubmit",
      promptId: null,
      toolId: null,
      requestId: prompt.turn_id,
      childSessionId: null,
    }),
  );
});

test("a subagent keeps its scope without inventing a child session", () => {
  const sample = codexHookSamples().find((payload) => payload.hook_event_name === "SubagentStart");
  assert.ok(sample);
  const event = normalizeCodex(sample, { projectId, sessionId: sample.session_id });
  assert.ok(event);
  const observed = v2(event);
  assert.equal(observed.sessionId, sample.session_id);
  assert.deepEqual(observed.activity, {
    turnId: sample.turn_id,
    parentSessionId: sample.session_id,
    parentTurnId: sample.turn_id,
    childSessionId: "agent_synthetic_1111",
    childTurnId: null,
  });
  assert.equal(observed.sourceLocator, "codex_hook:SubagentStart:explorer");
});

test("content is redacted before it leaves the bridge", () => {
  const sample = codexHookSamples().find((payload) => payload.hook_event_name === "PreToolUse");
  assert.ok(sample);
  const event = normalizeCodex(
    {
      ...sample,
      tool_input: { command: "curl -H 'authorization: bearer sk-livecanaryvalue123456' x.invalid" },
    },
    { projectId, sessionId: sample.session_id },
  );
  assert.ok(event);
  const text = event.payload.kind === "tool_call" ? event.payload.content.text : null;
  assert.ok(text);
  assert.equal(text.includes("sk-livecanaryvalue123456"), false);
  assert.ok(text.includes("[REDACTED]"));
});

test("normalized Codex observations are accepted by the local store", () => {
  const store = new Store(":memory:");
  try {
    store.registerProject(projectId, "probe", false, defaultPolicy);
    const events = normalize();
    const result = store.append(events);
    assert.equal(result.accepted, events.length);
  } finally {
    store.close();
  }
});

test("the Codex installer preserves unrelated settings and reverses cleanly", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-codex-hooks-"));
  try {
    const path = codexHooksPath(dir);
    const original = {
      description: "existing workspace hooks",
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo existing" }] }],
        Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }],
      },
    };
    mkdirSync(join(dir, ".codex"), { recursive: true });
    writeFileSync(path, JSON.stringify(original));
    const installed = installCodexHooks(dir, projectId);
    assert.equal(installed.path, path);
    assert.deepEqual(installed.added, [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "SubagentStart",
      "SubagentStop",
      "SessionEnd",
    ]);
    assert.equal(installed.preservedGroups, 2);
    const written = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(written.description, original.description);
    assert.equal(written.hooks.PreToolUse.length, 2);
    assert.equal(written.hooks.Stop.length, 1);
    assert.match(written.hooks.PostToolUse[0].hooks[0].command, /index\.ts' repo_probe codex$/);
    assert.deepEqual(codexHookStatus(dir), { installed: true, projectId });
    const removed = uninstallCodexHooks(dir);
    assert.equal(removed.removed.length, 7);
    assert.equal(removed.preservedGroups, 2);
    // Only our groups are gone: the file returns to its previous shape.
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), original);
    assert.deepEqual(codexHookStatus(dir), { installed: false, projectId: null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

test("the bridge captures a Codex payload only when the harness is named", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "quoli-codex-bridge-"));
  try {
    const store = new Store(join(dir, "traceframe.sqlite"));
    store.registerProject(projectId, "probe", false, {
      ...defaultPolicy,
      prompt: true,
      tool: true,
      code: true,
    });
    store.close();
    const sample = codexHookSamples().find((payload) => payload.hook_event_name === "PreToolUse");
    assert.ok(sample);
    const run = (args: string[]) =>
      execFileSync(process.execPath, ["--import", "tsx", "apps/bridge/src/index.ts", ...args], {
        input: JSON.stringify(sample),
        env: {
          ...process.env,
          TRACEFRAME_DATA_DIR: dir,
          // An unreachable collector port exercises the offline spool path.
          TRACEFRAME_COLLECTOR_PORT: String(port),
        },
        encoding: "utf8",
      });
    assert.equal(run([projectId, "codex"]), "");
    const raw = readFileSync(join(dir, "bridge-spool.jsonl"), "utf8");
    const events = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => eventSchema.parse((JSON.parse(line) as { event: unknown }).event));
    assert.equal(events.length, 1);
    assert.equal(events[0].source, "codex_hook");
    assert.ok(events[0].schemaVersion === 2);
    assert.equal(events[0].adapterId, "codex-hook");
    assert.equal(existsSync(join(dir, "bridge-spool.jsonl.draining")), false);
    // The Claude path is unchanged: a Codex payload is not misread as a Claude one.
    const claude = codexHookSamples().find((payload) => payload.hook_event_name === "SessionStart");
    assert.ok(claude);
    assert.equal(
      normalizeCodex(claude, { projectId, sessionId: claude.session_id })?.source,
      "codex_hook",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
