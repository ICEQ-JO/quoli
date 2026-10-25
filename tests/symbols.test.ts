import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { compareSnapshots, diffAll } from "../packages/analysis/src/diff";
import { groupFileSymbols } from "../packages/analysis/src/symbols";
import type { RepositoryFile, StoredSnapshot } from "../packages/schema/src/repository";

const content = (
  text: string | null,
  state: RepositoryFile["content"]["state"] = "present",
): RepositoryFile["content"] => ({ text, state, originalBytes: null, categories: ["code"] });

const file = (
  path: string,
  text: string | null,
  state: RepositoryFile["content"]["state"] = "present",
): RepositoryFile => ({
  path,
  tracked: true,
  staged: false,
  status: "present",
  content: content(text, state),
  fingerprint: text === null ? null : createHash("sha256").update(text).digest("hex"),
});

const snapshot = (
  id: string,
  files: RepositoryFile[],
  extra: Partial<StoredSnapshot> = {},
): StoredSnapshot => ({
  id,
  projectId: "proj",
  sessionId: "sess",
  reason: "baseline",
  eventId: `evt-${id}`,
  capturedAt: "2026-10-26T10:00:00.000Z",
  head: null,
  indexIdentity: null,
  state: "observed",
  dirty: false,
  files,
  omitted: 0,
  warnings: [],
  ...extra,
});

function changeOf(path: string, before: string | null, after: string | null) {
  const comparison = compareSnapshots(
    snapshot("snap-before", before === null ? [] : [file(path, before)]),
    snapshot("snap-after", after === null ? [] : [file(path, after)]),
  );
  const change = comparison.files.find((entry) => entry.path === path);
  assert.ok(change, `expected a change for ${path}`);
  return change;
}

test("a modified function links its changed lines to an exact capture range", () => {
  const change = changeOf(
    "src/add.ts",
    `export function add(a: number, b: number) {
  return a + b;
}
`,
    `export function add(a: number, b: number) {
  return a - b;
}
`,
  );
  const diff = diffAll(change);
  const symbols = groupFileSymbols(change, diff);
  assert.equal(symbols.state, "available");
  assert.equal(symbols.language, "typescript");
  assert.equal(symbols.unattributed, 0);
  assert.equal(symbols.groups.length, 1);
  const group = symbols.groups[0];
  assert.equal(group.name, "add");
  assert.equal(group.qualified, "add");
  assert.equal(group.kind, "function");
  assert.equal(group.status, "modified");
  assert.deepEqual(group.before, { startLine: 1, endLine: 3 });
  assert.deepEqual(group.after, { startLine: 1, endLine: 3 });
  assert.ok(group.lines.some((line) => line.kind === "delete" && line.beforeLine === 2));
  assert.ok(group.lines.some((line) => line.kind === "add" && line.afterLine === 2));
  assert.equal(group.basis, "derived");
  assert.equal(group.rule, "tree-sitter-symbol-group/v1");
  assert.ok(group.uncertainty?.includes("runtime impact"));
});

test("a method is the innermost group and an unchanged method is not claimed", () => {
  const change = changeOf(
    "src/counter.ts",
    `class Counter {
  increment() {
    return 1;
  }
  unchanged() {
    return 2;
  }
}
`,
    `class Counter {
  increment() {
    return 3;
  }
  unchanged() {
    return 2;
  }
}
`,
  );
  const symbols = groupFileSymbols(change, diffAll(change));
  assert.equal(symbols.state, "available");
  assert.deepEqual(
    symbols.groups.map((group) => group.qualified),
    ["Counter.increment"],
  );
  assert.equal(symbols.groups[0].kind, "method");
  assert.ok(symbols.groups[0].lines.some((line) => line.afterLine === 3));
});

test("same-named methods in different classes stay separate", () => {
  const change = changeOf(
    "src/classes.ts",
    `class A {
  run() {
    return 1;
  }
}
class B {
  run() {
    return 1;
  }
}
`,
    `class A {
  run() {
    return 1;
  }
}
class B {
  run() {
    return 2;
  }
}
`,
  );
  const symbols = groupFileSymbols(change, diffAll(change));
  assert.deepEqual(
    symbols.groups.map((group) => group.qualified),
    ["B.run"],
  );
});

