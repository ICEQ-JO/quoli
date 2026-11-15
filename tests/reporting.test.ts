import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "../server/db.ts";
import { insightsReport } from "../server/insights.ts";
import { usageReport } from "../server/usage.ts";
import { reportingDay, validZone } from "../shared/reporting.ts";
import { filterQuery, matchesSessionDay, sessionFilters } from "../web/src/session-filters.ts";

test("reporting-day links ignore browser zone, including DST repeated hours and midnight", () => {
  for (const iso of ["2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z"]) {
    assert.equal(reportingDay(iso, "America/Los_Angeles"), "2026-11-01");
  }
  const startedAt = "2026-03-09T06:30:00Z";
  assert.equal(reportingDay(startedAt, "UTC"), "2026-03-09");
  assert.equal(reportingDay(startedAt, "America/Los_Angeles"), "2026-03-08");
  assert.ok(matchesSessionDay({ startedAt }, "2026-03-08", "America/Los_Angeles"));
  assert.ok(!matchesSessionDay({ startedAt }, "2026-03-09", "America/Los_Angeles"));
  assert.equal(validZone("nonsense"), false);
});

test("calendar ranges stay exactly 30 days across spring and fall DST", () => {
  const before = process.env.TZ;
  process.env.TZ = "America/New_York";
  const store = new Store(":memory:");
  try {
    for (const now of [new Date(2026, 2, 12, 12), new Date(2026, 10, 3, 12)]) {
      const usage = usageReport(store, 30, () => [], now);
      const trends = insightsReport([], 30, now);
      assert.equal(usage.days.length, 30);
      assert.equal(trends.days.length, 30);
      assert.equal(usage.timeZone, "America/New_York");
      assert.deepEqual(
        usage.days.map((d) => d.date),
        trends.days.map((d) => d.date),
      );
    }
  } finally {
    store.db.close();
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test("session filters round-trip and changing one filter preserves the others", () => {
  let query = "";
  for (const [key, value] of Object.entries({
    q: "fix title & branch",
    project: "p1",
    agent: "codex",
    status: "ended",
    day: "2026-11-01",
    zone: "America/Los_Angeles",
    model: "m",
    failed: true,
    loops: true,
  }))
    query = filterQuery(query, key, value);
  const parsed = sessionFilters(query);
  assert.deepEqual(parsed, {
    query: "fix title & branch",
    project: "p1",
    agent: "codex",
    status: "ended",
    day: "2026-11-01",
    zone: "America/Los_Angeles",
    model: "m",
    failedOnly: true,
    loopsOnly: true,
  });
  assert.equal(sessionFilters(filterQuery(query, "day", "")).day, "");
  assert.equal(sessionFilters(filterQuery(query, "day", "")).project, "p1");
  assert.equal(sessionFilters("?agent=bad&zone=bad&day=bad").agent, "");
  assert.equal(sessionFilters("?agent=bad&zone=bad&day=bad").zone, "");
});
