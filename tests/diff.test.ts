import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { compareSnapshots, diffFile } from "../packages/analysis/src/diff";
import type { RepositoryFile, StoredSnapshot } from "../packages/schema/src/repository";

const content = (
  text: string | null,
  state: RepositoryFile["content"]["state"] = "present",
): RepositoryFile["content"] => ({ text, state, originalBytes: null, categories: ["code"] });

const file = (
  path: string,
  text: string | null,
  extra: Partial<RepositoryFile> = {},
): RepositoryFile => ({
  path,
  tracked: true,
  staged: false,
  status: "present",
  content: content(text),
  fingerprint: null,
  ...extra,
});

const fingerprint = (text: string): string => createHash("sha256").update(text).digest("hex");

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
  capturedAt: "2026-10-22T10:00:00.000Z",
  head: null,
  indexIdentity: null,
  state: "observed",
  dirty: false,
  files,
  omitted: 0,
  warnings: [],
  ...extra,
});

const statusOf = (
  comparison: ReturnType<typeof compareSnapshots>,
  path: string,
): string | undefined => comparison.files.find((change) => change.path === path)?.status;

test("a captured pair reports additions, modifications, deletions and unchanged files", () => {
  const before = snapshot("snap-before", [
    file("src/keep.ts", "const a = 1;\n"),
    file("src/edit.ts", "const a = 1;\n"),
    file("src/gone.ts", "const gone = true;\n"),
  ]);
  const after = snapshot("snap-after", [
    file("src/keep.ts", "const a = 1;\n"),
    file("src/edit.ts", "const a = 2;\n"),
    file("src/new.ts", "const fresh = true;\n"),
  ]);
  const comparison = compareSnapshots(before, after);
  assert.equal(statusOf(comparison, "src/keep.ts"), "unchanged");
  assert.equal(statusOf(comparison, "src/edit.ts"), "modified");
  assert.equal(statusOf(comparison, "src/gone.ts"), "deleted");
  assert.equal(statusOf(comparison, "src/new.ts"), "added");
  assert.equal(comparison.files.length, 4);
  assert.equal(comparison.beforeId, "snap-before");
  assert.equal(comparison.afterId, "snap-after");
  assert.equal(comparison.complete, true);
  assert.deepEqual(comparison.warnings, []);
  assert.deepEqual(
    comparison.files.map((change) => change.path),
    ["src/edit.ts", "src/gone.ts", "src/keep.ts", "src/new.ts"],
  );
  assert.ok(
    comparison.files.every(
      (change) => change.basis === "derived" && change.rule === "captured-snapshot-pair/v1",
    ),
  );
  assert.ok(comparison.files.every((change) => /^[a-f0-9]{64}$/.test(change.id)));
});

test("an unchanged capture pair produces no changes and no warnings", () => {
  const files = [file("a.ts", "one\n"), file("b.ts", "two\n")];
  const comparison = compareSnapshots(snapshot("one", files), snapshot("two", files));
  assert.deepEqual(
    comparison.files.map((change) => change.status),
    ["unchanged", "unchanged"],
  );
  assert.equal(comparison.complete, true);
  assert.deepEqual(comparison.warnings, []);
  assert.ok(comparison.files.every((change) => change.uncertainty === null));
});

test("a missing baseline yields unavailable entries and never an invented empty before side", () => {
  const after = snapshot("snap-after", [file("src/only.ts", "const a = 1;\n")]);
  const comparison = compareSnapshots(null, after);
  assert.equal(comparison.beforeId, null);
  assert.equal(comparison.baselineDirty, null);
  assert.equal(comparison.complete, false);
  assert.equal(comparison.files.length, 1);
  const change = comparison.files[0];
  assert.equal(change.status, "unavailable");
  assert.equal(change.before, null);
  assert.equal(change.after?.path, "src/only.ts");
  assert.ok(change.uncertainty);
  assert.ok(
    comparison.warnings.some((warning) => warning.includes("Baseline snapshot is unavailable")),
  );
  const diff = diffFile(change);
  assert.equal(diff.state, "unavailable");
  assert.equal(diff.lines.length, 0);
  assert.equal(diff.additions, null);
  assert.equal(diff.total, null);
});

test("a dirty baseline stays distinguishable from changes between snapshots", () => {
  const after = snapshot("snap-after", [file("a.ts", "const a = 2;\n")]);
  const dirty = compareSnapshots(
    snapshot("snap-before", [file("a.ts", "const a = 1;\n")], { dirty: true }),
    after,
  );
  assert.equal(dirty.baselineDirty, true);
  assert.equal(dirty.files[0].status, "modified");
  const clean = compareSnapshots(snapshot("snap-before", [file("a.ts", "const a = 1;\n")]), after);
  assert.equal(clean.baselineDirty, false);
});

