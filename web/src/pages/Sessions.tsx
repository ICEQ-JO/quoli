import { useMemo, useState } from "react";
import type { SessionSummary } from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import {
  EmptyState,
  ErrorState,
  LiveDot,
  Loading,
  PageHead,
  projectName,
  useNow,
} from "../components/ui.tsx";
import { ago, compact, duration, money, tokenSum } from "../format.ts";
import { Link, navigate, paths } from "../router.ts";

const PAGE = 100;

export function SessionsPage() {
  const [sessions, refresh, error] = useData("sessions:all", () => api.sessions());
  const [projects, refreshProjects] = useData("projects", api.projects);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState<"" | "live" | "ended">("");
  const [failedOnly, setFailedOnly] = useState(false);
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
        (!status || s.live === (status === "live")) &&
        (!failedOnly || s.failures > 0) &&
        (!q || s.title.toLowerCase().includes(q) || (s.branch ?? "").toLowerCase().includes(q)),
    );
  }, [sessions, query, project, status, failedOnly]);

  const filtered = query || project || status || failedOnly;
  const reset = () => {
    setQuery("");
    setProject("");
    setStatus("");
    setFailedOnly(false);
  };

  return (
    <div className="page wide">
      <PageHead title="Sessions">Every recorded Claude Code session, across projects.</PageHead>

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
            setQuery(e.target.value);
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
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
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
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="">Live and ended</option>
          <option value="live">Live</option>
          <option value="ended">Ended</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(e) => setFailedOnly(e.target.checked)}
          />
          Has failures
        </label>
        {sessions && (
          <span className="faint count" aria-live="polite">
            {rows.length} of {sessions.length}
          </span>
        )}
      </search>

      {!sessions && (error ? <ErrorState message={error} retry={refresh} /> : <Loading />)}
      {sessions && error && (
        <ErrorState title="Showing the last data we had" message={error} retry={refresh} />
      )}
      {sessions?.length === 0 && (
        <EmptyState title="No sessions recorded yet">
          <span>Start a new Claude Code session in a connected repository.</span>
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
                <th scope="col" className="num c-n">
                  Files
                </th>
                <th scope="col" className="num c-n">
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
      <td className="num">{s.filesTouched}</td>
      <td className="num" title={tokenSum(s.tokens).toLocaleString()}>
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
