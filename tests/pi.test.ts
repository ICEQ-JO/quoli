import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  normalizePi,
  PI_EVENTS,
  PI_VERSION,
  piAdapter,
  piSourceVersion,
} from "../apps/bridge/src/pi";
import { installPi, piStatus, piUsesRuntime, uninstallPi } from "../apps/bridge/src/pi-install";
import { piEnvelopeSamples, piProbe } from "../fixtures/pi";
import { adapterSupportsSourceVersion } from "../packages/schema/src/adapter";
import { defaultPolicy, eventSchema, type NormalizedEvent } from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";

const projectId = "repo_probe";

function normalize(samples = piEnvelopeSamples()) {
  return samples
    .map((payload) => normalizePi(payload, projectId))
    .filter((event): event is NormalizedEvent => event !== null);
}

/** Every normalized Pi observation is v2; narrow so the test can read v2 fields. */
function v2(event: NormalizedEvent) {
  assert.equal(event.schemaVersion, 2);
  if (event.schemaVersion !== 2) throw new Error("expected a v2 observation");
  return event;
}

test("every envelope maps to its declared observation", () => {
  for (const payload of piEnvelopeSamples()) {
    const event = normalizePi(payload, projectId);
    const declared = (PI_EVENTS as Record<string, string>)[payload.type] ?? null;
    assert.equal(event?.payload.kind ?? null, declared, `${payload.type} mapping drifted`);
    if (!event) continue;
    eventSchema.parse(event);
  }
});

test("the registration only claims facts Pi reports", () => {
  assert.equal(piAdapter.capabilities.usage, true);
  assert.equal(piAdapter.capabilities.sourceTime, true);
  assert.deepEqual(piAdapter.capabilities.identifiers, ["session", "tool", "request"]);
  assert.equal(piAdapter.failures.status, "reported");
  assert.equal(piAdapter.failures.exitCode, "unsupported");
  assert.equal(piAdapter.install.settingsPath, piProbe.extensionPath);
  for (const event of normalize().map(v2)) {
    assert.equal(event.sourceVersion, PI_VERSION);
    assert.equal(event.activity.parentSessionId, null);
    assert.equal(event.activity.childSessionId, null);
    assert.equal(event.sourceSequence, null);
  }
});

test("only verified Pi versions are accepted", () => {
  assert.equal(piSourceVersion("0.75.3"), "0.75.3");
  assert.equal(piSourceVersion("\n0.76.0\n"), "0.76.0");
  assert.equal(piSourceVersion("not a version"), null);
  assert.deepEqual(adapterSupportsSourceVersion(piAdapter, "0.75.3"), { supported: true });
  assert.deepEqual(adapterSupportsSourceVersion(piAdapter, "0.76.0"), {
    supported: false,
    reason: "unsupported_source_version",
    supportedVersions: ["0.75.3"],
  });
});

test("delivery identity is stable per source event and distinct per response", () => {
  const [prompt] = piEnvelopeSamples().filter((payload) => payload.type === "user_message");
  assert.ok(prompt);
  const first = normalizePi(prompt, projectId);
  const replay = normalizePi(prompt, projectId);
  assert.ok(first && replay);
  assert.equal(first.deliveryId, replay.deliveryId);
  assert.ok(prompt.timestamp);
  const nextPrompt = normalizePi({ ...prompt, timestamp: prompt.timestamp + 1 }, projectId);
  assert.ok(nextPrompt);
  assert.notEqual(first.deliveryId, nextPrompt.deliveryId);

  const [usage] = piEnvelopeSamples().filter((payload) => payload.type === "assistant_message");
  assert.ok(usage);
  const usageEvent = normalizePi(usage, projectId);
  assert.ok(usageEvent);
  assert.equal(usageEvent.requestId, usage.responseId);
  const otherResponse = normalizePi({ ...usage, responseId: "chatcmpl-synthetic-2" }, projectId);
  assert.ok(otherResponse);
  assert.notEqual(usageEvent.deliveryId, otherResponse.deliveryId);
  // Without a provider response id the message timestamp carries the identity.
  const withoutId = normalizePi({ ...usage, responseId: undefined }, projectId);
  assert.ok(withoutId);
  assert.equal(withoutId.requestId, String(usage.timestamp));
});

