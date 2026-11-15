import type { SyncStatus } from "../../shared/model.ts";

/** Local evidence stays local; only the existing opt-in summary sync is described here. */
export function sharingLabel(status: SyncStatus | null, failed = false): string {
  if (failed) return "Sync status unavailable";
  if (!status) return "Checking team sharing…";
  if (status.linking) return "Finish team connection";
  if (!status.available) return "Team sharing unavailable";
  if (!status.hasKey) return "Team not linked";
  if (!status.enabled) return "Team sharing paused";
  if (status.lastError) return "Summary sync needs attention";
  return status.lastSyncAt ? "Sharing summaries with team" : "Summary sync pending";
}
