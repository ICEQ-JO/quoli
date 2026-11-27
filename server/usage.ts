import { basename } from "node:path";
import {
  type AgentKind,
  type SessionDetail,
  type TokenTotals,
  type UsageReport,
  zeroTokens,
} from "../shared/model.ts";
import { reportingZone } from "../shared/reporting.ts";
import { projectId, type Store, type UsageRow } from "./db.ts";
import { costOf, effectivePrices, priceFor, usdOf } from "./prices.ts";

/** YYYY-MM-DD in the server's local time zone. */
export const localDate = (t: Date | string) => {
  const d = typeof t === "string" ? new Date(t) : t;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
};

const tokensOf = (u: UsageRow): TokenTotals => ({
  input: u.input,
  output: u.output,
  cacheRead: u.cacheRead,
  cacheWrite: u.cacheWrite,
});

function add(into: TokenTotals, t: TokenTotals) {
  into.input += t.input;
  into.output += t.output;
  into.cacheRead += t.cacheRead;
  into.cacheWrite += t.cacheWrite;
}

const round = (n: number) => Math.round(n * 1e9) / 1e9;
const plus = (a: number | null, b: number | null) => (b === null ? a : round((a ?? 0) + b));

/**
 * Spend and tokens over the last `days` calendar days, derived from transcript usage rows and
 * the current price table. Usage without a model id, or with an unpriced model, adds tokens but
 * no cost, exactly like session costs. With `agent`, only that agent's sessions count.
 */
export function usageReport(
  store: Store,
  days: number,
  details: (ids: string[]) => SessionDetail[],
  now = new Date(),
  agent: AgentKind | null = null,
  filter: { project?: string | null; model?: string | null } = {},
): UsageReport {
  const prices = effectivePrices(store);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.toISOString();
  const monthStart = new Date(start);
  monthStart.setDate(1);
  start.setDate(start.getDate() - (days - 1));
  // Daylight-saving shifts can move midnight by an hour; snap back to it.
  start.setHours(0, 0, 0, 0);
  const from = new Date(Math.min(start.getTime(), monthStart.getTime())).toISOString();
  const agents = agent ? store.sessionAgents() : null;
  const rows = store
    .usageSince(from)
    .filter(
      (u) =>
        (!agents || (agents.get(u.sessionId) ?? "claude-code") === agent) &&
        (!filter.project || projectId(u.root) === filter.project) &&
        (!filter.model || u.model === filter.model),
    );

  const priced = (u: UsageRow) => {
    const p = u.model ? priceFor(u.model, prices) : null;
    return p ? usdOf(tokensOf(u), p) : null;
  };

  const dayMap = new Map<string, { tokens: TokenTotals; usd: number | null }>();
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    dayMap.set(localDate(d), { tokens: zeroTokens(), usd: null });
  }
  const byModel = new Map<string | null, TokenTotals>();
  const byProject = new Map<string, { tokens: TokenTotals; usd: number | null }>();
  const bySession = new Map<string, { tokens: TokenTotals; usd: number | null }>();
  const total = zeroTokens();
  let cacheSavings: number | null = null;
  let spentToday: number | null = null;
  let spentMonth: number | null = null;
  const startIso = start.toISOString();
  const monthIso = monthStart.toISOString();

  for (const u of rows) {
    const usd = priced(u);
    if (u.at >= monthIso) spentMonth = plus(spentMonth, usd);
    if (u.at >= today) spentToday = plus(spentToday, usd);
    if (u.at < startIso) continue;
    const t = tokensOf(u);
    add(total, t);
    const day = dayMap.get(localDate(u.at));
    if (day) {
      add(day.tokens, t);
      day.usd = plus(day.usd, usd);
    }
    if (!byModel.has(u.model)) byModel.set(u.model, zeroTokens());
    add(byModel.get(u.model) as TokenTotals, t);
    const proj = byProject.get(u.root) ?? { tokens: zeroTokens(), usd: null };
    add(proj.tokens, t);
    proj.usd = plus(proj.usd, usd);
    byProject.set(u.root, proj);
    const sess = bySession.get(u.sessionId) ?? { tokens: zeroTokens(), usd: null };
    add(sess.tokens, t);
    sess.usd = plus(sess.usd, usd);
    bySession.set(u.sessionId, sess);
    const p = u.model ? priceFor(u.model, prices) : null;
    if (p)
      cacheSavings = round((cacheSavings ?? 0) + (u.cacheRead * (p.input - p.cacheRead)) / 1e6);
  }

  const byUsd = (a: { usd: number | null }, b: { usd: number | null }) =>
    (b.usd ?? -1) - (a.usd ?? -1);
  const top = [...bySession]
    .map(([id, v]) => ({ id, ...v }))
    .sort(byUsd)
    .slice(0, 10);
  const titles = new Map(details(top.map((s) => s.id)).map((d) => [d.id, d]));
  const modelRows = [...byModel].map(([model, tokens]) => ({
    model,
    tokens,
    usd: costOf([{ model, tokens }], prices).usd,
  }));

  return {
    timeZone: reportingZone(),
    days: [...dayMap].map(([date, v]) => ({ date, ...v })),
    total: { tokens: total, cost: costOf(modelRows, prices) },
    byModel: modelRows.sort(byUsd),
    byProject: [...byProject]
      .map(([root, v]) => ({ projectId: projectId(root), name: basename(root), root, ...v }))
      .sort(byUsd),
    topSessions: top.map((s) => {
      const d = titles.get(s.id);
      return {
        id: s.id,
        projectId: d?.projectId ?? "",
        title: d?.title ?? `Session ${s.id.slice(0, 8)}`,
        startedAt: d?.startedAt ?? "",
        tokens: s.tokens,
        usd: s.usd,
      };
    }),
    cacheSavingsUsd: cacheSavings,
    spend: { today: spentToday, month: spentMonth },
  };
}
