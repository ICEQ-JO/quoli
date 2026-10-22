import { changeMap, verification } from "@traceframe/analysis";
import { mapQuerySchema } from "@traceframe/schema/map";
import type { StoredSnapshot } from "@traceframe/schema/repository";
import type { Store } from "@traceframe/storage";
import { compareSnapshots } from "../../../packages/analysis/src/diff";

/** Pure projection from captured snapshots and retained observations. */
export function readMap(
  store: Store,
  projectId: string,
  sessionId: string,
  input: unknown,
): { status: number; data: unknown } {
  const query = mapQuerySchema.parse(input);
  const selected = resolvePair(store, projectId, sessionId, query.beforeId, query.afterId);
  if ("error" in selected) return { status: selected.status, data: { error: selected.error } };
  const { before, after } = selected;
  const comparison = compareSnapshots(before, after);
  const events = store.allEvents(projectId, sessionId);
  const checks = verification(events);
  const map = changeMap({
    files: comparison.files.map((file) => ({
      id: file.id,
      path: file.path,
      status: file.status,
      uncertainty: file.uncertainty,
      evidenceIds: [before.eventId, after.eventId],
    })),
    checks: checks.checks,
    beforeId: before.id,
    afterId: after.id,
    caps: { nodes: query.nodes, edges: query.edges },
  });
  return {
    status: 200,
    data: { ...map, evidenceIds: [...map.evidenceIds, before.eventId, after.eventId] },
  };
}

/** The requested pair, or the two latest captures of the session. */
function resolvePair(
  store: Store,
  projectId: string,
  sessionId: string,
  beforeId: string | null,
  afterId: string | null,
): { status: number; error: string } | { before: StoredSnapshot; after: StoredSnapshot } {
  if (beforeId && afterId) {
    const before = store.snapshot(projectId, beforeId);
    const after = store.snapshot(projectId, afterId);
    if (!before || !after || before.sessionId !== sessionId || after.sessionId !== sessionId)
      return { status: 404, error: "Snapshot pair not available in this review." };
    if (before.id === after.id)
      return { status: 400, error: "Choose two different snapshot observations." };
    return { before, after };
  }
  const latest = store
    .snapshotSummaries(projectId, sessionId, 0, 2, true)
    .snapshots.filter(
      (snapshot) => snapshot.reason === "baseline" || snapshot.reason === "checkpoint",
    );
  if (latest.length < 2)
    return {
      status: 400,
      error:
        "Two repository captures are needed for a change map. Capture a baseline and a checkpoint.",
    };
  const after = store.snapshot(projectId, latest[0].id);
  const before = store.snapshot(projectId, latest[1].id);
  if (!after || !before)
    return { status: 404, error: "Snapshot pair not available in this review." };
  return { before, after };
}
