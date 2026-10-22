import assert from "node:assert/strict";
import { test } from "node:test";
import { readChanges } from "../apps/collector/src/changes";
import { defaultPolicy } from "../packages/schema/src/index";
import type { RepositorySnapshot } from "../packages/schema/src/repository";
import { Store } from "../packages/storage/src/index";

function snapshot(id: string, text: string): RepositorySnapshot {
  return {
    id,
    capturedAt: "2026-10-22T00:00:00.000Z",
    head: null,
    indexIdentity: null,
    state: "observed",
    dirty: true,
    omitted: 0,
    warnings: [],
    files: [
      {
        path: "src/example.ts",
        tracked: true,
        staged: false,
        status: "present",
        fingerprint: null,
        content: { text, state: "present", originalBytes: null, categories: ["code"] },
      },
    ],
  };
}
const query = { beforeId: "snap_before", afterId: "snap_after", status: "changed" };
test("change lists are bounded projections with source provenance and no file body", () => {
  const store = new Store(":memory:");
  store.registerProject("repo", "Example", false, { ...defaultPolicy, code: true });
  store.appendSnapshot(
    "repo",
    "review",
    snapshot("snap_before", "export const value = 1;\n"),
    "baseline",
  );
  store.appendSnapshot(
    "repo",
    "review",
    snapshot("snap_after", "export const value = 2;\n"),
    "checkpoint",
  );
  const result = readChanges(store, "repo", "review", query);
  assert.equal(result.status, 200);
  const data = result.data as {
    files: { id: string; status: string }[];
    evidenceIds: string[];
    total: number;
    baselineDirty: boolean;
  };
  assert.equal(data.files[0].status, "modified");
  assert.equal(data.baselineDirty, true);
  assert.equal(data.evidenceIds.length, 2);
  assert.equal(JSON.stringify(data).includes("export const"), false);
  const selected = readChanges(store, "repo", "review", {
    ...query,
    fileId: data.files[0].id,
    limit: 1,
  });
  assert.equal(selected.status, 200);
  const detail = selected.data as {
    diff: { lines: { text: string }[]; nextCursor: number | null };
    beforeContent: { text: string };
    afterContent: { text: string };
  };
  assert.equal(detail.diff.lines.length, 1);
  assert.ok(detail.diff.nextCursor);
  assert.match(detail.beforeContent.text, /value = 1/);
  assert.match(detail.afterContent.text, /value = 2/);
  store.close();
});
test("snapshot and file identities cannot escape the project/session/pair scope", () => {
  const store = new Store(":memory:");
  store.registerProject("repo", "Example", false, { ...defaultPolicy, code: true });
  store.registerProject("other", "Other", false, { ...defaultPolicy, code: true });
  store.appendSnapshot("repo", "review", snapshot("snap_before", "one\n"), "baseline");
  store.appendSnapshot("repo", "review", snapshot("snap_after", "two\n"), "checkpoint");
  store.appendSnapshot(
    "other",
    "review",
    snapshot("snap_private", "private fixture\n"),
    "baseline",
  );
  assert.equal(
    readChanges(store, "repo", "review", { ...query, beforeId: "snap_private" }).status,
    404,
  );
  assert.equal(readChanges(store, "repo", "another-review", query).status, 404);
  assert.equal(readChanges(store, "other", "review", query).status, 404);
  assert.equal(
    readChanges(store, "repo", "review", { ...query, beforeId: "snap_after" }).status,
    400,
  );
  assert.equal(readChanges(store, "repo", "review", { ...query, fileId: "unknown" }).status, 404);
  assert.throws(() => readChanges(store, "repo", "review", { ...query, execute: "inert" }));
  store.close();
});
test("a missing baseline and disabled capture stay unavailable without fabricated changes", () => {
  const store = new Store(":memory:");
  store.registerProject("repo", "Example");
  store.appendSnapshot("repo", "review", snapshot("snap_before", "one\n"), "baseline");
  store.appendSnapshot("repo", "review", snapshot("snap_after", "two\n"), "checkpoint");
  const missing = readChanges(store, "repo", "review", { ...query, beforeId: null }).data as {
    files: { status: string }[];
    complete: boolean;
  };
  assert.equal(missing.complete, false);
  assert.equal(missing.files[0].status, "unavailable");
  const incomplete = readChanges(store, "repo", "review", query).data as {
    files: { id: string; status: string }[];
  };
  assert.equal(incomplete.files[0].status, "unavailable");
  const selected = readChanges(store, "repo", "review", {
    ...query,
    fileId: incomplete.files[0].id,
  }).data as { diff: { state: string }; beforeContent: { text: string | null } };
  assert.equal(selected.diff.state, "unavailable");
  assert.equal(selected.beforeContent.text, null);
  store.close();
});
