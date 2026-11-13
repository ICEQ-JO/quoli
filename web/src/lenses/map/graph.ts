import type {
  CodeEdge,
  CodeGraph,
  CodeRoute,
  CodeSymbol,
  CodeTable,
} from "../../../../shared/model.ts";

/** What a node on the map is: a function-like symbol, an HTTP route or a database table. */
export type MapNode =
  | { type: "symbol"; id: string; symbol: CodeSymbol }
  | { type: "route"; id: string; route: CodeRoute }
  | { type: "table"; id: string; table: CodeTable };

export interface GraphIndex {
  graph: CodeGraph;
  symbols: Map<string, CodeSymbol>;
  routes: Map<string, CodeRoute>;
  tables: Map<string, CodeTable>;
  byFile: Map<string, CodeSymbol[]>;
  /** Edges that carry control flow (call, route, query), by caller and by callee. */
  out: Map<string, CodeEdge[]>;
  into: Map<string, CodeEdge[]>;
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

export function indexGraph(graph: CodeGraph): GraphIndex {
  const idx: GraphIndex = {
    graph,
    symbols: new Map(graph.symbols.map((s) => [s.id, s])),
    routes: new Map((graph.routes ?? []).map((r) => [r.id, r])),
    tables: new Map((graph.tables ?? []).map((t) => [t.id, t])),
    byFile: new Map(),
    out: new Map(),
    into: new Map(),
  };
  for (const s of graph.symbols) push(idx.byFile, s.file, s);
  for (const list of idx.byFile.values()) list.sort((a, b) => a.startLine - b.startLine);
  for (const e of graph.edges) {
    if (e.kind === "import") continue;
    push(idx.out, e.from, e);
    push(idx.into, e.to, e);
  }
  return idx;
}

export function nodeOf(idx: GraphIndex, id: string): MapNode | null {
  const symbol = idx.symbols.get(id);
  if (symbol) return { type: "symbol", id, symbol };
  const route = idx.routes.get(id);
  if (route) return { type: "route", id, route };
  const table = idx.tables.get(id);
  if (table) return { type: "table", id, table };
  return null;
}

/** The file a node lives in. */
export function fileOfNode(n: MapNode): string {
  return n.type === "symbol" ? n.symbol.file : n.type === "route" ? n.route.file : n.table.file;
}

export interface FocusEdge {
  from: string;
  to: string;
  kind: CodeEdge["kind"];
  certainty: CodeEdge["certainty"];
}

export interface Focus {
  /** Columns from left to right: callers by hop (farthest first), the focus, callees by hop. */
  columns: string[][];
  /** Index of the focus column in `columns`. */
  centerColumn: number;
  /** Signed hop of every node: negative = caller side, 0 = focus, positive = callee side. */
  hop: Map<string, number>;
  /** Only edges between neighbouring columns, so none ever crosses a node. */
  edges: FocusEdge[];
  /** Nodes left out because a column was full. */
  hidden: number;
}

export const COLUMN_CAP = 12;

function degree(idx: GraphIndex, id: string) {
  return (idx.out.get(id)?.length ?? 0) + (idx.into.get(id)?.length ?? 0);
}

/** Breadth-first from the focus along edges in one direction; shortest hop wins. */
function walk(idx: GraphIndex, focus: Set<string>, depth: number, dir: "in" | "out") {
  const seen = new Map<string, number>();
  let frontier = [...focus];
  for (let hop = 1; hop <= depth && frontier.length; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of (dir === "in" ? idx.into : idx.out).get(id) ?? []) {
        const other = dir === "in" ? e.from : e.to;
        if (focus.has(other) || seen.has(other)) continue;
        seen.set(other, hop);
        next.push(other);
      }
    }
    frontier = next;
  }
  return seen;
}

/**
 * Callers on the left by hop, the focus in the middle, callees on the right by hop. A node
 * reachable both ways stays on the side where it is nearer (callers win ties).
 */
