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

export type MapSelection = { kind: "symbol" | "file" | "route" | "table"; id: string };

/** A file opens its first twelve symbols; named search can reveal any remaining symbol. */
export function focusOf(idx: GraphIndex, sel: MapSelection): string[] {
  if (sel.kind !== "file") return nodeOf(idx, sel.id) ? [sel.id] : [];
  return (idx.byFile.get(sel.id) ?? [])
    .filter((s) => s.kind !== "module")
    .slice(0, 12)
    .map((s) => s.id);
}
