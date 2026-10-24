"use client";
import type { EventPage, Session } from "@traceframe/schema";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { eventTitle, preview } from "../review";
import { Icon } from "./ui-icon";
import { eventRead, useWorkspaceSummaries } from "./workspace-data";
export function ReviewQueue({
  project,
  sessions,
  cursor,
  refresh,
  metadataLoading,
  metadataFailed,
  eventId,
  inspector,
  onSelect,
  onSession,
}: {
  project: string;
  sessions: Session[];
  cursor: number;
  refresh: number;
  metadataLoading: boolean;
  metadataFailed: boolean;
  eventId: string;
  inspector: ReactNode;
  onSelect: (session: string, event: string, replace?: boolean) => void;
  onSession: (session: string) => void;
}) {
  const summaries = useWorkspaceSummaries(project, sessions, refresh, cursor);
  const [pages, setPages] = useState<Record<string, EventPage>>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState("");
  const select = useRef(onSelect),
    active = useRef<AbortController | null>(null);
  select.current = onSelect;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh/retry requery retained queue evidence.
  useEffect(() => {
    const abort = new AbortController();
    active.current = abort;
    setPages({});
    setError(false);
    setLoading(true);
    setBusy("");
    if (summaries.loading) return () => abort.abort();
    const candidates = sessions.filter((s) => (summaries.summaries[s.id]?.kindCounts.gap ?? 0) > 0);
    let index = 0;
    const result = Object.create(null) as Record<string, EventPage>;
    let failed = false;
    const worker = async () => {
      while (index < candidates.length && !abort.signal.aborted) {
        const s = candidates[index++];
        try {
          result[s.id] = await eventRead(project, s.id, "gap", 0, abort.signal);
        } catch {
          if (!abort.signal.aborted) failed = true;
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker)).then(() => {
      if (!abort.signal.aborted) {
        setPages(result);
        setError(failed);
        setLoading(false);
      }
    });
    return () => abort.abort();
  }, [project, sessions, summaries.summaries, summaries.loading, refresh, retry]);
  const items = Object.values(pages)
    .flatMap((p) => p.events)
    .sort((a, b) => a.sequence - b.sequence)
    .slice(0, 200);
  const selected = items.find((e) => e.id === eventId);
  useEffect(() => {
    if (!eventId && items.length && window.matchMedia("(min-width: 900px)").matches)
      select.current(items[0].sessionId, items[0].id, true);
  }, [eventId, items]);
  const total = Object.values(pages).reduce((n, p) => n + p.total, 0);
  const isLoading = metadataLoading || summaries.loading || loading;
  async function more(session: string) {
    const current = pages[session],
      abort = active.current;
    if (busy || !current || current.nextCursor === null || !abort) return;
    setBusy(session);
    try {
      const next = await eventRead(project, session, "gap", current.nextCursor, abort.signal);
      if (!abort.signal.aborted)
        setPages((old) => ({
          ...old,
          [session]: { ...next, events: [...old[session].events, ...next.events] },
        }));
    } catch {
      if (!abort.signal.aborted) setError(true);
    } finally {
      if (!abort.signal.aborted) setBusy("");
    }
  }
  return (
    <section className="review-inbox" aria-label="Recorded capture review queue">
      <header className="index-heading">
        <div>
          <h1>Needs review</h1>
          <p>Recorded capture gaps for this page of retained sessions.</p>
        </div>
        <span className="queue-count">{isLoading ? "—" : items.length} loaded</span>
      </header>
      {(error || summaries.failed || metadataFailed) && (
        <div className="inline-warning" role="alert">
          The queue is incomplete. Some evidence could not load.
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setRetry((n) => n + 1);
              summaries.retry();
            }}
          >
            Retry queue
          </button>
        </div>
      )}
      <div className={`inbox-layout ${eventId ? "has-selection" : ""}`}>
        <section className="inbox-list" aria-label="Capture problems">
          {isLoading ? (
            <div className="view-loading" role="status">
              Loading recorded gaps…
            </div>
          ) : !items.length ? (
            <div className="activity-empty">
              <Icon name="shield" size={25} />
              <h2>
                {error || summaries.failed || metadataFailed
                  ? "Queue unavailable"
                  : "No recorded gaps in this view"}
              </h2>
              <p>
                Missing records can still exist. Absence of a gap event does not establish complete
                capture.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                className={`inbox-item ${item.id === eventId ? "selected" : ""}`}
                type="button"
                aria-pressed={item.id === eventId}
                onClick={() => onSelect(item.sessionId, item.id)}
              >
                <Icon name="alert" size={16} />
                <span>
                  <strong>{eventTitle(item)}</strong>
                  <small>
                    {sessions.find((s) => s.id === item.sessionId)?.title ?? item.sessionId}
                  </small>
                  <span>{preview(item)}</span>
                </span>
                <Icon name="arrow" size={13} />
              </button>
            ))
          )}
          {Object.entries(pages)
            .filter(([, page]) => page.nextCursor !== null)
            .map(
              ([session]) =>
                items.length < 200 && (
                  <button
                    key={session}
                    className="queue-more"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void more(session)}
                  >
                    {busy === session
                      ? "Loading…"
                      : `Load more from ${sessions.find((s) => s.id === session)?.title ?? "session"}`}
                  </button>
                ),
            )}
          {!isLoading && (
            <div className="index-footnote">
              {items.length} of {total} gap observations loaded
              {items.length >= 200 ? " · 200-record display limit" : ""}.{" "}
              {summaries.failed ? "Some session counts are unknown." : "Recorded evidence only."}
            </div>
          )}
        </section>
        <section className="inbox-detail" aria-label="Gap source evidence">
          <button
            className="queue-back text-button"
            type="button"
            onClick={() => onSelect(selected?.sessionId ?? sessions[0]?.id ?? "session-cache", "")}
          >
            <Icon name="arrow-left" size={14} />
            Back to recorded gaps
          </button>
          {eventId ? (
            <>
              <div className="inbox-detail-context">
                <span>
                  {selected
                    ? sessions.find((s) => s.id === selected.sessionId)?.title
                    : "Selected observation"}
                </span>
                {selected && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => onSession(selected.sessionId)}
                  >
                    Open session
                    <Icon name="arrow-right" size={14} />
                  </button>
                )}
              </div>
              {inspector}
            </>
          ) : (
            <div className="inspector-empty">
              <h2>Select a recorded gap</h2>
              <p>Inspect the captured fact and the limits of what is known.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
