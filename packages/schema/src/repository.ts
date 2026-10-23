import { z } from "zod";
import { contentSchema, MAX_BODY, safeId } from "./index";

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

const providerId = z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/);
const commit = z.string().regex(/^[a-f0-9]{40,64}$/);
const ref = z.string().min(1).max(1024);
export const repositoryReadStateSchema = z.enum([
  "available",
  "missing",
  "denied",
  "truncated",
  "stale",
  "rate_limited",
  "unavailable",
]);
export const repositoryIdentitySchema = z
  .object({ provider: providerId, repositoryId: z.string().min(1).max(512) })
  .strict();
export const repositoryRevisionSchema = z
  .object({
    requestedRef: ref.nullable(),
    requestedCommit: commit.nullable(),
    requestedPullRequest: safeId.nullable(),
    resolvedRef: ref.nullable(),
    resolvedCommit: commit.nullable(),
  })
  .strict()
  .superRefine((revision, ctx) => {
    if (!revision.requestedRef && !revision.requestedCommit && !revision.requestedPullRequest)
      ctx.addIssue({ code: "custom", message: "A ref, commit, or pull request is required" });
    if (revision.resolvedCommit === null && revision.requestedCommit !== null)
      ctx.addIssue({ code: "custom", message: "A requested commit requires its resolved commit" });
  });
export const repositoryReadLimitsSchema = z
  .object({
    maxEntries: z.number().int().min(1).max(1000),
    maxBytes: z.number().int().min(1).max(MAX_BODY),
  })
  .strict();
export const repositoryReadResultSchema = z
  .object({
    repository: repositoryIdentitySchema,
    revision: repositoryRevisionSchema,
    state: repositoryReadStateSchema,
    omitted: z.number().int().nonnegative(),
    retryAfterSeconds: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.state !== "rate_limited" && result.retryAfterSeconds !== null)
      ctx.addIssue({ code: "custom", message: "Only rate-limited reads include a retry delay" });
  });
export const repositoryTreeEntrySchema = z
  .object({ path: z.string().min(1).max(4096), kind: z.enum(["file", "directory", "submodule"]) })
  .strict();
export const repositoryTreeResultSchema = repositoryReadResultSchema.extend({
  entries: z.array(repositoryTreeEntrySchema).max(1000),
});
export const repositoryBlobResultSchema = repositoryReadResultSchema.extend({
  path: z.string().min(1).max(4096),
  content: contentSchema.nullable(),
});
export const repositoryComparisonResultSchema = repositoryReadResultSchema.extend({
  baseCommit: commit.nullable(),
  headCommit: commit.nullable(),
  paths: z.array(z.string().min(1).max(4096)).max(1000),
});
export type RepositoryIdentity = z.infer<typeof repositoryIdentitySchema>;
export type RepositoryRevision = z.infer<typeof repositoryRevisionSchema>;
export type RepositoryReadLimits = z.infer<typeof repositoryReadLimitsSchema>;
export type RepositoryTreeResult = z.infer<typeof repositoryTreeResultSchema>;
export type RepositoryBlobResult = z.infer<typeof repositoryBlobResultSchema>;
export type RepositoryComparisonResult = z.infer<typeof repositoryComparisonResultSchema>;