test("excluded, binary, disabled, truncated and redacted content preserves uncertainty", () => {
  const before = snapshot("snap-before", [file("a.ts", "const secret = 1;\n")]);
  const cases: { name: string; file: RepositoryFile; expected: string }[] = [
    {
      name: "excluded",
      file: file("a.ts", null, { status: "excluded", content: content(null, "unavailable") }),
      expected: "excluded",
    },
    {
      name: "binary",
      file: file("a.ts", null, { status: "binary", content: content(null, "unsupported") }),
      expected: "binary",
    },
    {
      name: "disabled",
      file: file("a.ts", null, { status: "present", content: content(null, "disabled") }),
      expected: "disabled",
    },
    {
      name: "truncated",
      file: file("a.ts", "const", { status: "present", content: content("const", "truncated") }),
      expected: "truncated",
    },
    {
      name: "redacted",
      file: file("a.ts", "[REDACTED]", {
        status: "present",
        content: content("[REDACTED]", "redacted"),
      }),
      expected: "redacted",
    },
  ];
  for (const testCase of cases) {
    const comparison = compareSnapshots(before, snapshot("snap-after", [testCase.file]));
    const change = comparison.files[0];
    assert.equal(change.status, "unavailable", testCase.name);
    assert.ok(
      change.uncertainty?.includes(testCase.expected),
      `${testCase.name}: ${change.uncertainty}`,
    );
    const diff = diffFile(change);
    assert.equal(diff.state, "unavailable", testCase.name);
    assert.equal(diff.lines.length, 0, testCase.name);
  }
});

test("fingerprints still compare when the captured text is not complete", () => {
  const before = snapshot("snap-before", [
    file("a.ts", "const secret = 1;\n", { fingerprint: fingerprint("one") }),
  ]);
  const after = snapshot("snap-after", [
    file("a.ts", "const", {
      fingerprint: fingerprint("two"),
      content: content("const", "truncated"),
    }),
  ]);
  const change = compareSnapshots(before, after).files[0];
  assert.equal(change.status, "modified");
  assert.ok(change.uncertainty?.includes("truncated"));
  assert.equal(diffFile(change).state, "unavailable");
});

test("omitted and racy captures never turn missing entries into creates or deletes", () => {
  const before = snapshot("snap-before", [file("a.ts", "one\n"), file("b.ts", "two\n")]);
  const racy = compareSnapshots(
    before,
    snapshot("snap-after", [file("a.ts", "one\n")], {
      omitted: 3,
      state: "racy",
    }),
  );
  const missing = racy.files.find((change) => change.path === "b.ts");
  assert.equal(missing?.status, "unavailable");
  assert.ok(missing?.uncertainty);
  assert.equal(racy.complete, false);
  assert.ok(racy.warnings.some((warning) => warning.includes("omitted 3 files")));
  assert.ok(racy.warnings.some((warning) => warning.includes("racy")));

  const incompleteBaseline = compareSnapshots(
    snapshot("snap-before", [file("a.ts", "one\n")], { omitted: 2 }),
    snapshot("snap-after", [file("a.ts", "one\n"), file("c.ts", "three\n")]),
  );
  const created = incompleteBaseline.files.find((change) => change.path === "c.ts");
  assert.equal(created?.status, "unavailable");
  assert.equal(diffFile(created as (typeof incompleteBaseline.files)[number]).state, "unavailable");
});

test("identical sanitized text suggests a rename only when the pairing is unique", () => {
  const comparison = compareSnapshots(
    snapshot("snap-before", [file("old.ts", "same body\n")]),
    snapshot("snap-after", [file("new.ts", "same body\n")]),
  );
  const change = comparison.files[0];
  assert.equal(change.status, "renamed");
  assert.equal(change.basis, "inferred");
  assert.equal(change.rule, "unique-sanitized-content-rename/v1");
  assert.equal(change.path, "new.ts");
  assert.equal(change.beforePath, "old.ts");
  assert.equal(change.before?.path, "old.ts");
  assert.equal(change.after?.path, "new.ts");
  assert.ok(change.uncertainty);
});

test("ambiguous identical content is not reported as a rename", () => {
  const comparison = compareSnapshots(
    snapshot("snap-before", [file("one.ts", "same body\n"), file("two.ts", "same body\n")]),
    snapshot("snap-after", [file("new.ts", "same body\n")]),
  );
  assert.equal(comparison.files.filter((change) => change.status === "renamed").length, 0);
  assert.deepEqual(comparison.files.map((change) => change.status).sort(), [
    "added",
    "deleted",
    "deleted",
  ]);
  assert.ok(comparison.files.every((change) => change.basis === "derived"));
});

