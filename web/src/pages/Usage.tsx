import { AGENT_KINDS, AGENT_NAMES, type TokenTotals } from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import { AnalysisNav, useAnalysis } from "../components/AnalysisNav.tsx";
import { SessionName } from "../components/SessionName.tsx";
import { SpendChart } from "../components/SpendChart.tsx";
import { EmptyState, ErrorState, Loading, PageHead } from "../components/ui.tsx";
import { ago, compact, money, tokenSum, usd } from "../format.ts";
import { Link, paths } from "../router.ts";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

/** Spend and tokens over time, where they went, and how close you are to your budgets. */
export function UsagePage() {
  const { days, agent, project, model, set } = useAnalysis();
  const [projects] = useData("projects", api.projects);
  const [report, refresh, error] = useData(`usage:${days}:${agent}:${project}:${model}`, () =>
    api.usage(days, agent || undefined, project || undefined, model || undefined),
  );
  const [settings] = useData("settings", api.settings);
  useLiveEvents(refresh);
  const budgets = settings?.settings;

  return (
    <div className="page wide">
      <PageHead
        title="Usage"
        actions={
          <>
            <label className="sr-only" htmlFor="u-project">
              Project
            </label>
            <select
              id="u-project"
              className="input"
              value={project}
              onChange={(e) => set("project", e.target.value)}
            >
              <option value="">All projects</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="u-agent">
              Agent
            </label>
            <select
              id="u-agent"
              className="input"
              value={agent}
              onChange={(e) => set("agent", e.target.value)}
            >
              <option value="">All agents</option>
              {AGENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {AGENT_NAMES[k]}
                </option>
              ))}
            </select>
            <fieldset className="segmented">
              <legend className="sr-only">Range</legend>
              {RANGES.map((r) => (
                <button
                  type="button"
                  key={r.days}
                  aria-pressed={days === r.days}
                  className={days === r.days ? "active" : ""}
                  onClick={() => set("days", r.days)}
                >
                  {r.label}
                </button>
              ))}
            </fieldset>
          </>
        }
      >
        Estimated at list prices from the token usage each agent reports. Not an invoice. Models
        without a price are counted in tokens but not in spend.
      </PageHead>

      <AnalysisNav />
      {model && (
        <p className="filter-chip">
          Model: {model} · token usage only{" "}
          <button type="button" onClick={() => set("model", "")}>
            Clear model filter
          </button>
        </p>
      )}
      {report && (
        <p className="faint">
          Reporting zone: {report.timeZone} · USD estimates · Usage is grouped by token timestamp;
          session trends by session start.
        </p>
      )}
      {(agent || project || model) && (
        <p className="faint">Budget targets are global; the spend amounts follow these filters.</p>
      )}
      {!report && (error ? <ErrorState message={error} retry={refresh} /> : <Loading />)}
      {report && (
        <>
          {error && (
            <ErrorState title="Showing the last data we had" message={error} retry={refresh} />
          )}
          <section className="panel" aria-labelledby="u-over">
            <h2 id="u-over" className="sr-only">
              Overview
            </h2>
            <dl className="spend-stats row">
              <div className="figure-stat">
                <dt>Spend, last {days} days</dt>
                <dd>
                  <b className="num">{money(report.total.cost, report.total.tokens)}</b>
                </dd>
              </div>
              <div className="figure-stat">
                <dt>Tokens</dt>
                <dd>
                  <b className="num" title={tokenSum(report.total.tokens).toLocaleString()}>
                    {compact(tokenSum(report.total.tokens))}
                  </b>
                </dd>
              </div>
              <div className="figure-stat">
                <dt title="Cache reads priced at the input price, minus what they actually cost">
                  Saved by prompt caching
                </dt>
                <dd>
                  <b className="num">{usd(report.cacheSavingsUsd)}</b>
                </dd>
              </div>
              <Budget
                label="Today"
                spent={report.spend.today}
                budget={budgets?.budgetDailyUsd ?? null}
              />
              <Budget
                label="This month"
                spent={report.spend.month}
                budget={budgets?.budgetMonthlyUsd ?? null}
              />
            </dl>
            <SpendChart days={report.days} budget={budgets?.budgetDailyUsd} height={160} />
            <details>
              <summary>Daily spend and tokens</summary>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">USD estimate</th>
                    <th className="num">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td className="num">
                        {d.usd === null
                          ? tokenSum(d.tokens)
                            ? "Unpriced"
                            : "no usage"
                          : usd(d.usd)}
                      </td>
                      <td className="num">{tokenSum(d.tokens).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            {report.total.cost.unpriced.length > 0 && (
              <p className="panel-note">
                No price for {report.total.cost.unpriced.join(", ")}; their tokens are counted but
                not priced. <Link to={paths.settings("prices")}>Edit prices</Link>
              </p>
            )}
          </section>

          {tokenSum(report.total.tokens) === 0 ? (
            <EmptyState title={`No usage in the last ${days} days`}>
              <span>Token usage appears here once an agent reports it.</span>
            </EmptyState>
          ) : (
            <div className="dash-grid">
              <div className="dash-col">
                <Breakdown
                  id="u-model"
                  title="By model"
                  rows={report.byModel.map((m) => ({
                    key: m.model ?? "none",
                    label: m.model ?? "No model id",
                    mono: true,
                    tokens: m.tokens,
                    usd: m.usd,
                  }))}
                />
                <Breakdown
                  id="u-project"
                  title="By project"
                  rows={report.byProject.map((p) => ({
                    key: p.root,
                    label: p.name,
                    title: p.root,
                    to: paths.board(p.projectId),
                    tokens: p.tokens,
                    usd: p.usd,
                  }))}
                />
                <TokenMix tokens={report.total.tokens} />
              </div>
              <div className="dash-col">
                <section className="panel" aria-labelledby="u-top">
                  <div className="sec-head">
                    <h2 id="u-top">Most expensive sessions</h2>
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Session</th>
                        <th scope="col" className="num">
                          Tokens
                        </th>
                        <th scope="col" className="num">
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topSessions.map((s) => (
                        <tr key={s.id}>
                          <td className="t-title">
                            <Link to={paths.board(s.projectId, s.id)} title={s.title}>
                              <SessionName session={s} />
                            </Link>
                            <span className="faint">{s.startedAt ? ago(s.startedAt) : ""}</span>
                          </td>
                          <td className="num mono">{compact(tokenSum(s.tokens))}</td>
                          <td className="num mono">
                            {s.usd === null
                              ? tokenSum(s.tokens)
                                ? "Unpriced"
                                : "No usage"
                              : usd(s.usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Budget({
  label,
  spent,
  budget,
}: {
  label: string;
  spent: number | null;
  budget: number | null;
}) {
  if (!budget) {
    return (
      <div className="figure-stat">
        <dt>{label}</dt>
        <dd>
          <b className="num">{usd(spent)}</b>
          <Link to={paths.settings()} className="faint">
            Set a budget
          </Link>
        </dd>
      </div>
    );
  }
  const share = spent === null ? null : spent / budget;
  const tone = share !== null && share >= 1 ? "over" : share !== null && share >= 0.8 ? "near" : "";
  return (
    <div className="figure-stat">
      <dt>{label}</dt>
      <dd>
        <b className="num">{usd(spent)}</b>
        {share !== null && (
          <span className={`budget ${tone}`}>
            <span className="meter" aria-hidden>
              <i style={{ width: `${Math.min(100, share * 100)}%` }} />
            </span>
            <span>
              {tone === "over" ? "Over" : `${Math.round(share * 100)}% of`} {usd(budget)}
            </span>
          </span>
        )}
      </dd>
    </div>
  );
}

interface Row {
  key: string;
  label: string;
  title?: string;
  mono?: boolean;
  to?: string;
  tokens: TokenTotals;
  usd: number | null;
}

/** Horizontal bars, one neutral series, sorted by cost; unpriced rows say so instead of $0. */
function Breakdown({ id, title, rows }: { id: string; title: string; rows: Row[] }) {
  const max = Math.max(...rows.map((r) => r.usd ?? 0)) || 1;
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="sec-head">
        <h2 id={id}>{title}</h2>
      </div>
      <ul className="hbars">
        {rows.map((r) => (
          <li key={r.key}>
            <span className={`hb-label ${r.mono ? "mono" : ""}`} title={r.title ?? r.label}>
              {r.to ? <Link to={r.to}>{r.label}</Link> : r.label}
            </span>
            <span className="hb-track" aria-hidden>
              <i style={{ width: `${r.usd ? Math.max(1, (r.usd / max) * 100) : 0}%` }} />
            </span>
            <span className="hb-value num mono">{r.usd === null ? "Unpriced" : usd(r.usd)}</span>
            <span className="hb-sub num mono faint">{compact(tokenSum(r.tokens))} tok</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where the tokens went: input, output, cache reads and writes, as one stacked bar. */
function TokenMix({ tokens }: { tokens: TokenTotals }) {
  const total = tokenSum(tokens) || 1;
  const parts: [string, number, string][] = [
    ["Cache read", tokens.cacheRead, "mix-a"],
    ["Cache write", tokens.cacheWrite, "mix-b"],
    ["Input", tokens.input, "mix-c"],
    ["Output", tokens.output, "mix-d"],
  ];
  return (
    <section className="panel" aria-labelledby="u-mix">
      <div className="sec-head">
        <h2 id="u-mix">Token mix</h2>
        <span className="faint">cache reads are the cheapest tokens</span>
      </div>
      <div className="mix-bar" aria-hidden>
        {parts.map(([label, n, cls]) =>
          n ? (
            <i key={label} className={cls} style={{ flexGrow: n / total }} title={label} />
          ) : null,
        )}
      </div>
      <dl className="mix-legend">
        {parts.map(([label, n, cls]) => (
          <div key={label}>
            <dt>
              <i className={cls} aria-hidden />
              {label}
            </dt>
            <dd className="num mono" title={n.toLocaleString()}>
              {compact(n)} <span className="faint">{Math.round((n / total) * 100)}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
