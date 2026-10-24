"use client";

import type { Session } from "@traceframe/schema";
import { number } from "@traceframe/ui";
import { ConnectionGuide } from "./connection-guide";
import { Icon } from "./ui-icon";
import { sourceDate, useWorkspaceSummaries } from "./workspace-data";

type Props = {
  sessions: Session[];
  cursor: number;
  project: string;
  projectName: string;
  synthetic: boolean;
  refresh: number;
  loading: boolean;
  unavailable: boolean;
  onSession: (id: string) => void;
  onGaps: (id: string) => void;
  onLibrary: () => void;
};

export function WorkspaceHome({
  sessions,
  cursor,
  project,
  projectName,
  synthetic,
  refresh,
  loading,
  unavailable,
  onSession,
  onGaps,
  onLibrary,
}: Props) {
  const evidence = useWorkspaceSummaries(project, sessions, refresh, cursor);
  const ready = !loading && !unavailable && !evidence.loading && !evidence.failed;
  const gapTotal = ready
    ? sessions.reduce(
        (sum, session) => sum + (evidence.summaries[session.id]?.kindCounts.gap ?? 0),
        0,
      )
    : null;
  const gaps = ready
    ? sessions.filter((session) => (evidence.summaries[session.id]?.kindCounts.gap ?? 0) > 0)
    : [];
  return (
    <>
      <header className="home-heading">
        <div>
          <h1>Workspace overview</h1>
          <p>{projectName} · Your local work, with the evidence to take a closer look.</p>
        </div>
        <span className="workspace-badge">
          <span />
          {synthetic ? "Synthetic workspace" : "Local workspace"}
        </span>
      </header>
      <section className="workspace-ledger" aria-label="Retained workspace counts">
        <div>
          <Icon name="sessions" />
          <strong>{loading || unavailable ? "—" : sessions.length}</strong>
          <span>sessions</span>
        </div>
        <div>
          <Icon name="activity" />
          <strong>
            {loading || unavailable ? "—" : number(sessions.reduce((n, s) => n + s.count, 0))}
          </strong>
          <span>observations</span>
        </div>
        <div className="ledger-gap">
          <Icon name="alert" />
          <strong>{number(gapTotal)}</strong>
          <span>recorded capture gaps</span>
        </div>
        <span className="ledger-caption">Derived from this page of retained sessions</span>
      </section>
      <ConnectionGuide empty={!loading && !unavailable && sessions.length === 0} />
      <div className="overview-columns">
        <section className="session-register" aria-label="Session register">
          <div className="register-heading">
            <h2>Recent sessions</h2>
            <button type="button" className="text-button" onClick={onLibrary}>
              View all <Icon name="arrow-right" size={15} />
            </button>
          </div>
          <div className="register-columns">
            <span>Session</span>
            <span>Capture state</span>
            <span>Observations</span>
            <span />
          </div>
          {loading ? (
            <div className="home-loading" role="status">
              Loading local sessions…
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ) : unavailable ? (
            <div className="activity-empty">
              <Icon name="alert" size={24} />
              <h2>Sessions unavailable</h2>
              <p>Local metadata couldn’t load. Use Retry above to reconnect.</p>
            </div>
          ) : sessions.length ? (
            sessions.slice(0, 3).map((session) => (
              <button
                className="register-row"
                type="button"
                key={session.id}
                onClick={() => onSession(session.id)}
              >
                <span className="register-session-icon">
                  <Icon name={session.kind === "repository" ? "branch" : "session"} size={20} />
                </span>
                <span className="register-session">
                  <strong>{session.title}</strong>
                  <span>
                    <span className="fixture-tag">{synthetic ? "Fixture" : "Local"}</span>
                    <span>{sourceDate(session.startedAt)}</span>
                  </span>
                </span>
                <span
                  className={`capture-pill ${!session.ended && session.kind !== "repository" ? "warning" : ""}`}
                >
                  <i />
                  {session.kind === "repository"
                    ? "Repository observation"
                    : session.ended
                      ? "End recorded"
                      : "No end recorded"}
                </span>
                <span className="register-count">
                  {session.count}
                  <small>observations</small>
                </span>
                <Icon name="arrow" size={16} />
              </button>
            ))
          ) : (
            <div className="activity-empty">
              <Icon name="branch" size={24} />
              <h2>No retained sessions</h2>
              <p>
                Connect a repository above to begin. Repository history works without agent hooks.
              </p>
            </div>
          )}
          <div className="register-footer">
            <Icon name="lock" size={14} />
            <span>Stored locally · Available evidence only</span>
          </div>
        </section>
        <aside className="review-queue" aria-label="Capture gap review queue">
          <div className="queue-heading">
            <Icon name="alert" size={18} />
            <h2>Take a closer look</h2>
            <span>{number(gapTotal)}</span>
          </div>
          <p>Recorded gaps worth inspecting before drawing a conclusion.</p>
          {unavailable ? (
            <p className="queue-loading">
              Workspace evidence unavailable. Use Retry above to reconnect.
            </p>
          ) : evidence.failed ? (
            <div className="summary-error" role="alert">
              <p>Capture gap summaries couldn’t load.</p>
              <button className="button" type="button" onClick={evidence.retry}>
                Retry summaries
              </button>
            </div>
          ) : !ready ? (
            <div className="queue-loading" role="status">
              Loading capture gaps…
            </div>
          ) : gaps.length ? (
            gaps.map((session) => (
              <button
                className="queue-item"
                key={session.id}
                type="button"
                onClick={() => onGaps(session.id)}
              >
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {evidence.summaries[session.id]?.kindCounts.gap} recorded{" "}
                    {evidence.summaries[session.id]?.kindCounts.gap === 1 ? "gap" : "gaps"}
                  </small>
                </span>
                <Icon name="arrow" size={16} />
              </button>
            ))
          ) : (
            <p className="queue-loading">
              No explicit gaps recorded. Capture may still be incomplete.
            </p>
          )}
          <div className="queue-footnote">
            <Icon name="info" size={15} />
            <span>A gap describes available capture, not whether the work was correct.</span>
          </div>
        </aside>
      </div>
      <section className="workspace-review-path" aria-label="How to review a session">
        <h2>From the request to the source.</h2>
        <p>
          Open a session to read its captured request and available work. Compare file versions in
          Changes. Follow any source link to inspect the retained observation and its provenance.
        </p>
        <button type="button" className="text-button" onClick={onLibrary}>
          Choose a session <Icon name="arrow-right" size={15} />
        </button>
      </section>
    </>
  );
}