test("unicode, spaces and a leading dash are compared as inert path and text", () => {
  const path = "docs/naïve draft - notes.md";
  const comparison = compareSnapshots(
    snapshot("snap-before", [file(path, "héllo\n")]),
    snapshot("snap-after", [file(path, "héllo wörld\n")]),
  );
  const change = comparison.files[0];
  assert.equal(change.path, path);
  assert.equal(change.status, "modified");
  const diff = diffFile(change);
  assert.equal(diff.state, "available");
  assert.ok(diff.lines.some((line) => line.text.includes("wörld")));
  assert.ok(diff.lines.some((line) => line.text.includes("héllo\n")));

  const dashed = compareSnapshots(
    snapshot("snap-before", [file("-draft.md", "a\n")]),
    snapshot("snap-after", [file("-draft.md", "b\n")]),
  );
  assert.equal(dashed.files[0].path, "-draft.md");
  assert.equal(dashed.files[0].status, "modified");
});

test("a newline-only change stays visible", () => {
  const comparison = compareSnapshots(
    snapshot("snap-before", [file("a.txt", "one\ntwo\n")]),
    snapshot("snap-after", [file("a.txt", "one\ntwo")]),
  );
  const change = comparison.files[0];
  assert.equal(change.status, "modified");
  const diff = diffFile(change);
  assert.equal(diff.state, "available");
  assert.equal(diff.additions, 1);
  assert.equal(diff.deletions, 1);
  assert.ok(diff.lines.some((line) => line.kind === "delete" && line.text === "two\n"));
  assert.ok(diff.lines.some((line) => line.kind === "add" && line.text === "two"));
});

test("diff pages keep line positions, totals and a terminating cursor", () => {
  const beforeText = `${Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n")}\n`;
  const afterText = `${Array.from(
    { length: 10 },
    (_, i) => `line ${i === 5 ? "5 changed" : i}`,
  ).join("\n")}\n`;
  const change = compareSnapshots(
    snapshot("snap-before", [file("a.txt", beforeText)]),
    snapshot("snap-after", [file("a.txt", afterText)]),
  ).files[0];

  const full = diffFile(change);
  assert.equal(full.state, "available");
  assert.equal(full.total, 11);
  assert.equal(full.additions, 1);
  assert.equal(full.deletions, 1);
  const removed = full.lines.find((line) => line.kind === "delete");
  const added = full.lines.find((line) => line.kind === "add");
  assert.equal(removed?.beforeLine, 6);
  assert.equal(removed?.afterLine, null);
  assert.equal(added?.afterLine, 6);
  assert.equal(added?.beforeLine, null);

  const first = diffFile(change, { limit: 2 });
  assert.equal(first.lines.length, 2);
  assert.equal(first.nextCursor, 2);
  assert.equal(first.total, 11);
  const second = diffFile(change, { cursor: first.nextCursor as number, limit: 2 });
  assert.equal(second.lines.length, 2);
  assert.equal(second.nextCursor, 4);
  const last = diffFile(change, { cursor: 10 });
  assert.equal(last.lines.length, 1);
  assert.equal(last.nextCursor, null);
  const past = diffFile(change, { cursor: 99 });
  assert.equal(past.lines.length, 0);
  assert.equal(past.nextCursor, null);
});

test("invalid pagination options fall back to safe bounds", () => {
  const change = compareSnapshots(
    snapshot("snap-before", [file("a.txt", "one\n")]),
    snapshot("snap-after", [file("a.txt", "two\n")]),
  ).files[0];
  const negative = diffFile(change, { cursor: -5 });
  assert.equal(negative.lines.length, 2);
  assert.equal(negative.nextCursor, null);
  const zeroLimit = diffFile(change, { limit: 0 });
  assert.equal(zeroLimit.lines.length, 2);
  const hugeLimit = diffFile(change, { limit: 100000 });
  assert.equal(hugeLimit.lines.length, 2);
});

test("inputs above the hard bounds return a bounded result instead of a fabricated diff", () => {
  const manyLines = `${Array.from({ length: 2001 }, (_, i) => `line ${i}`).join("\n")}\n`;
  const tooManyLines = compareSnapshots(
    snapshot("snap-before", [file("big.txt", manyLines)]),
    snapshot("snap-after", [file("big.txt", `${manyLines}tail\n`)]),
  ).files[0];
  const lineBound = diffFile(tooManyLines);
  assert.equal(lineBound.state, "bounded");
  assert.equal(lineBound.lines.length, 0);
  assert.equal(lineBound.additions, null);
  assert.ok(lineBound.reason);

  const beforeSide = `${Array.from({ length: 2000 }, (_, i) => `before ${i}`).join("\n")}\n`;
  const afterSide = `${Array.from({ length: 2000 }, (_, i) => `after ${i}`).join("\n")}\n`;
  const cellBound = compareSnapshots(
    snapshot("snap-before", [file("big.txt", beforeSide)]),
    snapshot("snap-after", [file("big.txt", afterSide)]),
  ).files[0];
  const cells = diffFile(cellBound);
  assert.equal(cells.state, "bounded");
  assert.equal(cells.lines.length, 0);
  assert.equal(cells.total, null);
});

