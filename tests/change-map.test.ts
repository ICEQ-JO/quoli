import assert from "node:assert/strict";
import { test } from "node:test";
import type { CodeFile } from "../shared/model.ts";
import { changeMap, importGraph } from "../web/src/lenses/code/changemap.ts";

const file = (path: string, imports: string[] = []): CodeFile => ({
  path,
  lines: 10,
  language: "TypeScript",
  imports,
  scanned: true,
  status: "clean",
  diff: null,
});

// app → api → db → util ; page → api ; api.test → api ; db → api (cycle) ; lonely.md
const graph = importGraph([
  file("src/app.ts", ["src/api.ts"]),
  file("src/page.ts", ["src/api.ts"]),
  file("src/api.ts", ["src/db.ts"]),
  file("src/db.ts", ["src/util.ts", "src/api.ts"]),
  file("src/util.ts"),
  file("test/api.test.ts", ["src/api.ts"]),
  file("docs/lonely.md"),
]);
const cols = (m: ReturnType<typeof changeMap>) =>
  Object.fromEntries([...m.columns].map(([c, l]) => [c, l]));

test("direct imports go left, importers go right, the change sits in the middle", () => {
  const m = changeMap(graph, ["src/api.ts"]);
  assert.deepEqual(cols(m), {
    "-1": ["src/db.ts"],
    0: ["src/api.ts"],
    1: ["src/app.ts", "src/page.ts", "test/api.test.ts"],
  });
});

test("every edge is a recorded import between neighbouring columns or two changes", () => {
  const m = changeMap(graph, ["src/api.ts"], { hops: 2 });
  const imports = new Map([...graph.imports]);
  for (const [from, to] of m.edges) assert.ok(imports.get(from)?.includes(to), `${from} → ${to}`);
  // db imports api back (a cycle): both directions are real and drawn.
  assert.ok(m.edges.some(([a, b]) => a === "src/db.ts" && b === "src/api.ts"));
  assert.ok(m.edges.some(([a, b]) => a === "src/api.ts" && b === "src/db.ts"));
  assert.deepEqual(m.columns.get(-2), ["src/util.ts"]);
});

test("a file is placed once even when it is both imported and importing", () => {
  const m = changeMap(graph, ["src/api.ts"]);
  const all = [...m.columns.values()].flat();
  assert.equal(all.length, new Set(all).size);
});

test("files with no imports still appear as changes, with no edges", () => {
  const m = changeMap(graph, ["docs/lonely.md"]);
  assert.deepEqual(cols(m), { 0: ["docs/lonely.md"] });
  assert.deepEqual(m.edges, []);
});

test("columns are capped by connection count and the rest is counted", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    file(`u/${String(i).padStart(2, "0")}.ts`, ["c.ts"]),
  );
  const g = importGraph([file("c.ts"), ...many, file("hub.ts", ["c.ts"])]);
  const m = changeMap(g, ["c.ts"], { cap: 10 });
  assert.equal(m.columns.get(1)?.length, 10);
  assert.equal(m.more.get(1), 21);
});

test("two changed files that import each other keep their edge", () => {
  const m = changeMap(graph, ["src/api.ts", "src/app.ts"]);
  assert.ok(m.edges.some(([a, b]) => a === "src/app.ts" && b === "src/api.ts"));
});
