import { z } from "zod";
import { safeId } from "./index";

export const comparisonQuerySchema = z
  .object({
    beforeId: safeId.nullable(),
    afterId: safeId,
    fileId: safeId.nullable().default(null),
    search: z.string().max(200).default(""),
    status: z.enum(["all", "changed", "unavailable"]).default("changed"),
    cursor: z.number().int().nonnegative().max(10000).default(0),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();
export type ComparisonQuery = z.infer<typeof comparisonQuerySchema>;

// Derived-view contracts are shared with the dashboard; captured snapshots remain primary evidence.
import type { Content } from "./index";
import type { RepositoryFile, StoredSnapshot } from "./repository";
export type SnapshotSource = Pick<
  StoredSnapshot,
  "id" | "eventId" | "capturedAt" | "state" | "reason" | "head" | "dirty"
>;
export type ChangeStatus =
  | "added"
  | "deleted"
  | "modified"
  | "unchanged"
  | "unavailable"
  | "renamed";
export type ChangeItem = {
  id: string;
  path: string;
  beforePath: string | null;
  status: ChangeStatus;
  basis: "derived" | "inferred";
  rule: string;
  uncertainty: string | null;
};
export type ComparisonMeta = {
  before: SnapshotSource | null;
  after: SnapshotSource;
  beforeId: string | null;
  afterId: string;
  baselineDirty: boolean | null;
  complete: boolean;
  warnings: string[];
  omitted: number;
  evidenceIds: string[];
};
export type ChangeList = ComparisonMeta & {
  total: number;
  compared: number;
  nextCursor: number | null;
  files: (ChangeItem & {
    beforeState: Content["state"] | null;
    afterState: Content["state"] | null;
    beforeStatus: RepositoryFile["status"] | null;
    afterStatus: RepositoryFile["status"] | null;
  })[];
};
export type DiffLine = {
  kind: "context" | "add" | "delete";
  beforeLine: number | null;
  afterLine: number | null;
  text: string;
};
export type SymbolKind = "function" | "class" | "method";
export type SymbolGroupLine = {
  kind: DiffLine["kind"];
  beforeLine: number | null;
  afterLine: number | null;
};
export type SymbolGroup = {
  id: string;
  name: string;
  qualified: string;
  kind: SymbolKind;
  status: "added" | "deleted" | "modified";
  before: { startLine: number; endLine: number } | null;
  after: { startLine: number; endLine: number } | null;
  /** Changed lines attributed to the innermost containing symbol. */
  lines: SymbolGroupLine[];
  basis: "derived";
  rule: string;
  uncertainty: string | null;
};
export type SymbolGrouping = {
  state: "available" | "partial" | "unsupported" | "bounded" | "unavailable";
  language: "typescript" | "tsx" | "javascript" | "jsx" | null;
  groups: SymbolGroup[];
  /** Changed lines outside every named function or class. */
  unattributed: number;
  omitted: number;
  reason: string | null;
};
export type ChangeDetail = ComparisonMeta & {
  change: ChangeItem;
  beforeContent: Content | null;
  afterContent: Content | null;
  beforeStatus: RepositoryFile["status"] | null;
  afterStatus: RepositoryFile["status"] | null;
  diff: {
    state: "available" | "unavailable" | "bounded";
    lines: DiffLine[];
    nextCursor: number | null;
    total: number | null;
    additions: number | null;
    deletions: number | null;
    reason: string | null;
  };
  symbols: SymbolGrouping;
};
export const browserChangesSchema = z
  .object({ project: safeId, session: safeId, query: comparisonQuerySchema })
  .strict();
