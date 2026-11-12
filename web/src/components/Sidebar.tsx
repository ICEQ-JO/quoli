import type { SessionSummary } from "../../../shared/model.ts";
import { ago, compact, money, plural, tokenSum } from "../format.ts";
import { Link } from "../router.ts";
import { ErrorState, LiveDot } from "./ui.tsx";

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
        <span>Agent sessions</span>
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
          <p className="faint pad" role="status">
            Loading…
          </p>
        ))}
      {sessions?.length === 0 && (
        <div className="side-empty">
          <p>No agent sessions recorded for this project yet.</p>
          <code>pnpm connect {projectPath || "<repo>"}</code>
        </div>
      )}
      <ul className="session-list">
        {sessions?.map((s) => (
          <li key={s.id}>
            <Link
              to={hrefFor(s.id === activeId ? null : s.id)}
              className={`session-item ${s.id === activeId ? "active" : ""}`}
              aria-current={s.id === activeId ? "true" : undefined}
            >
              <span className="row">
                <LiveDot live={s.live} />
                <span className="when">{s.live ? "Live now" : ago(s.startedAt)}</span>
                {s.branch && (
                  <span className="branch" title={s.branch}>
                    {s.branch}
                  </span>
                )}
              </span>
              <span className="title" title={s.title}>
                {s.title}
              </span>
              <span className="row meta">
                <span>{plural(s.toolCount, "tool")}</span>
                <span>{plural(s.filesTouched, "file")}</span>
                <span>{compact(tokenSum(s.tokens))} tok</span>
                <span title="Estimate from list prices">{money(s.cost, s.tokens)}</span>
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
