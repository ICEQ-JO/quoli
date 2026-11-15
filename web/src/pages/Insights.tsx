import { type ReactNode, useState } from "react";
import {
  AGENT_KINDS,
  AGENT_NAMES,
  CATEGORY_ORDER,
  type InsightsGroup,
  type InsightsReport,
} from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import { AnalysisNav, useAnalysis } from "../components/AnalysisNav.tsx";
import { chartKeys } from "../components/chart-keys.ts";
import { EmptyState, ErrorState, Loading, PageHead } from "../components/ui.tsx";
import { CATEGORY, span, usd } from "../format.ts";
import { Link, navigate, paths } from "../router.ts";
import "./insights.css";

type Day = InsightsReport["days"][number];

const RANGES = [7, 30, 90];
const pct = (n: number, of: number) =>
  !of ? "—" : !n ? "0%" : `${((n / of) * 100).toFixed(n / of < 0.1 ? 1 : 0)}%`;
const dayLabel = (date: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00`).toLocaleDateString([], o);
const short = (date: string) => dayLabel(date, { month: "short", day: "numeric" });
const long = (date: string) => dayLabel(date, { weekday: "short", month: "short", day: "numeric" });

/** Is this getting better or worse? Trends across sessions, each day linked to its sessions. */
export function InsightsPage() {
  const { days, project, agent, model, set } = useAnalysis();
  const [projects] = useData("projects", api.projects);
  const [report, refresh, error] = useData(`insights:${days}:${project}:${agent}:${model}`, () =>
    api.insights(days, { project, agent, model }),
  );
  const [hover, setHover] = useState<number | null>(null);
  useLiveEvents(refresh);
  const open = (date: string) =>
    navigate(paths.sessionsWhere({ day: date, agent, project, model, zone: report?.timeZone }));

  return (
    <div className="page wide">
      <PageHead
        title="Insights"
        actions={
          <>
            <label className="sr-only" htmlFor="i-p">
              Project
            </label>
            <select
              id="i-p"
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
            <label className="sr-only" htmlFor="i-a">
              Agent
            </label>
            <select
              id="i-a"
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
            <label className="sr-only" htmlFor="i-m">
              Model
            </label>
            <select
              id="i-m"
              className="input"
              value={model}
              onChange={(e) => set("model", e.target.value)}
            >
              <option value="">All models</option>
              {(report?.models ?? (model ? [model] : [])).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <fieldset className="segmented">
              <legend className="sr-only">Range</legend>
              {RANGES.map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-pressed={days === n}
                  className={days === n ? "active" : ""}
                  onClick={() => set("days", n)}
                >
                  {n} days
                </button>
              ))}
            </fieldset>
          </>
        }
      >
        Trends across sessions, by the day each one started. Click a day to see its sessions.
      </PageHead>

      <AnalysisNav />
      {report && (
        <p className="faint">
          Reporting zone: {report.timeZone} · USD estimates. Arrow keys inspect dates; Enter opens
          sessions started that day.
        </p>
      )}
      {!report && (error ? <ErrorState message={error} retry={refresh} /> : <Loading />)}
      {report && error && (
        <ErrorState title="Showing the last data we had" message={error} retry={refresh} />
      )}
      {report && report.total.sessions === 0 && (
        <EmptyState title={`No sessions started in the last ${days} days`}>
          <span>Sessions appear here once a connected agent records one.</span>
        </EmptyState>
      )}
      {report && report.total.sessions > 0 && (
        <>
          <Totals report={report} />
          <div className="ins-grid">
            <DayChart
              id="i-sessions"
              title="Sessions per day"
              days={report.days}
              hover={hover}
              setHover={setHover}
              open={open}
              value={(d) => d.sessions}
              top={(max) => String(max)}
              readout={(d) => (
                <>
                  <b>{d.sessions}</b> {d.sessions === 1 ? "session" : "sessions"}
                </>
              )}
            />
            <DayChart
              id="i-cost"
              title="Cost per session"
              note="median, with a line up to the 90th percentile"
              days={report.days}
              hover={hover}
              setHover={setHover}
              open={open}
              value={(d) => d.medianUsd}
              high={(d) => d.p90Usd}
              unknown={(d) => d.sessions > 0 && d.medianUsd === null}
              top={(max) => usd(max)}
              readout={(d) =>
                d.medianUsd === null ? (
                  <b>{d.sessions ? "price unknown" : "no sessions"}</b>
                ) : (
                  <>
                    median <b>{usd(d.medianUsd)}</b> · p90 <b>{usd(d.p90Usd)}</b>
                    {d.unpricedSessions > 0 && <span> · {d.unpricedSessions} unknown</span>}
                  </>
                )
              }
            />
            <DayChart
              id="i-fail"
              title="Failure rate"
              note="failed calls ÷ calls"
              days={report.days}
              hover={hover}
              setHover={setHover}
              open={open}
              value={(d) => (d.calls ? d.failures / d.calls : null)}
              top={(max) => pct(max, 1)}
              tone="fail"
              readout={(d) =>
                d.calls ? (
                  <>
                    <b>{pct(d.failures, d.calls)}</b> {d.failures} of {d.calls} calls
                    {d.loops > 0 && <span> · {d.loops} possible loops</span>}
                  </>
                ) : (
                  <b>no calls</b>
                )
              }
            />
            <MixChart days={report.days} hover={hover} setHover={setHover} open={open} />
          </div>
          <div className="ins-grid lower">
            <div className="ins-col">
              <Durations report={report} />
              <Extensions rows={report.extensions} />
            </div>
            <div className="ins-col">
              <Groups title="By agent" id="i-agent" rows={report.byAgent} />
              <Groups title="By main model" id="i-model" rows={report.byModel} mono />
            </div>
          </div>
          <DayTable
            days={report.days}
            open={(d) => paths.sessionsWhere({ day: d, agent, project })}
          />
        </>
      )}
    </div>
  );
}

function Totals({ report }: { report: InsightsReport }) {
  const t = report.total;
  return (
    <section className="panel" aria-labelledby="i-total">
      <h2 id="i-total" className="sr-only">
        Totals
      </h2>
      <dl className="spend-stats row">
        <div className="figure-stat">
          <dt>Sessions</dt>
          <dd>
            <b className="num">{t.sessions}</b>
          </dd>
        </div>
        <div className="figure-stat">
          <dt>Cost per session</dt>
          <dd>
            <b className="num">{t.medianUsd === null ? "unknown" : usd(t.medianUsd)}</b>
            {t.p90Usd !== null && <span className="faint">p90 {usd(t.p90Usd)}</span>}
          </dd>
        </div>
        <div className="figure-stat">
          <dt>Failure rate</dt>
          <dd>
            <b className="num">{pct(t.failures, t.calls)}</b>
            <span className="faint">
              {t.failures} of {t.calls} calls
            </span>
          </dd>
        </div>
        <div className="figure-stat">
          <dt>Session length</dt>
          <dd>
            <b className="num">{t.medianMs === null ? "—" : span(t.medianMs)}</b>
            {t.p90Ms !== null && <span className="faint">p90 {span(t.p90Ms)}</span>}
          </dd>
        </div>
        <div className="figure-stat">
          <dt>Possible loops</dt>
          <dd>
            <b className="num">{t.loops}</b>
            <span className="faint">
              in {t.sessionsWithLoops} {t.sessionsWithLoops === 1 ? "session" : "sessions"}
            </span>
          </dd>
        </div>
      </dl>
      <p className="panel-note">
        Medians and 90th percentiles. Cost counts only sessions where every model has a price
        {t.unpricedSessions > 0 && (
          <>
            ; {t.unpricedSessions} {t.unpricedSessions === 1 ? "session is" : "sessions are"} left
            out. <Link to={paths.settings("prices")}>Edit prices</Link>
          </>
        )}
        . Length runs from the first event to the last recorded activity; live sessions are left
        out.
      </p>
    </section>
  );
}

interface Hover {
  hover: number | null;
  setHover: (i: number | null) => void;
  open: (date: string) => void;
}

/** One value per day as bars on a single labelled axis, linked across charts by the hovered day. */
function DayChart({
  id,
  title,
  note,
  days,
  value,
  high,
  unknown,
  top,
  readout,
  tone,
  hover,
  setHover,
  open,
}: Hover & {
  id: string;
  title: string;
  note?: string;
  days: Day[];
  value: (d: Day) => number | null;
  high?: (d: Day) => number | null;
  unknown?: (d: Day) => boolean;
  top: (max: number) => string;
  readout: (d: Day) => ReactNode;
  tone?: "fail";
}) {
  const [entry, setEntry] = useState(days.length - 1);
  const max = Math.max(...days.map((d) => high?.(d) ?? value(d) ?? 0)) || 1;
  const shown = hover ?? days.length - 1;
  const d = days[shown];
  const w = 100 / days.length;
  return (
    <section className="panel ins-chart" aria-labelledby={id}>
      <div className="sec-head">
        <h2 id={id}>{title}</h2>
        {note && <span className="faint">{note}</span>}
      </div>
      <p className="sc-readout" aria-live="polite">
        <span className="sc-date">{shown === days.length - 1 ? "Today" : long(d.date)}</span>
        <span>{readout(d)}</span>
      </p>
      <div className="ins-plot" onPointerLeave={() => setHover(null)}>
        <span className="ins-top" aria-hidden>
          {top(max)}
        </span>
        {days.map((day, i) => {
          const v = value(day);
          const h = high?.(day) ?? null;
          return (
            <button
              type="button"
              key={day.date}
              className={`sc-col ${i === shown ? "on" : ""}`}
              style={{ left: `${i * w}%`, width: `${w}%` }}
              onPointerEnter={() => setHover(i)}
              tabIndex={i === Math.min(entry, days.length - 1) ? 0 : -1}
              onKeyDown={(e) => chartKeys(e, i, days.length)}
              onFocus={() => {
                setEntry(i);
                setHover(i);
              }}
              onBlur={() => setHover(null)}
              onClick={() => open(day.date)}
              aria-label={`${long(day.date)}: ${title}, ${
                v === null ? (unknown?.(day) ? "unknown" : "none") : top(v)
              }. Open its sessions.`}
            >
              {unknown?.(day) ? (
                <i className="sc-bar unpriced" style={{ height: 6 }} />
              ) : (
                <>
                  {h !== null && v !== null && h > v && (
                    <i
                      className="ins-range"
                      style={{ bottom: `${(v / max) * 100}%`, height: `${((h - v) / max) * 100}%` }}
                    />
                  )}
                  <i
                    className={`sc-bar ${tone ?? ""}`}
                    style={{ height: v ? `max(2px, ${(v / max) * 100}%)` : 0 }}
                  />
                </>
              )}
            </button>
          );
        })}
      </div>
      <Axis days={days} />
    </section>
  );
}

function Axis({ days }: { days: Day[] }) {
  const every = Math.ceil(days.length / 6);
  const w = 100 / days.length;
  const last = days.length - 1;
  return (
    <div className="sc-axis" aria-hidden>
      {days.map((day, i) =>
        (i % every === 0 && last - i >= every / 2) || i === last ? (
          <span key={day.date} style={{ left: `${(i + 0.5) * w}%` }}>
            {i === last ? "Today" : short(day.date)}
          </span>
        ) : null,
      )}
    </div>
  );
}

/** What the agents spent their calls on each day, as shares of that day's calls. */
function MixChart({ days, hover, setHover, open }: Hover & { days: Day[] }) {
  const [entry, setEntry] = useState(days.length - 1);
  const shown = hover ?? days.length - 1;
  const d = days[shown];
  const w = 100 / days.length;
  const used = CATEGORY_ORDER.filter((c) => days.some((day) => day.mix[c] > 0));
  return (
    <section className="panel ins-chart" aria-labelledby="i-mix">
      <div className="sec-head">
        <h2 id="i-mix">Tool mix</h2>
        <span className="faint">share of each day's calls</span>
      </div>
      <p className="sc-readout" aria-live="polite">
        <span className="sc-date">{shown === days.length - 1 ? "Today" : long(d.date)}</span>
        <span>
          {d.calls
            ? used
                .filter((c) => d.mix[c])
                .map((c) => `${CATEGORY[c].label} ${pct(d.mix[c], d.calls)}`)
                .join(" · ")
            : "no calls"}
        </span>
      </p>
      <div className="ins-plot" onPointerLeave={() => setHover(null)}>
        {days.map((day, i) => (
          <button
            type="button"
            key={day.date}
            className={`sc-col ${i === shown ? "on" : ""}`}
            style={{ left: `${i * w}%`, width: `${w}%` }}
            onPointerEnter={() => setHover(i)}
            tabIndex={i === Math.min(entry, days.length - 1) ? 0 : -1}
            onKeyDown={(e) => chartKeys(e, i, days.length)}
            onFocus={() => {
              setEntry(i);
              setHover(i);
            }}
            onBlur={() => setHover(null)}
            onClick={() => open(day.date)}
            aria-label={`${long(day.date)}: ${day.calls} calls. Open its sessions.`}
          >
            {day.calls > 0 && (
              <span className="ins-stack">
                {used.map((c) =>
                  day.mix[c] ? (
                    <i key={c} style={{ flexGrow: day.mix[c], background: CATEGORY[c].color }} />
                  ) : null,
                )}
              </span>
            )}
          </button>
        ))}
      </div>
      <Axis days={days} />
      <ul className="ins-legend">
        {used.map((c) => (
          <li key={c}>
            <i style={{ background: CATEGORY[c].color }} aria-hidden />
            {CATEGORY[c].label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Durations({ report }: { report: InsightsReport }) {
  const max = Math.max(...report.durations.map((d) => d.sessions)) || 1;
  return (
    <section className="panel" aria-labelledby="i-dur">
      <div className="sec-head">
        <h2 id="i-dur">Session length</h2>
        <span className="faint">sessions that have ended</span>
      </div>
      <ul className="hbars">
        {report.durations.map((d) => (
          <li key={d.label} className="ins-hbar">
            <span className="hb-label">{d.label}</span>
            <span className="hb-track" aria-hidden>
              <i style={{ width: `${(d.sessions / max) * 100}%` }} />
            </span>
            <span className="hb-value num mono">{d.sessions}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Groups({
  title,
  id,
  rows,
  mono,
}: {
  title: string;
  id: string;
  rows: InsightsGroup[];
  mono?: boolean;
}) {
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="sec-head">
        <h2 id={id}>{title}</h2>
        <span className="faint">failed share of calls; median cost and length</span>
      </div>
      <table className="table ins-table">
        <thead>
          <tr>
            <th scope="col">{mono ? "Model" : "Agent"}</th>
            <th scope="col" className="num">
              Sessions
            </th>
            <th scope="col" className="num">
              Failed
            </th>
            <th scope="col" className="num">
              Cost
            </th>
            <th scope="col" className="num">
              Length
            </th>
            <th scope="col" className="num">
              Loops
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td className={mono && g.key ? "mono ins-name" : "ins-name"} title={g.label}>
                {g.label}
              </td>
              <td className="num mono">{g.sessions}</td>
              <td className="num mono" title={`${g.failures} of ${g.calls} calls`}>
                {pct(g.failures, g.calls)}
              </td>
              <td className="num mono">{g.medianUsd === null ? "unknown" : usd(g.medianUsd)}</td>
              <td className="num mono">{g.medianMs === null ? "—" : span(g.medianMs)}</td>
              <td className="num mono">{g.loops}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const EXT_KIND = { mcp: "MCP", skill: "Skill", subagent: "Subagent" } as const;

/** MCP servers, skills and subagent types across the sessions in range. */
function Extensions({ rows }: { rows: InsightsReport["extensions"] }) {
  return (
    <section className="panel" aria-labelledby="i-ext">
      <div className="sec-head">
        <h2 id="i-ext">MCP servers, skills and subagents</h2>
        <span className="faint">most called first</span>
      </div>
      {rows.length === 0 ? (
        <p className="faint">
          None called in this range. MCP servers are named for Claude Code and Codex sessions,
          skills and subagent types for Claude Code.
        </p>
      ) : (
        <table className="table ins-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Kind</th>
              <th scope="col" className="num">
                Sessions
              </th>
              <th scope="col" className="num">
                Calls
              </th>
              <th scope="col" className="num">
                Failed
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={`${x.kind}:${x.plugin}:${x.name}`}>
                <td
                  className="mono ins-name"
                  title={x.plugin ? `${x.name} (plugin ${x.plugin})` : x.name}
                >
                  {x.name}
                  {x.plugin && <span className="faint"> · {x.plugin}</span>}
                </td>
                <td className="faint">{EXT_KIND[x.kind]}</td>
                <td className="num mono">{x.sessions}</td>
                <td className="num mono">{x.calls}</td>
                <td className="num mono">{pct(x.failures, x.calls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The same numbers as the charts, one row per day with sessions. */
function DayTable({ days, open }: { days: Day[]; open: (date: string) => string }) {
  const rows = days.filter((d) => d.sessions > 0).reverse();
  return (
    <details className="panel ins-days">
      <summary>Show the numbers by day</summary>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col" className="num">
              Sessions
            </th>
            <th scope="col" className="num">
              Median cost
            </th>
            <th scope="col" className="num">
              p90 cost
            </th>
            <th scope="col" className="num">
              Cost unknown
            </th>
            <th scope="col" className="num">
              Calls
            </th>
            <th scope="col" className="num">
              Failure rate
            </th>
            <th scope="col" className="num">
              Loops
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date}>
              <td>
                <Link to={open(d.date)}>{long(d.date)}</Link>
              </td>
              <td className="num mono">{d.sessions}</td>
              <td className="num mono">{d.medianUsd === null ? "—" : usd(d.medianUsd)}</td>
              <td className="num mono">{d.p90Usd === null ? "—" : usd(d.p90Usd)}</td>
              <td className="num mono">{d.unpricedSessions}</td>
              <td className="num mono">{d.calls}</td>
              <td className="num mono">{pct(d.failures, d.calls)}</td>
              <td className="num mono">{d.loops}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