export function focusColumns(idx: GraphIndex, focusIds: string[], depth: number): Focus {
  const focus = new Set(focusIds);
  const callers = walk(idx, focus, depth, "in");
  const callees = walk(idx, focus, depth, "out");
  const hop = new Map<string, number>();
  for (const id of focus) hop.set(id, 0);
  for (const [id, h] of callers) hop.set(id, -h);
  for (const [id, h] of callees) {
    const mine = callers.get(id);
    if (mine === undefined || h < mine) hop.set(id, h);
  }
  let hidden = 0;
  const columns: string[][] = [];
  for (let h = -depth; h <= depth; h++) {
    let ids = [...hop].filter(([, v]) => v === h).map(([id]) => id);
    if (h !== 0 && ids.length > COLUMN_CAP) {
      ids = ids.sort((a, b) => degree(idx, b) - degree(idx, a) || a.localeCompare(b));
      hidden += ids.length - COLUMN_CAP;
      for (const id of ids.slice(COLUMN_CAP)) hop.delete(id);
      ids = ids.slice(0, COLUMN_CAP);
    }
    columns.push(ids);
  }
  const edges: FocusEdge[] = [];
  for (const list of idx.out.values()) {
    for (const e of list) {
      const a = hop.get(e.from);
      const b = hop.get(e.to);
      if (a !== undefined && b !== undefined && b === a + 1) edges.push({ ...e });
    }
  }
  order(columns, edges, depth);
  return { columns, centerColumn: depth, hop, edges, hidden };
}

/** Orders every column by the average position of its neighbours one column closer to the focus. */
function order(columns: string[][], edges: FocusEdge[], center: number) {
  columns[center].sort();
  for (const dir of [-1, 1]) {
    for (let c = center + dir; c >= 0 && c < columns.length; c += dir) {
      const inner = new Map(columns[c - dir].map((id, i) => [id, i]));
      const rank = (id: string) => {
        const near = edges
          .filter((e) => (dir < 0 ? e.from === id : e.to === id))
          .map((e) => inner.get(dir < 0 ? e.to : e.from))
          .filter((v): v is number => v !== undefined);
        return near.length
          ? near.reduce((a, b) => a + b, 0) / near.length
          : Number.MAX_SAFE_INTEGER;
      };
      const rk = new Map(columns[c].map((id) => [id, rank(id)]));
      columns[c].sort(
        (a, b) => (rk.get(a) as number) - (rk.get(b) as number) || a.localeCompare(b),
      );
    }
  }
}

export interface Placed {
  id: string;
  x: number;
  y: number;
}

export const NODE_W = 248;
export const NODE_H = 54;
export const COL_GAP = 168;
export const ROW_GAP = 14;

/** Positions columns left to right, each centred on the same horizontal axis. */
export function layoutColumns(columns: string[][]): {
  nodes: Placed[];
  width: number;
  height: number;
} {
  const tallest = Math.max(1, ...columns.map((c) => c.length));
  const height = tallest * NODE_H + (tallest - 1) * ROW_GAP;
  const nodes: Placed[] = [];
  columns.forEach((ids, c) => {
    const h = ids.length * NODE_H + Math.max(0, ids.length - 1) * ROW_GAP;
    ids.forEach((id, i) => {
      nodes.push({ id, x: c * (NODE_W + COL_GAP), y: (height - h) / 2 + i * (NODE_H + ROW_GAP) });
    });
  });
  return { nodes, width: columns.length * (NODE_W + COL_GAP) - COL_GAP, height };
}

export const FOCUS_CAP = 8;

export type MapSelection = { kind: "symbol" | "file" | "route" | "table"; id: string };

/** The nodes a selection puts in the middle. A file focuses its most connected functions. */
export function focusOf(idx: GraphIndex, sel: MapSelection): string[] {
  if (sel.kind !== "file") return nodeOf(idx, sel.id) ? [sel.id] : [];
  return (idx.byFile.get(sel.id) ?? [])
    .filter((s) => s.kind !== "module" && degree(idx, s.id) > 0)
    .sort((a, b) => degree(idx, b.id) - degree(idx, a.id) || a.startLine - b.startLine)
    .slice(0, FOCUS_CAP)
    .map((s) => s.id);
}

/**
 * What the map shows with nothing selected: what the session changed, else the entry points with
 * the most going on (routes first, then functions nobody calls).
 */
export function defaultFocus(
  idx: GraphIndex,
  changed: string[],
): { ids: string[]; why: "changed" | "entry" } {
  const connected = changed.filter((id) => degree(idx, id) > 0);
  if (connected.length) {
    return {
      ids: connected.sort((a, b) => degree(idx, b) - degree(idx, a)).slice(0, FOCUS_CAP),
      why: "changed",
    };
  }
  const routes = [...idx.routes.values()].filter((r) => r.handler).map((r) => r.id);
  const roots = idx.graph.symbols
    .filter((s) => s.kind !== "module" && !idx.into.has(s.id) && idx.out.has(s.id))
    .map((s) => s.id);
  const pool = routes.length >= FOCUS_CAP ? routes : [...routes, ...roots];
  return {
    ids: pool
      .sort((a, b) => (idx.out.get(b)?.length ?? 0) - (idx.out.get(a)?.length ?? 0))
      .slice(0, FOCUS_CAP),
    why: "entry",
  };
}
