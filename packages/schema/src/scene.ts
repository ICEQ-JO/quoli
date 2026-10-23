import { z } from "zod";
import { safeId } from "./index";

/**
 * Versioned evidence-scene contract (V19).
 *
 * A scene is a bounded, deterministic projection of retained evidence. The
 * vocabulary is closed: a producer cannot invent a node or edge kind, and every
 * node and edge must say how it is known (basis), under which rule, from which
 * evidence, and what remains uncertain. Labels are plain text; there is no
 * diagram source, executable label or general-purpose DSL.
 */

export const SCENE_VERSION = 1;

export const sceneNodeKindSchema = z.enum([
  "turn",
  "prompt",
  "decision",
  "subagent",
  "tool",
  "file",
  "symbol",
  "hunk",
  "check",
  "gap",
  "cost",
  "capability",
]);
export type SceneNodeKind = z.infer<typeof sceneNodeKindSchema>;

export const sceneEdgeKindSchema = z.enum([
  "prompted",
  "declared",
  "spawned",
  "invoked",
  "touched",
  "changed",
  "verified",
  "failed",
  "cost_of",
  "used",
]);
export type SceneEdgeKind = z.infer<typeof sceneEdgeKindSchema>;

const provenance = {
  basis: z.enum(["recorded", "derived", "inferred"]),
  rule: z.string().min(1).max(100),
  evidenceIds: z.array(safeId).min(1).max(50),
  uncertainty: z.string().min(1).max(1000),
};

export const sceneNodeSchema = z
  .object({
    id: safeId,
    kind: sceneNodeKindSchema,
    /** Inert plain text. Never HTML, a command or diagram source. */
    label: z.string().min(1).max(300),
    status: z.string().max(40).nullable(),
    /** The retained record that explains the node, for drill-down. */
    ref: z.string().max(100).nullable(),
    ...provenance,
  })
  .strict();
export type SceneNode = z.infer<typeof sceneNodeSchema>;

export const sceneEdgeSchema = z
  .object({
    id: safeId,
    kind: sceneEdgeKindSchema,
    from: safeId,
    to: safeId,
    ...provenance,
  })
  .strict();
export type SceneEdge = z.infer<typeof sceneEdgeSchema>;

export const sceneSchema = z
  .object({
    version: z.literal(SCENE_VERSION),
    projectId: safeId,
    sessionId: safeId,
    /** The projection rule that generated the scene. */
    rule: z.string().min(1).max(100),
    uncertainty: z.string().min(1).max(1000),
    nodes: z.array(sceneNodeSchema).max(500),
    edges: z.array(sceneEdgeSchema).max(1000),
    /**
     * Everything the source projection had but the scene does not show, whether
     * a cap or a declared conversion gap. The scene uncertainty names the reason.
     */
    omittedNodes: z.number().int().nonnegative(),
    omittedEdges: z.number().int().nonnegative(),
    caps: z
      .object({
        nodes: z.number().int().positive().max(500),
        edges: z.number().int().positive().max(1000),
      })
      .strict(),
    evidenceIds: z.array(safeId).max(200),
    window: z
      .object({
        before: z.string().max(100).nullable(),
        after: z.string().max(100),
        baselineMissing: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((scene, ctx) => {
    if (scene.nodes.length > scene.caps.nodes)
      ctx.addIssue({ code: "custom", path: ["nodes"], message: "Node cap exceeded" });
    if (scene.edges.length > scene.caps.edges)
      ctx.addIssue({ code: "custom", path: ["edges"], message: "Edge cap exceeded" });
    const nodeIds = new Set(scene.nodes.map((node) => node.id));
    if (nodeIds.size !== scene.nodes.length)
      ctx.addIssue({ code: "custom", path: ["nodes"], message: "Duplicate node id" });
    const edgeIds = new Set(scene.edges.map((edge) => edge.id));
    if (edgeIds.size !== scene.edges.length)
      ctx.addIssue({ code: "custom", path: ["edges"], message: "Duplicate edge id" });
    for (const edge of scene.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
        ctx.addIssue({
          code: "custom",
          path: ["edges", edge.id],
          message: "Edge references a node that is not in the scene",
        });
    }
    if (scene.nodes.length > 0 && scene.evidenceIds.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["evidenceIds"],
        message: "A scene with nodes must cite its evidence",
      });
  });
export type Scene = z.infer<typeof sceneSchema>;

/**
 * Evidence a scene cites that the caller does not hold. Deletion or a partial
 * read must surface as missing evidence, not as a silently thinner scene.
 */
export function unknownSceneEvidence(scene: Scene, known: ReadonlySet<string>): string[] {
  const cited = new Set(scene.evidenceIds);
  for (const node of scene.nodes) for (const id of node.evidenceIds) cited.add(id);
  for (const edge of scene.edges) for (const id of edge.evidenceIds) cited.add(id);
  return [...cited].filter((id) => !known.has(id)).sort();
}
