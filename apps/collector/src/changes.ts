import { compareSnapshots, diffAll, diffPage } from "../../../packages/analysis/src/diff";
import { groupFileSymbols } from "../../../packages/analysis/src/symbols";
import {
  type ChangeDetail,
  type ChangeList,
  comparisonQuerySchema,
} from "../../../packages/schema/src/changes";
import type { StoredSnapshot } from "../../../packages/schema/src/repository";
import type { Store } from "../../../packages/storage/src/index";

function source(snapshot: StoredSnapshot) {
  return {
    id: snapshot.id,
    eventId: snapshot.eventId,
    capturedAt: snapshot.capturedAt,
    state: snapshot.state,
    reason: snapshot.reason,
    head: snapshot.head,
    dirty: snapshot.dirty,
  };
}
/** Pure projection from scoped, immutable snapshots; no filesystem or command access. */
export function readChanges(
  store: Store,
  projectId: string,
  sessionId: string,
  input: unknown,
): { status: number; data: ChangeList | ChangeDetail | { error: string } } {
  const query = comparisonQuerySchema.parse(input);
  const after = store.snapshot(projectId, query.afterId);
  const before = query.beforeId ? store.snapshot(projectId, query.beforeId) : null;
  if (
    !after ||
    after.sessionId !== sessionId ||
    (query.beforeId && (!before || before.sessionId !== sessionId))
  )
    return { status: 404, data: { error: "Snapshot not available in this review." } };
  if (before?.id === after.id)
    return { status: 400, data: { error: "Choose two different snapshot observations." } };
  const comparison = compareSnapshots(before, after);
  const provenance = {
    before: before ? source(before) : null,
    after: source(after),
    beforeId: comparison.beforeId,
    afterId: comparison.afterId,
    baselineDirty: comparison.baselineDirty,
    complete: comparison.complete,
    warnings: comparison.warnings,
    omitted: comparison.omitted,
    evidenceIds: [before?.eventId, after.eventId].filter((id): id is string => Boolean(id)),
  };
  if (query.fileId) {
    const change = comparison.files.find((file) => file.id === query.fileId);
    if (!change)
      return { status: 404, data: { error: "File change not available in this snapshot pair." } };
    const { before: beforeFile, after: afterFile, ...details } = change;
    const fullDiff = diffAll(change);
    return {
      status: 200,
      data: {
        ...provenance,
        change: details,
        beforeContent: beforeFile?.content ?? null,
        afterContent: afterFile?.content ?? null,
        beforeStatus: beforeFile?.status ?? null,
        afterStatus: afterFile?.status ?? null,
        diff: diffPage(fullDiff, { cursor: query.cursor, limit: query.limit }),
        symbols: groupFileSymbols(change, fullDiff),
      },
    };
  }
  const search = query.search.trim().toLowerCase();
  const files = comparison.files.filter(
    (file) =>
      (!search || file.path.toLowerCase().includes(search)) &&
      (query.status === "all" ||
        (query.status === "changed" ? file.status !== "unchanged" : file.status === "unavailable")),
  );
  return {
    status: 200,
    data: {
      ...provenance,
      total: files.length,
      compared: comparison.files.length,
      nextCursor: query.cursor + query.limit < files.length ? query.cursor + query.limit : null,
      files: files
        .slice(query.cursor, query.cursor + query.limit)
        .map(({ before: beforeFile, after: afterFile, ...details }) => ({
          ...details,
          beforeState: beforeFile?.content.state ?? null,
          afterState: afterFile?.content.state ?? null,
          beforeStatus: beforeFile?.status ?? null,
          afterStatus: afterFile?.status ?? null,
        })),
    },
  };
}
