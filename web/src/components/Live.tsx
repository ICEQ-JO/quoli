import type { LiveSession, Project } from "../../../shared/model.ts";
import { CATEGORY, duration, plural, span, usd } from "../format.ts";
import { Link, paths } from "../router.ts";
import { AgentTag, LiveDot, projectName, useNow } from "./ui.tsx";

const QUIET_MS = 2 * 60_000;

/** "Running pnpm test · 12s" or "Last: src/a.ts · 3m ago", from the session's current step. */
function Step({ s, now }: { s: LiveSession; now: number }) {
  if (!s.step) return <span className="faint">Waiting for the first call</span>;
  const running = s.step.status === "running";
  const quiet = now - Date.parse(s.lastAt);
  return (
    <span className="live-step">
      <i style={{ background: CATEGORY[s.step.category].color }} aria-hidden />
      <span className="faint">{running ? "Running" : "Last"}</span>
      <span className="mono live-what" title={s.step.summary || s.step.name}>
        {s.step.summary || s.step.name}
      </span>
      <span className="faint num">
        {running
          ? span(now - Date.parse(s.step.startedAt))
          : quiet >= QUIET_MS
            ? `quiet ${span(quiet)}`
            : `${span(quiet)} ago`}
      </span>
    </span>
  );
}

/** A running session on the Dashboard: what it is doing now, how long, and what it costs. */
export function LiveRow({ s, projects }: { s: LiveSession; projects: Project[] | null }) {
  const now = useNow(5000);
  return (
    <li className="srow live-row">
      <LiveDot live />
      <div className="srow-main">
        <Link to={paths.board(s.projectId, s.id)} className="srow-title" title={s.title}>
          {s.title}
        </Link>
        <span className="srow-meta">
          <span title={s.root}>{projectName(projects, s.projectId)}</span>
          <AgentTag session={s} />
          <span className="num">{duration(s.startedAt, null)}</span>
          <span>{plural(s.toolCount, "call")}</span>
          {s.failures > 0 && <span className="fail">{s.failures} failed</span>}
          {s.loops > 0 && <span className="loop-tag">possible loop</span>}
        </span>
        <Step s={s} now={now} />
      </div>
      <span className="live-cost num" title="Estimate from list prices">
        <b>{s.cost.usd === null ? "—" : usd(s.cost.usd)}</b>
        <span className="faint">
          {s.recentUsd === null ? "no spend" : `+${usd(s.recentUsd)}`} in 10 min
        </span>
      </span>
    </li>
  );
}

/** The compact version for the sidebar: one line per running session, on every page. */
export function LiveStrip({ live }: { live: LiveSession[] }) {
  const now = useNow(5000);
  if (!live.length) return null;
  return (
    <section className="live-strip" aria-label="Running sessions">
      {live.slice(0, 3).map((s) => (
        <Link key={s.id} to={paths.board(s.projectId, s.id)} className="ls-item" title={s.title}>
          <span className="ls-title">
            <LiveDot live />
            <span>{s.title}</span>
          </span>
          <span className="ls-now">
            {s.step ? (
              <>
                <i style={{ background: CATEGORY[s.step.category].color }} aria-hidden />
                <span className="mono">{s.step.summary || s.step.name}</span>
              </>
            ) : (
              <span>starting</span>
            )}
            <span className="num">
              {s.step?.status === "running"
                ? span(now - Date.parse(s.step.startedAt))
                : usd(s.cost.usd)}
            </span>
          </span>
        </Link>
      ))}
      {live.length > 3 && (
        <Link to={paths.sessions()} className="ls-more">
          {live.length - 3} more running
        </Link>
      )}
    </section>
  );
}
