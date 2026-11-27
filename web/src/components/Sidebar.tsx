import type { SessionSummary } from "../../../shared/model.ts";
import { ago, money, plural } from "../format.ts";
import { Link } from "../router.ts";
import { SessionName } from "./SessionName.tsx";
import { Trace, TraceLegend } from "./Trace.tsx";
import { AgentTag, ErrorState, LiveDot, Loading } from "./ui.tsx";

interface Props {
  sessions: SessionSummary[] | null;
  activeId: string | null;
  /** The board URL with this session selected (null clears the selection). */
  hrefFor: (id: string | null) => string;
  projectPath: string;
  /** Sessions recorded for the project; the list holds only the newest ones. */
  total?: number;
  /** Message of the latest failed load, and a way to try again. */
  error?: string | null;
  retry?: () => void;
}

export function Sidebar({ sessions, activeId, hrefFor, projectPath, total, error, retry }: Props) {
  return (
    <nav className="sidebar" aria-label="Agent sessions">
      <div className="side-head">
        <h2>Sessions</h2>
        {sessions && sessions.length > 0 && <span className="side-count">{sessions.length}</span>}
        {activeId && (
          <Link to={hrefFor(null)} className="link">
            Clear
          </Link>
        )}
      </div>
      {sessions === null &&
        (error ? (
          <ErrorState title="Could not load sessions" message={error} retry={retry} />
        ) : (
          <div className="pad">
            <Loading />
          </div>
        ))}
      {sessions?.length === 0 && (
        <div className="side-empty">
          <p>No agent sessions recorded for this project yet.</p>
          <code>pnpm connect {projectPath || "<repo>"}</code>
        </div>
      )}
      {sessions && sessions.length > 0 && <TraceLegend />}
      <ul className="session-list">
        {sessions?.map((s) => (
          <li key={s.id}>
            <Link
              to={hrefFor(s.id === activeId ? null : s.id)}
              className={`session-item ${s.id === activeId ? "active" : ""}`}
              aria-current={s.id === activeId ? "true" : undefined}
            >
              <span className="title" title={s.title}>
                <SessionName session={s} />
              </span>
              <span className="row meta">
                <LiveDot live={s.live} />
                <span className="when">{s.live ? "Live now" : ago(s.startedAt)}</span>
                <AgentTag session={s} />
                {s.branch && (
                  <span className="branch" title={s.branch}>
                    {s.branch}
                  </span>
                )}
                <span className="cost" title="Estimate from list prices">
                  {money(s.cost, s.tokens)}
                </span>
              </span>
              <span className="row trace-row">
                <Trace trace={s.trace} max={40} />
                <span>{plural(s.toolCount, "call")}</span>
                {s.failures > 0 && <span className="fail">{s.failures} failed</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {sessions && total !== undefined && total > sessions.length && (
        <p className="faint pad">
          Showing the newest {sessions.length} of {total} sessions. Older ones are kept but not
          listed here.
        </p>
      )}
    </nav>
  );
}
