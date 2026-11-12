import type { CodeFile } from "../../../../shared/model.ts";

/**
 * The change map: changed files in the middle column, the files they import to the left, the
 * files that import them to the right, optionally a second step out on each side. Every edge is
 * a resolved relative import recorded in the code map; nothing is inferred from names.
 */

/** Column index: -2/-1 = imported by the changes, 0 = changed, 1/2 = importing the changes. */
export type Column = -2 | -1 | 0 | 1 | 2;

export interface ChangeMap {
  columns: Map<Column, string[]>;
  /** Files left out of a column by the cap. */
  more: Map<Column, number>;
  /**
   * `[importer, imported]`, both shown, between neighbouring columns or between two changed
   * files. Imports between two neighbours in the same column are left out: they are real but
   * say nothing about the change and would cross the cards.
   */
  edges: [string, string][];
}

export interface Graph {
  imports: Map<string, string[]>;
  importers: Map<string, string[]>;
}

/** Forward and reverse import lists, built once per code map. */
export function importGraph(files: CodeFile[]): Graph {
  const imports = new Map<string, string[]>();
  const importers = new Map<string, string[]>();
  for (const f of files) {
    imports.set(f.path, f.imports);
    for (const to of f.imports) {
      const list = importers.get(to);
      if (list) list.push(f.path);
      else importers.set(to, [f.path]);
    }
  }
  return { imports, importers };
}

export function changeMap(
  graph: Graph,
  changed: string[],
  { hops = 1, cap = 18 }: { hops?: 1 | 2; cap?: number } = {},
): ChangeMap {
  const centre = [...new Set(changed)].sort(byDirThenName);
  const placed = new Set(centre);
  const columns = new Map<Column, string[]>([[0, centre]]);
  const more = new Map<Column, number>();

  const ring = (from: string[], next: (p: string) => string[]) => {
    const out = new Set<string>();
    for (const p of from) for (const q of next(p)) if (!placed.has(q)) out.add(q);
    return [...out];
  };
  const usesOf = (p: string) => graph.imports.get(p) ?? [];
  const usedByOf = (p: string) => graph.importers.get(p) ?? [];

  // Barycentre ordering keeps lines short: each neighbour sits near the files it connects to.
  const order = (list: string[], beside: string[], link: (a: string, b: string) => boolean) => {
    const pos = new Map(beside.map((p, i) => [p, i]));
    const score = (p: string) => {
      const hits = beside.filter((b) => link(p, b)).map((b) => pos.get(b) ?? 0);
      return hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : Number.MAX_SAFE_INTEGER;
    };
    const degree = (p: string) => beside.filter((b) => link(p, b)).length;
    // Keep the best-connected files when capping, then lay them out by position.
    const kept = [...list]
      .sort((a, b) => degree(b) - degree(a) || byDirThenName(a, b))
      .slice(0, cap);
    return {
      kept: kept.sort((a, b) => score(a) - score(b) || byDirThenName(a, b)),
      dropped: list.length - kept.length,
    };
  };
  const imports = (a: string, b: string) => usesOf(a).includes(b);

  const place = (col: Column, list: string[], beside: string[], link: typeof imports) => {
    const { kept, dropped } = order(list, beside, link);
    for (const p of kept) placed.add(p);
    if (kept.length) columns.set(col, kept);
    if (dropped) more.set(col, dropped);
    return kept;
  };

  const uses1 = place(-1, ring(centre, usesOf), centre, (n, c) => imports(c, n));
  const usedBy1 = place(1, ring(centre, usedByOf), centre, (n, c) => imports(n, c));
  if (hops === 2) {
    place(-2, ring(uses1, usesOf), uses1, (n, c) => imports(c, n));
    place(2, ring(usedBy1, usedByOf), usedBy1, (n, c) => imports(n, c));
  }

  const colOf = new Map<string, number>();
  for (const [c, list] of columns) for (const p of list) colOf.set(p, c);
  const edges: [string, string][] = [];
  for (const [from, a] of colOf) {
    for (const to of usesOf(from)) {
      const b = colOf.get(to);
      if (b === undefined) continue;
      if (Math.abs(a - b) === 1 || (a === 0 && b === 0)) edges.push([from, to]);
    }
  }
  return { columns, more, edges };
}

export function byDirThenName(a: string, b: string): number {
  const da = a.lastIndexOf("/");
  const db = b.lastIndexOf("/");
  return a.slice(0, da).localeCompare(b.slice(0, db)) || a.localeCompare(b);
}
