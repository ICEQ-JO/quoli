import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { demoEvents, demoPolicy } from "../fixtures/demo";
import { demoSnapshots } from "../fixtures/repository";
import { relationships, usage, verification } from "../packages/analysis/src/index";
import { Store } from "../packages/storage/src/index";

const canary = "traceframe-lifecycle-canary";

function store(): Store {
  const instance = new Store(":memory:");
  instance.registerProject("demo-quoli", "quoli", true, demoPolicy);
  return instance;
}

test("a policy change applies before new content is persisted", () => {
  const instance = store();
  const events = demoEvents();
  const call = events.find((e) => e.payload.kind === "tool_call" && e.payload.toolName === "Read");
  assert.ok(call);
  const withCode = structuredClone(call);
  if (withCode.payload.kind === "tool_call") withCode.payload.path = "src/usage/cache.ts";
  instance.append([withCode]);
  assert.equal(instance.allEvents("demo-quoli", call.sessionId)[0].payload.kind, "tool_call");
  instance.updateSettings("demo-quoli", { policy: { code: false } });
  const after = structuredClone(call);
  after.id = "policy-after";
  after.deliveryId = "policy-after";
  if (after.payload.kind === "tool_call") after.payload.path = "src/usage/cache.ts";
  instance.append([after]);
  const stored = instance
    .allEvents("demo-quoli", call.sessionId)
    .find((e) => e.id === "policy-after");
  assert.ok(stored);
  assert.equal(stored.payload.kind, "tool_call");
  if (stored.payload.kind === "tool_call") {
    assert.equal(stored.payload.path, null);
    assert.equal(stored.payload.content.state, "disabled");
  }
  instance.close();
});

test("paused capture rejects new observations and keeps retained evidence readable", () => {
  const instance = store();
  instance.append(demoEvents());
  instance.updateSettings("demo-quoli", { paused: true });
  assert.throws(() => instance.append(demoEvents()), /paused/);
  assert.ok(instance.allEvents("demo-quoli", "session-cache").length > 0);
  instance.updateSettings("demo-quoli", { paused: false });
  const again = demoEvents();
  again[0].id = "after-resume";
  again[0].deliveryId = "after-resume";
  assert.equal(instance.append(again).accepted, 1);
  instance.close();
});

test("retention removes expired evidence and leaves no dangling claim behind", () => {
  const instance = store();
  instance.append(demoEvents());
  const capture = demoSnapshots().find((c) => c.sessionId === "session-cache");
  assert.ok(capture);
  instance.appendSnapshot("demo-quoli", "session-cache", capture.snapshot, "baseline");
  instance.updateSettings("demo-quoli", { retentionDays: 7 });
  const removed = instance.applyRetention("demo-quoli", Date.now() + 30 * 86_400_000);
  assert.ok(removed.events > 0);
  assert.ok(removed.snapshots > 0);
  assert.equal(instance.allEvents("demo-quoli", "session-cache").length, 0);
  assert.equal(instance.snapshots("demo-quoli", "session-cache").length, 0);
  // Derived views are rebuilt from what remains; no removed observation keeps a claim alive.
  assert.deepEqual(verification(instance.allEvents("demo-quoli", "session-cache")).checks, []);
  assert.deepEqual(relationships(instance.allEvents("demo-quoli", "session-cache")), []);
  assert.equal(usage(instance.allEvents("demo-quoli", "session-cache")).input, null);
  instance.close();
});

test("deletion blocks stale producers, is idempotent and clears the local log", () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-purge-"));
  const path = join(dir, "evidence.sqlite");
  try {
    const instance = new Store(path);
    instance.registerProject("demo-quoli", "quoli", true, demoPolicy);
    const events = demoEvents();
    const prompt = events[1];
    if (prompt.payload.kind !== "prompt") throw new Error("Expected a prompt observation");
    prompt.payload.content = { ...prompt.payload.content, text: canary };
    instance.append(events);
    const capture = demoSnapshots().find((c) => c.sessionId === "session-cache");
    assert.ok(capture);
    instance.appendSnapshot("demo-quoli", "session-cache", capture.snapshot, "baseline");
    const result = instance.purgeProject("demo-quoli");
    // The retained snapshot observation is an event too.
    assert.equal(result.removed.events, events.length + 1);
    assert.equal(result.removed.snapshots, 1);
    assert.equal(result.checkpointed, true);
    assert.equal(instance.project("demo-quoli"), undefined);
    assert.equal(instance.allEvents("demo-quoli", "session-cache").length, 0);
    assert.equal(instance.snapshots("demo-quoli", "session-cache").length, 0);
    // A stale producer or an in-flight retry is rejected after the deletion.
    assert.throws(() => instance.append(demoEvents()), /deleted/);
    // The deletion is idempotent after an interruption.
    const again = instance.purgeProject("demo-quoli");
    assert.equal(again.removed.events, 0);
    assert.equal(again.purgedAt, result.purgedAt);
    assert.equal(instance.lifecycle("demo-quoli").purgedAt, result.purgedAt);
    // Explicit re-registration is an owner action and clears the tombstone.
    instance.registerProject("demo-quoli", "quoli", true, demoPolicy);
    assert.equal(instance.lifecycle("demo-quoli").purgedAt, null);
    assert.equal(instance.append(demoEvents()).accepted, events.length);
    instance.close();
    const wal = `${path}-wal`;
    if (existsSync(wal)) assert.equal(readFileSync(wal).toString().includes(canary), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