test("added and deleted files diff against an empty side only when absence was established", () => {
  const comparison = compareSnapshots(
    snapshot("snap-before", [file("gone.ts", "removed body\n")]),
    snapshot("snap-after", [file("new.ts", "added body\n")]),
  );
  const added = comparison.files.find((change) => change.status === "added");
  const deleted = comparison.files.find((change) => change.status === "deleted");
  assert.ok(added && deleted);
  const addedDiff = diffFile(added);
  assert.equal(addedDiff.state, "available");
  assert.equal(addedDiff.additions, 1);
  assert.equal(addedDiff.deletions, 0);
  const deletedDiff = diffFile(deleted);
  assert.equal(deletedDiff.state, "available");
  assert.equal(deletedDiff.deletions, 1);
  assert.equal(deletedDiff.additions, 0);
});

test("duplicate sanitized paths keep every entry and stay attributable", () => {
  const comparison = compareSnapshots(
    snapshot("snap-before", [file("redacted.ts", "one\n"), file("redacted.ts", "two\n")]),
    snapshot("snap-after", [file("redacted.ts", "one\n")]),
  );
  assert.equal(comparison.files.length, 2);
  assert.equal(new Set(comparison.files.map((change) => change.id)).size, 2);
  assert.deepEqual(comparison.files.map((change) => change.before?.content.text).sort(), [
    "one\n",
    "two\n",
  ]);
  assert.ok(
    comparison.files.every((change) => change.uncertainty?.includes("Duplicate sanitized path")),
  );
  assert.ok(comparison.files.some((change) => change.status === "unavailable"));
  assert.equal(comparison.complete, false);
});

test("the union hard cap reports the omitted path count", () => {
  const beforeFiles = Array.from({ length: 1001 }, (_, i) => file(`src/b${i}.ts`, "b\n"));
  const afterFiles = Array.from({ length: 1001 }, (_, i) => file(`src/a${i}.ts`, "a\n"));
  const comparison = compareSnapshots(
    snapshot("snap-before", beforeFiles),
    snapshot("snap-after", afterFiles),
  );
  assert.equal(comparison.files.length, 2000);
  assert.equal(comparison.omitted, 2);
  assert.equal(comparison.complete, false);
  assert.ok(comparison.warnings.some((warning) => warning.includes("2 paths were omitted")));
});

test("change ids are deterministic and change with the compared snapshot ids", () => {
  const first = compareSnapshots(
    snapshot("snap-before", [file("a.ts", "one\n")]),
    snapshot("snap-after", [file("a.ts", "two\n")]),
  ).files[0];
  const again = compareSnapshots(
    snapshot("snap-before", [file("a.ts", "one\n")]),
    snapshot("snap-after", [file("a.ts", "two\n")]),
  ).files[0];
  const other = compareSnapshots(
    snapshot("snap-before-2", [file("a.ts", "one\n")]),
    snapshot("snap-after", [file("a.ts", "two\n")]),
  ).files[0];
  assert.equal(first.id, again.id);
  assert.notEqual(first.id, other.id);
});

test("contradictory fingerprints and redaction collisions do not establish a file diff", () => {
  const inconsistent = compareSnapshots(
    snapshot("snap-before", [file("a.ts", "one\n", { fingerprint: "a".repeat(64) })]),
    snapshot("snap-after", [file("a.ts", "two\n", { fingerprint: "a".repeat(64) })]),
  );
  assert.equal(inconsistent.files[0].status, "unavailable");
  assert.equal(diffFile(inconsistent.files[0]).state, "unavailable");
  assert.equal(inconsistent.complete, false);
  const collision = compareSnapshots(
    snapshot("snap-before", [file("[REDACTED].ts", "one\n"), file("[REDACTED].ts", "two\n")]),
    snapshot("snap-after", [file("[REDACTED].ts", "changed\n"), file("[REDACTED].ts", "two\n")]),
  );
  assert.ok(collision.files.every((change) => change.status === "unavailable"));
});

test("added partial content keeps an explicit limitation on comparison coverage", () => {
  const comparison = compareSnapshots(
    snapshot("snap-before", []),
    snapshot("snap-after", [
      file("a.ts", "[REDACTED]", { content: content("[REDACTED]", "redacted") }),
    ]),
  );
  assert.equal(comparison.files[0].status, "added");
  assert.match(comparison.files[0].uncertainty ?? "", /redacted/);
  assert.equal(comparison.complete, false);
  assert.equal(diffFile(comparison.files[0]).state, "unavailable");
});
