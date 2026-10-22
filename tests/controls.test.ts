import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

test("a recorded path is stored relative to the registered root", () => {
  const instance = store();
  const root = mkdtempSync(join(tmpdir(), "traceframe-root-"));
  try {
    instance.registerLocalRepository("repo-paths", "Paths", root, demoPolicy, false);
    const event = demoEvents().find((e) => e.payload.kind === "tool_call");
    assert.ok(event);
    const inside = structuredClone(event);
    inside.id = "path-inside";
    inside.deliveryId = "path-inside";
    inside.projectId = "repo-paths";
    if (inside.payload.kind === "tool_call") inside.payload.path = `${root}/src/app.ts`;
    const outside = structuredClone(event);
    outside.id = "path-outside";
    outside.deliveryId = "path-outside";
    outside.projectId = "repo-paths";
    if (outside.payload.kind === "tool_call") outside.payload.path = "/elsewhere/other.ts";
    instance.append([inside, outside]);
    const stored = instance.allEvents("repo-paths", event.sessionId);
    const inside_ = stored.find((e) => e.id === "path-inside");
    const outside_ = stored.find((e) => e.id === "path-outside");
    assert.equal(inside_?.payload.kind === "tool_call" ? inside_.payload.path : null, "src/app.ts");
    // A path outside the registered root keeps its own shape.
    assert.equal(
      outside_?.payload.kind === "tool_call" ? outside_.payload.path : null,
      "/elsewhere/other.ts",
    );
  } finally {
    instance.close();
    rmSync(root, { recursive: true, force: true });
  }
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

test("a deletion race leaves no partial evidence and restores the append-only history", () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-race-"));
  const path = join(dir, "evidence.sqlite");
  try {
    const instance = new Store(path);
    instance.registerProject("demo-quoli", "quoli", true, demoPolicy);
    instance.append(demoEvents());
    // A producer retry that was already on its way when the deletion happened.
    const retry = demoEvents();
    const purged = instance.purgeProject("demo-quoli");
    assert.ok(purged.removed.events > 0);
    assert.throws(() => instance.append(retry), /deleted/);
    // Another project keeps its history, and the append-only protection is back.
    instance.registerProject("other-project", "other", false, demoPolicy);
    const other = demoEvents().map((event) => ({ ...event, projectId: "other-project" }));
    instance.append(other);
    instance.close();
    const db = new DatabaseSync(path);
    assert.throws(() => db.exec("UPDATE events SET body='{}'"), /append-only/);
    db.close();
    const reopened = new Store(path);
    assert.equal(reopened.allEvents("demo-quoli", "session-cache").length, 0);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
