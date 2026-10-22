import type { EventPage, EventQuery, Relationship, Session, UsageView } from "@traceframe/schema";
import { useEffect, useState } from "react";
export type ReviewSummary = {
  usage: UsageView;
  relationships: Relationship[];
  kindCounts: Record<string, number>;
};
export async function localRead<T>(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/data?${new URLSearchParams(params)}`, {
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Local evidence unavailable.");
  return data;
}
export async function eventRead(
  project: string,
  session: string,
  kind: EventQuery["kind"],
  cursor = 0,
  signal?: AbortSignal,
): Promise<EventPage> {
  if (signal?.aborted) throw new DOMException("Superseded", "AbortError");
  const response = await fetch("/api/data", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project,
      session,
      query: { kind, order: "receipt", cursor, search: "" },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (signal?.aborted) throw new DOMException("Superseded", "AbortError");
  if (!response.ok) throw new Error(data.error ?? "Local observations unavailable.");
  return data;
}
type WorkspaceCounts = Record<string, { kindCounts: Record<string, number> }>;
const emptySummaries: WorkspaceCounts = {};
export function useWorkspaceSummaries(project: string, _sessions: Session[], refresh: number) {
  const [state, setState] = useState<{
    scope: string;
    summaries: WorkspaceCounts;
    loading: boolean;
    failed: boolean;
  }>({ scope: "", summaries: {}, loading: true, failed: false });
  const [retry, setRetry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh/retry are explicit projection reloads.
  useEffect(() => {
    const abort = new AbortController();
    setState({ scope: project, summaries: {}, loading: true, failed: false });
    localRead<WorkspaceCounts>({ resource: "session-counts", project }, abort.signal)
      .then((summaries) => {
        if (!abort.signal.aborted)
          setState({ scope: project, summaries, loading: false, failed: false });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setState({ scope: project, summaries: {}, loading: false, failed: true });
      });
    return () => abort.abort();
  }, [project, refresh, retry]);
  return {
    ...(state.scope === project
      ? state
      : { summaries: emptySummaries, loading: true, failed: false }),
    retry: () => setRetry((n) => n + 1),
  };
}
export function sourceDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Date unknown";
}
