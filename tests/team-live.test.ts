import assert from "node:assert/strict";
import { test } from "node:test";
import { type LiveRow, overlaps } from "../web/src/class/live.ts";

const row = (user: string, repo: string | null, branch: string | null): LiveRow => ({
  user_id: user,
  member: user,
  agent: "claude-code",
  model: null,
  repo,
  branch,
  started_at: "2026-11-15T10:00:00Z",
  updated_at: "2026-11-15T10:05:00Z",
  usd: null,
  calls: 0,
  failures: 0,
});

test("overlap: different members on one repository, same branch first", () => {
  const out = overlaps([
    row("ana", "acme/api", "feat/a"),
    row("bo", "acme/api", "feat/b"),
    row("ana", "acme/shop", "main"),
    row("bo", "acme/shop", "main"),
    row("cy", "acme/shop", "x"),
    row("ana", "acme/solo", "main"),
    row("ana", "acme/solo", "main"),
    row("bo", null, null),
  ]);
  assert.deepEqual(out, [
    { repo: "acme/shop", branch: "main", members: ["ana", "bo"] },
    { repo: "acme/api", branch: null, members: ["ana", "bo"] },
  ]);
});