test("tool calls keep their raw name, category and failure status", () => {
  const [call] = piEnvelopeSamples().filter((payload) => payload.type === "tool_call");
  const [result] = piEnvelopeSamples().filter((payload) => payload.type === "tool_result");
  assert.ok(call && result);
  const called = v2(normalizePi(call, projectId) as NormalizedEvent);
  assert.equal(called.toolId, call.toolCallId);
  assert.deepEqual(called.tool, { rawName: "read", category: "Read" });
  assert.equal(called.payload.kind === "tool_call" ? called.payload.path : null, call.path);
  const bash = normalizePi({ ...call, toolName: "bash", toolCallId: "call_2" }, projectId);
  assert.equal(bash ? v2(bash).tool?.category : null, "Bash");
  const custom = normalizePi({ ...call, toolName: "my_extension_tool" }, projectId);
  assert.deepEqual(custom ? v2(custom).tool : null, {
    rawName: "my_extension_tool",
    category: "Other",
  });

  const succeeded = normalizePi(result, projectId);
  assert.ok(succeeded);
  assert.equal(
    succeeded.payload.kind === "tool_result" ? succeeded.payload.status : null,
    "success",
  );
  assert.equal(succeeded.payload.kind === "tool_result" ? succeeded.payload.exitCode : 1, null);
  const failed = normalizePi({ ...result, isError: true }, projectId);
  assert.equal(failed?.payload.kind === "tool_result" ? failed.payload.status : null, "failure");
  // Without the reported flag the result is not guessed.
  const unknown = normalizePi({ ...result, isError: undefined }, projectId);
  assert.equal(unknown, null);
});

test("usage keeps the reported counts and never invents spend", () => {
  const [usage] = piEnvelopeSamples().filter((payload) => payload.type === "assistant_message");
  assert.ok(usage);
  const event = normalizePi(usage, projectId);
  assert.ok(event);
  if (event.payload.kind !== "usage") throw new Error("expected usage");
  assert.equal(event.payload.input, 20);
  assert.equal(event.payload.output, 2);
  assert.equal(event.payload.cacheRead, 0);
  assert.equal(event.payload.cacheWrite, 0);
  assert.equal(event.payload.model, "stub-model");
  assert.equal(event.payload.provider, "stub");
  assert.equal(event.payload.temporality, "request_delta");
  // Pi computes cost from configured rates; it is not provider-reported spend.
  assert.equal(event.payload.costUsdMicros, null);
  // A model the schema cannot carry drops the whole usage record rather than guessing.
  assert.equal(normalizePi({ ...usage, model: "vendor/model" }, projectId), null);
  assert.equal(normalizePi({ ...usage, usage: undefined }, projectId), null);
  assert.equal(normalizePi({ ...usage, usage: { input: -1, output: 2 } }, projectId), null);
});

test("content is redacted and the session id is required", () => {
  const [call] = piEnvelopeSamples().filter((payload) => payload.type === "tool_call");
  assert.ok(call);
  const event = normalizePi(
    {
      ...call,
      text: '{"command":"curl -H \'authorization: bearer sk-livecanaryvalue123456\' x.invalid"}',
    },
    projectId,
  );
  assert.ok(event);
  const text = event.payload.kind === "tool_call" ? event.payload.content.text : null;
  assert.ok(text);
  assert.equal(text.includes("sk-livecanaryvalue123456"), false);
  assert.ok(text.includes("[REDACTED]"));
  assert.equal(normalizePi({ ...call, sessionId: undefined }, projectId), null);
  assert.equal(normalizePi({ ...call, sessionId: "../../etc/passwd" }, projectId), null);
});

