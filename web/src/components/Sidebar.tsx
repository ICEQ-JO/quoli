import type { SessionSummary } from "../../../shared/model.ts";
import { ago, compact, money, tokenSum } from "../format.ts";
import { Link } from "../router.ts";

interface Props {
  sessions: SessionSummary[] | null;
  activeId: string | null;
  /** The board URL with this session selected (null clears the selection). */
  hrefFor: (id: string | null) => string;
  projectPath: string;
}

export function Sidebar({ sessions, activeId, hrefFor, projectPath }: Props) {
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
      {sessions === null && <p className="faint pad">Loading…</p>}
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
              aria-current={s.id === activeId ? "page" : undefined}
            >
              <span className="row">
                <span
                  className={`live-dot ${s.live ? "on" : ""}`}
                  title={s.live ? "Live" : "Not running"}
                />
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
                <span>{s.toolCount} tools</span>
                <span>
                  {s.filesTouched} {s.filesTouched === 1 ? "file" : "files"}
                </span>
                <span>{compact(tokenSum(s.tokens))} tok</span>
                <span title="Estimate from list prices">{money(s.cost)}</span>
                {s.failures > 0 && <span className="fail">{s.failures} failed</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
