import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { demoEvents, demoPolicy } from "../fixtures/demo";
import { activity, relationships, usage } from "../packages/analysis/src/index";
import {
  activityViewSchema,
  batchSchema,
  defaultPolicy,
  eventSchema,
  relationshipSchema,
  type StoredEvent,
} from "../packages/schema/src/index";
import { sanitizeContent, sanitizeEvent, withholdContent } from "../packages/schema/src/privacy";
import { Store } from "../packages/storage/src/index";

const stored = (events = demoEvents()): StoredEvent[] =>
  events.map((e, i) => ({ ...e, sequence: i + 1, receivedAt: "2026-10-22T10:00:00.000Z" }));

function v2Event(id = "v2-tool", deliveryId = "v2-delivery") {
  return {
    schemaVersion: 2,
    id,
    deliveryId,
    projectId: "demo-quoli",
    sessionId: "session-v2",
    source: "future_harness",
    sourceVersion: "2026.10",
    adapterId: "future-adapter",
    adapterVersion: "2.0.0",
    sourceLocator: "future_harness:tool",
    producerId: "fixture-v2",
    promptId: null,
    toolId: "tool-v2",
    requestId: null,
    sourceTime: null,
    sourceSequence: null,
    policyVersion: 1,
    tool: { rawName: "workspace.apply_patch", category: "Other" },
    activity: {
      turnId: "turn-v2",
      parentSessionId: null,
      parentTurnId: null,
      childSessionId: null,
      childTurnId: null,
    },
    fieldCapabilities: {
      content: "available",
      plan: "available",
      decision: "unsupported",
      approval: "disabled",
      correction: "unavailable",
    },
    declared: {
      plan: {
        text: "token=example-v2-secret",
        state: "present",
        originalBytes: null,
        categories: ["prompt"],
      },
      decision: null,
      approval: null,
      correction: null,
    },
    payload: {
      kind: "tool_call",
      toolName: "Other",
      content: {
        text: "apply a synthetic patch",
        state: "present",
        originalBytes: null,
        categories: ["tool"],
      },
      path: null,
    },
  };
}
test("versioned contracts reject invented/malformed usage and provenance", () => {
  assert.equal(batchSchema.parse({ events: demoEvents() }).events.length, 29);
  assert.throws(() => eventSchema.parse({ ...demoEvents()[0], schemaVersion: 99 }));
  assert.throws(() => eventSchema.parse({ ...demoEvents()[0], hiddenReasoning: "invented" }));
  const e = demoEvents().find((e) => e.payload.kind === "usage");
  assert.throws(() => eventSchema.parse({ ...e, payload: { ...e?.payload, input: -1 } }));
  assert.throws(() =>
    relationshipSchema.parse({
      id: "link",
      subjectId: "a",
      objectId: "b",
      basis: "derived",
      evidenceIds: [],
      rule: null,
      uncertainty: "Unknown",
    }),
  );
});
test("v2 preserves v1 evidence and records explicit activity capabilities", () => {
  const v2 = v2Event();
  const parsed = eventSchema.parse(v2);
  assert.equal(parsed.schemaVersion, 2);
  if (parsed.schemaVersion === 2) {
    assert.equal(parsed.tool?.rawName, "workspace.apply_patch");
    assert.equal(parsed.tool?.category, "Other");
  }
  const clean = sanitizeEvent(parsed, demoPolicy);
  if (clean.schemaVersion === 2) {
    assert.equal(clean.declared.plan?.text?.includes("example-v2-secret"), false);
    assert.equal(clean.declared.decision, null);
  }
  const disabled = sanitizeEvent(parsed, defaultPolicy);
  if (disabled.schemaVersion === 2) {
    assert.equal(disabled.declared.plan?.text, null);
    assert.equal(disabled.declared.plan?.state, "disabled");
  }
  const withheld = withholdContent(parsed);
  if (withheld.schemaVersion === 2) {
    assert.equal(withheld.declared.plan?.text, null);
    assert.equal(withheld.declared.plan?.state, "unavailable");
  }
  const store = new Store(":memory:");
  store.registerProject("demo-quoli", "quoli", false, demoPolicy);
  assert.equal(store.append([parsed]).accepted, 1);
  const retained = store.allEvents("demo-quoli", "session-v2")[0];
  assert.equal(retained?.schemaVersion, 2);
  if (retained?.schemaVersion === 2) assert.equal(retained.tool?.rawName, "workspace.apply_patch");
  store.close();
  assert.equal(batchSchema.parse({ events: demoEvents() }).events[0]?.schemaVersion, 1);
  assert.throws(() => eventSchema.parse({ ...v2, sourceVersion: "" }));
  assert.throws(() =>
    eventSchema.parse({
      ...v2,
      fieldCapabilities: { ...v2.fieldCapabilities, plan: "unsupported" },
    }),
  );
  assert.throws(() =>
    eventSchema.parse({ ...v2, activity: { ...v2.activity, turnId: "not a safe id" } }),
  );
  assert.throws(() =>
    eventSchema.parse({
      ...v2,
      fieldCapabilities: { ...v2.fieldCapabilities, content: "disabled" },
    }),
  );
});
test("metadata defaults suppress prompts and code embedded in tool text", () => {
  const event = demoEvents().find((e) => e.payload.kind === "tool_call");
  assert.ok(event);
  const input = {
    ...event,
    payload: {
      kind: "tool_call" as const,
      toolName: "Read" as const,
      path: "src/main.ts",
      content: {
        text: '{"nested":{"content":"private code"}}',
        state: "present" as const,
        originalBytes: null,
        categories: ["prompt" as const],
      },
    },
  };
  const clean = sanitizeEvent(input, { ...demoPolicy, code: false });
  assert.equal(clean.payload.kind, "tool_call");
  if (clean.payload.kind === "tool_call") {
    assert.equal(clean.payload.path, null);
    assert.equal(clean.payload.content.text, null);
    assert.equal(clean.payload.content.state, "disabled");
  }
  assert.equal(JSON.stringify(clean).includes("private code"), false);
  const prompt = sanitizeEvent(demoEvents()[1], defaultPolicy);
  assert.ok("content" in prompt.payload);
  assert.equal(prompt.payload.content.text, null);
});
test("redaction runs before UTF-8-safe bounded truncation and excluded paths", () => {
  const secret = "example-canary-value";
  const c = sanitizeContent(
    {
      text: `token=${secret}\n${"界".repeat(100)}`,
      state: "present",
      originalBytes: null,
      categories: ["tool"],
    },
    { ...demoPolicy, maxFieldBytes: 64 },
  );
  assert.equal(c.state, "truncated");
  assert.ok(c.text?.includes("[REDACTED]"));
  assert.equal(c.text?.includes(secret), false);
  assert.ok(Buffer.byteLength(c.text ?? "") <= 64);
  assert.equal(c.text?.includes("�"), false);
  const e = demoEvents().find((e) => e.payload.kind === "tool_call");
  assert.ok(e);
  if (e.payload.kind === "tool_call") e.payload.path = "config/.env.local";
  const clean = sanitizeEvent(e, demoPolicy);
  if (clean.payload.kind === "tool_call") assert.equal(clean.payload.content.text, null);
});
test("usage is nullable, deduplicated by request, and never mixes counter samples", () => {
  const main = stored().filter((e) => e.sessionId === "session-cache");
  const v = usage(main);
  assert.equal(v.input, 3100);
  assert.equal(v.output, 1560);
  assert.equal(v.cacheRead, 30500);
  assert.equal(v.cacheWrite, 2400);
  assert.equal(v.requests, 2);
  assert.equal(v.cacheReadShare, 30500 / 36000);
  const original = main.find((e) => e.payload.kind === "usage");
  assert.ok(original);
  assert.equal(
    usage([...main, { ...original, id: "corroboration", source: "claude_otel" }]).input,
    3100,
  );
  const conflict = structuredClone(original);
  if (conflict.payload.kind === "usage") conflict.payload.input = 5;
  assert.equal(usage([...main, conflict]).input, null);
  const cumulative = structuredClone(original);
  if (cumulative.payload.kind === "usage") cumulative.payload.temporality = "cumulative";
  assert.equal(usage([...main, cumulative]).input, null);
  assert.equal(usage(stored().filter((e) => e.sessionId === "session-interrupted")).output, null);
  assert.equal(usage([]).input, null);
});
test("activity projects explicit concurrent child turns and retained gaps without time inference", () => {
  const root = eventSchema.parse({
    ...v2Event("root", "root-delivery"),
    sessionId: "root-session",
    activity: {
      turnId: "root-turn",
      parentSessionId: null,
      parentTurnId: null,
      childSessionId: "child-a",
      childTurnId: "child-turn",
    },
  });
  const rootB = eventSchema.parse({
    ...v2Event("root-b", "root-b-delivery"),
    sessionId: "root-session",
    activity: {
      turnId: "root-turn",
      parentSessionId: null,
      parentTurnId: null,
      childSessionId: "child-b",
      childTurnId: "child-turn",
    },
  });
  const childA = eventSchema.parse({
    ...v2Event("child-a", "child-a-delivery"),
    sessionId: "child-a",
    activity: {
      turnId: "child-turn",
      parentSessionId: "root-session",
      parentTurnId: "root-turn",
      childSessionId: null,
      childTurnId: null,
    },
  });
  const childB = eventSchema.parse({
    ...v2Event("child-b", "child-b-delivery"),
    sessionId: "child-b",
    activity: {
      turnId: "child-turn",
      parentSessionId: "root-session",
      parentTurnId: "root-turn",
      childSessionId: null,
      childTurnId: null,
    },
  });
  const orphan = eventSchema.parse({
    ...v2Event("orphan", "orphan-delivery"),
    sessionId: "orphan-session",
    activity: {
      turnId: "orphan-turn",
      parentSessionId: "missing-session",
      parentTurnId: "missing-turn",
      childSessionId: null,
      childTurnId: null,
    },
  });
  const end = eventSchema.parse({
    ...v2Event("child-a-end", "child-a-end-delivery"),
    sessionId: "child-a",
    toolId: null,
    tool: null,
    activity: {
      turnId: null,
      parentSessionId: null,
      parentTurnId: null,
      childSessionId: null,
      childTurnId: null,
    },
    payload: { kind: "session_end", reason: "completed" },
  });
  const records = [root, rootB, childA, childB, orphan, end].map((event, index) => ({
    ...event,
    sequence: index + 1,
    receivedAt: "2026-10-23T10:00:00.000Z",
  }));
  const projected = activity([
    records[2],
    records[0],
    records[4],
    records[1],
    records[3],
    records[5],
  ]);
  activityViewSchema.parse(projected);
  assert.equal(projected.turns.length, 4);
  assert.deepEqual(
    projected.subagents.map((link) => link.child.sessionId).sort(),
    ["child-a", "child-a", "child-b", "child-b", "orphan-session"].sort(),
  );
  assert.equal(projected.turns.find((turn) => turn.sessionId === "child-a")?.ended, true);
  assert.ok(
    projected.gaps.some(
      (gap) => gap.kind === "missing_parent" && gap.sessionId === "orphan-session",
    ),
  );
  assert.ok(
    projected.gaps.some((gap) => gap.kind === "missing_end" && gap.sessionId === "child-b"),
  );
  assert.ok(projected.subagents.every((link) => link.rule === "explicit-activity-identities/v1"));
  const rootTurn = projected.turns.find((turn) => turn.sessionId === "root-session");
  assert.deepEqual(rootTurn?.declarations, [
    { kind: "plan", eventId: "root", state: "present" },
    { kind: "plan", eventId: "root-b", state: "present" },
  ]);
  // Declarations keep their state and evidence, never the captured text.
  assert.equal(JSON.stringify(projected).includes("example-v2-secret"), false);
  assert.deepEqual(activity(records), projected);
});
test("a spawned child with no retained evidence stays a gap", () => {
  const root = eventSchema.parse({
    ...v2Event("root-c", "root-c-delivery"),
    sessionId: "root-c",
    activity: {
      turnId: "root-c-turn",
      parentSessionId: null,
      parentTurnId: null,
      childSessionId: "missing-child",
      childTurnId: "missing-child-turn",
    },
  });
  const projected = activity([{ ...root, sequence: 1, receivedAt: "2026-10-23T10:00:00.000Z" }]);
  activityViewSchema.parse(projected);
  assert.ok(
    projected.gaps.some((gap) => gap.kind === "missing_child" && gap.sessionId === "root-c"),
  );
});
test("tool evidence joins require matching project, session and explicit ID", () => {
  const rows = stored();
  const links = relationships(rows);
  assert.ok(links.length > 0);
  for (const r of links) relationshipSchema.parse(r);
  const call = rows.find((e) => e.payload.kind === "tool_call" && e.sessionId === "session-cache");
  assert.ok(call);
  const result = rows.find((e) => e.toolId === call.toolId && e.payload.kind === "tool_result");
  assert.ok(result);
  assert.equal(relationships([call, { ...result, sessionId: "another-session" }]).length, 0);
  assert.equal(relationships([call, { ...result, projectId: "another-project" }]).length, 0);
});
test("SQLite survives restart, retries are idempotent, and paging is stable", () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-store-"));
  const path = join(dir, "evidence.sqlite");
  try {
    let store = new Store(path);
    store.registerProject("demo-quoli", "quoli", true, demoPolicy);
    assert.equal(store.append(demoEvents()).accepted, 29);
    assert.equal(store.append(demoEvents()).duplicates, 29);
    store.close();
    store = new Store(path);
    const first = store.events("demo-quoli", "session-cache");
    assert.equal(first.events.length, 8);
    assert.ok(first.nextCursor);
    const second = store.events("demo-quoli", "session-cache", first.nextCursor);
    assert.equal(second.events.length, 8);
    assert.equal(new Set([...first.events, ...second.events].map((e) => e.id)).size, 16);
    assert.equal(store.events("wrong-project", "session-cache").total, 0);
    store.close();
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const db = new DatabaseSync(path);
    assert.throws(() => db.exec("UPDATE events SET body='{}'"));
    assert.throws(() => db.exec("DELETE FROM events"));
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("failed mixed batch rolls back and reused delivery identity cannot rewrite an event", () => {
  const store = new Store(":memory:");
  store.registerProject("demo-quoli", "quoli", true, demoPolicy);
  const events = demoEvents().slice(0, 2);
  assert.throws(() => store.append([events[0], { ...events[1], projectId: "unregistered" }]));
  assert.equal(store.events("demo-quoli", events[0].sessionId).total, 0);
  store.append([events[0]]);
  assert.throws(() => store.append([{ ...events[0], sourceTime: null }]));
  const duplicateText = { ...events[0], id: "new-event", deliveryId: "new-delivery" };
  assert.equal(store.append([duplicateText]).accepted, 1);
  store.close();
});
test("secrets and disabled code do not reach database, WAL or artifact body", () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-privacy-"));
  const path = join(dir, "evidence.sqlite");
  try {
    const store = new Store(path);
    store.registerProject("demo-quoli", "quoli", true, { ...demoPolicy, code: false });
    const event = demoEvents()[1];
    if ("content" in event.payload) event.payload.content.text = "token=example-secret-canary";
    store.append([event]);
    store.artifact("demo-quoli", "code-canary", "sensitive-artifact-canary");
    for (const file of [path, `${path}-wal`]) {
      const bytes = readFileSync(file).toString();
      assert.equal(bytes.includes("example-secret-canary"), false);
      assert.equal(bytes.includes("sensitive-artifact-canary"), false);
    }
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("excluded tool paths suppress matching results; unmatched results stay content-free on retry", () => {
  const store = new Store(":memory:");
  store.registerProject("demo-quoli", "quoli", true, demoPolicy);
  const events = demoEvents();
  const call = events.find((e) => e.toolId === "tool-read" && e.payload.kind === "tool_call");
  const result = events.find((e) => e.toolId === "tool-read" && e.payload.kind === "tool_result");
  assert.ok(call && result);
  if (call.payload.kind === "tool_call") call.payload.path = "config/.env.local";
  if (result.payload.kind === "tool_result") result.payload.content.text = "excluded-file-canary";
  store.append([call, result]);
  assert.equal(
    JSON.stringify(store.allEvents("demo-quoli", "session-cache")).includes("excluded-file-canary"),
    false,
  );
  const lateCall = { ...call, id: "late-call", deliveryId: "late-call", toolId: "late-tool" };
  if (lateCall.payload.kind === "tool_call") lateCall.payload.path = "src/allowed.ts";
  const earlyResult = {
    ...result,
    id: "early-result",
    deliveryId: "early-result",
    toolId: "late-tool",
  };
  store.append([earlyResult]);
  store.append([lateCall]);
  assert.equal(store.append([earlyResult]).duplicates, 1);
  assert.equal(
    JSON.stringify(store.allEvents("demo-quoli", "session-cache")).includes("excluded-file-canary"),
    false,
  );
  store.close();
});
test("failed migrations roll back DDL and release the database lock", () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-migration-"));
  const path = join(dir, "db.sqlite");
  try {
    const incompatible = new DatabaseSync(path);
    incompatible.exec("CREATE TABLE events(wrong_column TEXT)");
    incompatible.close();
    assert.throws(() => new Store(path));
    const db = new DatabaseSync(path);
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE name='projects'").get(),
      undefined,
    );
    db.exec("DROP TABLE events");
    db.close();
    const recovered = new Store(path);
    recovered.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("a v1 store upgrades without rewriting history and then accepts v2 evidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-v1-upgrade-"));
  const path = join(dir, "evidence.sqlite");
  const legacy = demoEvents()[0];
  const legacyV2 = eventSchema.parse(v2Event("v2-legacy", "delivery-v2-legacy"));
  const receivedAt = "2026-10-23T10:00:00.000Z";
  try {
    const v1 = new DatabaseSync(path);
    for (const version of [
      "001-initial.sql",
      "002-repository.sql",
      "003-lifecycle.sql",
      "004-repository-observation.sql",
    ])
      v1.exec(
        readFileSync(new URL(`../packages/storage/migrations/${version}`, import.meta.url), "utf8"),
      );
    v1.prepare("INSERT INTO projects VALUES(?,?,?,?)").run(
      "demo-quoli",
      "quoli",
      0,
      JSON.stringify(demoPolicy),
    );
    v1.prepare(
      "INSERT INTO events(id,project_id,session_id,source,producer_id,delivery_id,received_at,body) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      legacy.id,
      legacy.projectId,
      legacy.sessionId,
      legacy.source,
      legacy.producerId,
      legacy.deliveryId,
      receivedAt,
      JSON.stringify(legacy),
    );
    // v2 evidence can already exist: the v2 contract merged before this migration.
    v1.prepare(
      "INSERT INTO events(id,project_id,session_id,source,producer_id,delivery_id,received_at,body) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      legacyV2.id,
      legacyV2.projectId,
      legacyV2.sessionId,
      legacyV2.source,
      legacyV2.producerId,
      legacyV2.deliveryId,
      receivedAt,
      JSON.stringify(legacyV2),
    );
    v1.exec("CREATE TABLE event_schema_version(blocked TEXT)");
    v1.close();

    assert.throws(() => new Store(path));
    const failed = new DatabaseSync(path);
    assert.equal(
      failed
        .prepare("PRAGMA table_info(events)")
        .all()
        .some((row) => row.name === "schema_version"),
      false,
    );
    assert.equal(
      String(failed.prepare("SELECT body FROM events").get()?.body),
      JSON.stringify(legacy),
    );
    failed.exec("DROP TABLE event_schema_version");
    failed.close();

    let upgraded = new Store(path);
    assert.deepEqual(upgraded.allEvents("demo-quoli", legacy.sessionId), [
      { ...legacy, sequence: 1, receivedAt },
    ]);
    assert.deepEqual(upgraded.allEvents("demo-quoli", legacyV2.sessionId), [
      { ...legacyV2, sequence: 2, receivedAt },
    ]);
    assert.equal(
      upgraded.append([eventSchema.parse(v2Event("v2-after-upgrade", "delivery-v2-after"))])
        .accepted,
      1,
    );
    upgraded.close();

    upgraded = new Store(path);
    assert.deepEqual(
      upgraded
        .allEvents("demo-quoli", "session-v2")
        .map((event) => [event.id, event.schemaVersion]),
      [
        ["v2-legacy", 2],
        ["v2-after-upgrade", 2],
      ],
    );
    upgraded.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("storage capacity rejects a whole batch without deleting retained evidence", () => {
  const store = new Store(":memory:", { maxEvents: 1, maxBytes: 1048576 });
  store.registerProject("demo-quoli", "quoli", true, demoPolicy);
  const events = demoEvents().slice(0, 2);
  assert.throws(() => store.append(events), /storage limit/);
  assert.equal(store.events("demo-quoli", events[0].sessionId).total, 0);
  store.append([events[0]]);
  assert.throws(() => store.append([events[1]]), /storage limit/);
  assert.equal(store.events("demo-quoli", events[0].sessionId).total, 1);
  store.close();
});

test("session queries search all observations, keep source-order cursors stable and scope projects", () => {
  const store = new Store(":memory:");
  store.registerProject("demo-quoli", "quoli", true, demoPolicy);
  store.append(demoEvents());
  const query = { search: "", kind: "all" as const, order: "source" as const, cursor: 0 };
  const first = store.events("demo-quoli", "session-cache", 0, 8, query);
  assert.ok(first.nextCursor);
  const second = store.events("demo-quoli", "session-cache", first.nextCursor, 8, query);
  assert.ok(second.nextCursor);
  const third = store.events("demo-quoli", "session-cache", second.nextCursor, 8, query);
  const all = [...first.events, ...second.events, ...third.events];
  assert.equal(all.length, 17);
  assert.equal(new Set(all.map((e) => e.id)).size, 17);
  assert.deepEqual(
    all.map((e) => e.sourceTime),
    [...all.map((e) => e.sourceTime)].sort(),
  );
  const matches = store.events("demo-quoli", "session-cache", 0, 8, {
    ...query,
    search: "pnpm typecheck",
    order: "receipt",
  });
  assert.equal(matches.total, 1);
  assert.equal(matches.events[0].toolId, "tool-typecheck");
  const files = store.events("demo-quoli", "session-cache", 0, 8, { ...query, kind: "files" });
  assert.equal(files.total, 6);
  const commands = store.events("demo-quoli", "session-cache", 0, 8, {
    ...query,
    kind: "commands",
  });
  assert.equal(commands.total, 5);
  assert.equal(
    store.events("demo-quoli", "session-cache", 0, 8, { ...query, kind: "gap" }).total,
    1,
  );
  assert.equal(
    store.events("other-project", "session-cache", 0, 8, { ...query, search: "pnpm" }).total,
    0,
  );
  assert.equal(
    store.events("demo-quoli", "session-cache", 0, 8, { ...query, search: "' OR 1=1 --" }).total,
    0,
  );
  store.close();
});
