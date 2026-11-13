import type { AgentKind, TokenTotals, UsageDay } from "../../../shared/model.ts";
import { AGENT_NAMES } from "../../../shared/model.ts";

/** One uploaded session summary (public.session_summaries), as the account page reads it. */
export interface SummaryRow {
  session_id: string;
  agent: AgentKind;
  model: string | null;
  repo: string | null;
  branch: string | null;
  started_at: string;
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd: number | string | null;
  calls: number;
  failures: number;
}

export interface ActivityGroup {
  key: string;
  label: string;
  sessions: number;
  ms: number;
  tokens: number;
  /** Sum of priced sessions; null when none of the group's sessions had a price. */
  usd: number | null;
}

export interface Activity {
  sessions: number;
  /** Agent time: the sum of finished sessions' durations. */
  ms: number;
  tokens: TokenTotals;
  usd: number | null;
  /** Sessions with tokens but no price (an unknown model). */
  unpriced: number;
  calls: number;
  failures: number;
  /** One entry per local day of the range, oldest first, for the spend chart. */
  days: UsageDay[];
  agents: ActivityGroup[];
  repos: ActivityGroup[];
  models: ActivityGroup[];
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const tokensOf = (r: SummaryRow): TokenTotals => ({
  input: Number(r.input_tokens) || 0,
  output: Number(r.output_tokens) || 0,
  cacheRead: Number(r.cache_read_tokens) || 0,
  cacheWrite: Number(r.cache_write_tokens) || 0,
});
const sum = (t: TokenTotals) => t.input + t.output + t.cacheRead + t.cacheWrite;
const priceOf = (r: SummaryRow) => (r.usd === null || r.usd === "" ? null : Number(r.usd));
const addUsd = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

/**
 * Totals, a per-day series and breakdowns for the last `days` local days (today included).
 * Derived from the summaries alone; rows outside the range are ignored.
 */
export function activityOf(rows: SummaryRow[], days: number, now = new Date()): Activity {
  const series: UsageDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    series.push({
      date: localDate(d),
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      usd: null,
    });
  }
  const byDate = new Map(series.map((d) => [d.date, d]));
  const out: Activity = {
    sessions: 0,
    ms: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    usd: null,
    unpriced: 0,
    calls: 0,
    failures: 0,
    days: series,
    agents: [],
    repos: [],
    models: [],
  };
  const groups = { agents: new Map(), repos: new Map(), models: new Map() } as Record<
    "agents" | "repos" | "models",
    Map<string, ActivityGroup>
  >;
  const count = (kind: keyof typeof groups, key: string, label: string, r: SummaryRow) => {
    const g = groups[kind].get(key) ?? { key, label, sessions: 0, ms: 0, tokens: 0, usd: null };
    g.sessions++;
    g.ms += r.duration_ms ?? 0;
    g.tokens += sum(tokensOf(r));
    g.usd = addUsd(g.usd, priceOf(r));
    groups[kind].set(key, g);
  };

  for (const r of rows) {
    const day = byDate.get(localDate(new Date(r.started_at)));
    if (!day) continue;
    const t = tokensOf(r);
    const usd = priceOf(r);
    out.sessions++;
    out.ms += r.duration_ms ?? 0;
    out.calls += r.calls;
    out.failures += r.failures;
    out.usd = addUsd(out.usd, usd);
    if (usd === null && sum(t) > 0) out.unpriced++;
    for (const k of ["input", "output", "cacheRead", "cacheWrite"] as const) {
      out.tokens[k] += t[k];
      day.tokens[k] += t[k];
    }
    day.usd = addUsd(day.usd, usd);
    count("agents", r.agent, AGENT_NAMES[r.agent] ?? r.agent, r);
    // Only GitHub "owner/name" is uploaded; other repositories stay private and are grouped here.
    count("repos", r.repo ?? "", r.repo ?? "Without a GitHub remote", r);
    count("models", r.model ?? "", r.model ?? "Unknown model", r);
  }
  const order = (m: Map<string, ActivityGroup>) =>
    [...m.values()].sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label));
  out.agents = order(groups.agents);
  out.repos = order(groups.repos);
  out.models = order(groups.models);
  return out;
}
