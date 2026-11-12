import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AGENT_NAMES } from "../../../shared/model.ts";
import { SpendChart } from "../components/SpendChart.tsx";
import { ago, compact, span, tokenSum, usd } from "../format.ts";
import { type ActivityGroup, activityOf, type SummaryRow } from "./activity.ts";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
const RANGE_KEY = "quoli.activity.days";

function savedRange(): Range {
  try {
    const n = Number(localStorage.getItem(RANGE_KEY));
    return RANGES.find((r) => r === n) ?? 30;
  } catch {
    return 30;
  }
}

const COLUMNS =
  "session_id,agent,model,repo,branch,started_at,duration_ms,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,usd,calls,failures";

const hours = (ms: number) => (ms >= 60_000 ? span(ms).replace(/ \d+s$/, "") : span(ms));
const cost = (v: number | null, tokens: number) =>
  v === null ? (tokens ? `${compact(tokens)} tokens` : usd(0)) : usd(v);

/**
 * The signed-in person's own activity, from the session summaries their computers uploaded
 * (#167). Only their rows are readable (row-level security); summaries carry no prompts or code.
 */
export function Activity({ client, me }: { client: SupabaseClient; me: string }) {
  const [days, setDays] = useState<Range>(savedRange);
  const [rows, setRows] = useState<SummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await client
      .from("session_summaries")
      .select(COLUMNS)
      .eq("user_id", me)
      .gte("started_at", since.toISOString())
      .order("started_at", { ascending: false })
      .limit(5000);
    if (error) setError(error.message);
    else {
      setError(null);
      setRows(data as unknown as SummaryRow[]);
    }
  }, [client, me, days]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);
  const a = useMemo(() => (rows ? activityOf(rows, days) : null), [rows, days]);
  const pick = (r: Range) => {
    setDays(r);
    try {
      localStorage.setItem(RANGE_KEY, String(r));
    } catch {}
  };

  return (
    <section className="card class-activity" aria-labelledby="activity-h">
      <div className="class-head">
        <h2 id="activity-h">Your activity</h2>
        <fieldset className="segmented">
          <legend className="sr-only">Range</legend>
          {RANGES.map((r) => (
            <button
              type="button"
              key={r}
              aria-pressed={days === r}
              className={days === r ? "active" : ""}
              onClick={() => pick(r)}
            >
              {r} days
            </button>
          ))}
        </fieldset>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!a ? (
        <p className="faint">Loading…</p>
      ) : a.sessions === 0 ? (
        <p className="faint">
          No sessions in the last {days} days. Start a coding agent on a connected computer; a
          summary of each session arrives here within a few minutes.
        </p>
      ) : (
        <>
          <p className="act-line">
            <b className="num">{compact(a.sessions)}</b> {a.sessions === 1 ? "session" : "sessions"}
            <span aria-hidden="true"> · </span>
            <b className="num">{hours(a.ms)}</b> with agents
            <span aria-hidden="true"> · </span>
            <b className="num">{cost(a.usd, tokenSum(a.tokens))}</b> est.
            <span aria-hidden="true"> · </span>
            <b className="num">{compact(tokenSum(a.tokens))}</b> tokens
            <span aria-hidden="true"> · </span>
            <b className={`num ${a.failures ? "warn" : ""}`}>{compact(a.failures)}</b> failed{" "}
            {a.failures === 1 ? "call" : "calls"} of {compact(a.calls)}
          </p>
          <SpendChart days={a.days} height={96} />
          {a.unpriced > 0 && (
            <p className="faint act-note">
              {a.unpriced} {a.unpriced === 1 ? "session uses a model" : "sessions use models"} Quoli
              has no price for; their tokens are counted but not in the cost.
            </p>
          )}
          <div className="act-groups">
            <Groups title="Agents" groups={a.agents} />
            <Groups title="Repositories" groups={a.repos} />
            <Groups title="Models" groups={a.models} />
          </div>
          <details className="class-recent">
            <summary>Recent sessions</summary>
            <div className="table-wrap">
              <table className="table class-table">
                <thead>
                  <tr>
                    <th scope="col">Repository</th>
                    <th scope="col">Agent · model</th>
                    <th scope="col">Started</th>
                    <th scope="col" className="num">
                      Time
                    </th>
                    <th scope="col" className="num">
                      Calls
                    </th>
                    <th scope="col" className="num">
                      Failed
                    </th>
                    <th scope="col" className="num">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).slice(0, 50).map((r) => (
                    <tr key={r.session_id}>
                      <td>
                        {r.repo ?? <span className="faint">—</span>}
                        {r.branch && <span className="faint"> · {r.branch}</span>}
                      </td>
                      <td className="faint">
                        {AGENT_NAMES[r.agent]}
                        {r.model ? ` · ${r.model}` : ""}
                      </td>
                      <td className="nowrap">{ago(r.started_at)}</td>
                      <td className="num">
                        {r.duration_ms === null ? "live" : hours(r.duration_ms)}
                      </td>
                      <td className="num">{r.calls}</td>
                      <td className={`num ${r.failures ? "warn" : ""}`}>{r.failures}</td>
                      <td className="num">
                        {cost(
                          r.usd === null ? null : Number(r.usd),
                          r.input_tokens +
                            r.output_tokens +
                            r.cache_read_tokens +
                            r.cache_write_tokens,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

/** A breakdown as a short ranked list: share of sessions as a hairline bar, then the numbers. */
function Groups({ title, groups }: { title: string; groups: ActivityGroup[] }) {
  const top = groups.slice(0, 6);
  const max = Math.max(1, ...top.map((g) => g.sessions));
  return (
    <div className="act-group">
      <h3>{title}</h3>
      <ol>
        {top.map((g) => (
          <li key={g.key}>
            <span className="act-name" title={g.label}>
              {g.label}
            </span>
            <span className="act-n num">
              {g.sessions} · {cost(g.usd, g.tokens)}
            </span>
            <span className="act-bar" aria-hidden="true">
              <span style={{ width: `${(g.sessions / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ol>
      {groups.length > top.length && (
        <p className="faint act-more">and {groups.length - top.length} more</p>
      )}
    </div>
  );
}
