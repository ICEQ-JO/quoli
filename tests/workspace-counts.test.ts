import assert from "node:assert/strict";
import { test } from "node:test";
import { demoEvents, demoPolicy } from "../fixtures/demo";
import { Store } from "../packages/storage/src/index";

test("workspace counts match retained sessions, remain project-scoped and contain no captured body", () => {
  const store = new Store(":memory:");
  store.registerProject("demo-quoli", "Example", true, demoPolicy);
  store.registerProject("other", "Other", true, demoPolicy);
  const events = demoEvents();
  store.append(events);
  store.append(
    events.map((e) => ({
      ...e,
      projectId: "other",
      id: `other_${e.id}`,
      deliveryId: `other_${e.deliveryId}`,
    })),
  );
  const counts = store.sessionCounts("demo-quoli");
  assert.equal(Object.keys(counts).length, 3);
  assert.equal(counts["session-cache"].kindCounts.tool_call, 6);
  assert.equal(counts["session-cache"].kindCounts.gap, 1);
  assert.equal(counts["session-interrupted"].kindCounts.gap, 2);
  assert.equal(counts["session-metadata"].kindCounts.prompt, 1);
  assert.equal(JSON.stringify(counts).includes("The usage panel"), false);
  assert.deepEqual(store.sessionCounts("unknown"), {});
  store.close();
});

test("workspace count projection shares the 50-session register bound and handles dictionary-shaped IDs", () => {
  const store = new Store(":memory:");
  store.registerProject("demo-quoli", "Example", true, demoPolicy);
  const base = demoEvents()[0];
  store.append(
    Array.from({ length: 51 }, (_, i) => ({
      ...base,
      id: `count_${i}`,
      deliveryId: `count_${i}`,
      sessionId: `session_${i}`,
    })),
  );
  const bounded = store.sessionCounts("demo-quoli");
  assert.equal(Object.keys(bounded).length, 50);
  assert.equal(Object.hasOwn(bounded, "session_0"), false);
  assert.deepEqual(
    Object.keys(bounded).sort(),
    store
      .sessions("demo-quoli")
      .map((s) => s.id)
      .sort(),
  );
  store.append([
    { ...base, id: "count_prototype", deliveryId: "count_prototype", sessionId: "__proto__" },
  ]);
  const special = store.sessionCounts("demo-quoli");
  assert.equal(Object.hasOwn(special, "__proto__"), true);
  assert.equal(
    Object.getOwnPropertyDescriptor(special, "__proto__")?.value.kindCounts.session_start,
    1,
  );
  assert.equal(Object.getPrototypeOf(special), Object.prototype);
  assert.equal(Object.keys(special).length, 50);
  store.close();
});
