import { z } from "zod";
import { contentSchema, safeId } from "./index";

export type ObservationStatus = {
  enabled: boolean;
  status: "waiting" | "observing" | "paused" | "unavailable" | "blocked";
  checkedAt: string | null;
  capturedAt: string | null;
};

export const repositoryFileSchema = z
  .object({
    path: z.string().min(1).max(4096),
    tracked: z.boolean(),
    staged: z.boolean(),
    status: z.enum([
      "present",
      "deleted",
      "symlink",
      "submodule",
      "binary",
      "oversized",
      "excluded",
      "unavailable",
      "racy",
    ]),
    content: contentSchema,
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
export const repositorySnapshotSchema = z
  .object({
    id: safeId,
    capturedAt: z.iso.datetime(),
    head: z
      .string()
      .regex(/^[a-f0-9]{40,64}$/)
      .nullable(),
    indexIdentity: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    state: z.enum(["observed", "racy"]),
    dirty: z.boolean().nullable(),
    files: z.array(repositoryFileSchema).max(1000),
    omitted: z.number().int().nonnegative(),
    warnings: z.array(z.string().max(1000)).max(100),
  })
  .strict();
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
export type RepositoryFile = z.infer<typeof repositoryFileSchema>;
export type StoredSnapshot = RepositorySnapshot & {
  projectId: string;
  sessionId: string;
  reason: "baseline" | "checkpoint";
  eventId: string;
};
export type SnapshotSummary = Omit<StoredSnapshot, "files" | "warnings"> & {
  fileCount: number;
  warningCount: number;
};
export type SnapshotPage = {
  snapshots: SnapshotSummary[];
  total: number;
  nextCursor: number | null;
};
