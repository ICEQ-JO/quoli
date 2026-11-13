import assert from "node:assert/strict";
import { test } from "node:test";
import { insightsReport, mainModel, percentile, sessionMs } from "../server/insights.ts";
import type { SessionDetail, ToolCall, ToolCategory } from "../shared/model.ts";

// Local-time dates, so day bucketing is checked in the server's own time zone.
const at = (day: number, h = 12, m = 0) => new Date(2026, 10, day, h, m).toISOString();
const NOW = new Date(2026, 10, 12, 18, 0);

let n = 0;
function session(o: {
  day: number;
  h?: number;
  minutes?: number;
  usd?: number | null;
  unpriced?: string[];
  agent?: SessionDetail["agent"];
  calls?: [ToolCategory, "ok" | "failed"][];
  usage?: [string | null, number][];
  loops?: number;
  live?: boolean;
}): SessionDetail {
  const id = `s${n++}`;
  const startedAt = at(o.day, o.h ?? 12);
  const end = new Date(Date.parse(startedAt) + (o.minutes ?? 1) * 60_000).toISOString();
  const toolCalls: ToolCall[] = (o.calls ?? []).map(([category, status], i) => ({
    id: `${id}c${i}`,
    agentId: "main",
    name: category,
    category,
    startedAt,
    endedAt: startedAt,
    status,
    summary: "",
    files: [],
    input: {},
    output: null,
  }));
  const usage = (o.usage ?? []).map(([model, input]) => ({
    at: startedAt,
    agentId: "main",
    model,
    tokens: { input, output: 0, cacheRead: 0, cacheWrite: 0 },
  }));
  return {
    id,
    agent: o.agent ?? "claude-code",
    agentVersion: null,
    projectId: "p",
    root: "/r",
    title: id,
    branch: null,
    startedAt,
    endedAt: o.live ? null : end,
    lastAt: end,
    live: !!o.live,
    toolCount: toolCalls.length,
    filesTouched: 0,
    failures: toolCalls.filter((c) => c.status === "failed").length,
    loops: o.loops ?? 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    models: [...new Set(usage.map((u) => u.model).filter((m): m is string => !!m))],
    cost: { usd: o.usd === undefined ? 1 : o.usd, unpriced: o.unpriced ?? [] },
    trace: "",
    agents: [],
    turns: [],
    toolCalls,
    files: {},
    usage,
    report: {} as SessionDetail["report"],
  };
}

test("percentile uses the nearest rank", () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([5], 0.9), 5);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
});

test("sessions are bucketed by the local day they started, inside the range only", () => {
  const r = insightsReport(
    [
      session({ day: 12, h: 0 }), // just after local midnight: today
      session({ day: 11, h: 23 }),
      session({ day: 6 }), // the first day of a 7-day range
      session({ day: 5 }), // before it
    ],
    7,
    NOW,
  );
  assert.deepEqual(
    r.days.map((d) => [d.date, d.sessions]),
    [
      ["2026-11-06", 1],
      ["2026-11-07", 0],
      ["2026-11-08", 0],
      ["2026-11-09", 0],
      ["2026-11-10", 0],
      ["2026-11-11", 1],
      ["2026-11-12", 1],
    ],
  );
  assert.equal(r.total.sessions, 3);
});

test("unknown or partial costs are counted separately, never as $0", () => {
  const r = insightsReport(
    [
      session({ day: 12, usd: 2 }),
      session({ day: 12, usd: 4 }),
      session({ day: 12, usd: null }), // nothing priced
      session({ day: 12, usd: 1, unpriced: ["mystery"] }), // partly priced
    ],
    1,
    NOW,
  );
  const [today] = r.days;
  assert.deepEqual(
    [today.sessions, today.unpricedSessions, today.medianUsd, today.p90Usd],
    [4, 2, 2, 4],
  );
  assert.equal(r.total.unpricedSessions, 2);
  const none = insightsReport([session({ day: 12, usd: null })], 1, NOW);
  assert.equal(none.total.medianUsd, null);
});

test("failure rates, tool mix, loops and groups by agent and main model", () => {
  const r = insightsReport(
    [
      session({
        day: 12,
        agent: "codex",
        calls: [
          ["run", "failed"],
          ["run", "ok"],
          ["read", "ok"],
        ],
        usage: [
          ["gpt-5", 10],
          ["gpt-5-mini", 50],
        ],
        loops: 2,
      }),
      session({ day: 12, calls: [["edit", "ok"]], usage: [["claude-opus-5-5", 5]] }),
    ],
    1,
    NOW,
  );
  const [today] = r.days;
  assert.deepEqual([today.calls, today.failures, today.loops], [4, 1, 2]);
  assert.deepEqual([today.mix.run, today.mix.read, today.mix.edit, today.mix.web], [2, 1, 1, 0]);
  assert.equal(r.total.sessionsWithLoops, 1);
  assert.deepEqual(
    r.byAgent.map((g) => [g.label, g.calls, g.failures]),
    [
      ["Codex", 3, 1],
      ["Claude Code", 1, 0],
    ],
  );
  assert.deepEqual(r.byModel.map((g) => g.key).sort(), ["claude-opus-5-5", "gpt-5-mini"]);
  assert.deepEqual(r.models, ["claude-opus-5-5", "gpt-5", "gpt-5-mini"]);

  // Filters narrow the sessions but keep every model in range for the picker.
  const codex = insightsReport([session({ day: 12 })], 1, NOW, { agent: "codex" });
  assert.equal(codex.total.sessions, 0);
  const byModel = insightsReport(
    [session({ day: 12, usage: [["gpt-5", 1]] }), session({ day: 12, usage: [["x", 1]] })],
    1,
    NOW,
    { model: "gpt-5" },
  );
  assert.deepEqual([byModel.total.sessions, byModel.models], [1, ["gpt-5", "x"]]);
});

test("durations run to the last recorded activity; live sessions have none yet", () => {
  const ended = session({ day: 12, minutes: 3 });
  assert.equal(sessionMs(ended), 180_000);
  assert.equal(sessionMs(session({ day: 12, live: true })), null);
  // No end event: the last usage row ends it.
  const quiet = session({ day: 12, usage: [["m", 1]] });
  quiet.endedAt = null;
  quiet.usage[0].at = new Date(Date.parse(quiet.startedAt) + 90_000).toISOString();
  assert.equal(sessionMs(quiet), 90_000);
  const r = insightsReport(
    [ended, session({ day: 12, minutes: 0.5 }), session({ day: 12, minutes: 90 })],
    1,
    NOW,
  );
  assert.deepEqual(
    r.durations.map((d) => d.sessions),
    [1, 1, 0, 0, 1],
  );
  assert.equal(r.total.medianMs, 180_000);
  assert.equal(mainModel(session({ day: 12 })), null);
});
