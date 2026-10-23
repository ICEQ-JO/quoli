import type { ChangeMap } from "@traceframe/schema/map";
import { type Scene, type SceneNode, sceneSchema } from "@traceframe/schema/scene";

/**
 * One-way compatibility bridge from the existing change map to a scene.
 *
 * Nodes convert without a stronger claim: they stay a derived projection of the
 * same rule and evidence. The map's reference edges do not convert, because the
 * scene vocabulary has no kind for "a recorded check referenced this path" and
 * restating them as verified, failed or touched would claim coverage the map
 * explicitly refuses. They are counted as omitted and named in the uncertainty.
 */

export const SCENE_FROM_MAP_RULE = "change-map-scene/v1";
export const NODE_UNCERTAINTY_FALLBACK =
  "No node-specific uncertainty was recorded; the scene-level uncertainty applies.";
export const SCENE_FROM_MAP_UNCERTAINTY =
  "The scene restates the captured change map: captured changes and recorded checks joined by explicit references only. A reference is not coverage, authorship or correctness. Change-map reference edges have no v1 scene edge kind and are counted as omitted instead of being restated as verified, failed or touched.";

export function sceneFromMap(map: ChangeMap, ids: { projectId: string; sessionId: string }): Scene {
  const nodes: SceneNode[] = map.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label,
    status: node.status,
    ref: node.ref,
    basis: "derived",
    rule: map.rule,
    evidenceIds: node.evidenceIds,
    uncertainty: node.uncertainty ?? NODE_UNCERTAINTY_FALLBACK,
  }));
  return sceneSchema.parse({
    version: 1,
    projectId: ids.projectId,
    sessionId: ids.sessionId,
    rule: SCENE_FROM_MAP_RULE,
    uncertainty: SCENE_FROM_MAP_UNCERTAINTY,
    nodes,
    edges: [],
    omittedNodes: map.omittedNodes,
    omittedEdges: map.omittedEdges + map.edges.length,
    caps: map.caps,
    evidenceIds: map.evidenceIds,
    window: map.window,
  });
}
