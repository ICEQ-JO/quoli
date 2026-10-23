import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { type CapturePolicy, policySchema } from "@traceframe/schema";
import { runtime } from "./runtime";

/**
 * The trusted capture state a retry write must apply.
 *
 * `unknown` covers a missing or unreadable store: the caller withholds content
 * rather than guessing a policy, so a retry never persists text under an
 * assumed permission.
 */
export type RetryCaptureState =
  | {
      state: "active";
      policy: CapturePolicy;
      epoch: number;
      retentionDays: number | null;
    }
  | { state: "paused" | "purged" | "unknown" };

/**
 * Reads the project's policy and lifecycle state from the collector store.
 *
 * The hook is a second process, so it opens the database read-only and never
 * becomes a writer. The read only happens on the undelivered path, and a
 * failure is reported as `unknown` instead of being retried or logged.
 */
export function retryCaptureState(projectId: string): RetryCaptureState {
  let file: string;
  try {
    file = runtime().dbFile;
  } catch {
    return { state: "unknown" };
  }
  if (!existsSync(file)) return { state: "unknown" };
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    db.exec("PRAGMA busy_timeout=250;");
    const lifecycle = db
      .prepare(
        "SELECT paused, purged_at, retention_days, epoch FROM project_lifecycle WHERE project_id=?",
      )
      .get(projectId);
    // A purge deletes the project row and leaves a tombstone, so lifecycle
    // must be read first: a deleted project is purged, never merely unknown.
    if (lifecycle?.purged_at != null) return { state: "purged" };
    if (lifecycle?.paused) return { state: "paused" };
    const project = db.prepare("SELECT policy FROM projects WHERE id=?").get(projectId);
    if (!project) return { state: "unknown" };
    return {
      state: "active",
      policy: policySchema.parse(JSON.parse(String(project.policy))),
      epoch: lifecycle ? Number(lifecycle.epoch) : 1,
      retentionDays: lifecycle?.retention_days == null ? null : Number(lifecycle.retention_days),
    };
  } catch {
    return { state: "unknown" };
  } finally {
    db?.close();
  }
}