test("nested functions are qualified and grouped at the innermost symbol", () => {
  const change = changeOf(
    "src/nested.ts",
    `function outer() {
  function inner() {
    return 1;
  }
  return inner();
}
`,
    `function outer() {
  function inner() {
    return 2;
  }
  return inner();
}
`,
  );
  const symbols = groupFileSymbols(change, diffAll(change));
  assert.deepEqual(
    symbols.groups.map((group) => group.qualified),
    ["outer.inner"],
  );
});

test("arrow functions assigned to a const are grouped as functions", () => {
  const change = changeOf(
    "src/sum.ts",
    "export const sum = (a: number, b: number) => a + b;\n",
    "export const sum = (a: number, b: number) => a - b;\n",
  );
  const symbols = groupFileSymbols(change, diffAll(change));
  assert.deepEqual(
    symbols.groups.map((group) => [group.name, group.kind, group.status]),
    [["sum", "function", "modified"]],
  );
});

test("added and deleted functions use the side that exists", () => {
  const added = changeOf(
    "src/fresh.ts",
    "const keep = 1;\n",
    `const keep = 1;
export function fresh() {
  return 1;
}
`,
  );
  const addedSymbols = groupFileSymbols(added, diffAll(added));
  assert.equal(addedSymbols.groups[0].status, "added");
  assert.equal(addedSymbols.groups[0].before, null);
  assert.deepEqual(addedSymbols.groups[0].after, { startLine: 2, endLine: 4 });
  assert.ok(addedSymbols.groups[0].lines.every((line) => line.kind === "add"));

  const deleted = changeOf(
    "src/gone.ts",
    `export function gone() {
  return 1;
}
`,
    "",
  );
  const deletedSymbols = groupFileSymbols(deleted, diffAll(deleted));
  assert.equal(deletedSymbols.groups[0].status, "deleted");
  assert.equal(deletedSymbols.groups[0].after, null);
  assert.ok(deletedSymbols.groups[0].lines.every((line) => line.kind === "delete"));
});

test("a renamed symbol is reported as a deletion and an addition, not a semantic rename", () => {
  const change = changeOf(
    "src/name.ts",
    "export function oldName() {\n  return 1;\n}\n",
    "export function newName() {\n  return 1;\n}\n",
  );
  const symbols = groupFileSymbols(change, diffAll(change));
  assert.deepEqual(symbols.groups.map((group) => [group.qualified, group.status]).sort(), [
    ["newName", "added"],
    ["oldName", "deleted"],
  ]);
  assert.ok(symbols.groups.every((group) => group.uncertainty?.includes("semantic rename")));
});

test("malformed syntax keeps the file diff and claims no symbols", () => {
  const change = changeOf(
    "src/broken.ts",
    "export function broken() {\n  return 1;\n}\n",
    "export function broken( {\n",
  );
  const diff = diffAll(change);
  assert.equal(diff.state, "available");
  const symbols = groupFileSymbols(change, diff);
  assert.equal(symbols.state, "partial");
  assert.deepEqual(symbols.groups, []);
  assert.ok(symbols.reason?.includes("after"));
  assert.ok(symbols.reason?.includes("file diff remains available"));
});

test("Unicode text does not shift the captured line ranges", () => {
  const change = changeOf(
    "src/unicode.ts",
    `const rocket = "🚀";
// a unicode comment
function greet(name: string) {
  return \`hi \${name}\`;
}
`,
    `const rocket = "🚀";
// a unicode comment
function greet(name: string) {
  return \`hello \${name}\`;
}
`,
  );
  const symbols = groupFileSymbols(change, diffAll(change));
  assert.equal(symbols.groups.length, 1);
  assert.deepEqual(symbols.groups[0].after, { startLine: 3, endLine: 5 });
  assert.ok(symbols.groups[0].lines.some((line) => line.afterLine === 4));
});

