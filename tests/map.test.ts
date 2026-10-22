import assert from "node:assert/strict";
import { test } from "node:test";
import { demoEvents } from "../fixtures/demo";
import { demoSnapshots } from "../fixtures/repository";
import { verification } from "../packages/analysis/src/checks";
import { compareSnapshots } from "../packages/analysis/src/diff";
import { changeMap } from "../packages/analysis/src/map";
import { changeMapSchema } from "../packages/schema/src/map";

const stored = () =>
  demoEvents().map((e, i) => ({ ...e, sequence: i + 1, receivedAt: "2026-10-22T10:00:00.000Z" }));

function demoPair() {
  const captures = demoSnapshots().filter((c) => c.sessionId === "session-cache");
  const before = captures.find((c) => c.reason === "baseline");
  const after = captures.find((c) => c.reason === "checkpoint");
  assert.ok(before && after);
  const stored = (capture: typeof before) => ({
    ...capture.snapshot,
    projectId: "demo-quoli",
    sessionId: capture.sessionId,
    reason: capture.reason,
    eventId: `obs-${capture.snapshot.id}`,
  });
  return {
    before: stored(before),
    after: stored(after),
    comparison: compareSnapshots(stored(before), stored(after)),
  };
}

function map(overrides: Partial<Parameters<typeof changeMap>[0]> = {}) {
  const { before, after, comparison } = demoPair();
  const checks = verification(stored().filter((e) => e.sessionId === "session-cache")).checks;
  return changeMap({
    files: comparison.files.map((file) => ({
      id: file.id,
      path: file.path,
      status: file.status,
      uncertainty: file.uncertainty,
      evidenceIds: ["obs-before", "obs-after"],
    })),
    checks,
    beforeId: before.id,
    afterId: after.id,
    ...overrides,
  });
}

test("the map joins captured changes to recorded checks with explicit rules", () => {
  const result = map();
  changeMapSchema.parse(result);
  const files = result.nodes.filter((n) => n.kind === "file");
  const checks = result.nodes.filter((n) => n.kind === "check");
  assert.equal(files.length, 2);
  assert.equal(checks.length, 3);
  // Unchanged paths are not changes and stay out of the map.
  assert.equal(
    result.nodes.some((n) => n.label === "README.md"),
    false,
  );
  for (const edge of result.edges) {
    assert.ok(edge.rule.startsWith("prior-file-reference") || edge.rule.startsWith("post-check"));
    assert.equal(edge.basis, "derived");
    assert.ok(edge.evidenceIds.length > 0);
    assert.ok(edge.uncertainty.length > 0);
  }
  assert.ok(result.edges.some((e) => e.position === "after"));
  assert.ok(result.edges.some((e) => e.position === "before"));
  assert.ok(result.uncertainty.includes("does not establish authorship"));
});

test("the map is deterministic and never invents a connection", () => {
  const first = map();
  const second = map();
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.nodes.map((n) => n.id),
    second.nodes.map((n) => n.id),
  );
  // A check that references an uncaptured path produces no edge.
  const isolated = changeMap({
    files: [
      {
        id: "f1",
        path: "other/file.ts",
        status: "modified",
        uncertainty: null,
        evidenceIds: ["e1"],
      },
    ],
    checks: verification(stored()).checks,
    beforeId: "before",
    afterId: "after",
  });
  assert.equal(isolated.edges.length, 0);
});

test("node and edge caps are explicit and report what was omitted", () => {
  const many = Array.from({ length: 150 }, (_, index) => ({
    id: `file-${index}`,
    path: `src/file-${String(index).padStart(3, "0")}.ts`,
    status: "modified",
    uncertainty: null,
    evidenceIds: ["obs-before", "obs-after"],
  }));
  const bounded = changeMap({
    files: many,
    checks: verification(stored()).checks,
    beforeId: "before",
    afterId: "after",
    caps: { nodes: 100, edges: 200 },
  });
  assert.equal(bounded.nodes.length, 100);
  assert.equal(bounded.omittedNodes, 54);
  assert.equal(bounded.caps.nodes, 100);
  assert.equal(bounded.caps.edges, 200);
  const expanded = changeMap({
    files: many,
    checks: verification(stored()).checks,
    beforeId: "before",
    afterId: "after",
    caps: { nodes: 500, edges: 1000 },
  });
  assert.equal(expanded.nodes.length, 154);
  assert.equal(expanded.omittedNodes, 0);
});

test("a missing baseline stays explicit instead of implying a change", () => {
  const result = changeMap({
    files: [
      { id: "f1", path: "src/a.ts", status: "modified", uncertainty: null, evidenceIds: ["e1"] },
    ],
    checks: [],
    beforeId: null,
    afterId: "after",
  });
  assert.equal(result.window.baselineMissing, true);
  assert.equal(result.window.before, null);
});
