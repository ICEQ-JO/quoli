import assert from "node:assert/strict";
import { test } from "node:test";
import type { CodeFile } from "../shared/model.ts";
import {
  aggregateTouches,
  crumbs,
  indexFiles,
  intensity,
  scopeForPath,
  scopeOf,
  tileColumns,
} from "../web/src/lenses/code/scope.ts";

const f = (path: string): CodeFile => ({
  path,
  lines: 1,
  language: null,
  imports: [],
  scanned: true,
  status: "clean",
});
const files = [
  "README.md",
  "packages/admin/src/a.ts",
  "packages/admin/src/b.ts",
  "packages/admin/src/ui/c.ts",
  "packages/shop/index.ts",
  "docs/deep/only/x.md",
].map(f);

test("scopeOf lists top-level folders with single-child chains merged", () => {
  const idx = indexFiles(files);
  const root = scopeOf(idx, "");
  assert.deepEqual(
    root.folders.map((x) => [x.name, x.path, x.files]),
    [
      ["packages", "packages", 4],
      ["docs/deep/only", "docs/deep/only", 1],
    ],
  );
  assert.deepEqual(
    root.files.map((x) => x.path),
    ["README.md"],
  );
  const pk = scopeOf(idx, "packages");
  assert.deepEqual(
    pk.folders.map((x) => [x.name, x.path]),
    [
      ["admin/src", "packages/admin/src"],
      ["shop", "packages/shop"],
    ],
  );
  assert.deepEqual(scopeOf(idx, "nope"), { folders: [], files: [] });
});

test("aggregateTouches counts edited and read files per ancestor directory", () => {
  const t = new Map([
    ["packages/admin/src/a.ts", { read: 2, edited: 1, calls: [] }],
    ["packages/admin/src/b.ts", { read: 1, edited: 0, calls: [] }],
    ["README.md", { read: 0, edited: 0, calls: [] }],
  ]);
  const h = aggregateTouches(t);
  assert.deepEqual(h.get("packages"), { edited: 1, read: 1 });
  assert.deepEqual(h.get("packages/admin/src"), { edited: 1, read: 1 });
  assert.deepEqual(h.get(""), { edited: 1, read: 1 });
  assert.equal(h.get("docs"), undefined);
});

test("scope helpers", () => {
  assert.equal(scopeForPath("a/b/c.ts"), "a/b");
  assert.equal(scopeForPath("c.ts"), "");
  assert.deepEqual(crumbs("a/b"), [
    { name: "a", path: "a" },
    { name: "b", path: "a/b" },
  ]);
  assert.deepEqual(crumbs(""), []);
  assert.equal(intensity(0), 0);
  assert.ok(intensity(0.01) > 0.1 && intensity(1) === 1);
  assert.ok(tileColumns(1) === 1 && tileColumns(100) === 4 && tileColumns(3) === 2);
});
