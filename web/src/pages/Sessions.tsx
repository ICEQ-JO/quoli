import { useMemo, useState } from "react";
import { AGENT_KINDS, AGENT_NAMES, type SessionSummary } from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import {
  AgentTag,
  EmptyState,
  ErrorState,
  LiveDot,
  Loading,
  PageHead,
  projectName,
  useNow,
} from "../components/ui.tsx";
import { ago, compact, duration, money, tokenSum } from "../format.ts";
import { Link, navigate, paths, useLocation } from "../router.ts";
import { filterQuery, matchesSessionDay, sessionFilters } from "../session-filters.ts";

const PAGE = 100;

export function SessionsPage() {
  const [sessions, refresh, error] = useData("sessions:all", () => api.sessions());
  const [projects, refreshProjects] = useData("projects", api.projects);
  // Insights links here with ?day=YYYY-MM-DD (and its agent/project filters).
  const { search } = useLocation();
  const { query, project, status, agent, day, zone, model, failedOnly, loopsOnly } =
    sessionFilters(search);
  const set = (key: string, value: string | boolean) => {
    navigate(paths.sessions() + filterQuery(search, key, value), { replace: key === "q" });
    setShown(PAGE);
  };
  const [shown, setShown] = useState(PAGE);
  useNow();
  useLiveEvents(() => {
    refresh();
    refreshProjects();
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sessions ?? []).filter(
      (s) =>
        (!project || s.projectId === project) &&
        (!agent || s.agent === agent) &&
        (!status || s.live === (status === "live")) &&
        (!failedOnly || s.failures > 0) &&
        (!loopsOnly || s.loops > 0) &&
        matchesSessionDay(s, day, zone) &&
        (!model || s.models.includes(model)) &&
        (!q || s.title.toLowerCase().includes(q) || (s.branch ?? "").toLowerCase().includes(q)),
    );
  }, [sessions, query, project, status, agent, failedOnly, loopsOnly, day, zone, model]);

  const filtered = query || project || status || agent || failedOnly || loopsOnly || day || model;
  // The server lists only the newest sessions; projects count all of them.
  const recorded = (projects ?? []).reduce((n, p) => n + p.sessions, 0);
  const reset = () => {
    navigate(paths.sessions());
    setShown(PAGE);
  };
  const clearDay = () => set("day", "");

  return (
    <div className="page wide">
      <PageHead title="Sessions">Every recorded agent session, across projects.</PageHead>

      <search className="filters">
        <label className="sr-only" htmlFor="s-q">
          Search sessions by title or branch
        </label>
        <input
          id="s-q"
          type="search"
          className="input"
          placeholder="Search title or branch"
          value={query}
          onChange={(e) => {
            set("q", e.target.value);
            setShown(PAGE);
          }}
        />
        <label className="sr-only" htmlFor="s-p">
          Project
        </label>
        <select
          id="s-p"
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
        <label className="sr-only" htmlFor="s-a">
          Agent
        </label>
        <select
          id="s-a"
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
        <label className="sr-only" htmlFor="s-s">
          Status
        </label>
        <select
          id="s-s"
          className="input"
          value={status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="">Live and ended</option>
          <option value="live">Live</option>
          <option value="ended">Ended</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(e) => set("failed", e.target.checked)}
          />
          Has failures
        </label>
        <label className="check" title="Sessions where a simple rule found a possible loop">
          <input
            type="checkbox"
            checked={loopsOnly}
            onChange={(e) => set("loops", e.target.checked)}
          />
          Possible loops
        </label>
        {day && (
          <span className="filter-chip">
            Started{" "}
            {new Date(`${day}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}
            <button type="button" onClick={clearDay} aria-label="Clear the day filter">
              ×
            </button>
          </span>
        )}
        {sessions && (
          <span className="faint count" aria-live="polite">
            {rows.length} of {sessions.length}
          </span>
        )}
      </search>

      {day && (
        <p className="faint">
          Session start day in {zone || Intl.DateTimeFormat().resolvedOptions().timeZone}.
        </p>
      )}
      {model && (
        <p className="filter-chip">
          Model: {model}{" "}
          <button type="button" onClick={() => set("model", "")}>
            Clear model filter
          </button>
        </p>
      )}
      {filtered && (
        <button className="btn" type="button" onClick={reset}>
          Clear all filters
        </button>
      )}
      {sessions && recorded > sessions.length && (
        <p className="faint">
          Showing the newest {sessions.length} of {recorded} recorded sessions. Older ones are kept
          but not listed here.
        </p>
      )}
      {!sessions && (error ? <ErrorState message={error} retry={refresh} /> : <Loading />)}
      {sessions && error && (
        <ErrorState title="Showing the last data we had" message={error} retry={refresh} />
      )}
      {sessions?.length === 0 && (
        <EmptyState title="No sessions recorded yet">
          <span>Start a new agent session in a connected repository.</span>
          <Link to={paths.projects()} className="btn">
            Go to Projects
          </Link>
        </EmptyState>
      )}
      {sessions && sessions.length > 0 && rows.length === 0 && (
        <EmptyState title="No session matches these filters">
          {filtered && (
            <button type="button" className="btn" onClick={reset}>
              Clear filters
            </button>
          )}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <>
          <table className="table sessions">
            <caption className="sr-only">Sessions, newest first</caption>
            <thead>
              <tr>
                <th scope="col" className="c-dot">
                  <span className="sr-only">Status</span>
                </th>
                <th scope="col">Title</th>
                <th scope="col" className="c-agent">
                  Agent
                </th>
                <th scope="col" className="c-proj">
                  Project
                </th>
                <th scope="col" className="c-branch">
                  Branch
                </th>
                <th scope="col" className="c-when">
                  Started
                </th>
                <th scope="col" className="num c-dur">
                  Duration
                </th>
                <th scope="col" className="num c-n">
                  Tools
                </th>
                <th
                  scope="col"
                  className="num c-n c-opt"
                  title="Files the agent read or edited. Changed files are in the Review lens"
                >
                  Touched
                </th>
                <th scope="col" className="num c-n c-opt">
                  Tokens
                </th>
                <th scope="col" className="num c-n" title="Estimate from list prices">
                  Cost
                </th>
                <th scope="col" className="num c-n">
                  Failed
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((s) => (
                <Row key={s.id} s={s} name={projectName(projects, s.projectId)} />
              ))}
            </tbody>
          </table>
          {rows.length > shown && (
            <p className="card-foot center">
              <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, rows.length - shown)} more ({rows.length - shown} remaining)
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Row({ s, name }: { s: SessionSummary; name: string }) {
  const to = paths.board(s.projectId, s.id);
  return (
    <tr
      className="clickable"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a")) navigate(to);
      }}
    >
      <td className="c-dot">
        <LiveDot live={s.live} />
      </td>
      <td className="ellip" title={s.title}>
        <Link to={to} className="strong">
          {s.title}
        </Link>
        {s.loops > 0 && (
          <span
            className="loop-tag"
            title={`${s.loops} possible ${s.loops === 1 ? "loop" : "loops"} (inferred). Open the Summary for details.`}
          >
            loop
          </span>
        )}
      </td>
      <td className="ellip">
        <AgentTag session={s} always />
      </td>
      <td className="ellip" title={name}>
        {name}
      </td>
      <td className="ellip mono" title={s.branch ?? undefined}>
        {s.branch ?? <span className="faint">—</span>}
      </td>
      <td className="nowrap" title={new Date(s.startedAt).toLocaleString()}>
        {ago(s.startedAt)}
      </td>
      <td className="num nowrap">{duration(s.startedAt, s.endedAt)}</td>
      <td className="num">{s.toolCount}</td>
      <td className="num c-opt">{s.filesTouched}</td>
      <td className="num c-opt" title={tokenSum(s.tokens).toLocaleString()}>
        {compact(tokenSum(s.tokens))}
      </td>
      <td
        className="num nowrap"
        title={
          s.cost.unpriced.length
            ? `Estimate. No price for: ${s.cost.unpriced.join(", ")}`
            : "Estimate from list prices"
        }
      >
        {money(s.cost, s.tokens)}
        {s.cost.unpriced.length > 0 && <span className="warn"> ⚠</span>}
      </td>
      <td className={`num ${s.failures ? "fail" : "faint"}`}>{s.failures}</td>
    </tr>
  );
}
