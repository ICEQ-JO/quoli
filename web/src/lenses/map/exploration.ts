import type { CodeEdge } from "../../../../shared/model.ts";
import { type GraphIndex, nodeOf } from "./graph.ts";

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
}
export const EXPLORATION_LIMIT = 120;
export const EXPANSION_BATCH = 12;

/** Add neighbours without moving anything already on the board. */
export function revealNodes(
  current: PlacedNode[],
  ids: string[],
  origin?: string,
  direction = 1,
): PlacedNode[] {
  const next = [...current];
  const anchor = current.find((n) => n.id === origin) ?? current[0];
  const x = anchor ? anchor.x + direction * 300 : 0;
  for (const id of ids) {
    if (next.some((n) => n.id === id) || next.length >= EXPLORATION_LIMIT) continue;
    let y = anchor?.y ?? 0;
    while (next.some((n) => n.x === x && Math.abs(n.y - y) < 100)) y += 110;
    next.push({ id, x, y });
  }
  return next;
}

export function neighbours(idx: GraphIndex, id: string, direction: "in" | "out"): string[] {
  return [
    ...new Set(
      ((direction === "in" ? idx.into : idx.out).get(id) ?? []).map((e) =>
        direction === "in" ? e.from : e.to,
      ),
    ),
  ].filter((n) => nodeOf(idx, n));
}

/** Keep every known relationship between visible nodes, including cycles and cross-links. */
export function visibleRelationships(idx: GraphIndex, nodes: PlacedNode[]): CodeEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  return idx.graph.edges.filter((e) => e.kind !== "import" && ids.has(e.from) && ids.has(e.to));
}

export const relationLabel = (e: CodeEdge) =>
  e.kind === "route"
    ? "handles"
    : e.kind === "query"
      ? e.access === "write"
        ? "writes"
        : "reads"
      : "calls";
