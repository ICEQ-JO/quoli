"use client";
import type { Session } from "@traceframe/schema";
import { ConnectionGuide } from "./connection-guide";
import { Icon } from "./ui-icon";
import { sourceDate, useWorkspaceSummaries } from "./workspace-data";
export type SessionFilters = { search: string; state: string; group: string; order: string };
export function SessionIndex({
  project,
  projectName,
  sessions,
  synthetic,
  refresh,
  loading,
  unavailable,
  filters,
  onFilters,
  onSession,
  onQueue,
}: {
  project: string;
  projectName: string;
  sessions: Session[];
  synthetic: boolean;
  refresh: number;
  loading: boolean;
  unavailable: boolean;
  filters: SessionFilters;
  onFilters: (next: SessionFilters) => void;
  onSession: (id: string) => void;
  onQueue: () => void;
}) {
  const evidence = useWorkspaceSummaries(project, sessions, refresh);
  const rows = sessions
    .filter(
      (s) =>
        s.title.toLowerCase().includes(filters.search.trim().toLowerCase()) &&
        (filters.state === "all" || (filters.state === "ended" ? s.ended : !s.ended)),
    )
    .sort((a, b) =>
      filters.order === "name"
        ? a.title.localeCompare(b.title)
        : (b.startedAt ?? "").localeCompare(a.startedAt ?? "") || a.id.localeCompare(b.id),
    );
  const groups =
    filters.group === "capture"
      ? [
          { label: "Repository history", rows: rows.filter((s) => s.kind === "repository") },
          {
            label: "No end recorded",
            rows: rows.filter((s) => !s.ended && s.kind !== "repository"),
          },
          { label: "End recorded", rows: rows.filter((s) => s.ended && s.kind !== "repository") },
        ]
      : [{ label: "All sessions", rows }];
  const change = (key: keyof SessionFilters, value: string) =>
    onFilters({ ...filters, [key]: value });
  const gapTotal =
    !loading && !unavailable && !evidence.loading && !evidence.failed
      ? sessions.reduce((n, s) => n + (evidence.summaries[s.id]?.kindCounts.gap ?? 0), 0)
      : null;
  return (
    <section className="session-index" aria-label="Session work list" aria-busy={loading}>
      <header className="index-heading">
        <div>
          <h1>Sessions</h1>
          <p>
            {projectName} <span> / </span> {synthetic ? "Synthetic examples" : "Local repository"}
          </p>
        </div>
        <button className="button" type="button" onClick={onQueue}>
          <Icon name="alert" size={15} />
          Needs review <span>{gapTotal ?? "—"}</span>
        </button>
      </header>
      <ConnectionGuide empty={!loading && !unavailable && sessions.length === 0} />
      <div className="index-toolbar">
        <div className="search-field">
          <Icon name="search" size={16} />
          <input
            aria-label="Search sessions"
            placeholder="Search sessions…"
            maxLength={200}
            value={filters.search}
            onChange={(e) => change("search", e.target.value)}
          />
          {filters.search && (
            <button
              type="button"
              className="icon-button"
              aria-label="Clear session search"
              onClick={() => change("search", "")}
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <label>
          <span className="sr-only">Capture state</span>
          <select
            aria-label="Session capture state"
            value={filters.state}
            onChange={(e) => change("state", e.target.value)}
          >
            <option value="all">All capture states</option>
            <option value="ended">End recorded</option>
            <option value="open">No end recorded</option>
          </select>
        </label>
        <details className="display-options">
          <summary>
            <Icon name="sliders" size={15} />
            Display
          </summary>
          <div>
            <label>
              Group by
              <select
                aria-label="Group sessions"
                value={filters.group}
                onChange={(e) => change("group", e.target.value)}
              >
                <option value="capture">Capture state</option>
                <option value="none">No grouping</option>
              </select>
            </label>
            <label>
              Order by
              <select
                aria-label="Order sessions"
                value={filters.order}
                onChange={(e) => change("order", e.target.value)}
              >
                <option value="recent">Source date</option>
                <option value="name">Session name</option>
              </select>
            </label>
          </div>
        </details>
      </div>
      {evidence.failed && (
        <div className="inline-warning" role="alert">
          Some gap counts are unavailable.
          <button className="text-button" type="button" onClick={evidence.retry}>
            Retry counts
          </button>
        </div>
      )}
      <div className="work-list-status" role="status">
        {loading
          ? "Loading sessions…"
          : unavailable
            ? "Session metadata unavailable. Retry the local connection above."
            : `${rows.length} of ${sessions.length} retained sessions`}
        <span>Source dates · UTC</span>
      </div>
      {!loading && !rows.length && (
        <div className="activity-empty">
          <Icon name="sessions" size={24} />
          <h2>
            {sessions.length
              ? "No sessions match"
              : unavailable
                ? "Sessions unavailable"
                : "No retained sessions"}
          </h2>
          <p>
            {sessions.length
              ? "Try another name or capture state."
              : "Connect a repository above to begin. Repository history does not require agent hooks."}
          </p>
          {sessions.length > 0 && (
            <button
              type="button"
              className="button"
              onClick={() => onFilters({ ...filters, search: "", state: "all" })}
            >
              Clear session filters
            </button>
          )}
        </div>
      )}
      {groups
        .filter((g) => g.rows.length)
        .map((group) => (
          <section className="session-group" key={group.label} aria-label={group.label}>
            <h2>
              <span
                className={`capture-dot ${group.label === "No end recorded" ? "warning" : ""}`}
              />
              {group.label}
              <span>{group.rows.length}</span>
            </h2>
            <div className="work-table-wrap">
              <table className="work-table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Capture state</th>
                    <th>Observations</th>
                    <th>Gaps</th>
                    <th>Source date</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <button
                          className="work-session"
                          type="button"
                          onClick={() => onSession(s.id)}
                        >
                          <Icon name="session" size={15} />
                          <span className="work-session-copy">
                            <span>{s.title}</span>
                            <small className={`work-mobile-status ${s.ended ? "" : "warning"}`}>
                              {s.kind === "repository"
                                ? "Repository observation"
                                : s.ended
                                  ? "End recorded"
                                  : "No end recorded"}
                            </small>
                          </span>
                          <Icon name="arrow" size={13} />
                        </button>
                      </td>
                      <td>
                        <span className={`work-capture ${s.ended ? "" : "warning"}`}>
                          <i />
                          {s.kind === "repository"
                            ? "Repository observation"
                            : s.ended
                              ? "End recorded"
                              : "No end recorded"}
                        </span>
                      </td>
                      <td>{s.count}</td>
                      <td>
                        {evidence.summaries[s.id]
                          ? (evidence.summaries[s.id].kindCounts.gap ?? 0)
                          : "—"}
                      </td>
                      <td>{sourceDate(s.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      <footer className="index-footnote">
        <Icon name="lock" size={13} />
        Local evidence. An end event does not establish feature correctness.
        {sessions.length >= 50 && <span>Session register limited to 50 records.</span>}
      </footer>
    </section>
  );
}