test("TSX and JavaScript are grouped with their language recorded", () => {
  const tsx = changeOf(
    "src/card.tsx",
    "export function Card({ title }: { title: string }) {\n  return <div>{title}</div>;\n}\n",
    "export function Card({ title }: { title: string }) {\n  return <span>{title}</span>;\n}\n",
  );
  const tsxSymbols = groupFileSymbols(tsx, diffAll(tsx));
  assert.equal(tsxSymbols.language, "tsx");
  assert.equal(tsxSymbols.groups[0].name, "Card");

  const js = changeOf(
    "src/util.js",
    "function double(value) {\n  return value * 2;\n}\n",
    "function double(value) {\n  return value * 3;\n}\n",
  );
  const jsSymbols = groupFileSymbols(js, diffAll(js));
  assert.equal(jsSymbols.language, "javascript");
  assert.equal(jsSymbols.groups[0].name, "double");
});

test("unsupported languages and top-level-only changes fall back to the file diff", () => {
  const python = changeOf(
    "src/change.py",
    "def value():\n    return 1\n",
    "def value():\n    return 2\n",
  );
  const pythonSymbols = groupFileSymbols(python, diffAll(python));
  assert.equal(pythonSymbols.state, "unsupported");
  assert.equal(pythonSymbols.language, null);
  assert.deepEqual(pythonSymbols.groups, []);

  const topLevel = changeOf("src/const.ts", "const value = 1;\n", "const value = 2;\n");
  const topLevelSymbols = groupFileSymbols(topLevel, diffAll(topLevel));
  assert.equal(topLevelSymbols.state, "available");
  assert.deepEqual(topLevelSymbols.groups, []);
  assert.equal(topLevelSymbols.unattributed, 2);
});

test("unavailable content keeps an explicit reason", () => {
  const comparison = compareSnapshots(
    snapshot("snap-before", [
      file("src/redacted.ts", "export function value() {\n  return 1;\n}\n"),
    ]),
    snapshot("snap-after", [file("src/redacted.ts", null, "redacted")]),
  );
  const change = comparison.files[0];
  const symbols = groupFileSymbols(change, diffAll(change));
  assert.equal(symbols.state, "unavailable");
  assert.equal(symbols.language, "typescript");
  assert.ok(symbols.reason);
});

test("large files and symbol floods are bounded rather than parsed", () => {
  const huge = `const value = "${"a".repeat(512 * 1024)}";\n`;
  const large = changeOf("src/large.ts", "const value = 1;\n", huge);
  const largeSymbols = groupFileSymbols(large, diffAll(large));
  assert.equal(largeSymbols.state, "bounded");
  assert.ok(largeSymbols.reason?.includes("524288"));

  const many = Array.from(
    { length: 501 },
    (_, index) => `function f${index}() {\n  return ${index};\n}\n`,
  ).join("");
  const flood = changeOf("src/flood.ts", "const value = 1;\n", many);
  const floodSymbols = groupFileSymbols(flood, diffAll(flood));
  assert.equal(floodSymbols.state, "bounded");
  assert.ok(floodSymbols.reason?.includes("500"));
});

test("group output is capped with an omitted count", () => {
  const functions = (value: number) =>
    Array.from(
      { length: 250 },
      (_, index) => `function f${index}() {\n  return ${index + value};\n}\n`,
    ).join("");
  const change = changeOf("src/many.ts", functions(0), functions(1));
  const symbols = groupFileSymbols(change, diffAll(change));
  assert.equal(symbols.state, "available");
  assert.equal(symbols.groups.length, 200);
  assert.equal(symbols.omitted, 50);
});

test("grouping is deterministic for the same captured pair", () => {
  const change = changeOf(
    "src/stable.ts",
    "export function stable() {\n  return 1;\n}\n",
    "export function stable() {\n  return 2;\n}\n",
  );
  const diff = diffAll(change);
  assert.deepEqual(groupFileSymbols(change, diff), groupFileSymbols(change, diff));
});
