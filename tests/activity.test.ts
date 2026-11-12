import assert from "node:assert/strict";
import { test } from "node:test";
import { activityOf, type SummaryRow } from "../web/src/class/activity.ts";

const row = (p: Partial<SummaryRow>): SummaryRow => ({
  session_id: "s",
  agent: "claude-code",
  model: "claude-opus-5-5",
  repo: "me/app",
  branch: "main",
  started_at: new Date(2026, 10, 13, 10).toISOString(),
  duration_ms: 60_000,
  input_tokens: 100,
  output_tokens: 50,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  usd: 0.5,
  calls: 4,
  failures: 0,
  ...p,
});

test("activity totals, per-day spend and breakdowns cover only the range", () => {
  const now = new Date(2026, 10, 13, 18);
  const rows = [
    row({ session_id: "a" }),
    row({ session_id: "b", usd: "0.25", failures: 1, duration_ms: null }),
    // An unpriced OpenCode session still counts its tokens and time.
    row({ session_id: "c", agent: "opencode", model: "new-model", usd: null, repo: null }),
    row({ session_id: "d", started_at: new Date(2026, 10, 11, 9).toISOString(), usd: 1 }),
    // Outside a 7-day range.
    row({ session_id: "old", started_at: new Date(2026, 10, 1, 9).toISOString(), usd: 9 }),
  ];
  const a = activityOf(rows, 7, now);
  assert.equal(a.sessions, 4);
  assert.equal(a.usd, 1.75);
  assert.equal(a.unpriced, 1);
  assert.equal(a.ms, 180_000, "a live session (no duration) adds no time");
  assert.equal(a.calls, 16);
  assert.equal(a.failures, 1);
  assert.equal(a.tokens.input, 400);
  assert.equal(a.days.length, 7);
  assert.equal(a.days[6].date, "2026-11-13");
  assert.equal(a.days[6].usd, 0.75);
  assert.equal(a.days[4].usd, 1);
  assert.equal(a.days[0].usd, null);
  assert.deepEqual(
    a.agents.map((g) => [g.label, g.sessions, g.usd]),
    [
      ["Claude Code", 3, 1.75],
      ["OpenCode", 1, null],
    ],
  );
  assert.deepEqual(
    a.repos.map((g) => g.label),
    ["me/app", "No repository"],
  );
  assert.equal(a.models[1].label, "new-model");

  const empty = activityOf([], 30, now);
  assert.equal(empty.sessions, 0);
  assert.equal(empty.usd, null);
  assert.equal(empty.days.length, 30);
});
