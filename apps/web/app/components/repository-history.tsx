"use client";
import type { EventPage, Session, StoredEvent } from "@traceframe/schema";
import type { ObservationStatus, SnapshotPage } from "@traceframe/schema/repository";
import { useEffect, useState } from "react";
import type { View } from "../review";
import { localRead } from "./workspace-data";

type State = { observation: ObservationStatus; captures: SnapshotPage; events: EventPage };
export function RepositoryHistory({
  project,
  session,
  onView,
  onEvidence,
}: {
  project: string;
  session: Session;
  onView: (view: View) => void;
  onEvidence: (id: string) => void;
}) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly reloads local evidence.
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const [observation, captures, events] = await Promise.all([
          localRead<ObservationStatus>({ resource: "observation", project }, abort.signal),
          localRead<SnapshotPage>(
            { resource: "snapshots", project, session: session.id, order: "latest" },
            abort.signal,
          ),
          // A bounded latest-first query keeps recent commit observations visible
          // even when this day's history is larger than the initial activity page.
          localRead<EventPage>(
            { resource: "repository-history", project, session: session.id },
            abort.signal,
          ),
        ]);
        if (!abort.signal.aborted) {
          setData({ observation, captures, events });
          setError("");
        }
      } catch {
        if (!abort.signal.aborted)
          setError("Repository observation is unavailable. Check the local collector, then retry.");
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [project, session.id, retry]);
  const states =
    data?.events.events.filter((event) => event.payload.kind === "repository_state") ?? [];
  const latest = data?.captures.snapshots[0];
  const status = data?.observation;
  return (
    <article className="session-document" aria-label="Repository history">
      <section className="brief-section">
        <div className="brief-section-heading">
          <h2>Automatic repository history</h2>
          <span>{status?.status ?? "Connecting…"}</span>
        </div>
        <p>
          Changes observed in this repository, regardless of agent or editor. These observations do
          not identify who made an edit.
        </p>
        <p className="document-muted">
          Quoli samples while its local collector runs, normally every 5 seconds. Intermediate
          changes and work while stopped may be missed. This is repository history, not an agent
          session.
        </p>
        {error && (
          <div className="error-notice" role="alert">
            <p>{error}</p>
            <button type="button" className="button" onClick={() => setRetry((n) => n + 1)}>
              Retry observation
            </button>
          </div>
        )}
        {status && (
          <p role="status">
            {status.enabled ? `Capture ${status.status}.` : "Automatic capture is not enabled."}{" "}
            Last check:{" "}
            {status.checkedAt ? new Date(status.checkedAt).toLocaleString() : "Not checked yet"}.
            Last captured change:{" "}
            {status.capturedAt ? new Date(status.capturedAt).toLocaleString() : "None"}.
          </p>
        )}
        {status?.status === "blocked" && (
          <p>
            Storage or capture limits prevented a sample from being saved. Review Settings; existing
            evidence is preserved.
          </p>
        )}
        {status?.status === "unavailable" && (
          <p>
            The registered repository could not be read safely. Check its location and permissions.
            Quoli will retry.
          </p>
        )}
        <div className="check-facts">
          <span>{data?.captures.total ?? "—"} captured versions in this history</span>
          <span>Latest HEAD {latest?.head?.slice(0, 12) ?? "Unavailable"}</span>
        </div>
        <button
          className="button"
          type="button"
          disabled={!data?.captures.total}
          onClick={() => onView("File changes")}
        >
          Open captured diffs
        </button>
        <button className="text-button" type="button" onClick={() => onView("Timeline")}>
          All repository activity
        </button>
      </section>
      <section className="brief-section">
        <div className="brief-section-heading">
          <h2>Observed branches and commits</h2>
          <span>Latest 50 state observations</span>
        </div>
        <p className="document-muted">
          Commit IDs describe the local Git graph. Messages and author emails are not collected. A
          branch switch or rewritten history does not mean Quoli observed new work.
        </p>
        {!data && !error && <p role="status">Loading repository observations…</p>}
        {data && !states.length && (
          <p>No Git state observations are retained for this history yet.</p>
        )}
        {states.map((event: StoredEvent) => {
          const state = event.payload;
          if (state.kind !== "repository_state") return null;
          return (
            <article className="check-row" key={event.id}>
              <div className="check-head">
                <strong>{state.branch ?? "Detached or unknown branch"}</strong>
                <span>{new Date(event.sourceTime ?? event.receivedAt).toLocaleString()}</span>
              </div>
              <p>
                <code>{state.head ?? "No HEAD observed"}</code>
              </p>
              <p>
                {state.transition === "initial"
                  ? "Initial observed state; earlier commits were not imported."
                  : state.transition === "diverged"
                    ? "HEAD moved outside the previously observed forward history."
                    : state.transition === "unavailable"
                      ? "Git history continuity is unavailable."
                      : state.transition === "fast_forward"
                        ? "Newly reachable commits since the last observed HEAD."
                        : "No new commit observed in this sample."}
              </p>
              {state.commits.length > 0 && (
                <ul>
                  {state.commits.map((id) => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              )}
              {state.omitted && (
                <p>More commits exist than the 100-ID sample limit; earlier IDs were omitted.</p>
              )}
              <button type="button" className="text-button" onClick={() => onEvidence(event.id)}>
                Recorded source
              </button>
            </article>
          );
        })}
        {data && data.events.total > states.length && (
          <p>
            {data.events.total - states.length} earlier state observations remain available in All
            repository activity.
          </p>
        )}
      </section>
    </article>
  );
}
