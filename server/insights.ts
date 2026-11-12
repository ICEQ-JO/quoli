import {
  AGENT_NAMES,
  CATEGORY_ORDER,
  type InsightsGroup,
  type InsightsReport,
  type SessionDetail,
  type ToolCategory,
} from "../shared/model.ts";
import { lastActivityAt } from "./steps.ts";
import { localDate } from "./usage.ts";

const DAY = 86_400_000;

/** Nearest-rank percentile of an ascending list; null when it is empty. */
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);
const ms = (iso: string) => Date.parse(iso);

/** A session's cost when every model it used has a price; partial or unknown costs are null. */
export const knownUsd = (d: SessionDetail) => (d.cost.unpriced.length ? null : d.cost.usd);

/**
 * From the first event to the last recorded activity. Live sessions are still running, so they
 * have no duration yet.
 */
export function sessionMs(d: SessionDetail): number | null {
  if (d.live) return null;
  const hit = lengths.get(d);
  if (hit !== undefined) return hit;
  const length = Math.max(0, ms(lastActivityAt(d)) - ms(d.startedAt));
  lengths.set(d, length);
  return length;
}
const lengths = new WeakMap<SessionDetail, number>();

/** The model that used the most tokens in the session, or null when none was reported. */
export function mainModel(d: SessionDetail): string | null {
  const totals = new Map<string, number>();
  for (const u of d.usage) {
    if (!u.model) continue;
    const t = u.tokens;
    totals.set(
      u.model,
      (totals.get(u.model) ?? 0) + t.input + t.output + t.cacheRead + t.cacheWrite,
    );
  }
  return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export const DURATION_BUCKETS = [
  { label: "Under 1 min", maxMs: 60_000 },
  { label: "1–5 min", maxMs: 5 * 60_000 },
  { label: "5–15 min", maxMs: 15 * 60_000 },
  { label: "15–60 min", maxMs: 60 * 60_000 },
  { label: "Over 1 hour", maxMs: null },
] as const;

const emptyMix = () =>
  Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<ToolCategory, number>;

function group(key: string, label: string, list: SessionDetail[]): InsightsGroup {
  const calls = list.reduce((n, d) => n + d.toolCalls.length, 0);
  const costs = asc(list.map(knownUsd).filter((u): u is number => u !== null));
  const durations = asc(list.map(sessionMs).filter((m): m is number => m !== null));
  return {
    key,
    label,
    sessions: list.length,
    calls,
    failures: list.reduce((n, d) => n + d.failures, 0),
    loops: list.reduce((n, d) => n + d.loops, 0),
    medianUsd: percentile(costs, 0.5),
    medianMs: percentile(durations, 0.5),
  };
}

function groupBy(list: SessionDetail[], keyOf: (d: SessionDetail) => string) {
  const m = new Map<string, SessionDetail[]>();
  for (const d of list) {
    const k = keyOf(d);
    const g = m.get(k);
    if (g) g.push(d);
    else m.set(k, [d]);
  }
  return m;
}

export interface InsightsFilter {
  projectId?: string | null;
  agent?: string | null;
  model?: string | null;
}

/**
 * Trends over the sessions that started in the last `days` local calendar days. Everything is
 * derived from the sessions' recorded calls and usage, bucketed by the day each session started.
 * Costs are per session and only counted when every model it used has a price.
 */
export function insightsReport(
  sessions: SessionDetail[],
  days: number,
  now = new Date(),
  filter: InsightsFilter = {},
): InsightsReport {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (days - 1) * DAY);
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const inRange = sessions.filter((d) => d.startedAt >= startIso);
  const models = [...new Set(inRange.flatMap((d) => d.models))].sort();
  const list = inRange.filter(
    (d) =>
      (!filter.projectId || d.projectId === filter.projectId) &&
      (!filter.agent || d.agent === filter.agent) &&
      (!filter.model || d.models.includes(filter.model)),
  );

  const byDay = new Map<string, SessionDetail[]>();
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) byDay.set(localDate(d), []);
  for (const d of list) byDay.get(localDate(d.startedAt))?.push(d);

  const durations = asc(list.map(sessionMs).filter((m): m is number => m !== null));
  const costs = asc(list.map(knownUsd).filter((u): u is number => u !== null));
  const all = group("all", "All", list);

  return {
    days: [...byDay].map(([date, ds]) => {
      const c = asc(ds.map(knownUsd).filter((u): u is number => u !== null));
      const mix = emptyMix();
      for (const d of ds) for (const call of d.toolCalls) mix[call.category]++;
      return {
        date,
        sessions: ds.length,
        unpricedSessions: ds.length - c.length,
        medianUsd: percentile(c, 0.5),
        p90Usd: percentile(c, 0.9),
        calls: ds.reduce((n, d) => n + d.toolCalls.length, 0),
        failures: ds.reduce((n, d) => n + d.failures, 0),
        loops: ds.reduce((n, d) => n + d.loops, 0),
        mix,
      };
    }),
    total: {
      sessions: list.length,
      calls: all.calls,
      failures: all.failures,
      loops: all.loops,
      sessionsWithLoops: list.filter((d) => d.loops > 0).length,
      unpricedSessions: list.length - costs.length,
      medianUsd: percentile(costs, 0.5),
      p90Usd: percentile(costs, 0.9),
      medianMs: percentile(durations, 0.5),
      p90Ms: percentile(durations, 0.9),
    },
    durations: DURATION_BUCKETS.map((b, i) => {
      const min = i ? (DURATION_BUCKETS[i - 1].maxMs as number) : 0;
      return {
        label: b.label,
        sessions: durations.filter((m) => m >= min && (b.maxMs === null || m < b.maxMs)).length,
      };
    }),
    byAgent: [...groupBy(list, (d) => d.agent)]
      .map(([k, ds]) => group(k, AGENT_NAMES[k as keyof typeof AGENT_NAMES] ?? k, ds))
      .sort((a, b) => b.sessions - a.sessions),
    byModel: [...groupBy(list, (d) => mainModel(d) ?? "")]
      .map(([k, ds]) => group(k, k || "No model reported", ds))
      .sort((a, b) => b.sessions - a.sessions),
    models,
    extensions: extensionTotals(list),
  };
}

function extensionTotals(list: SessionDetail[]): InsightsReport["extensions"] {
  const m = new Map<string, InsightsReport["extensions"][number]>();
  for (const d of list) {
    for (const e of d.report?.extensions ?? []) {
      const key = `${e.kind}\0${e.plugin ?? ""}\0${e.name}`;
      const x = m.get(key) ?? {
        kind: e.kind,
        name: e.name,
        plugin: e.plugin,
        sessions: 0,
        calls: 0,
        failures: 0,
      };
      x.sessions++;
      x.calls += e.calls;
      x.failures += e.failures;
      m.set(key, x);
    }
  }
  return [...m.values()]
    .sort((a, b) => b.calls - a.calls || b.sessions - a.sessions || a.name.localeCompare(b.name))
    .slice(0, 20);
}