test("normalized Pi observations are accepted by the local store", () => {
  const store = new Store(":memory:");
  try {
    store.registerProject(projectId, "probe", false, {
      ...defaultPolicy,
      prompt: true,
      tool: true,
      code: true,
    });
    const events = normalize();
    assert.equal(events.length, piEnvelopeSamples().length);
    const result = store.append(events);
    assert.equal(result.accepted, events.length);
    assert.equal(result.duplicates, 0);
    // A re-delivered envelope is a duplicate, not a second observation.
    assert.deepEqual(store.append(events), { accepted: 0, duplicates: events.length });
  } finally {
    store.close();
  }
});

test("default policy withholds Pi content", () => {
  const store = new Store(":memory:");
  try {
    store.registerProject(projectId, "probe", false, defaultPolicy);
    const events = store.append(normalize()).accepted;
    assert.equal(events, piEnvelopeSamples().length);
    const stored = store.allEvents(projectId, piEnvelopeSamples()[0]?.sessionId ?? "");
    assert.ok(stored.length > 0);
    for (const event of stored) {
      if (event.schemaVersion !== 2 || !("content" in event.payload)) continue;
      assert.equal(event.payload.content.text, null, `${event.payload.kind} leaked content`);
    }
  } finally {
    store.close();
  }
});

test("the installer writes, reports and reverses only its own extension", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-pi-install-"));
  try {
    mkdirSync(join(dir, ".pi/extensions"), { recursive: true });
    const foreign = join(dir, ".pi/extensions/other.ts");
    writeFileSync(foreign, "export default function () {}\n");
    const installed = installPi(dir, projectId);
    assert.equal(installed.path, join(dir, piProbe.extensionPath));
    assert.deepEqual(piStatus(dir), { installed: true, projectId });
    assert.deepEqual(piUsesRuntime(dir, "/nonexistent"), false);
    const source = readFileSync(installed.path, "utf8");
    assert.match(source, /^\/\/ quoli-pi-extension\/v1 /);
    assert.match(source, /apps\/bridge\/src\/index\.ts/);
    assert.match(source, /"pi"\]/);
    uninstallPi(dir);
    assert.deepEqual(piStatus(dir), { installed: false, projectId: null });
    assert.equal(existsSync(foreign), true);
    assert.equal(readFileSync(foreign, "utf8"), "export default function () {}\n");
    assert.equal(existsSync(installed.path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the installer refuses to replace a file it does not own", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-pi-foreign-"));
  try {
    mkdirSync(join(dir, ".pi/extensions"), { recursive: true });
    const path = join(dir, piProbe.extensionPath);
    writeFileSync(path, "export default function () {}\n");
    assert.throws(() => installPi(dir, projectId), /not owned by Quoli/);
    assert.throws(() => uninstallPi(dir), /not owned by Quoli/);
    assert.equal(readFileSync(path, "utf8"), "export default function () {}\n");
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

test("the bridge captures a Pi envelope only when the harness is named", async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "quoli-pi-bridge-"));
  try {
    const store = new Store(join(dir, "traceframe.sqlite"));
    store.registerProject(projectId, "probe", false, {
      ...defaultPolicy,
      prompt: true,
      tool: true,
      code: true,
    });
    store.close();
    const [sample] = piEnvelopeSamples().filter((payload) => payload.type === "tool_call");
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
    // The envelope carries no Claude `session_id`; naming the harness is enough.
    assert.equal(run([projectId, "pi"]), "");
    const raw = readFileSync(join(dir, "bridge-spool.jsonl"), "utf8");
    const events = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => eventSchema.parse((JSON.parse(line) as { event: unknown }).event));
    assert.equal(events.length, 1);
    assert.equal(events[0].source, "pi_extension");
    assert.equal(events[0].adapterId, "pi-extension");
    assert.equal(existsSync(join(dir, "bridge-spool.jsonl.draining")), false);
    // Without the harness name the same payload is not read as a Claude hook.
    assert.equal(run([projectId]), "");
    assert.equal(
      readFileSync(join(dir, "bridge-spool.jsonl"), "utf8").trim().split("\n").length,
      1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
