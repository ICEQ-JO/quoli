import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { capacityEvents } from "../fixtures/capacity";
import { demoPolicy } from "../fixtures/demo";
import { Store } from "../packages/storage/src/index";

test("session pages enumerate all retained sessions and counts without admitting other projects", () => {
  const store = new Store(":memory:");
  try {
    store.registerProject("capacity", "Synthetic");
    store.registerProject("other", "Other");
    const events = capacityEvents(100, "wide");
    store.append(events);
    store.append([{ ...events[0], projectId: "other", id: "other", deliveryId: "other" }]);
    const first = store.sessionPage("capacity");
    assert.equal(first.total, 100);
    assert.equal(first.sessions.length, 50);
    assert.ok(first.nextCursor);
    assert.equal(store.hasSession("capacity", "root"), true);
    assert.equal(store.hasSession("other", "child-1"), false);
    // Late records do not move an existing session across the receipt-order cursor.
    store.append([{ ...events[0], id: "late", deliveryId: "late" }]);
    const last = store.sessionPage("capacity", first.nextCursor);
    assert.equal(last.sessions.length, 50);
    assert.equal(last.nextCursor, null);
    assert.equal(new Set([...first.sessions, ...last.sessions].map((s) => s.id)).size, 100);
    assert.deepEqual(
      Object.keys(store.sessionCounts("capacity", first.nextCursor)).sort(),
      last.sessions.map((s) => s.id).sort(),
    );
    assert.equal(last.sessions.find((s) => s.id === "root")?.count, 2);
    assert.deepEqual(store.sessionPage("missing"), { sessions: [], nextCursor: null, total: 0 });
    assert.throws(() => store.sessionPage("capacity", -1), /cursor/);
    assert.throws(() => store.sessionCounts("capacity", 1.5), /cursor/);
  } finally {
    store.close();
  }
});

test("event and byte caps reject atomically, allow exact replays, and do not claim accepted loss", () => {
  const store = new Store(":memory:", { maxEvents: 2, maxBytes: 8192 });
  try {
    store.registerProject("capacity", "Synthetic");
    const events = capacityEvents(3);
    assert.throws(() => store.append(events), /storage limit/);
    assert.equal(store.usage("capacity").events, 0);
    store.append(events.slice(0, 2));
    assert.deepEqual(store.append(events.slice(0, 2)), { accepted: 0, duplicates: 2 });
    assert.throws(() => store.append(events.slice(2)), /storage limit/);
    assert.equal(store.allEvents("capacity", "root").length, 2);
    assert.equal(store.sessionPage("capacity").sessions[0].count, 2);
  } finally {
    store.close();
  }
  const bytes = new Store(":memory:", { maxEvents: 10000, maxBytes: 2048 });
  try {
    bytes.registerProject("capacity", "Synthetic", false, demoPolicy);
    bytes.artifact("capacity", "filler", "x".repeat(1900));
    assert.throws(() => bytes.append(capacityEvents(1)), /storage limit/);
    assert.equal(bytes.usage("capacity").events, 0);
  } finally {
    bytes.close();
  }
});

test("an imported over-bound session stays paginatable but cannot produce a complete prefix summary", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-over-bound-"));
  const path = join(dir, "db.sqlite");
  try {
    const initial = new Store(path);
    initial.registerProject("capacity", "Synthetic");
    initial.append(capacityEvents(1));
    initial.close();
    // Simulate imported data that predates/bypasses the current ingest quota.
    const db = new DatabaseSync(path);
    try {
      db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<10000)
        INSERT INTO events(id,project_id,session_id,source,producer_id,delivery_id,received_at,schema_version,body)
        SELECT 'import-'||i,project_id,session_id,source,producer_id,'import-'||i,received_at,schema_version,
        json_set(body,'$.id','import-'||i,'$.deliveryId','import-'||i) FROM events CROSS JOIN n WHERE sequence=1`);
    } finally {
      db.close();
    }
    const store = new Store(path);
    try {
      assert.equal(store.events("capacity", "root").total, 10001);
      assert.equal(store.events("capacity", "root").events.length, 8);
      assert.equal(store.sessionPage("capacity").sessions[0].count, 10001);
      assert.throws(() => store.allEvents("capacity", "root"), /projection limit/);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
