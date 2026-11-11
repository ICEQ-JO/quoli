import type { SessionSummary } from "../../../shared/model.ts";
import { ago, compact, tokenSum } from "../format.ts";

interface Props {
  sessions: SessionSummary[] | null;
  activeId: string | null;
  onOpen: (id: string | null) => void;
  projectPath: string;
}

export function Sidebar({ sessions, activeId, onOpen, projectPath }: Props) {
  return (
    <nav className="sidebar" aria-label="Agent sessions">
      <div className="side-head">
        <span>Agent sessions</span>
        {activeId && (
          <button type="button" className="link" onClick={() => onOpen(null)}>
            Clear
          </button>
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
            <button
              type="button"
              className={`session-item ${s.id === activeId ? "active" : ""}`}
              onClick={() => onOpen(s.id === activeId ? null : s.id)}
            >
              <span className="row">
                <span
                  className={`live-dot ${s.live ? "on" : ""}`}
                  title={s.live ? "Live" : "Not running"}
                />
                <span className="when">{s.live ? "Live now" : ago(s.startedAt)}</span>
                {s.branch && <span className="branch">{s.branch}</span>}
              </span>
              <span className="title">{s.title}</span>
              <span className="row meta">
                <span>{s.toolCount} tools</span>
                <span>
                  {s.filesTouched} {s.filesTouched === 1 ? "file" : "files"}
                </span>
                <span>{compact(tokenSum(s.tokens))} tok</span>
                {s.failures > 0 && <span className="fail">{s.failures} failed</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
