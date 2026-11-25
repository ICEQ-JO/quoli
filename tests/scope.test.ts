import assert from "node:assert/strict";
import { test } from "node:test";
import type { SyncStatus } from "../shared/model.ts";
import { sharingLabel } from "../web/src/scope.ts";

test("local scope labels distinguish loading, unlinked, paused, pending and failed sync", () => {
  const status: SyncStatus = {
    enabled: false,
    available: true,
    hasKey: false,
    since: null,
    lastSyncAt: null,
    lastError: null,
    sent: 0,
  };
  assert.equal(sharingLabel(null), "Checking team sharing…");
  assert.equal(sharingLabel(status, true), "Sync status unavailable");
  assert.equal(sharingLabel(status), "Team not linked");
  assert.equal(sharingLabel({ ...status, hasKey: true }), "Team sharing paused");
  assert.equal(sharingLabel({ ...status, hasKey: true, enabled: true }), "Summary sync pending");
  assert.equal(
    sharingLabel({ ...status, hasKey: true, enabled: true, lastError: "offline" }),
    "Summary sync needs attention",
  );
  assert.equal(
    sharingLabel({ ...status, hasKey: true, enabled: true, lastSyncAt: "2026-11-15T00:00:00Z" }),
    "Sharing summaries with team",
  );
  assert.equal(sharingLabel({ ...status, available: false }), "Team sharing unavailable");
});
