import { createHash } from "node:crypto";
import type { CheckObservation } from "@traceframe/schema/checks";
import type { ChangeMap, MapEdge, MapNode } from "@traceframe/schema/map";
import {
  FILE_AFTER_RULE,
  FILE_AFTER_UNCERTAINTY,
  FILE_BEFORE_RULE,
  FILE_BEFORE_UNCERTAINTY,
} from "./checks";

/**
 * Deterministic change map.
 *
 * The map joins captured file changes to recorded checks through explicit
 * references. It never infers authorship, never states that a check covered a
 * file, and keeps every cap and omission explicit.
 */

export const MAP_RULE = "captured-change-map/v1";
export const DEFAULT_NODE_CAP = 100;
export const DEFAULT_EDGE_CAP = 200;

/** The captured file changes the map may show. */
export type MappableFile = {
  id: string;
  path: string;
  status: string;
  uncertainty: string | null;
  evidenceIds: string[];
};

function id(prefix: string, parts: unknown[]): string {
  return `${prefix}-${createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 24)}`;
}

const CHECK_ORDER: Record<string, number> = {
  failed: 0,
  unknown_output: 1,
  missing_result: 2,
  passed: 3,
};

export function changeMap(input: {
  files: MappableFile[];
  checks: CheckObservation[];
  beforeId: string | null;
  afterId: string;
  caps?: { nodes?: number; edges?: number };
}): ChangeMap {
  const nodeCap = Math.max(1, Math.min(input.caps?.nodes ?? DEFAULT_NODE_CAP, 500));
  const edgeCap = Math.max(1, Math.min(input.caps?.edges ?? DEFAULT_EDGE_CAP, 1000));
  const changed = input.files
    .filter((file) => file.status !== "unchanged")
    .sort((a, b) => a.path.localeCompare(b.path));
  const checks = [...input.checks].sort(
    (a, b) =>
      (CHECK_ORDER[a.state] ?? 9) - (CHECK_ORDER[b.state] ?? 9) ||
      (a.command ?? "").localeCompare(b.command ?? "") ||
      a.id.localeCompare(b.id),
  );
  const fileNodes: MapNode[] = changed.map((file) => ({
    id: id("f", [file.path]),
    kind: "file",
    label: file.path,
    status: file.status,
    ref: file.id,
    evidenceIds: file.evidenceIds.slice(0, 50),
    uncertainty: file.uncertainty,
  }));
  const checkNodes: MapNode[] = checks.map((check) => ({
    id: id("c", [check.id]),
    kind: "check",
    label: check.command ?? "Command content disabled",
    status: check.state,
    ref: check.id,
    evidenceIds: check.evidenceIds.slice(0, 50),
    uncertainty: check.uncertainty,
  }));
  const allNodes = [...fileNodes, ...checkNodes];
  const fileNodeByPath = new Map(fileNodes.map((node) => [node.label, node]));
  const checkNodeById = new Map(checkNodes.map((node) => [node.ref, node]));
  const edges: MapEdge[] = [];
  for (const check of checks) {
    const target = checkNodeById.get(check.id);
    if (!target) continue;
    for (const reference of check.files) {
      const source = fileNodeByPath.get(reference.path);
      if (!source) continue;
      const rule = reference.position === "before" ? FILE_BEFORE_RULE : FILE_AFTER_RULE;
      edges.push({
        id: id("e", [source.id, target.id, rule]),
        from: source.id,
        to: target.id,
        basis: "derived",
        rule,
        position: reference.position,
        evidenceIds: [reference.eventId, ...check.evidenceIds].slice(0, 50),
        uncertainty:
          reference.position === "before" ? FILE_BEFORE_UNCERTAINTY : FILE_AFTER_UNCERTAINTY,
      });
    }
  }
  const nodes = allNodes.slice(0, nodeCap);
  const kept = new Set(nodes.map((node) => node.id));
  const visible = edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to));
  const visibleEdges = visible.slice(0, edgeCap);
  return {
    nodes,
    edges: visibleEdges,
    omittedNodes: allNodes.length - nodes.length,
    omittedEdges: edges.length - visibleEdges.length,
    caps: { nodes: nodeCap, edges: edgeCap },
    window: {
      before: input.beforeId,
      after: input.afterId,
      baselineMissing: input.beforeId === null,
    },
    evidenceIds: [...new Set(nodes.flatMap((node) => node.evidenceIds))].slice(0, 200),
    rule: MAP_RULE,
    uncertainty:
      "Captured changes and recorded checks are joined by explicit references only. The map does not establish authorship, coverage or feature correctness.",
  };
}
