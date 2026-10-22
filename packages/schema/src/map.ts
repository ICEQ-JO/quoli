import { z } from "zod";
import { safeId } from "./index";

/**
 * Change-map contracts.
 *
 * The map is a deterministic projection of captured changes and recorded checks.
 * It carries no inference of authorship, no runtime behaviour analysis and no
 * symbol-level dependency claims.
 */

export const mapNodeSchema = z
  .object({
    id: safeId,
    kind: z.enum(["file", "check"]),
    /** A repository path or the recorded command. */
    label: z.string().min(1).max(300),
    /** Captured change status, or the recorded check state. */
    status: z.string().max(40),
    /** The captured change id, or the recorded check id, used for drill-down. */
    ref: z.string().max(100),
    evidenceIds: z.array(safeId).min(1).max(50),
    uncertainty: z.string().max(1000).nullable(),
  })
  .strict();
export type MapNode = z.infer<typeof mapNodeSchema>;

export const mapEdgeSchema = z
  .object({
    id: safeId,
    from: safeId,
    to: safeId,
    basis: z.enum(["recorded", "derived", "inferred"]),
    rule: z.string().min(1).max(100),
    position: z.enum(["before", "after"]),
    evidenceIds: z.array(safeId).min(1).max(50),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type MapEdge = z.infer<typeof mapEdgeSchema>;

export const changeMapSchema = z
  .object({
    nodes: z.array(mapNodeSchema).max(500),
    edges: z.array(mapEdgeSchema).max(1000),
    omittedNodes: z.number().int().nonnegative(),
    omittedEdges: z.number().int().nonnegative(),
    caps: z.object({ nodes: z.number().int().positive(), edges: z.number().int().positive() }),
    window: z.object({
      before: z.string().max(100).nullable(),
      after: z.string().max(100),
      baselineMissing: z.boolean(),
    }),
    evidenceIds: z.array(safeId).max(200),
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type ChangeMap = z.infer<typeof changeMapSchema>;

export const mapQuerySchema = z
  .object({
    /** Null selects the two latest captures of the session. */
    beforeId: safeId.nullable().default(null),
    afterId: safeId.nullable().default(null),
    nodes: z.number().int().min(1).max(500).default(100),
    edges: z.number().int().min(1).max(1000).default(200),
  })
  .strict();
export type MapQuery = z.infer<typeof mapQuerySchema>;
export const browserMapSchema = z
  .object({ project: safeId, session: safeId, query: mapQuerySchema })
  .strict();
