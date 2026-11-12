import type {
  Cost,
  PriceTable,
  TokenTotals,
  ToolCall,
  Turn,
  TurnStat,
  UsagePoint,
} from "../shared/model.ts";
import { zeroTokens } from "../shared/model.ts";
import { costOf } from "./prices.ts";

const ms = (iso: string) => Date.parse(iso);

/** Milliseconds covered by at least one interval (overlapping parallel calls count once). */
export function coveredMs(intervals: [number, number][]): number {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let start = Number.NEGATIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const [a, b] of sorted) {
    if (a > end) {
      if (end > start) total += end - start;
      start = a;
      end = b;
    } else if (b > end) end = b;
  }
  if (end > start) total += end - start;
  return total;
}

function add(into: TokenTotals, t: TokenTotals) {
  into.input += t.input;
  into.output += t.output;
  into.cacheRead += t.cacheRead;
  into.cacheWrite += t.cacheWrite;
}

/**
 * Time, calls, tokens and cost per prompt. A turn runs from its prompt to the next prompt, or to
 * `lastAt` (the session's last event) for the last one. Token usage is attributed by time: a
 * usage row belongs to the turn it falls in, and rows before the first prompt go to the first
 * turn. Usage is reported per model request, so this is derived, not recorded per turn.
 */
export function turnStats(
  turns: Turn[],
  calls: ToolCall[],
  usage: UsagePoint[],
  prices: PriceTable,
  lastAt: string,
): TurnStat[] {
  if (!turns.length) return [];
  const byId = new Map(calls.map((c) => [c.id, c]));
  const starts = turns.map((t) => ms(t.at));
  const end = Math.max(ms(lastAt), ...starts);
  const rows = turns.map(() => new Map<string | null, TokenTotals>());
  for (const u of usage) {
    const at = ms(u.at);
    let i = 0;
    while (i + 1 < starts.length && at >= starts[i + 1]) i++;
    const m = rows[i];
    if (!m.has(u.model)) m.set(u.model, zeroTokens());
    add(m.get(u.model) as TokenTotals, u.tokens);
  }
  return turns.map((turn, i) => {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : end;
    const own = turn.toolCallIds.map((id) => byId.get(id)).filter((c): c is ToolCall => !!c);
    const tokens = zeroTokens();
    for (const t of rows[i].values()) add(tokens, t);
    const cost: Cost = costOf(
      [...rows[i]].map(([model, t]) => ({ model, tokens: t })),
      prices,
    );
    return {
      index: i,
      at: turn.at,
      endAt: new Date(to).toISOString(),
      ms: Math.max(0, to - from),
      calls: own.length,
      failures: own.filter((c) => c.status === "failed").length,
      toolMs: coveredMs(
        own.map((c) => [ms(c.startedAt), Math.min(c.endedAt ? ms(c.endedAt) : to, to)]),
      ),
      tokens,
      cost,
    };
  });
}

/** The `n` longest finished calls, longest first. Running calls are left out. */
export function slowestCalls(calls: ToolCall[], n = 5): { toolCallId: string; ms: number }[] {
  return calls
    .filter((c) => c.endedAt)
    .map((c) => ({ toolCallId: c.id, ms: ms(c.endedAt as string) - ms(c.startedAt) }))
    .filter((c) => c.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, n);
}
