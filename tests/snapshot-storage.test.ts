import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultPolicy } from "../packages/schema/src/index";
import type { RepositorySnapshot } from "../packages/schema/src/repository";
import { Store } from "../packages/storage/src/index";

function snapshot(id = "snap_fixture"): RepositorySnapshot {
  return {
    id,
    capturedAt: "2026-10-22T00:00:00.000Z",
    head: null,
    indexIdentity: null,
    state: "observed",
    dirty: true,
    omitted: 0,
    warnings: ["Working-tree observations are not atomic."],
    files: [
      {
        path: "src/example.ts",
        tracked: true,
        staged: false,
        status: "present",
        fingerprint: null,
        content: {
          text: "export const value = 1;",
          state: "present",
          originalBytes: null,
          categories: ["code"],
        },
      },
    ],
  };
}
test("snapshot and primary observation commit together, remain scoped and preserve dirty baseline", () => {
  const store = new Store(":memory:");
  store.registerProject("repo", "Example", false, { ...defaultPolicy, code: true });
  store.registerProject("other", "Other");
  store.registerRepository("repo", "/temporary/registered-root", false);
  assert.equal(store.repository("repo")?.includeUntracked, false);
  assert.throws(() => store.registerRepository("repo", "/another-root", false));
  const saved = store.appendSnapshot("repo", "manual", snapshot(), "baseline");
  assert.equal(saved.dirty, true);
  assert.equal(saved.reason, "baseline");
  assert.equal(store.allEvents("repo", "manual")[0].payload.kind, "repository_snapshot");
  assert.equal(store.snapshots("repo", "manual").length, 1);
  assert.equal(store.snapshot("other", saved.id), null);
  assert.equal(store.sessions("repo")[0].title, "Repository review");
  assert.throws(() => store.appendSnapshot("repo", "manual", snapshot(), "checkpoint"));
  assert.equal(store.allEvents("repo", "manual").length, 1);
  store.close();
});
test("snapshot persistence reapplies policy and redaction and recomputes sanitized fingerprints", () => {
  const store = new Store(":memory:");
  store.registerProject("disabled", "Metadata only");
  store.registerProject("enabled", "Code enabled", false, { ...defaultPolicy, code: true });
  const input = snapshot();
  input.files[0].content.text = `const token = "${"ghp_"}${"syntheticCanaryOnly12345"}";`;
  input.files[0].fingerprint = "a".repeat(64);
  const disabled = store.appendSnapshot("disabled", "review", input, "baseline");
  assert.equal(disabled.files[0].content.text, null);
  assert.equal(disabled.files[0].fingerprint, null);
  assert.equal(disabled.files[0].content.state, "disabled");
  const enabled = store.appendSnapshot("enabled", "review", input, "baseline");
  assert.match(enabled.files[0].content.text ?? "", /REDACTED/);
  assert.notEqual(enabled.files[0].fingerprint, "a".repeat(64));
  assert.equal(enabled.files[0].content.state, "redacted");
  store.close();
});
test("snapshot quota failures and event-validation failures roll back both records", () => {
  const store = new Store(":memory:", { maxEvents: 1, maxBytes: 4096 });
  store.registerProject("repo", "Example", false, { ...defaultPolicy, code: true });
  store.appendSnapshot("repo", "manual", snapshot(), "baseline");
  assert.throws(() => store.appendSnapshot("repo", "manual", snapshot("snap_next"), "checkpoint"));
  assert.equal(store.snapshots("repo", "manual").length, 1);
  assert.equal(store.allEvents("repo", "manual").length, 1);
  assert.throws(() => store.appendSnapshot("repo", "../unsafe", snapshot("snap_bad"), "baseline"));
  assert.equal(store.snapshot("repo", "snap_bad"), null);
  const large = snapshot("snap_large");
  large.files[0].content.text = "a".repeat(5000);
  assert.throws(() => store.appendSnapshot("repo", "manual", large, "checkpoint"));
  assert.equal(store.snapshot("repo", "snap_large"), null);
  store.close();
});

test("snapshot summary paging exposes provenance and counts without code or registered roots", () => {
  const store = new Store(":memory:");
  store.registerProject("repo", "Example", false, { ...defaultPolicy, code: true });
  store.registerProject("other", "Other", false, { ...defaultPolicy, code: true });
  store.registerRepository("repo", "/private/absolute-root", false);
  store.appendSnapshot("repo", "review", snapshot("snap_before"), "baseline");
  store.appendSnapshot("other", "review", snapshot("snap_other"), "baseline");
  store.appendSnapshot("repo", "review", snapshot("snap_after"), "checkpoint");
  const first = store.snapshotSummaries("repo", "review", 0, 1);
  assert.equal(first.total, 2);
  assert.equal(first.snapshots[0].fileCount, 1);
  assert.equal(first.snapshots[0].warningCount, 1);
  assert.equal(first.snapshots[0].reason, "baseline");
  assert.equal(JSON.stringify(first).includes("export const"), false);
  assert.equal(JSON.stringify(first).includes("absolute-root"), false);
  assert.ok(first.nextCursor);
  const next = store.snapshotSummaries("repo", "review", first.nextCursor, 1);
  assert.equal(next.snapshots[0].id, "snap_after");
  assert.equal(next.nextCursor, null);
  const latest = store.snapshotSummaries("repo", "review", 0, 1, true);
  assert.equal(latest.snapshots[0].id, "snap_after");
  assert.ok(latest.nextCursor);
  const older = store.snapshotSummaries("repo", "review", latest.nextCursor, 1, true);
  assert.equal(older.snapshots[0].id, "snap_before");
  assert.equal(older.nextCursor, null);
  assert.equal(store.snapshotSummaries("repo", "missing").total, 0);
  assert.throws(() => store.snapshotSummaries("repo", "review", -1));
  store.close();
});

test("artifact writes share the project body quota and release failed transactions", () => {
  const store = new Store(":memory:", { maxEvents: 100, maxBytes: 1024 });
  store.registerProject("repo", "Example", false, { ...defaultPolicy, code: true });
  store.artifact("repo", "first", "x".repeat(600));
  assert.throws(() => store.artifact("repo", "over-capacity", "y".repeat(600)));
  store.artifact("repo", "small", "retained");
  store.close();
});
