"use client";

import type { Session } from "@traceframe/schema";
import { number } from "@traceframe/ui";
import { useEffect, useState } from "react";
import { Icon } from "./ui-icon";

type Counts = { kindCounts: Record<string, number> };
type Props = {
  view: "Overview" | "Sessions";
  sessions: Session[];
  project: string;
  projectName: string;
  refresh: number;
  loading: boolean;
  unavailable: boolean;
  onSession: (id: string) => void;
  onGaps: (id: string) => void;
  onLibrary: () => void;
};
function sourceDate(value: string | null) {
  if (!value) return "Source date unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
export function WorkspaceHome({
  view,
  sessions,
  project,
  projectName,
  refresh,
  loading,
  unavailable,
  onSession,
  onGaps,
  onLibrary,
}: Props) {
  const [summaries, setSummaries] = useState<Record<string, Counts>>({});
  const [countsLoading, setCountsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit refresh and retry reload retained summaries.
  useEffect(() => {
    const abort = new AbortController();
    setCountsLoading(true);
    setFailed(false);
    setSummaries({});
    Promise.all(
      sessions.map(async (s) => {
        const response = await fetch(
          `/api/data?${new URLSearchParams({ resource: "summary", project, session: s.id })}`,
          { signal: abort.signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error("Session summaries unavailable");
        return [s.id, await response.json()] as const;
      }),
    )
      .then((entries) => {
        if (!abort.signal.aborted) setSummaries(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setCountsLoading(false);
      });
    return () => abort.abort();
  }, [project, sessions, refresh, retry]);
  const countsReady = !loading && !countsLoading && !failed && !unavailable;
  const gapTotal = countsReady
    ? sessions.reduce((sum, s) => sum + (summaries[s.id]?.kindCounts.gap ?? 0), 0)
    : null;
  const filtered = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(search.trim().toLowerCase()) &&
      (status === "all" || (status === "ended" ? s.ended : !s.ended)),
  );
  const rows = view === "Overview" ? sessions.slice(0, 3) : filtered;
  const gaps = countsReady
    ? sessions.filter((s) => (summaries[s.id]?.kindCounts.gap ?? 0) > 0)
    : [];
  return (
    <>
      <div className="home-heading">
        <div>
          <h1>{view === "Overview" ? "Workspace overview" : "Sessions"}</h1>
          <p>
            {view === "Overview"
              ? "A clear view of your agent’s work. Evidence first."
              : "Find a session. Follow the activity. Inspect the evidence."}
          </p>
        </div>
        <span className="workspace-badge">
          <span />
          Synthetic workspace
        </span>
      </div>
      {view === "Overview" ? (
        <>
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
            <span className="ledger-caption">Derived from retained history</span>
          </section>
          <div className="preview-banner">
            <div className="preview-banner-icon">
              <Icon name="branch" size={22} />
            </div>
            <div>
              <strong>Your review workspace, ready to explore.</strong>
              <p>
                These sessions are authored examples. Open one to trace requests, results, and the
                evidence in between.
              </p>
            </div>
            <button
              type="button"
              className="button primary"
              disabled={!sessions.length}
              onClick={() => sessions[0] && onSession(sessions[0].id)}
            >
              Explore a session
              <Icon name="arrow-right" size={16} />
            </button>
          </div>
        </>
      ) : (
        <div className="library-controls">
          <div className="search-field">
            <Icon name="search" />
            <input
              aria-label="Search sessions"
              placeholder="Search sessions…"
              value={search}
              maxLength={200}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="icon-button"
                aria-label="Clear session search"
                onClick={() => setSearch("")}
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>
          <select
            aria-label="Session capture state"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All capture states</option>
            <option value="ended">End recorded</option>
            <option value="open">End not recorded</option>
          </select>
          <span>
            {filtered.length} of {sessions.length} sessions
          </span>
        </div>
      )}
      <div className={view === "Overview" ? "overview-columns" : "library-layout"}>
        <section className="session-register" aria-label="Session register">
          <div className="register-heading">
            <h2>{view === "Overview" ? "Recent sessions" : "All sessions"}</h2>
            {view === "Overview" ? (
              <button type="button" className="text-button" onClick={onLibrary}>
                View all
                <Icon name="arrow-right" size={15} />
              </button>
            ) : (
              <span>Source dates · UTC</span>
            )}
          </div>
          <div className="register-columns">
            <span>Session</span>
            <span>Capture state</span>
            <span>Observations</span>
            <span />
          </div>
          {loading && !sessions.length ? (
            <div className="home-loading" role="status">
              Loading your local sessions…
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ) : rows.length ? (
            rows.map((s) => (
              <button
                className="register-row"
                type="button"
                key={s.id}
                onClick={() => onSession(s.id)}
              >
                <span className="register-session-icon">
                  <Icon name="session" size={20} />
                </span>
                <span className="register-session">
                  <strong>{s.title}</strong>
                  <span>
                    <span className="fixture-tag">Fixture</span>
                    <span>{sourceDate(s.startedAt)}</span>
                    <span className="register-project">{projectName}</span>
                  </span>
                </span>
                <span className={`capture-pill ${s.ended ? "" : "warning"}`}>
                  <i />
                  {s.ended ? "End recorded" : "End not recorded"}
                </span>
                <span className="register-count">
                  {s.count}
                  <small>observations</small>
                </span>
                <Icon name="arrow" size={16} />
              </button>
            ))
          ) : (
            <div className="activity-empty">
              <Icon name="search" size={26} />
              <h2>
                {sessions.length
                  ? "No sessions match"
                  : unavailable
                    ? "Sessions unavailable"
                    : "No retained sessions"}
              </h2>
              <p>
                {sessions.length
                  ? "Try a different title or capture state."
                  : unavailable
                    ? "Local session metadata couldn’t load. Use Retry above to reconnect."
                    : "Refresh after collecting local evidence. This preview does not connect a live agent."}
              </p>
              {sessions.length > 0 && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                >
                  Clear session filters
                </button>
              )}
            </div>
          )}
          <div className="register-footer">
            <Icon name="lock" size={14} />
            <span>Stored locally · No live agent connected</span>
          </div>
        </section>
        {view === "Overview" && (
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
            ) : failed ? (
              <div className="summary-error" role="alert">
                <p>Capture gap summaries couldn’t load.</p>
                <button className="button" type="button" onClick={() => setRetry((v) => v + 1)}>
                  Retry summaries
                </button>
              </div>
            ) : !countsReady ? (
              <div className="queue-loading" role="status">
                Loading capture gaps…
              </div>
            ) : gaps.length ? (
              gaps.map((s) => (
                <button
                  className="queue-item"
                  key={s.id}
                  type="button"
                  onClick={() => onGaps(s.id)}
                >
                  <span>
                    <strong>{s.title}</strong>
                    <small>
                      {summaries[s.id]?.kindCounts.gap} recorded{" "}
                      {summaries[s.id]?.kindCounts.gap === 1 ? "gap" : "gaps"}
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
              <span>
                A gap describes available capture, not whether the agent’s work was correct.
              </span>
            </div>
          </aside>
        )}
      </div>
      {view === "Overview" && (
        <section className="review-guide" aria-label="How to review a session">
          <div>
            <Icon name="trace" size={23} />
            <h2>From activity to understanding.</h2>
            <p>Three perspectives on the same evidence.</p>
          </div>
          <ol>
            <li>
              <span className="guide-route">
                <Icon name="activity" />
              </span>
              <div>
                <strong>Follow the activity</strong>
                <p>Prompts, tool requests, and reported results in one retained history.</p>
              </div>
            </li>
            <li>
              <span className="guide-route">
                <Icon name="link" />
              </span>
              <div>
                <strong>Inspect the source</strong>
                <p>Open a payload and follow links established by explicit tool IDs.</p>
              </div>
            </li>
            <li>
              <span className="guide-route">
                <Icon name="shield" />
              </span>
              <div>
                <strong>Keep uncertainty visible</strong>
                <p>Check usage and coverage. Missing evidence stays unknown.</p>
              </div>
            </li>
          </ol>
        </section>
      )}
    </>
  );
}
